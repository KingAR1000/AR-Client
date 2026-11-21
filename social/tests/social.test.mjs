import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
} from "node:crypto";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { instantMillis, verifiedBy } from "../src/worker.js";
import * as pinned from "../src/mojang-keys.js";
const rsaPair = () =>
  generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
// Stand-ins for Mojang's signing keys; production pins Mojang's real keys.
const mojang = { property: rsaPair(), certificate: rsaPair() };
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modulesRoot: new URL("..", import.meta.url).pathname,
    modules: ["src/worker.js", "src/mojang-keys.js"].map((file) => ({
      type: "ESModule",
      path: new URL("../" + file, import.meta.url).pathname,
    })),
    compatibilityDate: "2026-11-02",
    d1Databases: ["DB"],
    bindings: {
      MOJANG_KEYS: JSON.stringify({
        profilePropertyKeys: [mojang.property.publicKey.toString("base64")],
        playerCertificateKeys: [
          mojang.certificate.publicKey.toString("base64"),
        ],
      }),
    },
  }),
);
let db;
const alice = "a".repeat(32),
  bob = "b".repeat(32),
  mallory = "c".repeat(32);
const tokens = {
  alice: "1".repeat(64),
  bob: "2".repeat(64),
  mallory: "3".repeat(64),
};
before(async () => {
  db = await mf.getD1Database("DB");
  const dir = new URL("../migrations/", import.meta.url);
  for (const file of (await readdir(dir)).sort()) {
    const sql = await readFile(new URL(file, dir), "utf8");
    for (const query of sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)) {
      await db.prepare(query).run();
    }
  }
  for (const [name, id] of [
    ["alice", alice],
    ["bob", bob],
    ["mallory", mallory],
  ]) {
    await db
      .prepare("INSERT INTO users(id,name,last_seen) VALUES(?,?,?)")
      .bind(id, name, Date.now())
      .run();
    await db
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .bind(
        createHash("sha256").update(tokens[name]).digest("hex"),
        id,
        Date.now() + 3600000,
      )
      .run();
  }
});
after(() => mf.dispose());
async function request(who, action, args = {}, ip = "198.51.100.1") {
  const response = await mf.dispatchFetch("https://social.test/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": ip,
      ...(who ? { Authorization: "Bearer " + (tokens[who] || who) } : {}),
    },
    body: JSON.stringify({ action, ...args }),
  });
  return { status: response.status, body: await response.json() };
}
test("unauthenticated requests cannot read identities or chat", async () => {
  assert.equal((await request(null, "state")).status, 401);
  const response = await mf.dispatchFetch("https://social.test/health");
  assert.equal(response.status, 200);
});
test("friends must accept before messaging; outsiders never see messages", async () => {
  assert.equal(
    (await request("alice", "send", { target: bob, text: "too soon" })).status,
    403,
  );
  assert.equal(
    (await request("alice", "request", { target: bob })).status,
    200,
  );
  assert.equal((await request("alice", "accept", { target: bob })).status, 400);
  assert.equal((await request("bob", "accept", { target: alice })).status, 200);
  assert.equal(
    (
      await request("alice", "send", {
        target: bob,
        text: "hello <script>alert(1)</script>",
      })
    ).status,
    200,
  );
  const history = await request("bob", "messages", { target: alice });
  assert.equal(history.body.more, false);
  assert.equal(
    history.body.messages[0].body,
    "hello <script>alert(1)</script>",
  );
  assert.equal(
    (await request("mallory", "messages", { target: alice })).status,
    403,
  );
  assert.equal((await request("bob", "state")).body.peers[0].name, "alice");
});
test("blocking revokes friendship and both directions of chat", async () => {
  assert.equal((await request("bob", "block", { target: alice })).status, 200);
  for (const action of ["messages", "request", "send"])
    assert.equal(
      (await request("alice", action, { target: bob, text: "blocked" })).status,
      403,
    );
  assert.equal((await request("bob", "state")).body.blocks.length, 1);
  assert.equal((await request("alice", "state")).body.peers.length, 0);
  assert.equal(
    (await request("bob", "unblock", { target: alice })).status,
    200,
  );
  assert.equal(
    (await request("alice", "messages", { target: bob })).status,
    403,
  );
});
test("input limits, SQL injection and session revocation", async () => {
  assert.equal(
    (await request("alice", "request", { target: "bob' OR 1=1--" })).status,
    400,
  );
  const oversized = await mf.dispatchFetch("https://social.test/", {
    method: "POST",
    body: "x".repeat(17000),
  });
  assert.equal(oversized.status, 413);
  assert.equal((await request("mallory", "delete-account")).status, 200);
  assert.equal((await request("mallory", "state")).status, 401);
  assert.equal(
    await db
      .prepare("SELECT count(*) AS n FROM users WHERE id=?")
      .bind(mallory)
      .first("n"),
    0,
  );
});

