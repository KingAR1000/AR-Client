# Validation

Checks below were recorded on 28–29 October 2026. Installation and compilation checks do not establish authenticated gameplay or performance.

## Passed

- 20 Rust tests: managed paths, hashes, version metadata, command validation, profile recovery, content rollback, skin decoding and client-ID defaults.
- 6 frontend tests, 4 release-policy tests and 8 catalog-service tests; TypeScript production build.
- Windows x64 NSIS packaging and native startup; Fabric companion build with JDK 21 / Gradle 9.1.0.
- Launcher browser navigation and website layouts at 320, 390, 1280 and 1440px without uncaught errors or horizontal overflow.
- Website navigation, local assets, FAQ controls and published-release download resolution.
- Mojang release metadata reported **26.3**. Microsoft accepted a device authorization request for the bundled public app ID.
- Live Modrinth downloads for Sodium, Lithium and Fabric API with hash verification; compatibility metadata from all four loaders.
- Live CurseForge catalog requests, including a 26.3 query through the server handler, returned HTTP 200 without exposing the key.

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
- Signed-update installation and upgrade recovery. No project updater key or stable release has been configured; Windows development installers are unsigned.
- Public Vercel deployment, environment setup and custom-domain HTTPS; see [website/HOSTING.md](website/HOSTING.md).
- Full CurseForge install/update workflows and arbitrary third-party modpack compatibility.

## Current limits

- The bundled companion supports **Fabric 1.21.9 only**. New launcher installations still default to the latest stable Minecraft release.
- Modpacks support imports, not full lifecycle tracking/updating or transactional rollback of pack overrides. Use isolated installations.
- Catalog changes use staged downloads and rollback on ordinary file failures, not crash-proof transactions.
- Downloads report stages and verified file counts; cancellation and byte-level progress are absent.
- HUD controls support position, scale, opacity, color, visibility, keybinds, crosshair settings, scoreboard visibility and chat opacity. Named layouts, full themes and advanced chat/scoreboard styling are absent.
- Resource packs have no animated preview. Loader upgrades are selected through installation settings; Minecraft upgrades use separate installations.
- Performance presets can install compatible Sodium/Lithium releases. FPS, memory and latency improvements have not been benchmarked.
