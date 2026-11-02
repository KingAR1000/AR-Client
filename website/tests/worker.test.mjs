import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { invoke } from "../worker.mjs";
test("static fallback and unknown APIs never contact upstream", async () => {
  const request = new Request("https://example.test/");
  const env = { ASSETS: { fetch: async () => new Response("website") } };
  assert.equal(await (await worker.fetch(request, env, {})).text(), "website");
  assert.equal(
    (await worker.fetch(new Request("https://example.test/api/no"), {}, {}))
      .status,
    404,
  );
});
test("adapter preserves errors, methods and security headers", async () => {
  const r = await worker.fetch(
    new Request("https://example.test/api/curseforge?path=mods/search", {
      method: "POST",
    }),
    {},
    {},
  );
  assert.equal(r.status, 405);
  assert.equal(r.headers.get("Allow"), "GET");
  assert.equal(r.headers.get("X-Content-Type-Options"), "nosniff");
  const missing = await worker.fetch(
    new Request("https://example.test/api/curseforge?path=mods/search"),
    {},
    {},
  );
  assert.equal(missing.status, 503);
  assert.equal(missing.headers.get("Cache-Control"), "no-store");
  const bad = await worker.fetch(
    new Request("https://example.test/api/curseforge?path=../secret"),
    {},
    {},
  );
  assert.equal(bad.status, 400);
});
test("successful responses keep caching metadata and serialize exact payloads", async () => {
  const r = await invoke((_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=60");
    return res.status(200).json({ release: "26.3" });
  }, new Request("https://example.test/api/minecraft"));
  assert.deepEqual(await r.json(), { release: "26.3" });
  assert.equal(r.headers.get("Cache-Control"), "public, max-age=60");
});
