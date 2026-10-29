import { readFileSync, writeFileSync } from "node:fs";

async function json(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "ARClient/0.1.0 (KingAR1000/AR-Client)" },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(
      `Metadata unavailable: ${new URL(url).hostname} (${response.status})`,
    );
  return response.json();
}
const path = "in-game/versions.json";
const config = JSON.parse(readFileSync(path, "utf8"));
const manifest = await json(
  "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json",
);
const releases = [];
let floor = false;
for (const release of manifest.versions) {
  if (release.type !== "release") continue;
  releases.push(release);
  if (release.id === "1.21.9") {
    floor = true;
    break;
  }
}
if (!floor || releases[0]?.id !== manifest.latest.release)
  throw new Error("Cannot establish the official supported release range.");
const added = [];
for (const release of releases) {
  if (config.versions.some((v) => v.minecraft === release.id)) continue;
  const game = await json(release.url);
  const yarn = await json(
    `https://meta.fabricmc.net/v2/versions/yarn/${encodeURIComponent(release.id)}`,
  );
  const loaders = await json(
    `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(release.id)}`,
  );
  const apis = await json(
    `https://api.modrinth.com/v2/project/fabric-api/version?game_versions=${encodeURIComponent(JSON.stringify([release.id]))}`,
  );
  const loader = loaders.find((v) => v.loader?.stable)?.loader?.version;
  const api = apis.find((v) => v.version_type === "release");
  if (!loader || !api)
    throw new Error(
      `Stable Fabric dependencies are not available for ${release.id}.`,
    );
  const entry = {
    minecraft: release.id,
    java: game.javaVersion.majorVersion,
    yarn: yarn[0]?.version ?? null,
    loader,
    fabricApi: api.version_number,
    screenApi: "gui",
    inputApi: "sdl",
  };
  // New recipes are candidates. Build, API linking and bytecode validation must
  // all pass before prepare-companion can put them into a distributable.
  config.versions.push(entry);
  added.push(release.id);
}
config.versions.sort(
  (a, b) =>
    releases.findIndex((v) => v.id === b.minecraft) -
    releases.findIndex((v) => v.id === a.minecraft),
);
if (process.argv.includes("--write"))
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n");
console.log(
  added.length
    ? `New build candidates: ${added.join(", ")}. ${process.argv.includes("--write") ? "Recipes saved; run companion:build and companion:prepare before distributing." : "Run with --write to save recipes."}`
    : `All ${releases.length} official stable releases have build recipes. Latest: ${manifest.latest.release}.`,
);
