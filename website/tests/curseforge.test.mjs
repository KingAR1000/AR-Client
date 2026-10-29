import test from "node:test";
import assert from "node:assert/strict";
import { catalogUrl, createCatalogHandler } from "../lib/curseforge.mjs";

const params = (query) => new URLSearchParams(query);
const response = () => ({
  headers: {},
  code: 0,
  body: null,
  setHeader(name, value) {
    this.headers[name] = value;
  },
  status(code) {
    this.code = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});
test("accepts Minecraft search and preserves escaped filters without allowing hosts", () => {
  const url = catalogUrl(
    params({
      path: "mods/search",
      gameId: "432",
      classId: "6",
      gameVersion: "26.3",
      searchFilter: "a&b/c",
    }),
  );
  assert.equal(url.origin, "https://api.curseforge.com");
  assert.equal(url.pathname, "/v1/mods/search");
  assert.equal(url.searchParams.get("searchFilter"), "a&b/c");
  assert.equal(url.searchParams.get("pageSize"), "20");
});
test("accepts file listing and pinned modpack dependencies", () => {
  const url = catalogUrl(
    params("path=mods/306612/files&gameVersion=26.3&modLoaderType=4"),
  );
  assert.equal(url.searchParams.get("modLoaderType"), "4");
  assert.equal(
    catalogUrl(params("path=mods/306612/files/1234")).pathname,
    "/v1/mods/306612/files/1234",
  );
});
test("rejects arbitrary URLs, traversal, unrelated catalogs and unbounded queries", () => {
  for (const query of [
    "path=https://evil.test/",
    "path=//evil.test",
    "path=mods/../users",
    "path=users/me",
    "path=mods/search&gameId=1",
    "path=mods/search&pageSize=1000",
    "path=mods/search&pageSize=0",
    "path=mods/search&index=-1",
    "path=mods/search&classId=1",
    "path=mods/1/files&modLoaderType=100",
    "path=mods/search&url=https://evil.test",
    "path=mods/search&gameId=432&gameId=1",
    "path=mods/search&searchFilter=" + "x".repeat(121),
  ])
    assert.throws(() => catalogUrl(params(query)), query);
});
test("keeps the credential in the upstream header and only returns catalog data", async () => {
  const handler = createCatalogHandler({
    key: () => "test-private-key",
    fetch: async (url, options) => {
      assert.equal(options.headers["x-api-key"], "test-private-key");
      assert.equal(options.redirect, "error");
      assert.equal(url.origin, "https://api.curseforge.com");
      return {
        ok: true,
        json: async () => ({
          data: [{ id: 1 }],
          pagination: { totalCount: 1 },
          internal: "private",
        }),
      };
    },
  });
  const res = response();
  await handler(
    { method: "GET", url: "/api/curseforge?path=mods/search" },
    res,
  );
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, {
    data: [{ id: 1 }],
    pagination: { totalCount: 1 },
  });
  assert.ok(!JSON.stringify(res).includes("test-private-key"));
  assert.match(res.headers["Vercel-CDN-Cache-Control"], /s-maxage=120/);
});
test("fails clearly without a configured key and does not contact upstream", async () => {
  const res = response();
  await createCatalogHandler({
    key: () => "",
    fetch: () => assert.fail("must not fetch"),
  })({ method: "GET", url: "/api/curseforge?path=mods/search" }, res);
  assert.equal(res.code, 503);
  assert.equal(res.headers["Cache-Control"], "no-store");
});
test("rejects writes before reading credentials or contacting upstream", async () => {
  const res = response();
  await createCatalogHandler({ key: () => assert.fail("must not read key") })(
    { method: "POST", url: "/api/curseforge?path=mods/search" },
    res,
  );
  assert.equal(res.code, 405);
});
test("redacts upstream authentication errors and transport errors", async () => {
  for (const fetcher of [
    async () => ({ ok: false, status: 403, text: () => "private-secret" }),
    async () => {
      throw new Error("private-secret");
    },
  ]) {
    const res = response();
    await createCatalogHandler({ key: () => "private-secret", fetch: fetcher })(
      { method: "GET", url: "/api/curseforge?path=mods/search" },
      res,
    );
    assert.equal(res.code, 502);
    assert.ok(!JSON.stringify(res).includes("private-secret"));
    assert.equal(res.headers["Cache-Control"], "no-store");
  }
});
test("preserves rate limiting without caching or exposing upstream responses", async () => {
  const res = response();
  await createCatalogHandler({
    key: () => "test",
    fetch: async () => ({ ok: false, status: 429 }),
  })({ method: "GET", url: "/api/curseforge?path=mods/search" }, res);
  assert.equal(res.code, 429);
  assert.equal(res.headers["Retry-After"], "60");
});
