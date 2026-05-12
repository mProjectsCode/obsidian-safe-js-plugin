# Safe JS

Safe JS is an Obsidian plugin for running note-owned JavaScript through sandboxed Web Workers and a deliberately small host API.

Scripts do not receive direct access to the DOM, Node.js, Electron, or the Obsidian app object. Instead, they declare permissions with leading comments and call documented `api.*` functions that are validated by the plugin before they reach Obsidian.

## Status

This plugin is currently highly experimental. There are no stability guarantees regarding the current feature set as well as the exposed `api.*` functions.

## Features

- Run `safe-js` code blocks from notes.
- Enable optional `safe-js-debug` blocks for diagnostics.
- Review permission prompts before a script runs.
- Remember approvals per script source hash.
- Open generated API docs from the **Open API docs** command.
- Store small script-owned values through the permission-gated storage API.
- Inspect and clear stored approvals and script storage from the plugin settings.

## Code block languages

Use `safe-js` for normal execution:

````
```safe-js
// @permission ui:notify

await api.ui.notify("Hello from Safe JS");
```
````

Use `safe-js-debug` when debug blocks are enabled in settings.

## Permissions

Scripts request permissions with leading comments:

```js
// @permission vault:read
// @permission ui:notify
```

Permission comments must appear before executable code. Safe JS stores approvals per source hash, so changing the script asks for approval again.

The approval modal describes the requested permissions and highlights network exfiltration risk when `network:request` is combined with vault, metadata, workspace, or editor read access.

## API Docs

In Obsidian, run **Open API docs** to view the available permissions and `api.*` functions.

Current API groups include vault, metadata, workspace, editor, file manager, UI, storage, and network helpers. Every host operation goes through a permission-gated RPC method.

## Privacy And Security

Network requests are only available to scripts that declare and receive approval for `network:request`. The plugin does not fetch or execute remote code, and it does not auto-update outside normal plugin releases.

Do not trust the sandbox to be perfect. Review scripts before you run them, only approve permissions you understand, and treat code from other people as untrusted even when it runs through Safe JS.

Vault read and write APIs reject paths inside the active Obsidian configuration folder, including custom config folder names reported by Obsidian.

The storage API is scoped to Safe JS script storage keys. Stored approvals and script storage keys can be inspected or cleared from **Settings → Safe JS**.

## Reporting Bugs And Security Issues

Please report bugs via the issues page on GitHub. Report security issues responsibly by emailing m.projects.code@gmail.com. Do not publicly disclose security issues until there has been a reasonable opportunity to investigate and prepare a fix.

## AI Assistance Notice

Parts of this plugin were vibe coded with AI assistance. Security-sensitive code still requires human review, tests, and conservative judgment; AI assistance is not a security guarantee.

## Development

This project uses Bun, Vite, TypeScript, Svelte, and ESLint.

```bash
bun install
bun run dev
bun run check
```

Common commands:

- `bun run build` builds the production plugin bundle.
- `bun run dev` builds the development plugin bundle into `exampleVault/.obsidian/plugins/safe-js`.
- `bun run test` runs the Bun test suite.
- `bun run lint` runs ESLint.
- `bun run typecheck` runs TypeScript checks.

## Design Goals

- Execute scripts away from the Obsidian UI thread.
- Expose only explicit host capabilities through validated RPC messages.
- Keep worker lifetime, cancellation, timeout, and cleanup behavior predictable.
- Make the supported API small enough to audit and document.

## Non-Goals

- Full Node.js, Electron, DOM, or Obsidian API access inside scripts.
- Compatibility with unrestricted script runner plugins.
- Implicit access to vault files, network, shell commands, or global app state.

## License

GPL-3.0. See [LICENSE.md](LICENSE.md).
