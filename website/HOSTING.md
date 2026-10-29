# Vercel deployment

Import `KingAR1000/AR-Client` with these settings:

| Setting | Value |
| --- | --- |
| Production Branch | `main` |
| Root Directory | `website` |
| Framework Preset | Other |
| Build Command | Empty |
| Output Directory | `.` |
| Node.js | 22.x |

No frontend build or dependencies are required. Vercel serves the HTML/assets and runs `api/curseforge.js` and `api/minecraft.js` as Node functions. The repository root builds the desktop renderer and must not be used as the website root.

## CurseForge

Add **CURSEFORGE_API_KEY** in Vercel's environment settings, mark it Sensitive, and redeploy. Enable it for production and any previews needing catalog access. Never use a public-variable prefix or commit its value.

The service accepts bounded, read-only Minecraft catalog queries against fixed CurseForge endpoints. Set Vercel firewall rate limits within the upstream API quota. A personal key saved in the launcher overrides the shared service and connects directly to CurseForge.

## Domain

Add **client.kingar1000.xyz** to the Vercel project. Copy its assigned DNS record into Cloudflare, using DNS only while verifying the hostname and HTTPS. The launcher uses this hostname for the shared catalog service.

## Check the deployment

- `/api/minecraft` returns the latest official stable release.
- `/api/curseforge?path=mods%2Fsearch&gameId=432&classId=6&gameVersion=26.3&pageSize=1` returns catalog data once the key is configured. Missing configuration returns 503.
- Download links resolve real published Windows assets, falling back to GitHub Actions development builds when no stable release exists.
- Privacy and terms pages use the support address **hello@kingar1000.xyz**.

For local preview, run `npm --prefix website run dev`; tests use `npm --prefix website test`. The local server runs on `http://127.0.0.1:8787`. Set `CURSEFORGE_API_KEY` privately for local catalog requests; visual preview and unit tests need no key.
