# Validation record

This file distinguishes implementation from verified behavior. No production certification or FPS benchmark is implied.

## Verified in the Linux workspace

- Mojang manifest fetched on 2026-10-28: latest release `26.3`.
- React/TypeScript production build completes.
- Nine Rust core unit tests pass (checksum verification, path validation, rule matching, library inheritance, profile validation, state round-trip).
- Further integration and platform build results will be recorded before handoff.

## Requires external setup or runtime verification

- Microsoft/Xbox/Minecraft login, refresh, entitlement checks, skins/capes: no approved Microsoft application ID or owner test session supplied.
- CurseForge: no API key supplied.
- Signed updater: no project updater signing key supplied; no published release exists.
- Windows Authenticode: no certificate supplied.
- Minecraft gameplay, graphics/input latency and performance presets: require real game sessions on target hardware.
- Companion mod currently targets Fabric 1.21.9 only. It must not be installed into 26.x.

## Implementation boundaries

- No crosshair/scoreboard/chat customization controls yet; the companion currently implements HUD metrics, zoom, toggles and layout editing.
- Modpack imports and manually imported files are not fully tracked for per-file update/removal by the catalog manager.
- Catalog updates select the first upstream compatible release. Full transactional rollback across multiple moved files and user-facing cancellation are not yet implemented.
- Dependency resolution rejects some nested pinned dependency shapes rather than guessing. Full arbitrary modpack graph support is not certified.
- Download progress reports verified file counts/stages, not continuous byte-level totals.
- Automatic update installation is opt-in; development builds cannot verify signed updates until the public key is configured.
- The website source is included; custom-domain hosting/DNS is not configured.

These are actual gaps relative to the original request, not claims that all requested features have been completed.
