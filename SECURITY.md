# Security

Do not publish tokens or secrets in an issue. Report vulnerabilities through GitHub's private vulnerability reporting for this repository when enabled, or contact the owner through https://kingar1000.xyz. No response-time guarantee is implied.

The desktop WebView has a restrictive CSP, no shell plugin, and no general filesystem plugin. Backend commands validate profile identifiers and managed paths. Tokens and API keys use the OS credential vault; update signatures use Tauri's updater verification. Minecraft, runtime and catalog files are checksum-verified against upstream metadata. User-imported mods are executable third-party code.

This early implementation has not undergone an independent security audit. See VALIDATION.md for tested behavior and known boundaries. Avoid publishing a production release until account flows, Windows packaging, updater key rotation and adversarial archive/dependency cases have been reviewed.
