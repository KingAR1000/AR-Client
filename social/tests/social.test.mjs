import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    scriptPath: new URL("../src/worker.js", import.meta.url).pathname,
    compatibilityDate: "2026-11-02",
    d1Databases: ["DB"],
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
  const sql = await readFile(
    new URL("../migrations/0001_social.sql", import.meta.url),
    "utf8",
  );
  for (const query of sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)) {
    await db.prepare(query).run();
  }
  for (const [name, id] of [
    ["alice", alice],
    ["bob", bob],
    ["mallory", mallory],
  ]) {
    await db
      .prepare("INSERT INTO users VALUES(?,?,?)")
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
async function request(who, action, args = {}) {
  const response = await mf.dispatchFetch("https://social.test/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(who ? { Authorization: "Bearer " + tokens[who] } : {}),
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
