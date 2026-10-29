import {
  readFileSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { createHash } from "node:crypto";
const directory = "in-game/build/libs";
let files;
try {
  files = readdirSync(directory);
} catch {
  throw new Error(
    "Build the bundled Fabric companion first: gradle -p in-game build",
  );
}
const jar = files.find(
  (name) =>
    /^ar-client-fabric-\d.*\.jar$/.test(name) &&
    !name.includes("sources") &&
    !name.includes("dev"),
);
if (!jar)
  throw new Error(
    "No distributable Fabric companion jar found. Run gradle -p in-game build.",
  );
const bytes = readFileSync(`${directory}/${jar}`);
mkdirSync("src-tauri/resources", { recursive: true });
copyFileSync(`${directory}/${jar}`, "src-tauri/resources/ar-client-fabric.jar");
writeFileSync(
  "src-tauri/resources/companion.json",
  JSON.stringify(
    {
      minecraft: "1.21.9",
      loader: "fabric",
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
    null,
    2,
  ),
);
console.log("Prepared checksum-verified Fabric 1.21.9 companion for bundling.");
