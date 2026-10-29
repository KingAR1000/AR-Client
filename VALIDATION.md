# Validation record

Installation checks were performed on 2026-10-28; Microsoft registration checks and defaults were updated on 2026-10-29. This distinguishes implemented code from verified behavior; no production certification or FPS benchmark is implied.

## Passed in the Linux workspace

- Mojang manifest: latest official release **26.3**.
- React/TypeScript production build; **6 frontend tests**, including latest-stable defaults and release-range fallbacks; **4 release-policy tests** and **8 catalog-service tests**.
- **20 Rust tests**: path/HTTPS validation, checksum verification, metadata inheritance, version normalization, Send-safe command futures, profile CRUD, EULA enforcement, content rollback/collision protection, skin decoding and configuration recovery, and empty-ID migration while preserving custom registrations.
- Browser navigation across launcher sections: no uncaught runtime errors. Browser mode correctly refuses native operations.
- Redesigned Vercel website at 320px, 390px, 1280px and 1440px widths: no horizontal overflow or uncaught runtime errors; logo loads without brightness/inversion filters. Real Mojang metadata route returns 26.3. Screenshot shows the actual browser-rendered launcher interface, not a native gameplay session.
- Fabric companion `gradle build` succeeds with JDK 21 / Gradle 9.1.0; includes the crosshair/scoreboard mixins. Compilation does not prove gameplay behavior.
- Live Modrinth search and downloads for Sodium, Lithium and Fabric API, including hash verification.
- Public compatibility metadata retrieved from Fabric, Quilt, Forge and NeoForge.

## Real installation checks (not gameplay tests)

These fetched upstream metadata, downloaded/verified game jars, assets and libraries, ran relevant official loader installers, and assembled the classpath. None authenticated or launched Minecraft with an invented account.

| Minecraft | Loader | Result |
| --- | --- | --- |
| 1.21.9 | Fabric 0.17.2 | Passed, 79 classpath entries |
| 1.21.9 | Quilt 0.29.2 | Passed, 82 classpath entries |
| 1.21.9 | Forge 59.0.5 | Passed, 119 classpath entries |
| 1.21.9 | NeoForge 21.9.16-beta | Passed, 99 classpath entries |
| 26.3 | Vanilla | Passed, 67 classpath entries; automatic verified Java 25 runtime installation |

Forge/NeoForge subprocess checks used the workspace's inherited HTTP proxy and Java truststore through `JAVA_TOOL_OPTIONS`. Ordinary direct-network desktop installations do not require that workspace-specific configuration.

## Windows CI

The workflow builds a Windows x64 NSIS installer, bundles the Fabric companion, and smoke-tests native application startup without service credentials. Final run/artifact results are recorded in the pull request and GitHub Actions. Earlier runs caught missing Windows icon resources and a non-Send asset-download future; both were corrected and regression coverage added.

## External setup / unverified runtime behavior

- Microsoft accepted a device authorization request for the owner-provided app ID `a638a66e-7242-4bbe-b197-631d1ce1d7fb` on 2026-10-29. Full Microsoft/Xbox/Minecraft login, token refresh, entitlement checks, skin uploads and capes remain unverified; no player authorization session or Minecraft Services approval confirmation has been supplied.
- Owner-supplied CurseForge API key accepted by a live catalog request (HTTP 200) on 2026-10-29; the actual server handler also returned verified catalog JSON for a 26.3 search with no credential in its response. The bounded Vercel function and optional personal-vault override are implemented; public deployment and full install/update workflows remain unverified. The key is not in source or binaries.
- Signed updater: no project signing key or published stable release exists.
- Windows Authenticode: no signing certificate supplied; development installer is unsigned.
- Minecraft gameplay, Fabric mixin behavior, graphics/input latency, per-GPU performance and long-running game recovery: not verified in a real authenticated target-hardware session.
- Companion mod targets **Fabric 1.21.9 only**. The launcher can install other official releases; that does not make this mod compatible with them.

## Remaining gaps relative to the full product brief

- Full modpack lifecycle tracking/updating and transactional rollback of pack overrides are not implemented. Use a separate installation for each pack. Imported/local files do not acquire trustworthy compatibility metadata merely by being imported.
- Mod catalog updates support staged downloads and rollback on ordinary file-operation failures. This is not a crash-proof database transaction, nor proof of compatibility across arbitrary third-party dependency graphs.
- No user-facing download cancellation or byte-level progress; progress reports actual stages and verified file counts.
- HUD has position, scale, opacity, color, visibility, in-game keybinds, crosshair settings, scoreboard visibility and chat opacity; multiple named saved layouts, full theme management, advanced chat/scoreboard styling and animated resource-pack previews are absent.
- Loader updates are selected through installation configuration, not automatically migrated in the Update Center. Minecraft upgrades use new installations rather than world migration.
- Resource usage has not been benchmarked. “Maximum FPS” is a configurable preset with compatible Sodium/Lithium installation, not an FPS guarantee.
- Website redesign and server functions are prepared for the owner's chosen Vercel deployment. Vercel import, private environment setup, domain attachment and HTTPS verification are pending; use Vercel's assigned DNS values. See website/HOSTING.md.

This is substantial executable implementation work, but it is **not the complete production-ready application described in the original brief**. The remaining gaps are documented rather than hidden behind placeholder success states.
