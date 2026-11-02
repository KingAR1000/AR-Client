const DAY = 86400000;
const reply = (value, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
class Problem extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
async function boundedJson(request, limit = 16384) {
  const reader = request.body?.getReader();
  if (!reader) throw new Problem("JSON body required");
  let bytes = new Uint8Array();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (bytes.length + value.length > limit)
        throw new Problem("Request too large", 413);
      const next = new Uint8Array(bytes.length + value.length);
      next.set(bytes);
      next.set(value, bytes.length);
      bytes = next;
    }
  } finally {
    await reader.cancel();
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Problem("Invalid JSON");
  }
}
async function hash(value) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
async function rate(db, key, limit) {
  const window = Math.floor(Date.now() / 60000);
  const r = await db
    .prepare(
      "INSERT INTO limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window RETURNING count",
    )
    .bind(key, window)
    .first();
  if (r.count > limit)
    throw new Problem("Too many requests. Try again in a minute.", 429);
}
async function identity(request, env, action) {
  const bearer = request.headers
    .get("Authorization")
    ?.match(/^Bearer ([A-Za-z0-9._~-]{20,8192})$/)?.[1];
  if (!bearer) throw new Problem("Sign in to Minecraft first.", 401);
  if (action === "session") {
    const ip = request.headers.get("CF-Connecting-IP") || "local";
    await rate(env.DB, "ip:" + (await hash(ip)), 10);
    const response = await fetch(
      "https://api.minecraftservices.com/minecraft/profile",
      {
        headers: { Authorization: `Bearer ${bearer}` },
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok)
      throw new Problem(
        "Minecraft could not verify your account. Sign in again.",
        401,
      );
    const profile = await boundedJson(response);
    if (!/^[a-f0-9]{32}$/i.test(profile.id) || !/^\w{3,16}$/.test(profile.name))
      throw new Problem("Invalid Minecraft profile", 401);
    const id = profile.id.toLowerCase();
    await env.DB.prepare(
      "INSERT INTO users(id,name,last_seen) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,last_seen=excluded.last_seen",
    )
      .bind(id, profile.name, Date.now())
      .run();
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) =>
      v.toString(16).padStart(2, "0"),
    ).join("");
    const expires = Date.now() + DAY;
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE expires<?").bind(Date.now()),
      env.DB.prepare(
        "INSERT INTO sessions(hash,owner,expires) VALUES(?,?,?)",
      ).bind(await hash(token), id, expires),
    ]);
    await env.DB.prepare(
      "DELETE FROM sessions WHERE owner=? AND hash NOT IN (SELECT hash FROM sessions WHERE owner=? ORDER BY expires DESC LIMIT 5)",
    )
      .bind(id, id)
      .run();
    return { id, token, expires };
  }
  const tokenHash = await hash(bearer);
  const session = await env.DB.prepare(
    "SELECT owner AS id FROM sessions WHERE hash=? AND expires>?",
  )
    .bind(tokenHash, Date.now())
    .first();
  if (!session) throw new Problem("Session expired", 401);
  await rate(env.DB, "user:" + session.id, 90);
  return { ...session, tokenHash };
}
export async function handle(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/health" && request.method === "GET")
    return reply({ service: "AR Client social", version: 1 });
  if (url.pathname !== "/") throw new Problem("Not found", 404);
  if (request.method !== "POST") return reply({ error: "POST required" }, 405);
  const body = await boundedJson(request);
  const action = body.action;
  const me = await identity(request, env, action);
  if (action === "session") return reply(me);
  if (action === "logout") {
    await env.DB.prepare("DELETE FROM sessions WHERE hash=?")
      .bind(me.tokenHash)
      .run();
    return reply({ ok: true });
  }
  if (action === "delete-account") {
    await env.DB.prepare("DELETE FROM users WHERE id=?").bind(me.id).run();
    return reply({ ok: true });
  }
  if (action === "state") {
    await env.DB.prepare("UPDATE users SET last_seen=? WHERE id=?")
      .bind(Date.now(), me.id)
      .run();
    const peers = await env.DB.prepare(
      "SELECT u.id,u.name,CASE WHEN e.status='accepted' THEN u.last_seen ELSE 0 END AS lastSeen,e.status,e.requester FROM edges e JOIN users u ON u.id=CASE WHEN e.a=? THEN e.b ELSE e.a END WHERE e.a=? OR e.b=? ORDER BY u.name",
    )
      .bind(me.id, me.id, me.id)
      .all();
    const blocks = await env.DB.prepare(
      "SELECT u.id,u.name FROM blocks b JOIN users u ON u.id=b.target WHERE b.owner=? ORDER BY u.name",
    )
      .bind(me.id)
      .all();
    return reply({ id: me.id, peers: peers.results, blocks: blocks.results });
  }
  const target = typeof body.target === "string" ? body.target.trim() : "";
  if (!/^(?:[a-f0-9]{32}|[A-Za-z0-9_]{3,16})$/i.test(target))
    throw new Problem("Enter an exact Minecraft username.");
  if (action === "request") await rate(env.DB, "invite-lookups:" + me.id, 10);
  let targetId = target.toLowerCase();
  if (!/^[a-f0-9]{32}$/i.test(target)) {
    const lookup = await fetch(
      "https://api.mojang.com/users/profiles/minecraft/" +
        encodeURIComponent(target),
      { redirect: "error", signal: AbortSignal.timeout(10000) },
    );
    if (!lookup.ok)
      throw new Problem(
        "Minecraft username was not found or lookup is unavailable.",
        404,
      );
    const profile = await boundedJson(lookup);
    if (!/^[a-f0-9]{32}$/i.test(profile.id))
      throw new Problem("Invalid Minecraft username lookup", 502);
    targetId = profile.id.toLowerCase();
  }
  const peer = await env.DB.prepare("SELECT id,name FROM users WHERE id=?")
    .bind(targetId)
    .first();
  if (!peer)
    throw new Problem(
      "That player must sign into AR Client Friends first.",
      404,
    );
  if (peer.id === me.id) throw new Problem("Choose another player.");
  const [a, b] = [me.id, peer.id].sort();
  if (action === "block") {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO blocks(owner,target) VALUES(?,?)",
      ).bind(me.id, peer.id),
      env.DB.prepare("DELETE FROM edges WHERE a=? AND b=?").bind(a, b),
    ]);
    return reply({ ok: true });
  }
  if (action === "unblock") {
    await env.DB.prepare("DELETE FROM blocks WHERE owner=? AND target=?")
      .bind(me.id, peer.id)
      .run();
    return reply({ ok: true });
  }
  const blocked = await env.DB.prepare(
    "SELECT 1 FROM blocks WHERE (owner=? AND target=?) OR (owner=? AND target=?)",
  )
    .bind(me.id, peer.id, peer.id, me.id)
    .first();
  if (blocked) throw new Problem("This connection is unavailable.", 403);
  const edge = await env.DB.prepare(
    "SELECT status,requester FROM edges WHERE a=? AND b=?",
  )
    .bind(a, b)
    .first();
  if (action === "request") {
    await rate(env.DB, "invites:" + me.id, 10);
    if (edge)
      throw new Problem(
        "You already have a request or friendship with that player.",
      );
    const count = await env.DB.prepare(
      "SELECT count(*) AS n FROM edges WHERE a=? OR b=?",
    )
      .bind(me.id, me.id)
      .first();
    if (count.n >= 200) throw new Problem("Friend list limit reached.");
    const inserted = await env.DB.prepare(
      "INSERT OR IGNORE INTO edges(a,b,requester,status,created) SELECT ?,?,?,'pending',? WHERE NOT EXISTS(SELECT 1 FROM blocks WHERE (owner=? AND target=?) OR (owner=? AND target=?)) AND (SELECT count(*) FROM edges WHERE a=? OR b=?)<200 RETURNING a",
    )
      .bind(
        a,
        b,
        me.id,
        Date.now(),
        me.id,
        peer.id,
        peer.id,
        me.id,
        peer.id,
        peer.id,
      )
      .first();
    if (!inserted)
      throw new Problem("Request unavailable or friend limit reached.", 409);
    return reply({ ok: true });
  }
  if (action === "accept") {
    if (edge?.status !== "pending" || edge.requester === me.id)
      throw new Problem("No incoming request from that player.");
    await env.DB.prepare("UPDATE edges SET status='accepted' WHERE a=? AND b=?")
      .bind(a, b)
      .run();
    return reply({ ok: true });
  }
  if (action === "remove") {
    await env.DB.prepare("DELETE FROM edges WHERE a=? AND b=?")
      .bind(a, b)
      .run();
    return reply({ ok: true });
  }
  if (edge?.status !== "accepted")
    throw new Problem("Only accepted friends can exchange messages.", 403);
  if (action === "messages") {
    const before = Number(body.before || Number.MAX_SAFE_INTEGER);
    if (!Number.isSafeInteger(before) || before < 1)
      throw new Problem("Invalid message cursor");
    const messages = await env.DB.prepare(
      "SELECT id,sender,recipient,body,created FROM messages WHERE id<? AND created>? AND ((sender=? AND recipient=?) OR (sender=? AND recipient=?)) ORDER BY id DESC LIMIT 50",
    )
      .bind(before, Date.now() - 30 * DAY, me.id, peer.id, peer.id, me.id)
      .all();
    return reply({ messages: messages.results.reverse() });
  }
  if (action === "send") {
    await rate(env.DB, "messages:" + me.id, 30);
    if (
      typeof body.text !== "string" ||
      !body.text.trim() ||
      body.text.length > 2000 ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(body.text)
    )
      throw new Problem("Messages must contain 1–2000 characters.");
    // Recheck friendship/blocking in the INSERT, preventing a concurrent block from allowing a send.
    const inserted = await env.DB.prepare(
      "INSERT INTO messages(sender,recipient,body,created) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM edges WHERE a=? AND b=? AND status='accepted') AND NOT EXISTS(SELECT 1 FROM blocks WHERE (owner=? AND target=?) OR (owner=? AND target=?)) RETURNING id",
    )
      .bind(
        me.id,
        peer.id,
        body.text.trim(),
        Date.now(),
        a,
        b,
        me.id,
        peer.id,
        peer.id,
        me.id,
      )
      .first();
    if (!inserted) throw new Problem("This connection is unavailable.", 403);
    return reply(inserted);
  }
  throw new Problem("Unknown social action");
}
async function cleanup(env) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires<?").bind(Date.now()),
    env.DB.prepare("DELETE FROM messages WHERE created<?").bind(
      Date.now() - 30 * DAY,
    ),
    env.DB.prepare("DELETE FROM limits WHERE window<?").bind(
      Math.floor(Date.now() / 60000) - 60,
    ),
  ]);
}
export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (e) {
      return reply(
        {
          error:
            e instanceof Problem
              ? e.message
              : "Social service unavailable. Try again later.",
        },
        e instanceof Problem ? e.status : 503,
      );
    }
  },
  async scheduled(_event, env) {
    await cleanup(env);
  },
};
