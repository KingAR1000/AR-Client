import minecraft from "./api/minecraft.js";
import { createCatalogHandler } from "./lib/curseforge.mjs";
const security = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};
export async function invoke(handler, request) {
  let status = 200;
  const headers = new Headers(security);
  let result;
  const response = {
    setHeader(name, value) {
      headers.set(name, value);
    },
    status(code) {
      status = code;
      return response;
    },
    json(body) {
      headers.set("Content-Type", "application/json; charset=utf-8");
      result = new Response(JSON.stringify(body), { status, headers });
      return result;
    },
  };
  await handler({ method: request.method, url: request.url }, response);
  return (
    result || new Response("Service unavailable", { status: 503, headers })
  );
}
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    let handler;
    if (url.pathname === "/api/minecraft") handler = minecraft;
    else if (url.pathname === "/api/curseforge")
      handler = createCatalogHandler({ key: () => env.CURSEFORGE_API_KEY });
    else
      return Response.json(
        { error: "Not found" },
        { status: 404, headers: security },
      );
    const cache = globalThis.caches?.default;
    if (request.method === "GET" && cache) {
      const cached = await cache.match(request);
      if (cached) return cached;
    }
    const response = await invoke(handler, request);
    if (request.method === "GET" && response.status === 200 && cache)
      ctx.waitUntil(cache.put(request, response.clone()));
    return response;
  },
};
