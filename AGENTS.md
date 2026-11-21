# AR Client — agent notes

## Layout

- `src/` React launcher UI (Vite). `src/social.ts` is the launcher-wide friends connection; `src/preview.ts` is dev-only sample data.
- `src-tauri/` Rust backend (`social.rs` builds the Mojang-signed friends session).
- `social/` Cloudflare Worker + D1 for friends/chat. Never add Worker-to-Mojang requests: Mojang blocks Cloudflare egress.
- `website/` Cloudflare static site + API worker. `in-game/` Fabric companion (needs JDK 25 + Gradle).

## Verify

- `npm test` (vitest + release + website tests), `npm run build` (tsc + vite)
- `cd social && npm test` (Miniflare/workerd + D1), `npm run build` (wrangler dry run)
- `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --locked`
- Format JS/TS/CSS/HTML with `npx prettier --write <files>`.
- UI preview with sample data: `npm run dev`, open `http://127.0.0.1:1420/?preview#<Page>`.
