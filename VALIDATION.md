# Validation

Checks below were recorded on 28 October–4 November 2026. Installation and compilation checks do not establish authenticated gameplay or performance.

## Passed

- 37 Rust tests on Linux and 38 on Windows (including a real Windows credential-vault integration test): managed paths, hashes, version metadata, command validation, profile recovery, content rollback, skin decoding and client-ID defaults, login diagnostics, Horizon ownership/signature guards and server validation.
- 7 frontend tests, 4 release-policy tests and 8 catalog-service tests; TypeScript production build.
- Windows x64 NSIS packaging and native startup; version-specific Fabric companion builds with JDK 25 / Gradle 9.8.0.
- Launcher browser navigation and website layouts at 320, 390, 1280 and 1440px without uncaught errors or horizontal overflow.
- Website navigation, local assets, FAQ controls and published-release download resolution.
- Redesigned launcher previews used the real Rust core with a temporary 26.3 Fabric installation, live Mojang/Modrinth data, and no signed-in account. Layouts at 980, 1280 and 1440px passed overflow/error checks; settings and HUD controls were checked through the native command dispatcher.
- Mojang release metadata reported **26.3**. Microsoft accepted a device authorization request for the bundled public app ID.
- Live Modrinth downloads for Sodium, Lithium and Fabric API with hash verification; compatibility metadata from all four loaders.
- Live CurseForge catalog requests, including a 26.3 query through the server handler, returned HTTP 200 without exposing the key.
- Live `client.kingar1000.xyz` HTTPS, assets, privacy/terms, release metadata and CurseForge catalog service passed desktop/mobile checks. Invalid catalog routes return 400; writes return 405.
- Latest-stable catalog verification installed Sodium, Lithium and Fabric API for 26.3 with hashes checked; all four loaders returned compatible metadata. Vanilla 26.3 installation was reverified successfully.

- Companion builds validate actual mouse/zoom injection targets and argument descriptors, exact game metadata, Java bytecode level and packaged jar hashes. Rust regressions cover exact-version selection, minimum loader versions, manifest traversal/duplicates, tampered bundles and stale-jar retirement. Frontend coverage prevents a newer game being downgraded to obtain a HUD.

## 2 November additions

- Live local Minecraft 26.3 dedicated server: verified server/Java downloads, startup, console command, graceful stop and saved `world/level.dat` passed on Linux.
- Actual Horizon Nightly `2026-11-01 · c9d474d`: Linux archive SHA-256, signed-checksum verification and actual client/preparer option contracts passed. The published preparer lacks `--launch-api`; its real help and research-lock fallback were checked. This does not establish Windows Rust gameplay or successful resource preparation.
- Local Workers/D1 integration tests passed for authentication refusal, friend acceptance, friend-only messages, outsider denial, blocking/unblocking, input limits and social profile/session revocation. The social service is now deployed on D1/Workers Free; health returns 200 and unauthenticated calls return 401. Full real-account chat is still unverified.
- Minecraft login 403 is now actionable and regression-tested for secret redaction. The owner reported app registration approval on 3 November; authenticated gameplay is still unverified.

## 3 November credential storage fix

- Reproduced the Windows credential size failure in a real Windows vault test. The keyring backend limits UTF-16 credential blobs by bytes, despite the error wording referring to characters.
- Large token bundles now use generation-based, size-bounded OS-vault entries. A small manifest is committed only after every piece is saved; failed writes preserve the previous credential. Existing single-entry credentials remain readable, and logout removes the stored pieces.
- Regression coverage passed for large tokens, Unicode, size boundaries, account isolation, old credentials, refresh replacement, deletion, failed chunk/manifest writes, missing pieces, malformed metadata and oversize rejection. The actual Windows-vault save/read/refresh/logout test passed in GitHub Actions.
- The owner must retry Microsoft sign-in using the corrected installer to verify the complete account flow. This automated storage test does not establish authenticated gameplay.

## 4 November launcher layout and icon

