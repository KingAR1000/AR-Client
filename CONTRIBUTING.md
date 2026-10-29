# Contributing

Use a focused branch and pull request. Describe the behavior, affected Minecraft/loader versions, tests and any credentials needed to reproduce it. Do not commit Minecraft binaries, player tokens, client secrets, API keys, signing keys, worlds or proprietary third-party assets.

Run `npm ci`, `npm test`, `npm run build`, and `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --locked`. Format Rust with `cargo fmt --manifest-path src-tauri/Cargo.toml`. Build the desktop installer on Windows and the mod using `gradle -p in-game build` for changes affecting those components.

Use upstream manifests and compatibility metadata. Never silently claim a mod supports a new game release; create and test a version-specific build. Preserve ownership checks, checksum checks, operating-system credential storage and the browser/native boundary. Do not log launch arguments containing tokens. Avoid adding telemetry or advertising.

Keep user data recoverable during failed updates. Add regression tests for security fixes and nontrivial installation logic. Document any manual gameplay verification with OS, Java, game, loader and mod versions. Contributions must be compatible with GPL-3.0-only.
