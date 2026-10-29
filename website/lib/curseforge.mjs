const API = "https://api.curseforge.com/v1/";

// Construct every upstream URL ourselves. This service cannot proxy arbitrary
// hosts, HTTP methods, game catalogs, headers, or CurseForge account operations.
export function catalogUrl(input) {
  const route = input.get("path") || "";
  if (
    !/^(mods\/search|mods\/[1-9]\d{0,11}\/files(?:\/[1-9]\d{0,11})?)$/.test(
      route,
    )
  ) {
    throw new Error("Unsupported catalog route");
  }
  const url = new URL(route, API);
  const search = route === "mods/search";
  const file = /^mods\/\d+\/files\/\d+$/.test(route);
  const allowed = new Set(
    file
      ? ["path"]
      : search
        ? [
            "path",
            "gameId",
            "classId",
            "gameVersion",
            "searchFilter",
            "index",
            "pageSize",
            "modLoaderType",
          ]
        : ["path", "gameVersion", "modLoaderType", "index", "pageSize"],
  );
  for (const name of input.keys()) {
    if (!allowed.has(name) || input.getAll(name).length !== 1)
      throw new Error("Unsupported catalog parameter");
  }
  if (file) return url;
  const bounded = (name, fallback, max) => {
    const value = input.get(name) ?? String(fallback);
    if (!/^\d+$/.test(value) || Number(value) > max)
      throw new Error("Invalid catalog pagination");
    url.searchParams.set(name, String(Number(value)));
  };
  bounded("index", 0, 10000);
  bounded("pageSize", 20, 50);
  if (url.searchParams.get("pageSize") === "0")
    throw new Error("Invalid page size");
  const version = input.get("gameVersion");
  if (version) {
    if (!/^[0-9][A-Za-z0-9.+_-]{0,39}$/.test(version))
      throw new Error("Invalid Minecraft version");
    url.searchParams.set("gameVersion", version);
  }
  const loader = input.get("modLoaderType");
  if (loader !== null) {
    if (!["0", "1", "4", "5", "6"].includes(loader))
      throw new Error("Invalid modloader");
    url.searchParams.set("modLoaderType", loader);
  }
  if (search) {
    if (input.has("gameId") && input.get("gameId") !== "432")
      throw new Error("Minecraft catalog only");
    const category = input.get("classId") || "6";
    if (!["6", "12", "4471"].includes(category))
      throw new Error("Invalid project type");
    const query = input.get("searchFilter") || "";
    if (query.length > 120 || /[\x00-\x1f\x7f]/.test(query))
      throw new Error("Invalid search");
    url.searchParams.set("gameId", "432");
    url.searchParams.set("classId", category);
    url.searchParams.set("searchFilter", query);
  }
  return url;
}

export function createCatalogHandler({
  fetch: fetcher = globalThis.fetch,
  key = () => process.env.CURSEFORGE_API_KEY,
} = {}) {
  return async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res
        .status(405)
        .json({ error: "Only catalog GET requests are supported." });
    }
    let upstream;
    try {
      upstream = catalogUrl(
        new URL(req.url, "https://ar-client.invalid").searchParams,
      );
    } catch {
      return res.status(400).json({ error: "Invalid catalog request." });
    }
    const credential = key();
    if (!credential)
      return res
        .status(503)
        .json({
          error:
            "CurseForge is not configured on the AR Client service. Modrinth remains available.",
        });
    try {
      const response = await fetcher(upstream, {
        headers: { "x-api-key": credential, Accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        const status = [404, 429].includes(response.status)
          ? response.status
          : 502;
        if (status === 429) res.setHeader("Retry-After", "60");
        return res
          .status(status)
          .json({
            error:
              status === 404
                ? "Catalog file not found."
                : status === 429
                  ? "Catalog request limit reached. Try again shortly."
                  : "The CurseForge catalog is temporarily unavailable.",
          });
      }
      const payload = await response.json();
      if (!payload || !Object.hasOwn(payload, "data"))
        throw new Error("Invalid upstream response");
      // Cache public catalog metadata at Vercel; never cache errors or credentials.
      res.setHeader("Cache-Control", "public, max-age=30");
      res.setHeader(
        "Vercel-CDN-Cache-Control",
        "public, s-maxage=120, stale-while-revalidate=300",
      );
      return res
        .status(200)
        .json({
          data: payload.data,
          ...(payload.pagination ? { pagination: payload.pagination } : {}),
        });
    } catch {
      return res
        .status(502)
        .json({
          error:
            "The CurseForge catalog could not be reached. Try again shortly.",
        });
    }
  };
}
