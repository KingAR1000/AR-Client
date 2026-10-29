import {
  readFileSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
const config = JSON.parse(readFileSync("in-game/versions.json", "utf8"));
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const output = "src-tauri/resources/companions";
const builds = config.versions.map((profile) => {
  const directory = `in-game/build/${profile.minecraft}`;
  const proof = JSON.parse(
    readFileSync(`${directory}/verified-mixins.json`, "utf8"),
  );
  if (proof.minecraft !== profile.minecraft || proof.targets.length !== 2)
    throw new Error(`Invalid mixin validation for ${profile.minecraft}`);
  const filename = `ar-client-fabric-${profile.minecraft}-${pkg.version}.jar`;
  const bytes = readFileSync(`${directory}/libs/${filename}`);
  if (createHash("sha256").update(bytes).digest("hex") !== proof.sha256)
    throw new Error(
      `The validated jar changed for ${profile.minecraft}; rebuild before packaging.`,
    );
  return {
    profile,
    filename,
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
});
// Read/validate every input before replacing the bundle.
mkdirSync("src-tauri/resources", { recursive: true });
rmSync(output, { recursive: true, force: true });
mkdirSync(output);
for (const build of builds)
  copyFileSync(
    `in-game/build/${build.profile.minecraft}/libs/${build.filename}`,
    `${output}/${build.filename}`,
  );
writeFileSync(
  "src-tauri/resources/companion.json",
  JSON.stringify(
    {
      format: 1,
      builds: builds.map(({ profile, filename, sha256 }) => ({
        minecraft: profile.minecraft,
        loader: "fabric",
        minLoader: profile.loader,
        fabricApi: profile.fabricApi,
        filename,
        sha256,
      })),
    },
    null,
    2,
  ),
);
console.log(
  `Prepared ${builds.length} version-specific, checksum-verified AR HUD builds.`,
);
