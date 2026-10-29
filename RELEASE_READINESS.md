# AR Client public launch: owner handoff

The Windows development installer and startup checks pass. Public production readiness still depends on authenticated gameplay, signed-update testing and the implementation gaps in VALIDATION.md. Credentials alone do not finish those features.

## What the owner needs to supply

- Windows test results, when the owner is available: whether Microsoft sign-in adds the correct Minecraft account; whether the latest stable release (currently 26.3) opens a playable world; and any error text. Use the personal Microsoft account that owns the game. Never send tokens or passwords. Test a restart/sign-in refresh, a multiplayer session and a normal exit as well. Test Fabric 1.21.9 separately for the currently version-limited companion HUD. Owner cannot test yet; these checks remain pending and do not block code or website preparation.
- Minecraft Services application approval status if received. Device-code issuance for AR's public ID passed; that does not prove Xbox/Minecraft authorization. If a Minecraft Services approval error occurs, the owner must complete Microsoft's application process.
- Owner confirmed Cloudflare DNS, Vercel hosting, and public support at hello@kingar1000.xyz. Import this repository's `website` root from `main` into Vercel, then attach client.kingar1000.xyz using the exact records Vercel assigns. The old Sites records are superseded. No Vercel account connection is available to this session, so project creation and private environment setup need the owner; see website/HOSTING.md.
- Owner supplied and authorized a working CurseForge key; the live catalog accepted it. Store it only in Vercel's server-side `CURSEFORGE_API_KEY`, never in a public variable, Git or the desktop build. The proxy implementation is complete; its public deployment awaits Vercel setup. A personal OS-vault override remains available. Modrinth needs no project key.
- Updater signing setup through the local helper below. Keep the signing key and password privately backed up. These are separate from Windows Authenticode certificates.
- An Authenticode signing provider/certificate only if a verified Windows publisher is required. It is optional for distributing an unsigned installer; unsigned builds must be described accurately. Do not send certificate private keys or PFX passwords in chat.

## Configure release credentials on the owner's computer

Prerequisites: Node.js, Git, GitHub CLI, and an authenticated GitHub account with administration rights on this repository. The chat GitHub connection cannot manage Actions Secrets or Variables (HTTP 403); this helper uses the owner's local GitHub session instead.

From an up-to-date checkout of `main`:

```text
npm ci
gh auth login
npm run setup:release
```

The helper generates an encrypted Tauri signing key under the user's home directory at `.ar-client-release/updater.key` if no key exists, checks the password by signing a disposable local file, preserves existing release-environment protections, and uploads the private key/password through stdin to the `release` environment's GitHub secrets. It sets the public updater key and Microsoft app ID as repository variables. It never overwrites an existing key, publishes a release, or puts a password in a command-line argument. If provisioning stops halfway, keep the existing key and retry after fixing the indicated permission issue.

Enter a nonempty password during Tauri's key-generation prompt, then enter that same password at the helper's hidden prompt. Keep a private backup outside the Git checkout, ideally in a password manager or encrypted offline backup. Review the repository's release-environment protection rules. Full provisioning must be verified on the owner's computer; only syntax, CLI resolution and the release-version policy are verified in the workspace.

## Release configuration already prepared

- The manual Signed release workflow builds and tests the launcher and companion, signs updater artifacts, and creates a draft release.
- A new version/tag check rejects mismatched package, Tauri and Cargo versions and misleading tag names.
- Tags containing a prerelease suffix produce prereleases; stable version tags produce stable draft releases. A published stable release is required for the configured `/releases/latest/download/latest.json` update channel.
- Native updater signatures are distinct from Windows publisher signatures.
- PR #1 has been squash-merged into `main`, retaining the PR discussion and source branch. The release workflow is now present on the default branch for manual invocation; merging source does not publish a release or provision signing credentials.
- Before publication: verify real ownership-based login/launch, skin changes, critical mod/pack workflows, release signatures, install/upgrade recovery and a real signed-update cycle. Retain logs with credentials redacted and record actual tested game/loader/hardware versions.
- Complete or explicitly narrow the advertised scope of the unimplemented features listed in VALIDATION.md. The AR companion supports Fabric 1.21.9 only today.

## Cleanup

No history was removed. Once a working release and recoverable backup exist, review the exact failed workflow runs, obsolete branches and draft artifacts proposed for removal. Keep the known-good source, release tags, signing-key backups and useful regression evidence. Rewriting shared git history or deleting old published releases needs a specific decision; it can break clones, downloads and updater URLs. Chat conversation deletion must be performed in the ChatGPT interface by the user.
