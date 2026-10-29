import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const config = JSON.parse(readFileSync("in-game/versions.json", "utf8"));
const selected = process.argv.slice(2);
const versions = selected.length
  ? config.versions.filter((v) => selected.includes(v.minecraft))
  : config.versions;
if (selected.some((v) => !versions.some((entry) => entry.minecraft === v)))
  throw new Error("Unknown companion version. Run companion:refresh first.");
const executable =
  process.env.AR_GRADLE ||
  (process.platform === "win32" ? "gradle.bat" : "gradle");
for (const version of [...versions].reverse()) {
  if (!/^[0-9][0-9A-Za-z._+-]*$/.test(version.minecraft))
    throw new Error("Invalid Minecraft version in companion configuration");
  console.log(
    `Building and validating AR HUD for Minecraft ${version.minecraft}`,
  );
  const result = spawnSync(
    executable,
    [
      "-p",
      "in-game",
      `-Pminecraft_version=${version.minecraft}`,
      "build",
      "--no-daemon",
    ],
    { stdio: "inherit", shell: process.platform === "win32" },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      `Companion validation failed for ${version.minecraft}; no compatibility claim was generated.`,
    );
  const report = join(
    "in-game",
    "build",
    version.minecraft,
    "verified-mixins.json",
  );
  if (!existsSync(report))
    throw new Error(
      `Missing bytecode validation report for ${version.minecraft}`,
    );
}
