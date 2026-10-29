export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }
  try {
    const response = await fetch(
      "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json",
      { signal: AbortSignal.timeout(10000), redirect: "error" },
    );
    if (!response.ok) throw new Error("Manifest unavailable");
    const manifest = await response.json();
    const release = manifest.latest?.release;
    if (
      typeof release !== "string" ||
      !manifest.versions?.some((v) => v.id === release && v.type === "release")
    )
      throw new Error("Invalid manifest");
    res.setHeader("Cache-Control", "public, max-age=60");
    res.setHeader(
      "Vercel-CDN-Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=600",
    );
    return res.status(200).json({ release });
  } catch {
    return res
      .status(502)
      .json({ error: "Official Minecraft release metadata unavailable." });
  }
}
