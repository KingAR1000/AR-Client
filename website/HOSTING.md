# Website deployment on Vercel

The owner selected **Vercel** on 2026-10-29. The redesigned source is in this folder; the former Sites preview does not contain this redesign. Intended hostname: **client.kingar1000.xyz**. DNS provider: **Cloudflare**. Public support: **hello@kingar1000.xyz**.

## Project settings

Import `KingAR1000/AR-Client` into the owner's Vercel account using **main** as the Production Branch. PR #1 has been merged. If the project was previously configured to use `feat/ar-client`, switch its Production Branch to **main** in Git settings and redeploy.

- Root Directory: **website**
- Framework Preset: **Other**
- Build Command: leave empty / override to no build
- Output Directory: **.** (the project root)
- Install Command: no dependencies are required; the default is sufficient
- Node.js: **22.x**

Do not use the repository root as this website's root: its Vite build is the desktop renderer. Vercel detects `api/curseforge.js` and `api/minecraft.js` as Node server functions. The website itself is plain HTML with embedded CSS/JS and local assets.

No Vercel account credentials or integration are available in this session. Source preparation and local tests do not publish a Vercel deployment.

Alternatively, in an up-to-date checkout of the implementation branch, run `npx vercel` from this folder using the owner's Vercel login, then `npx vercel --prod` after configuration and preview verification.

## Private CurseForge configuration

In Vercel **Project Settings → Environment Variables**, add **CURSEFORGE_API_KEY** with the owner-provided key. Mark it Sensitive for production; add preview availability if the owner wants preview catalog testing. Redeploy after changing environment variables. Never use a `VITE_`, `NEXT_PUBLIC_`, or other public prefix. Never put the value in `vercel.json`, Git, a URL, a build argument or chat again.

The supplied key passed a live upstream catalog search. The actual handler also passed a live filtered request for Minecraft 26.3 with that key; the response contained catalog data and no credential. The key was used in memory for those checks and is **not provisioned into a Vercel project yet**. It is never shipped in desktop binaries. A personal key saved in the launcher's OS vault overrides the shared service and connects directly to CurseForge.

The proxy accepts only bounded GET metadata requests against fixed CurseForge Minecraft endpoints. It follows no redirects, forwards no player credentials or caller-supplied headers, caches only public successful data, and redacts failures. Set an appropriate rate limit in Vercel's firewall for `/api/curseforge`, within the upstream API quota, before public promotion. Do not use a process-local counter as a purported distributed limit.

## Domain and Cloudflare

After a successful Vercel deployment, add **client.kingar1000.xyz** under Project Settings → Domains. Copy the exact DNS record Vercel assigns into Cloudflare. Vercel may assign a project-specific CNAME, so do not guess the target. Use DNS only (grey cloud) while verifying the hostname and HTTPS.

The previous `custom-domains.chatgpt.site` CNAME and Sites verification TXT instructions are **superseded**. Do not add them for Vercel. If those records were already added, replace only the `client` CNAME with Vercel's assigned target. Remove obsolete Sites verification TXT entries for this hostname after the Vercel switch is verified. Leave the apex domain, mail records, and unrelated subdomains untouched. No DNS records have been changed by this session.

## Verification

- Open the Vercel preview: logo should be a flat white monogram, with no glow or rectangular background.
- `GET /api/minecraft` returns the latest official stable release from Mojang's manifest, currently `26.3`.
- `GET /api/curseforge?path=mods%2Fsearch&gameId=432&classId=6&gameVersion=26.3&pageSize=1` returns a `data` array after the private key is configured.
- Missing server configuration returns 503; errors do not expose keys. No secret should appear in public page source or response headers.
- The download control uses a real published x64 Windows release asset when one exists. Otherwise it points to GitHub Actions development builds, with their sign-in requirement stated.
- Confirm the custom hostname and certificate are valid before promoting it. The launcher uses the custom hostname for the shared CurseForge service; a preview hostname alone does not activate that route.

Local checks: `npm test` inside this folder; `npm run dev` serves both HTML and real handlers on `http://127.0.0.1:8787`. For a local key, set `CURSEFORGE_API_KEY` through a private environment mechanism. `.env*` files are ignored. No key is needed for visual preview or mocked unit tests.

## Previous hosting record (historical only)

The old preview remains at `https://ar-client-kingar1000.kingar-1000.chatgpt.site`. Existing Sites project ID: `appgprj_6ae299e130d8819195c255e0a348c2dc`; former deployment `appgdep_6ae29a9cee3c819194de5011b0ce8685`; pending domain record `appgdom_6ae29ab27eb48191a48ee37bb9a0484f`. `.openai/hosting.json` retains this historical identity and is excluded from Vercel deployments. Do not recreate or republish Sites for this website. No previous deployment or source history has been deleted.
