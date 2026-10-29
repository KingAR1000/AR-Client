# Contributing

AR Client is maintained solely by **KingAR1000**. Outside code contributions are not currently accepted. Open a pull request only if explicitly invited by the owner. The GPL license permits forks and modifications; it does not grant write access or require acceptance of changes.

## Maintainer checks

Run `npm ci`, `npm test`, `npm run build`, and `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --locked`. Format Rust with `cargo fmt --manifest-path src-tauri/Cargo.toml`. Changes to native packaging or the companion also need a Windows installer build and `gradle -p in-game build --no-daemon`.

Keep changes focused and record affected game/loader versions, tests and manual verification. Preserve ownership checks, hashes, managed-path validation, credential-vault storage and recoverable user data. Test version-specific mod builds before declaring compatibility. Add regression coverage for security fixes and nontrivial installation changes.

Never commit credentials, signing keys, Minecraft binaries, worlds or unlicensed third-party content. Do not log tokens or launch arguments containing them. Changes must remain compatible with GPL-3.0-only and include no advertising or analytics telemetry.