// Builds what the launcher sends: Mojang-signed textures + certificate, and a proof signed by the player's key.
function credentials({
  id,
  name,
  host = "social.test",
  texturesAge = 0,
  certificateFor = id,
  nonce = randomBytes(16).toString("hex"),
} = {}) {
  const player = rsaPair();
  const value = Buffer.from(
    JSON.stringify({
      timestamp: Date.now() - texturesAge,
      profileId: id,
      profileName: name,
      textures: {
        SKIN: { url: "http://textures.minecraft.net/texture/abc123" },
      },
    }),
  ).toString("base64");
  const expiresAt = new Date(Date.now() + 2 * 86400000)
    .toISOString()
    .replace("Z", "417Z");
  const payload = Buffer.alloc(24 + player.publicKey.length);
  payload.write(certificateFor, 0, "hex");
  payload.writeBigInt64BE(BigInt(instantMillis(expiresAt)), 16);
  player.publicKey.copy(payload, 24);
  const timestamp = Date.now();
  return {
    textures: {
      value,
      signature: sign(
        "sha1",
        Buffer.from(value),
        mojang.property.privateKey,
      ).toString("base64"),
    },
    certificate: {
      publicKey: player.publicKey.toString("base64"),
      expiresAt,
      signature: sign("sha1", payload, mojang.certificate.privateKey).toString(
        "base64",
      ),
    },
    proof: {
      timestamp,
      nonce,
      signature: sign(
        "sha256",
        Buffer.from(
          `AR Client social session v2\n${host}\n${id}\n${timestamp}\n${nonce}`,
        ),
        player.privateKey,
      ).toString("base64"),
    },
  };
}
test("pinned Mojang keys verify a real Mojang-signed profile", async () => {
  const fixture = JSON.parse(
    await readFile(new URL("./fixture-signed-profile.json", import.meta.url)),
  );
  const textures = fixture.properties.find((p) => p.name === "textures");
  const signature = Buffer.from(textures.signature, "base64");
  assert.equal(
    await verifiedBy(
      pinned.profilePropertyKeys,
      signature,
      Buffer.from(textures.value),
    ),
    true,
  );
  assert.equal(
    await verifiedBy(
      pinned.profilePropertyKeys,
      signature,
      Buffer.from(textures.value + "A"),
    ),
    false,
  );
  assert.equal(
    instantMillis("2026-11-21T10:00:00.123987Z"),
    Date.UTC(2026, 10, 21, 10, 0, 0, 123),
  );
  assert.equal(
    instantMillis("2026-11-21T10:00:00Z"),
    Date.UTC(2026, 10, 21, 10),
  );
});
test("sessions require Mojang-signed identity and a fresh, single-use proof", async () => {
  const dave = "d".repeat(32);
  const good = credentials({ id: dave, name: "Dave" });
  const session = await request(null, "session", good, "203.0.113.1");
  assert.equal(session.status, 200, JSON.stringify(session.body));
  assert.equal(session.body.id, dave);
  assert.equal(session.body.name, "Dave");
  assert.match(session.body.token, /^[a-f0-9]{64}$/);
  assert.ok(session.body.expires <= Date.now() + 86400000);
  const state = await request(session.body.token, "state");
  assert.equal(state.status, 200);
  assert.equal(state.body.name, "Dave");
  assert.equal(
    state.body.skin,
    "https://textures.minecraft.net/texture/abc123",
  );
  assert.equal(
    (await request(null, "session", good, "203.0.113.1")).status,
    401,
    "replayed proof",
  );
  const tampered = credentials({ id: dave, name: "Dave" });
  tampered.textures.value = Buffer.from(
    JSON.stringify({
      timestamp: Date.now(),
      profileId: dave,
      profileName: "Notch",
    }),
  ).toString("base64");
  for (const [label, body] of [
    ["renamed profile", tampered],
    ["other host", credentials({ id: dave, name: "Dave", host: "evil.test" })],
    [
      "stale profile",
      credentials({ id: dave, name: "Dave", texturesAge: 20 * 60000 }),
    ],
    [
      "certificate of another player",
      credentials({ id: dave, name: "Dave", certificateFor: alice }),
    ],
    [
      "missing proof",
      { ...credentials({ id: dave, name: "Dave" }), proof: undefined },
    ],
  ])
    assert.equal(
      (await request(null, "session", body, "203.0.113.2")).status,
      401,
      label,
    );
});
test("usernames, mutual requests, unread counts, receipts and presence", async () => {
  const erin = "e".repeat(32),
    frank = "f".repeat(32);
  const login = async (id, name) =>
    (await request(null, "session", credentials({ id, name }), "203.0.113.3"))
      .body.token;
  const e = await login(erin, "Erin"),
    f = await login(frank, "Frank");
  assert.equal(
    (await request(e, "request", { target: "nobody_here" })).status,
    404,
  );
  assert.equal(
    (await request(e, "request", { target: "frank" })).body.name,
    "Frank",
  );
  const mutual = await request(f, "request", { target: erin });
  assert.equal(mutual.body.accepted, true);
  assert.equal(
    (await request(f, "state", { activity: "Playing 26.3" })).status,
    200,
  );
  const sent = await request(f, "send", { target: erin, text: "hi" });
  assert.equal(sent.body.body, "hi");
  await request(f, "send", { target: erin, text: "you there?" });
  let erinView = (await request(e, "state")).body.peers[0];
  assert.equal(erinView.unread, 2);
  assert.equal(erinView.online, true);
  assert.equal(erinView.activity, "Playing 26.3");
  const history = await request(e, "messages", { target: frank });
  assert.equal(history.body.messages.length, 2);
  assert.equal((await request(e, "state")).body.peers[0].unread, 0);
  assert.equal(
    (await request(f, "messages", { target: erin })).body.seen,
    history.body.messages[1].id,
  );
  const newer = await request(e, "messages", {
    target: frank,
    after: history.body.messages[1].id,
  });
  assert.deepEqual(newer.body.messages, []);
  await request(f, "send", { target: erin, text: "third" });
  const incremental = await request(e, "messages", {
    target: frank,
    after: history.body.messages[1].id,
  });
  assert.deepEqual(
    incremental.body.messages.map((m) => m.body),
    ["third"],
  );
  assert.equal(
    (await request(e, "state", { activity: "x".repeat(65) })).status,
    400,
  );
  // A newer verified holder of a name wins username lookups.
  const ghost = "9".repeat(32);
  await login(ghost, "Frank");
  assert.equal((await request(e, "request", { target: "Frank" })).status, 200);
  assert.equal(
    (await request(e, "state")).body.peers.find((p) => p.id === ghost).status,
    "pending",
  );
});
