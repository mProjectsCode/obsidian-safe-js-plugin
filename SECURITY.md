# Security policy

Safe JS is an experimental Obsidian plugin for running JavaScript through sandboxed Web Workers and a limited, permission-gated host API. For user-facing features, permissions, and design goals, see [README.md](README.md).

Do not treat the sandbox as a perfect security boundary. Review scripts before running them, approve only permissions you understand, and treat code from other people as untrusted.

## Reporting a vulnerability

Please report security issues by emailing m.projects.code@gmail.com.

Do not publicly disclose security issues until there has been a reasonable opportunity to investigate and prepare a fix. Include enough detail to reproduce the issue when possible, such as affected versions, steps to reproduce, expected behavior, actual behavior, and any proof-of-concept code.

## Threat model

Safe JS aims to primarily protect users from malicious scripts included in files or vaults they download. As such we treat the following inputs as unsafe or attacker controlled:

- Vault content, including notes and other files in the vault.
- The plugin's `data.json` file, including settings, approvals, and stored script data.
- Any script source passed to Safe JS for execution.

The following things are trusted:

- Safe JS's own bundled plugin JavaScript file as installed by Obsidian.
- Obsidian's local runtime and storage APIs.

## Security goals

Safe JS aims to:

- Keep scripts away from direct DOM, Node.js, Electron, and Obsidian app access.
- Expose host behavior only through documented, permission-gated `api.*` calls.
- Validate RPC messages before they reach Obsidian APIs.
- Keep network access opt-in and permission-gated.
- Avoid executing remote code.
- Avoid reading or writing outside the vault.

## Non-goals

Safe JS does not promise:

- A perfect sandbox.
- Safe execution of arbitrary malicious code.
- Compatibility with unrestricted script runner plugins.
- Protection after the user grants a powerful permission to a malicious script.

## For contributors

Security-sensitive changes need tests and careful review. This includes changes to script execution, workers, SES setup, RPC validation, permissions, storage, vault access, path handling, network access, and settings persistence.
