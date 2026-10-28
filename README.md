# AR Client

A free, GPL-3.0 Minecraft Java launcher by **KingAR1000**, with a black-and-white Tauri interface, Rust installation engine, and Fabric companion mod.

**Development build — not yet a production-certified release.** The launcher supports official release discovery beginning with 1.21.9; Mojang's manifest reported 26.3 as latest on 2026-10-28. New Minecraft releases do not imply that every loader, mod, or companion build is compatible. No FPS improvement or hardware benchmark is claimed without measurement.

## Repository

- `src/`: React/TypeScript desktop interface, skin viewer, HUD layout editor.
- `src-tauri/`: Rust download, verification, authentication, installation, content, credential-vault and launch services. Core tests run without a desktop GUI.
- `in-game/`: Fabric companion for **Minecraft 1.21.9**. Other game versions must not load this jar.
- `website/index.html`: standalone landing page with embedded CSS/JS; intended for `client.kingar1000.xyz`.
- `.github/workflows/`: Windows installer builds, core tests, Fabric builds and opt-in signed releases.

## Build on Windows 11 x64

Install Node.js 22 LTS, stable Rust through rustup, Microsoft C++ Build Tools with the Desktop development with C++ workload, Windows SDK, and WebView2 Runtime. Install JDK 21 and Gradle 9.1.0 to build the Fabric mod.

```powershell
git clone https://github.com/KingAR1000/AR-Client.git
cd AR-Client
# Until the implementation PR is merged:
git switch feat/ar-client
npm ci
npm test
cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --locked
gradle -p in-game build --no-daemon
node scripts/prepare-companion.mjs
npm run desktop
```

Build the Fabric companion first with `gradle -p in-game build`, then build the Windows installer with `npm run bundle`. The executable is under `src-tauri/target/release/bundle/nsis/`. CI uploads the installer as the **AR-Client-Windows-x64** artifact. Development installers are not Authenticode signed and may trigger Windows SmartScreen.

```powershell
gradle -p in-game build --no-daemon
```

The distributable mod is `in-game/build/libs/ar-client-fabric-0.1.0.jar` (not the sources jar). Packaged builds automatically install the bundled companion and compatible **Fabric API** into **Fabric 1.21.9** installations. For development or separate use, install Fabric API and import the AR jar manually. The launcher and mod share `config/ar-client.json` for HUD layouts. Right Shift opens the in-game HUD editor; C zooms, R toggles sprint, V toggles sneak. Rebind these in Minecraft's Controls menu.

Linux development requires WebKitGTK 4.1, GTK 3, librsvg, libappindicator/ayatana development packages and a running Secret Service credential vault. Windows is the primary distribution target. Change bundle targets explicitly for Linux packaging.

## First launch

1. Settings → read and accept Minecraft's EULA.
2. Configure the Microsoft application client ID described below.
3. Accounts → Add account → authorize the device code on Microsoft's own website.
4. Create an installation, choose an officially listed game release and compatible modloader, and set RAM.
5. Install/repair or Launch Minecraft. Downloads are hashed before use. Java is fetched from Eclipse Temurin when no explicit executable is selected.
6. Add compatible mods/packs from the catalogs. Apply performance presets explicitly from Settings.

The launcher never bypasses ownership, provides cracked accounts, redistributes Minecraft jars, or invents successful login/download results. The Vite browser view has no desktop privileges and explicitly refuses native operations.

## Authentication setup — owner action required

There is **no shared or borrowed Microsoft client ID** in this repository.

1. Register an application in Microsoft Entra supporting personal Microsoft accounts.
2. Configure it as a public client and allow public client/device authorization flows. Never embed a client secret in a desktop application.
3. Follow Microsoft's current Minecraft/Xbox API access process and obtain any required approval for the application. A registration alone does not guarantee Minecraft Services access.
4. Enter the public Application (client) ID in AR Client → Settings. For releases, set the repository variable `AR_MICROSOFT_CLIENT_ID`; new installations then use that public ID by default.
5. Test with an account that owns Minecraft Java, including account refresh, multiple accounts and family restrictions.

