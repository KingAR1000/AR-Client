# Cloudflare Workers Free hosting

Use **Workers Free**, with Static Assets for the website and a small Worker for `/api/minecraft` and `/api/curseforge`. Static asset requests bypass Worker execution. Only the allowlisted HTML, images, fonts and security headers enter `dist/`; source files, credentials and configuration are excluded.

Do not enable Workers Paid, paid add-ons, R2, Spectrum, rented Minecraft servers or a paid database. Free-plan limits are hard limits: APIs may become unavailable when a quota is exhausted. Workers Free supplies its built-in CPU cap; setting a custom CPU limit is a Paid-only feature. Verify the account uses **Workers Free** before deploying. Free-plan capacity is not unlimited.

## Deployment

Deployed on 2 November 2026: **https://client.kingar1000.xyz/**, Worker `ar-client-website`, account `e9fef78eaadc935dacc244a9ab036c87`. The Workers Free plan was confirmed by Cloudflare's API rejecting a custom CPU limit as unsupported on Free. No plan was upgraded. The configuration uses the free plan's built-in CPU limit; custom `limits.cpu_ms` must remain omitted because it requires Paid.

Live Home, Privacy, Terms, logo integrity, latest Minecraft metadata (26.3), and CurseForge catalog requests passed. The catalog key is stored as a secret binding. The custom domain is attached directly to this Worker. The preview is `https://ar-client-website.hi-helllloooo-hi123-e9f.workers.dev`.

An owner can also deploy using local Wrangler:

```text
npm ci --prefix social
npm --prefix website test
npm --prefix website run cloudflare:check
cd website
node ../social/node_modules/wrangler/bin/wrangler.js login
node ../social/node_modules/wrangler/bin/wrangler.js secret put CURSEFORGE_API_KEY
npm run cloudflare:deploy
```

The key is private. Use Wrangler's interactive secret prompt; never put it in source, a command argument, browser code or a public variable. Keep the existing website running until the Cloudflare preview URL and both APIs pass checks.

The output gives an `ar-client-website.<account>.workers.dev` URL. Verify `/`, `/privacy`, `/terms`, assets and the API routes there. Then attach **client.kingar1000.xyz** as the Worker's custom domain. Cloudflare must replace the existing Vercel DNS target for that hostname; do this only after the preview works. Do not delete the domain or disrupt the owner's other records. Retire the old Vercel deployment only after the domain serves the verified Cloudflare site and APIs.

## Free-plan capacity

Checked against Cloudflare's documentation on 2 November 2026:

- Static Assets requests are free and unlimited; the configuration sends only `/api/*` through Worker code.
- Workers Free: **100,000 dynamic requests/day**, shared across the account; **10 ms CPU** per invocation.
- D1 Free for the separate friends/chat service: **5 million rows read/day**, **100,000 rows written/day**, **5 GB total storage** across the account, with additional per-database limits.
- Social chat's active polling consumes dynamic requests. Reaching a free quota must result in throttling/unavailability, never an upgrade or paid fallback.
- Friends/chat remains a separate Worker/D1 deployment; follow [`social/README.md`](../social/README.md). The website itself needs no database.
- Minecraft hosting runs on the user's computer, using its hardware, power and internet connection; AR Client provisions no paid cloud machines. Existing domain renewals and players' Minecraft licenses are separate from these free hosting services.

References: https://developers.cloudflare.com/workers/platform/pricing/ and https://developers.cloudflare.com/d1/platform/pricing/.

## Verify

- `/api/minecraft` returns the latest verified official stable Minecraft release.
- `/api/curseforge?path=mods%2Fsearch&gameId=432&classId=6&gameVersion=26.3&pageSize=1` returns catalog data after secret configuration.
- Missing secrets return 503; invalid catalog paths return 400; writes return 405. Errors are not cached. Cache entries contain public metadata only.
- Download links resolve actual GitHub Releases or Actions builds. No paid downloads or ads are added.
- GitHub workflows remain manual. Website checks now validate both API handlers and the Cloudflare bundle.

Local static preview: `npm --prefix website run dev`. Actual Cloudflare runtime preview after installing the shared tooling: `cd website` then `node ../social/node_modules/wrangler/bin/wrangler.js dev`.

## GitHub deployments

Cloudflare Workers Builds connects `KingAR1000/AR-Client`, production branch `main`, to both Workers. Branch previews are disabled. GitHub Actions remain manual; Cloudflare deploys only relevant source changes.

| Worker | Root directory | Build command | Deploy command | Watched paths |
| --- | --- | --- | --- | --- |
| `ar-client-website` | `/website` | `npm ci --prefix ../social && npm test` | `node ../social/node_modules/wrangler/bin/wrangler.js deploy --keep-vars` | `website/**`, `social/package.json`, `social/package-lock.json` |
| `ar-client` | `/social` | `npm test` | `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy` | `social/**` |

Markdown-only changes are excluded. The backend deploy applies versioned D1 migrations before publishing. Runtime secrets remain in Cloudflare; never put them into build variables. Keep Workers Builds on its free allowance. If it is exhausted, wait for renewal or deploy locally using the commands above; do not upgrade.

To deploy an unchanged commit again, use the Worker's **Settings → Builds → Build history → Retry build** in Cloudflare. The social endpoint is **https://social.client.kingar1000.xyz/**; the existing database and daily retention schedule are preserved.
