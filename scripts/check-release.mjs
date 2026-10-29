import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
export function validateRelease(tag, versions) {
  const version = versions[0];
  if (
    !version ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(version)
  )
    throw new Error("Invalid release version.");
  if (versions.some((v) => v !== version))
    throw new Error(
      "package.json, tauri.conf.json and Cargo.toml must have the same release version.",
    );
  if (tag !== `v${version}`)
    throw new Error(`Release tag must be v${version}.`);
  return version;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const tauri = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
  const cargo = readFileSync("src-tauri/Cargo.toml", "utf8")
    .split(/^\[/m)
    .find((section) => section.startsWith("package]"));
  const cargoVersion = cargo?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  console.log(
    `Validated release ${validateRelease(process.env.AR_RELEASE_TAG, [pkg.version, tauri.version, cargoVersion])}`,
  );
}