The implementation uses Microsoft's device authorization endpoint, Xbox Live authentication, XSTS, Minecraft login, ownership entitlements and profile services. Access/refresh credentials are stored through Windows Credential Manager (Linux: Secret Service), never in `state.json`. Passwords are entered only on Microsoft's website. OS vault failures are surfaced; there is no plaintext fallback.

## CurseForge and Modrinth

Modrinth browsing requires no key. CurseForge requires an API key issued under its API terms. Add it through Settings; it goes into the OS vault. It is never placed in the renderer state, git, or a public build config.

Author-disabled CurseForge downloads are rejected with an explanation. Dependency versions and game/loader compatibility are checked before content downloads. Catalog updates are explicit and isolated per installation. Imported jars/zips are user-provided and not represented as upstream-verified catalog downloads. Review mods before importing executable code.

Modpack imports require an installation matching the pack's game and loader requirements. `.mrpack` and CurseForge zip manifests are supported; content requiring unavailable or blocked downloads fails with a visible error. Imported mods and resource packs appear as local/untracked files and can be removed in the UI. Full modpack lifecycle updates are not implemented; use isolated installations for packs.

## Secure releases

Update signing is separate from Windows Authenticode signing. A project maintainer must create and protect the signing keys; no signing key is committed.

1. Generate a Tauri updater key pair using `npx tauri signer generate` in a secure environment.
2. Add the public key as repository variable `AR_UPDATER_PUBLIC_KEY`.
3. Add `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` as protected release-environment secrets.
4. Register a protected `release` environment, review a version tag, then manually run **Signed release** with that existing tag.
5. The workflow creates a **draft prerelease**. Test the installed Windows build and updater before publishing. The first public stable release must include `latest.json` and signed installer assets for subsequent update discovery.

Development builds have no updater public key and cannot accept an update. The updater reports missing configuration rather than silently downloading an unsigned executable. Publishing a website or installer does not provision Microsoft's application approval, CurseForge access, DNS, or code signing.

## Storage and recovery

Data lives under the operating system app-data directory for `xyz.kingar1000.arclient`:

```
state.json / state.json.bak
instances/<UUID>/      # worlds, mods, assets, libraries, game-output.log
runtimes/<major>/      # checksum-verified Temurin runtimes
skins/                 # locally imported PNGs
trash/                 # removed installations, including saved worlds
```

Use Open data folder from the top bar. Installation repair revalidates managed Minecraft files against upstream hashes. Failed downloads use temporary files and are not promoted after a hash mismatch. Removing an installation moves its directory to trash rather than erasing worlds. Profiles cannot be modified through the app while their game process is running. Back up worlds before third-party mod or Minecraft upgrades.

## Validation and current boundaries

See `VALIDATION.md` for recorded results. Unit tests cover path traversal, checksums, rule evaluation, library inheritance, profile validation and the native/browser boundary. `cargo run --manifest-path src-tauri/Cargo.toml --no-default-features --example verify_install -- 1.21.9 fabric 0.17.2` performs an opt-in real upstream installation into `/tmp/ar-install-verification` on Linux. Set `AR_TEST_JAVA` to use an existing Java executable.

Account-dependent workflows require an approved application and real owner account. Full Windows gameplay, per-GPU performance, every modpack, and every loader/version combination are not certified by compile tests. The AR companion's supported version is deliberately narrower than the launcher's. Current code does not implement every feature in the original product brief; consult the validation notes before treating this build as a finished replacement for an established client.

## Website

`website/index.html` is a standalone static page with embedded CSS and JavaScript. Serve it through your preferred static host. To use `client.kingar1000.xyz`, configure that host's custom domain and the corresponding DNS record in your domain provider. Its release link reads real GitHub releases; it does not advertise a nonexistent installer as downloadable.

## License and attribution

GNU GPL version 3 only; see [LICENSE](LICENSE). AR artwork was provided by KingAR1000. Third-party dependencies retain their own licenses. See [THIRD_PARTY.md](THIRD_PARTY.md). Minecraft is a trademark of Mojang/Microsoft; AR Client is independent and is not an official Minecraft product.

Creator: [kingar1000.xyz](https://kingar1000.xyz) · Source: [KingAR1000/AR-Client](https://github.com/KingAR1000/AR-Client)
