import { cp, mkdir, rm } from "node:fs/promises";
const output = new URL("./dist/", import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of [
  "index.html",
  "privacy.html",
  "terms.html",
  "assets",
  "_headers",
])
  await cp(new URL(file, import.meta.url), new URL(file, output), {
    recursive: true,
  });