- Rebuilt the launcher shell and Home screen around Horizon-inspired top navigation, a single launch row and numbered setup rows. All launcher sections remain accessible from the main navigation and More menu. Horizon's MIT notice is retained.
- Browser checks passed for all navigation routes, the Client/Server switch, installation creation dialog and dropdown closure. Home was checked at widths 600, 980, 1280 and 1440 without horizontal overflow; no uncaught browser errors occurred. Screenshots use the browser preview with no fabricated accounts or installations.
- Generated a contrasting dark-tile AR app icon and rebuilt the configured 32/128/256px PNGs and multi-resolution Windows ICO. The 32px rendering was visually inspected.

## Cloudflare production deployment

- Deployed `ar-client-website` and attached `client.kingar1000.xyz` on 2 November 2026. Live Home/Privacy/Terms, logo SHA-256, Minecraft release metadata (26.3), and a 26.3 CurseForge catalog request passed over HTTPS.
- Cloudflare API explicitly reported Workers Free when rejecting a custom CPU-limit setting. Custom limits were removed, preserving the free plan's built-in cap. No paid plan was enabled.
- Worker fetch uses `redirect: manual` and rejects non-success statuses, since Workers does not support `redirect: error`. The production preview caught and resolved this runtime difference; no API credentials are forwarded on redirects.
- The renamed social Worker `ar-client` serves `https://social.client.kingar1000.xyz/`; the launcher default and checked-in deployment name match. Existing D1 data and the daily cleanup schedule were retained.
- Cloudflare Workers Builds is connected to GitHub `main` for both Workers with relevant path filters and branch previews disabled. A push-triggered website deployment and a backend deployment with D1 migrations completed successfully on Free. GitHub Actions remain manual.
- Social database schema and migration history are installed, retention cleanup is scheduled daily, `/health` returns 200 and unauthenticated requests return 401. No fake users or messages were inserted into production.

## Installation checks

These downloaded and verified upstream game files, assets and libraries, ran loader installers where required, and assembled classpaths. They did not authenticate or launch a game session.

| Minecraft | Loader | Result |
| --- | --- | --- |
| 26.3 | Vanilla | 67 classpath entries; automatic verified Java 25 installation |
| 1.21.9 | Fabric 0.17.2 | 79 classpath entries |
| 1.21.9 | Quilt 0.29.2 | 82 classpath entries |
| 1.21.9 | Forge 59.0.5 | 119 classpath entries |
| 1.21.9 | NeoForge 21.9.16-beta | 99 classpath entries |

To repeat a live installation check, run `cargo run --manifest-path src-tauri/Cargo.toml --no-default-features --example verify_install -- 26.3`. This downloads game files. Set `AR_TEST_JAVA` to select an existing Java executable. `verify_catalog` checks live Modrinth downloads and loader metadata. The checks use temporary directories; proxy-bound environments may require Java proxy/truststore configuration.

## Unverified

- Full Microsoft/Xbox/Minecraft login, refresh, entitlement handling, skin uploads and cape changes. Device-code issuance alone does not confirm Minecraft Services approval.
- Authenticated Windows gameplay, Fabric mixins, multiplayer, graphics/input latency and long-running recovery.
- Signed-update installation and upgrade recovery. No stable release is published; release-signing configuration remains unverified. Windows development installers are unsigned.
- Full CurseForge install/update workflows and arbitrary third-party modpack compatibility.

## Current limits

- AR HUD requires Fabric and an exact matching bundled build. The build matrix covers 1.21.9, 1.21.10, 1.21.11, 26.1, 26.1.1, 26.1.2, 26.2 and 26.3. Future versions require successful compilation, mixin/jar checks and distribution through an AR Client update; compatibility with unreleased APIs is not guaranteed.
- Modpacks support imports, not full lifecycle tracking/updating or transactional rollback of pack overrides. Use isolated installations.
- Catalog changes use staged downloads and rollback on ordinary file failures, not crash-proof transactions.
- Downloads report stages and verified file counts; cancellation and byte-level progress are absent.
- HUD controls support position, scale, opacity, color, visibility, keybinds, crosshair settings, scoreboard visibility and chat opacity. Named layouts, full themes and advanced chat/scoreboard styling are absent.
- Resource packs have no animated preview. Loader upgrades are selected through installation settings; Minecraft upgrades use separate installations.
- Performance presets can install compatible Sodium/Lithium releases. FPS, memory and latency improvements have not been benchmarked.
