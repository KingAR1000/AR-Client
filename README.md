# AR Client

A free, open-source Minecraft Java launcher by [KingAR1000](https://kingar1000.xyz), licensed under GPL-3.0-only. Windows 11 x64 is the primary platform.

New installations default to the latest stable release from Mojang's manifest, currently **26.3**. **1.21.9 is the oldest supported release.** Existing installations keep their versions. Loader and mod availability varies by game version. The bundled AR HUD supports **Fabric 1.21.9 only**.

**Development build:** Windows packaging and startup checks pass; authenticated gameplay, signed updates, and performance benchmarks remain unverified. See [VALIDATION.md](VALIDATION.md) for tested behavior and limitations.

## Source

- `src/`: React/TypeScript launcher interface, skin viewer and HUD editor.
- `src-tauri/`: Rust authentication, installation, content and launch services.
- `in-game/`: Fabric companion mod.
- `website/`: Vercel website and server functions; see [hosting instructions](website/HOSTING.md).
- `scripts/` and `.github/workflows/`: packaging, release signing and automated checks.

Outside contributions are not currently accepted; see [CONTRIBUTING.md](CONTRIBUTING.md).

## Build on Windows

Install Node.js 22, stable Rust, Microsoft C++ Build Tools with the Desktop development with C++ workload, Windows SDK, WebView2 Runtime, JDK 21 and Gradle 9.1.0.

```powershell
git clone https://github.com/KingAR1000/AR-Client.git
cd AR-Client
npm ci
npm test
cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --locked
gradle -p in-game build --no-daemon
node scripts/prepare-companion.mjs
npm run desktop
```

Run `npm run bundle` to create the Windows installer under `src-tauri/target/release/bundle/nsis/`. CI uploads it as **AR-Client-Windows-x64**. Development installers are unsigned and may trigger Windows SmartScreen.

Packaged builds install the companion and Fabric API into compatible Fabric 1.21.9 instances. For manual installation, use `in-game/build/libs/ar-client-fabric-0.1.0.jar` and Fabric API. Right Shift opens the HUD editor; C zooms, R toggles sprint and V toggles sneak. Rebind controls in Minecraft's Controls menu.

Linux development also requires WebKitGTK 4.1, GTK 3, librsvg, libappindicator/ayatana development packages and a running Secret Service vault. Linux distribution packages are not configured.

## First launch

1. Read and accept Minecraft's EULA in Settings.
2. Add an account and authorize it on Microsoft's website. Minecraft Java access is required.
3. Create an installation, select a compatible loader if needed, and set memory.
4. Launch Minecraft or use Install/repair. Game files are verified against upstream hashes; Eclipse Temurin supplies Java when no custom executable is selected.
5. Install mods and packs from the catalogs. Apply performance presets explicitly in Settings.

The browser view cannot install or launch games; use the desktop application. Releases are checked at startup, on returning focus after a minute, every 30 minutes while visible, and manually in the Update Center.

## Authentication and catalogs

The public Microsoft application ID is bundled. A custom registration can be set in Settings or at build time through `AR_MICROSOFT_CLIENT_ID`. Registrations must support personal accounts and public-client device authorization, with any required Minecraft Services approval. No Microsoft client secret belongs in the launcher.

Microsoft/Xbox/Minecraft access and refresh credentials use Windows Credential Manager or Linux Secret Service. Passwords are entered on Microsoft's website. Vault failures have no plaintext fallback.

Modrinth requires no key. CurseForge uses `https://client.kingar1000.xyz/api/curseforge`; its project key belongs only in Vercel's private `CURSEFORGE_API_KEY` environment variable. An optional personal key in Settings uses the OS vault and connects directly. See [website/HOSTING.md](website/HOSTING.md).

Catalog installations check compatibility, required dependencies and hashes. Author-disabled downloads are rejected. Imported files remain local/untracked; use separate installations for modpacks. Full modpack lifecycle updates are not implemented.

## Signed releases

Updater signing and Windows publisher signing are separate. To configure updater credentials, install GitHub CLI, sign in with repository administration access, then run from this checkout:

```text
npm ci
gh auth login
npm run setup:release
```

The helper creates an encrypted updater key at `~/.ar-client-release/updater.key`, verifies its password, and configures GitHub's `release` environment secrets and repository variables. It preserves existing keys and environment protections. Keep a private backup of the key and password. Never commit signing material.

Set a protected `release` environment. Review a version tag matching `package.json`, `Cargo.toml` and `tauri.conf.json`, then run **Signed release** with that tag. The workflow builds and tests the application, signs updater artifacts and creates a draft release. Tags with a prerelease suffix create prereleases. Test installation, ownership-based login, gameplay, recovery and a signed-update cycle before publishing. A stable release must include `latest.json` and signed installer assets for automatic updates. Development builds without an updater public key cannot accept updates.

## Local data

The app-data directory for `xyz.kingar1000.arclient` contains:

```text
state.json / state.json.bak
instances/<UUID>/             # worlds, mods, game files and logs
runtimes/<major>/
skins/
trash/                        # removed installations, including worlds
```

Use Open data folder in the launcher. Repair revalidates managed game files. Failed downloads are not promoted after a checksum mismatch. Removing an installation moves it to trash; back up worlds before changing game versions or mods.

## License and security

See [LICENSE](LICENSE), [THIRD_PARTY.md](THIRD_PARTY.md) and [SECURITY.md](SECURITY.md). AR artwork belongs to KingAR1000. Minecraft and third-party content retain their own terms. AR Client is not affiliated with Mojang or Microsoft.
