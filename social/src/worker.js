import * as pinned from "./mojang-keys.js";
const DAY = 86400000;
const ONLINE = 60000;
const PROOF_WINDOW = 5 * 60000;
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
function base64(value, max = 4096) {
  if (typeof value !== "string" || value.length > max || !value)
    throw new Problem("Invalid Minecraft certificate", 401);
  try {
    return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  } catch {
    throw new Problem("Invalid Minecraft certificate", 401);
  }
}
const imported = new Map();
function rsa(der, hashName) {
  const id = hashName + ":" + der;
  if (!imported.has(id))
    imported.set(
      id,
      crypto.subtle
        .importKey(
          "spki",
          typeof der === "string" ? base64(der) : der,
          { name: "RSASSA-PKCS1-v1_5", hash: hashName },
          false,
          ["verify"],
        )
        .catch(() => {
          imported.delete(id);
          throw new Problem("Invalid Minecraft certificate", 401);
        }),
    );
  return imported.get(id);
}
export async function verifiedBy(keys, signature, data) {
  for (const key of keys)
    if (
      await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        await rsa(key, "SHA-1"),
        signature,
        data,
      )
    )
      return true;
  return false;
}
function trusted(env) {
  // Tests substitute their own signing keys; production uses the pinned Mojang keys.
  return env.MOJANG_KEYS ? JSON.parse(env.MOJANG_KEYS) : pinned;
}
// Java's Instant.parse(...).toEpochMilli(), which truncates sub-millisecond digits.
export function instantMillis(value) {
  const m =
    typeof value === "string" &&
    value.match(
      /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d{1,9}))?(?:Z|\+00:00)$/,
    );
  if (!m) throw new Problem("Invalid Minecraft certificate", 401);
  const [, y, mo, d, h, mi, s, fraction = ""] = m;
  return (
    Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) +
    Number(fraction.padEnd(3, "0").slice(0, 3))
  );
}
// Identity is proven without contacting Mojang (which blocks Cloudflare Workers):
// 1. Mojang-signed textures property: binds the profile ID to its current username.
// 2. Mojang-signed player certificate: binds the profile ID to the player's public key.
// 3. A fresh, single-use proof signed with that key's private half, which never leaves the player's computer.
async function verify(request, env, body) {
  const keys = trusted(env);
  const textures = body.textures || {};
  if (typeof textures.value !== "string" || textures.value.length > 8192)
    throw new Problem("Invalid Minecraft profile", 401);
  if (
    !(await verifiedBy(
      keys.profilePropertyKeys,
      base64(textures.signature),
      new TextEncoder().encode(textures.value),
    ))
  )
    throw new Problem("Minecraft profile signature is invalid", 401);
  let profile;
  try {
    profile = JSON.parse(
      new TextDecoder().decode(base64(textures.value, 8192)),
    );
  } catch {
    throw new Problem("Invalid Minecraft profile", 401);
  }
  const now = Date.now();
  if (
    !/^[a-f0-9]{32}$/i.test(profile.profileId) ||
    !/^\w{1,16}$/.test(profile.profileName) ||
    !Number.isSafeInteger(profile.timestamp) ||
    profile.timestamp < now - 15 * 60000 ||
    profile.timestamp > now + 2 * 60000
  )
    throw new Problem(
      "Minecraft profile proof expired. Check your computer's clock and try again.",
      401,
    );
  const id = profile.profileId.toLowerCase();
  const certificate = body.certificate || {};
  const publicKey = base64(certificate.publicKey);
  const expires = instantMillis(certificate.expiresAt);
  if (expires <= now)
    throw new Problem("Minecraft certificate expired. Try again.", 401);
  const signed = new Uint8Array(24 + publicKey.length);
  const view = new DataView(signed.buffer);
  view.setBigUint64(0, BigInt("0x" + id.slice(0, 16)));
  view.setBigUint64(8, BigInt("0x" + id.slice(16)));
  view.setBigInt64(16, BigInt(expires));
  signed.set(publicKey, 24);
  if (
    !(await verifiedBy(
      keys.playerCertificateKeys,
      base64(certificate.signature),
      signed,
    ))
  )
    throw new Problem("Minecraft certificate signature is invalid", 401);
  const proof = body.proof || {};
  if (
    !Number.isSafeInteger(proof.timestamp) ||
    Math.abs(now - proof.timestamp) > PROOF_WINDOW ||
    typeof proof.nonce !== "string" ||
    !/^[a-f0-9]{32}$/.test(proof.nonce)
  )
    throw new Problem(
      "Sign-in proof expired. Check your computer's clock and try again.",
      401,
    );
  const statement = `AR Client social session v2\n${new URL(request.url).host}\n${id}\n${proof.timestamp}\n${proof.nonce}`;
  if (
    !(await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      await rsa(publicKey, "SHA-256"),
      base64(proof.signature),
      new TextEncoder().encode(statement),
    ))
  )
    throw new Problem("Sign-in proof is invalid", 401);
  const fresh = await env.DB.prepare(
    "INSERT OR IGNORE INTO proofs(nonce,expires) VALUES(?,?) RETURNING nonce",
  )
    .bind(proof.nonce, now + 2 * PROOF_WINDOW)
    .first();
  if (!fresh) throw new Problem("Sign-in proof was already used", 401);
  const skin = String(profile.textures?.SKIN?.url || "").replace(
    /^http:/,
    "https:",
  );
  return {
    id,
    name: profile.profileName,
    expires,
    skin: /^https:\/\/textures\.minecraft\.net\/texture\/[a-f0-9]{1,128}$/.test(
      skin,
    )
      ? skin
      : "",
  };
}
async function identity(request, env, body) {
  if (body.action === "session") {
    const ip = request.headers.get("CF-Connecting-IP") || "local";
    await rate(env.DB, "ip:" + (await hash(ip)), 10);
    const profile = await verify(request, env, body);
    const now = Date.now();
    // Usernames are unique at verification time; release this name from stale holders.
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET verified=0 WHERE name=? AND id<>?").bind(
        profile.name,
        profile.id,
      ),
      env.DB.prepare(
        "INSERT INTO users(id,name,last_seen,verified,skin) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,last_seen=excluded.last_seen,verified=excluded.verified,skin=excluded.skin",
      ).bind(profile.id, profile.name, now, now, profile.skin),
    ]);
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) =>
      v.toString(16).padStart(2, "0"),
    ).join("");
    const expires = Math.min(now + DAY, profile.expires);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE expires<?").bind(now),
      env.DB.prepare(
        "INSERT INTO sessions(hash,owner,expires) VALUES(?,?,?)",
      ).bind(await hash(token), profile.id, expires),
    ]);
    await env.DB.prepare(
      "DELETE FROM sessions WHERE owner=? AND hash NOT IN (SELECT hash FROM sessions WHERE owner=? ORDER BY expires DESC LIMIT 5)",
    )
      .bind(profile.id, profile.id)
      .run();
    return { id: profile.id, name: profile.name, token, expires };
  }
  const bearer = request.headers
    .get("Authorization")
    ?.match(/^Bearer ([A-Za-z0-9._~-]{20,8192})$/)?.[1];
  if (!bearer) throw new Problem("Sign in to Minecraft first.", 401);
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
function activity(value) {
  if (value === undefined) return null;
  if (
    typeof value !== "string" ||
    value.length > 64 ||
    /[\x00-\x1f\x7f]/.test(value)
  )
    throw new Problem("Invalid activity");
  return value.trim();
}
export async function handle(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/health" && request.method === "GET")
    return reply({ service: "AR Client social", version: 2 });
  if (url.pathname !== "/") throw new Problem("Not found", 404);
  if (request.method !== "POST") return reply({ error: "POST required" }, 405);
  const body = await boundedJson(request);
  const action = body.action;
  const me = await identity(request, env, body);
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
    const now = Date.now();
    const status = activity(body.activity);
    await (
      status === null
        ? env.DB.prepare("UPDATE users SET last_seen=? WHERE id=?").bind(
            now,
            me.id,
          )
        : env.DB.prepare(
            "UPDATE users SET last_seen=?,activity=? WHERE id=?",
          ).bind(now, status, me.id)
    ).run();
    const [self, peers, blocks, unread] = await env.DB.batch([
      env.DB.prepare("SELECT name,skin FROM users WHERE id=?").bind(me.id),
      env.DB.prepare(
        "SELECT u.id,u.name,u.skin,CASE WHEN e.status='accepted' THEN u.last_seen ELSE 0 END AS lastSeen,CASE WHEN e.status='accepted' AND u.last_seen>? THEN u.activity ELSE '' END AS activity,e.status,e.requester,e.created FROM edges e JOIN users u ON u.id=CASE WHEN e.a=? THEN e.b ELSE e.a END WHERE e.a=? OR e.b=? ORDER BY u.name",
      ).bind(now - ONLINE, me.id, me.id, me.id),
      env.DB.prepare(
        "SELECT u.id,u.name,u.skin FROM blocks b JOIN users u ON u.id=b.target WHERE b.owner=? ORDER BY u.name",
      ).bind(me.id),
      env.DB.prepare(
        "SELECT m.sender AS id,count(*) AS n,max(m.id) AS last FROM messages m LEFT JOIN reads r ON r.owner=m.recipient AND r.peer=m.sender WHERE m.recipient=? AND m.id>coalesce(r.last_id,0) AND m.created>? GROUP BY m.sender",
      ).bind(me.id, now - 30 * DAY),
    ]);
    const counts = new Map(unread.results.map((r) => [r.id, r]));
    return reply({
      id: me.id,
      name: self.results[0]?.name || "",
      skin: self.results[0]?.skin || "",
      now,
      peers: peers.results.map((p) => ({
        ...p,
        online: p.status === "accepted" && now - p.lastSeen < ONLINE,
        unread: p.status === "accepted" ? counts.get(p.id)?.n || 0 : 0,
        lastUnread: p.status === "accepted" ? counts.get(p.id)?.last || 0 : 0,
      })),
      blocks: blocks.results,
    });
  }
  const target = typeof body.target === "string" ? body.target.trim() : "";
  if (!/^(?:[a-f0-9]{32}|[A-Za-z0-9_]{1,16})$/i.test(target))
    throw new Problem("Enter an exact Minecraft username.");
  let peer;
  if (/^[a-f0-9]{32}$/i.test(target)) {
    peer = await env.DB.prepare("SELECT id,name FROM users WHERE id=?")
      .bind(target.toLowerCase())
      .first();
  } else {
    await rate(env.DB, "invite-lookups:" + me.id, 20);
    peer = await env.DB.prepare(
      "SELECT id,name FROM users WHERE name=? ORDER BY verified DESC,last_seen DESC LIMIT 1",
    )
      .bind(target)
      .first();
  }
  if (!peer)
    throw new Problem(
      "That player hasn't joined AR Client Friends yet. Ask them to open Friends in AR Client once.",
      404,
    );
  if (peer.id === me.id) throw new Problem("You can't add yourself.");
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
    if (edge?.status === "pending" && edge.requester !== me.id) {
      // Both players asked: accept instead of failing.
      await env.DB.prepare(
        "UPDATE edges SET status='accepted' WHERE a=? AND b=?",
      )
        .bind(a, b)
        .run();
      return reply({ ok: true, accepted: true, name: peer.name });
    }
    if (edge)
      throw new Problem(
        edge.status === "accepted"
          ? `You're already friends with ${peer.name}.`
          : `You already sent ${peer.name} a request.`,
      );
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
        me.id,
        me.id,
      )
      .first();
    if (!inserted)
      throw new Problem("Request unavailable or friend limit reached.", 409);
    return reply({ ok: true, name: peer.name });
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
    await env.DB.batch([
      env.DB.prepare("DELETE FROM edges WHERE a=? AND b=?").bind(a, b),
      env.DB.prepare(
        "DELETE FROM reads WHERE (owner=? AND peer=?) OR (owner=? AND peer=?)",
      ).bind(me.id, peer.id, peer.id, me.id),
    ]);
    return reply({ ok: true });
  }
  if (edge?.status !== "accepted")
    throw new Problem("Only accepted friends can exchange messages.", 403);
  if (action === "messages") {
    const cursor = (value) => {
      if (value === undefined || value === null) return null;
      const n = Number(value);
      if (!Number.isSafeInteger(n) || n < 0)
        throw new Problem("Invalid message cursor");
      return n;
    };
    const before = cursor(body.before),
      after = cursor(body.after);
    const since = Date.now() - 30 * DAY;
    const pair = [me.id, peer.id, peer.id, me.id];
    const conversation =
      "((sender=? AND recipient=?) OR (sender=? AND recipient=?))";
    const query =
      after !== null
        ? env.DB.prepare(
            `SELECT id,sender,recipient,body,created FROM messages WHERE id>? AND created>? AND ${conversation} ORDER BY id ASC LIMIT 100`,
          ).bind(after, since, ...pair)
        : env.DB.prepare(
            `SELECT id,sender,recipient,body,created FROM messages WHERE id<? AND created>? AND ${conversation} ORDER BY id DESC LIMIT 50`,
          ).bind(before ?? Number.MAX_SAFE_INTEGER, since, ...pair);
    const rows = (await query.all()).results;
    const messages = after !== null ? rows : rows.reverse();
    const newest = before === null && messages.at(-1)?.id;
    const [seen] = await env.DB.batch([
      env.DB.prepare("SELECT last_id FROM reads WHERE owner=? AND peer=?").bind(
        peer.id,
        me.id,
      ),
      ...(newest
        ? [
            env.DB.prepare(
              "INSERT INTO reads(owner,peer,last_id) VALUES(?,?,?) ON CONFLICT(owner,peer) DO UPDATE SET last_id=excluded.last_id WHERE excluded.last_id>reads.last_id",
            ).bind(me.id, peer.id, newest),
          ]
        : []),
    ]);
    return reply({
      messages,
      seen: seen.results[0]?.last_id || 0,
      more: after === null && rows.length === 50,
    });
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
    const created = Date.now();
    // Recheck friendship/blocking in the INSERT, preventing a concurrent block from allowing a send.
    const inserted = await env.DB.prepare(
      "INSERT INTO messages(sender,recipient,body,created) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM edges WHERE a=? AND b=? AND status='accepted') AND NOT EXISTS(SELECT 1 FROM blocks WHERE (owner=? AND target=?) OR (owner=? AND target=?)) RETURNING id",
    )
      .bind(
        me.id,
        peer.id,
        body.text.trim(),
        created,
        a,
        b,
        me.id,
        peer.id,
        peer.id,
        me.id,
      )
      .first();
    if (!inserted) throw new Problem("This connection is unavailable.", 403);
    return reply({
      id: inserted.id,
      sender: me.id,
      recipient: peer.id,
      body: body.text.trim(),
      created,
    });
  }
  throw new Problem("Unknown social action");
}
async function cleanup(env) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires<?").bind(Date.now()),
    env.DB.prepare("DELETE FROM proofs WHERE expires<?").bind(Date.now()),
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
