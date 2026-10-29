# AR Client public launch: owner handoff

The Windows development installer and startup checks pass. Public production readiness still depends on authenticated gameplay, signed-update testing and the implementation gaps in VALIDATION.md. Credentials alone do not finish those features.

## What the owner needs to supply

- Windows test results: whether Microsoft sign-in adds the correct Minecraft account; whether Fabric 1.21.9 opens a playable world; and any error text. Use the personal Microsoft account that owns the game. Never send tokens or passwords. Test a restart/sign-in refresh, a multiplayer session, HUD controls and a normal exit as well.
- Minecraft Services application approval status if received. Device-code issuance for AR's public ID passed; that does not prove Xbox/Minecraft authorization. If a Minecraft Services approval error occurs, the owner must complete Microsoft's application process.
- DNS provider for kingar1000.xyz and confirmation of access to edit records for client.kingar1000.xyz. Supply only public record values/screenshots when needed, not a registrar password. Hosting selection and exact DNS records must be confirmed before changing the domain. Confirm the public support contact.
- CurseForge API access for AR Client under its API terms. Store a key only through the appropriate local app settings or a narrowly scoped secret mechanism. A personal developer key is not automatically a license to redistribute it to everyone in a desktop installer. Modrinth needs no project key.
- Updater signing setup through the local helper below. Keep the signing key and password privately backed up. These are separate from Windows Authenticode certificates.
- An Authenticode signing provider/certificate only if a verified Windows publisher is required. It is optional for distributing an unsigned installer; unsigned builds must be described accurately. Do not send certificate private keys or PFX passwords in chat.

## Configure release credentials on the owner's computer

Prerequisites: Node.js, Git, GitHub CLI, and an authenticated GitHub account with administration rights on this repository. The chat GitHub connection cannot manage Actions Secrets or Variables (HTTP 403); this helper uses the owner's local GitHub session instead.

From an up-to-date checkout of `feat/ar-client`:

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
- The workflow must be present on the default branch before GitHub exposes workflow_dispatch there. The implementation is currently in draft PR #1; a reviewed squash merge can give main one implementation commit while retaining the PR discussion.
- Before publication: verify real ownership-based login/launch, skin changes, critical mod/pack workflows, release signatures, install/upgrade recovery and a real signed-update cycle. Retain logs with credentials redacted and record actual tested game/loader/hardware versions.
- Complete or explicitly narrow the advertised scope of the unimplemented features listed in VALIDATION.md. The AR companion supports Fabric 1.21.9 only today.

## Cleanup

No history was removed. Once a working release and recoverable backup exist, review the exact failed workflow runs, obsolete branches and draft artifacts proposed for removal. Keep the known-good source, release tags, signing-key backups and useful regression evidence. Rewriting shared git history or deleting old published releases needs a specific decision; it can break clones, downloads and updater URLs. Chat conversation deletion must be performed in the ChatGPT interface by the user.
