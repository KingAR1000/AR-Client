# AR Client

A free, open-source Minecraft Java launcher by [KingAR1000](https://kingar1000.xyz), licensed under GPL-3.0-only. Windows 11 x64 is the primary platform.

The primary target is always the **latest stable Minecraft release**, currently **26.3**. The launcher offers releases from **1.21.9 through the latest stable**, discovers new releases through Mojang's manifest, and selects the latest stable for new installations. Existing installations keep their versions. Loader and mod availability varies by game version.

**Development build:** Windows packaging and startup checks pass; authenticated gameplay, signed updates, and performance benchmarks remain unverified. See [VALIDATION.md](VALIDATION.md) for tested behavior and limitations.

## Source

- `src/`: React/TypeScript launcher interface, skin viewer and HUD editor.
- `src-tauri/`: Rust authentication, installation, content and launch services.
- `in-game/`: Fabric companion mod.
- `website/`: Cloudflare Free website and API worker; see [hosting instructions](website/HOSTING.md).
- `scripts/` and `.github/workflows/`: packaging, release signing and checks.

Outside contributions are not currently accepted; see [CONTRIBUTING.md](CONTRIBUTING.md).

## Build on Windows

Install Node.js 22, stable Rust, Microsoft C++ Build Tools with the Desktop development with C++ workload, Windows SDK, WebView2 Runtime, JDK 25 and Gradle 9.8.0.

```powershell
git clone https://github.com/KingAR1000/AR-Client.git
cd AR-Client
npm ci
npm test
cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --locked
npm run companion:build
npm run companion:prepare
npm run desktop
```

Run `npm run bundle` to create the Windows installer under `src-tauri/target/release/bundle/nsis/`. All GitHub workflows are manual: open **Actions → select a workflow → Run workflow**. **Build and test** uploads the installer as **AR-Client-Windows-x64**. Development installers are unsigned and may trigger Windows SmartScreen.

Packaged builds include a separate Fabric companion for every supported release from 1.21.9 through 26.3. The launcher installs only the exact game-version match, its tested Fabric API version, and checks the required loader version. For manual installation, use `in-game/build/<game>/libs/ar-client-fabric-<game>-0.1.0.jar` with the matching Fabric API and Fabric 0.20.1 or newer. Right Shift opens the HUD editor; C zooms, R toggles sprint and V toggles sneak. Rebind controls in Minecraft's Controls menu.

Linux development also requires WebKitGTK 4.1, GTK 3, librsvg, libappindicator/ayatana development packages and a running Secret Service vault. Linux distribution packages are not configured.

## New Minecraft releases

`in-game/versions.json` pins the game, Java, mappings, Fabric loader and API for each build. `npm run companion:refresh` checks Mojang's official release manifest; add `-- --write` to generate recipes for new stable releases, then run `companion:build` and `companion:prepare`. Both manual build/release workflows have a **refresh_support** option for this process.

Every build compiles against its actual game/API dependencies and validates mixin method signatures, jar metadata, Java bytecode and hashes. An incompatible new release fails the build; it is not advertised as HUD-compatible. Publish a new signed launcher release to distribute validated new HUD jars. The launcher can discover and install new Minecraft releases independently, but never reuses an older HUD jar for an unsupported version. Managed stale HUD jars are preserved under `disabled-mods/` when switching to a version without a build. Runtime gameplay checks remain necessary after upstream API changes.

## First launch

1. Read and accept Minecraft's EULA in Settings.
2. Add an account and authorize it on Microsoft's website. Minecraft Java access is required.
3. Create an installation. The latest stable release uses Fabric when a matching AR HUD is bundled; other loaders remain selectable. Set memory as needed.
4. Launch Minecraft or use Install/repair. Game files are verified against upstream hashes; Eclipse Temurin supplies Java when no custom executable is selected.
5. Install mods and packs from the catalogs. Apply performance presets explicitly in Settings.

The browser view cannot install or launch games; use the desktop application. Only free hosting services are authorized. The website uses Cloudflare Static Assets and Workers Free; friends/chat targets Workers/D1 Free, with hard quotas and no paid fallback. No cloud Minecraft machines are provisioned. The website and social backend are deployed on Cloudflare Free; see [hosting instructions](website/HOSTING.md).

Releases are checked at startup, on returning focus after a minute, every 30 minutes while visible, and manually in the Update Center.

## Authentication and catalogs

The public Microsoft application ID is bundled. A custom registration can be set in Settings or at build time through `AR_MICROSOFT_CLIENT_ID`. Registrations must support personal accounts and public-client device authorization, with any required Minecraft Services approval. No Microsoft client secret belongs in the launcher.

Microsoft/Xbox/Minecraft access and refresh credentials use Windows Credential Manager or Linux Secret Service. Passwords are entered on Microsoft's website. Vault failures have no plaintext fallback.

Modrinth requires no key. CurseForge uses `https://client.kingar1000.xyz/api/curseforge`; its project key belongs only in the Cloudflare Worker’s private `CURSEFORGE_API_KEY` secret. An optional personal key in Settings uses the OS vault and connects directly. See [website/HOSTING.md](website/HOSTING.md).

Catalog installations check compatibility, required dependencies and hashes. Author-disabled downloads are rejected. Imported files remain local/untracked; use separate installations for modpacks. Full modpack lifecycle updates are not implemented.

## Minecraft sign-in returns HTTP 403

A successful Microsoft device login does not establish Minecraft API approval for the launcher. If `authentication/login_with_xbox` returns 403, the launcher now reports `AR_AUTH_APP_APPROVAL` with the registration review link rather than an opaque network error. A 403 alone is not proof of the exact upstream rejection reason.

The project owner must submit/review **a638a66e-7242-4bbe-b197-631d1ce1d7fb** at **https://aka.ms/mce-reviewappid**, with AR Client's name, https://github.com/KingAR1000/AR-Client and https://client.kingar1000.xyz. Microsoft/Mojang approval cannot be granted or bypassed by launcher code. After approval, retry Microsoft sign-in. Changing passwords, reinstalling Minecraft, or borrowing another launcher's client ID does not solve registration approval.

## Friends and chat

The Friends screen connects verified Minecraft identities, sends and accepts requests, removes friends, blocks players, and exchanges messages only between accepted friends. It supports recent-message polling, older-message retrieval and social-account deletion. Messages expire after 30 days and are not end-to-end encrypted. The Minecraft access token is used transiently to verify identity; the service stores only hashed, expiring social-session tokens. Native social-session tokens stay in memory. Microsoft refresh tokens remain in the OS vault.

The Cloudflare Worker and D1 schema are in [`social/`](social/README.md). The backend Worker `ar-client` is deployed at `https://social.client.kingar1000.xyz/` on Workers/D1 Free. Health and unauthenticated rejection checks pass; real-account friends/chat still requires successful Minecraft login and end-to-end validation. A build can override the default service URL with `AR_SOCIAL_URL`; do not direct account tokens to an untrusted service.

## Host a server

Servers creates isolated, local Java dedicated servers using the same official release range as the launcher. Start verifies the official server jar and Java runtime; console input, rolling output, whitelist commands, graceful Stop, and folder access are available in the launcher. Accept Minecraft's EULA in Settings first. Online authentication, whitelist enforcement and disabled RCON/query are the defaults. Add the host and friends with `whitelist add PlayerName` in the server console.

The computer must stay awake and AR Client must remain open. Closing AR Client requests a graceful stop and waits for the server to save. An OS crash or forced termination can interrupt saving, so back up worlds. LAN players use the host's local IP and configured port. Internet players need a private VPN or deliberate router/firewall configuration; AR Client does not open ports, install a VPN or provide rented cloud machines.

`cargo run --manifest-path src-tauri/Cargo.toml --no-default-features --example verify_server -- --accept-eula` runs a real, loopback-only startup/console/save check after downloading the server and Java.

## Rust Edition (Horizon)

The Rust Edition screen integrates **Horizon**, an independent **unofficial**, MIT-licensed implementation targeting Minecraft 26.3. It is not a Mojang release or a new official Minecraft edition. Its upstream README documents substantial unimplemented behavior; Nightlies are explicitly experimental. Java mod jars, Fabric HUDs and Java modloaders do not run in this implementation.

Select a 26.3 installation, accept the experimental Nightly notice, and use Install/verify or Play Rust Edition. An owning Microsoft account is required before preparation or launching. AR verifies Horizon's Ed25519-signed Nightly checksums against the embedded upstream public key, verifies the downloaded archive's SHA-256, checks the actual client/preparer contracts, installs the owner's vanilla files from Mojang, and prepares resources locally. Current published preparers predate `--launch-api`; those are checked against their real help output and signed `research-lock.json` instead.

The session is passed over standard input. Saves and settings use `rust-instances/<profile UUID>/`, separate from Java instances. `horizon/` contains builds/resources and `horizon-support/` holds verified vanilla preparation inputs. Native Rust mods are not managed by AR's Java mod catalogs. GPU support requires Vulkan or DirectX 12 on Windows. Resource preparation and authenticated Rust gameplay still need end-user validation after Minecraft API approval.

To inspect an already verified Horizon archive without starting Minecraft: `cargo run --manifest-path src-tauri/Cargo.toml --no-default-features --example verify_horizon -- PATH_TO_HORIZON`.

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
