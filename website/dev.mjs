import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname } from "node:path";
import curseforge from "./api/curseforge.js";
import minecraft from "./api/minecraft.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const types = {
  ".html": "text/html; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ttf": "font/ttf",
  ".txt": "text/plain",
};
http
  .createServer(async (req, res) => {
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (body) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(body));
    };
    const path = new URL(req.url, "http://localhost").pathname;
    if (path === "/api/curseforge") return curseforge(req, res);
    if (path === "/api/minecraft") return minecraft(req, res);
    const relative = path === "/" ? "index.html" : path.slice(1);
    if (
      ![
        "index.html",
        "privacy.html",
        "terms.html",
        "privacy",
        "terms",
      ].includes(relative) &&
      !/^assets\/[a-zA-Z0-9._-]+$/.test(relative)
    )
      return res.status(404).json({ error: "Not found" });
    const filename = ["privacy", "terms"].includes(relative)
      ? relative + ".html"
      : relative;
    try {
      const content = await readFile(resolve(root, filename));
      res.setHeader(
        "Content-Type",
        types[extname(filename)] || "application/octet-stream",
      );
      res.end(content);
    } catch {
      res.status(404).json({ error: "Not found" });
    }
  })
  .listen(8787, "127.0.0.1", () =>
    console.log("AR Client website: http://127.0.0.1:8787"),
  );
