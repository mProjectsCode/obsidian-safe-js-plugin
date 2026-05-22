# Safe JS

Safe JS is an Obsidian plugin for running JavaScript through sandboxed Web Workers and a deliberately small host API.

Scripts do not receive direct access to the DOM, Node.js, Electron, or the Obsidian app object. Instead, they declare permissions with leading comments and call documented `api.*` functions that are validated by the plugin before they reach Obsidian.

## Status

This plugin is currently highly experimental. There are no stability guarantees regarding the current feature set as well as the exposed `api.*` functions.

## Features

- Run `safe-js` code blocks from notes.
- Run explicitly configured vault `.js` files from commands.
- Run selected vault scripts after the workspace layout is ready.
- Enable optional `safe-js-debug` blocks for diagnostics.
- Review permission prompts before a script runs.
- Remember approvals per script source hash and caller plugin.
- Open generated API docs from the **Open API docs** command.
- Store small script-owned or explicitly global values through permission-gated storage APIs.
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

Code blocks render plain strings as text. They can also return a typed output object:

```js
// @permission output:render-rich

return {
	format: 'markdown',
	content: '## Rendered by Safe JS',
};
```

Supported formats are `text`, `markdown`, and `html`. Markdown and HTML output require `output:render-rich`; without that permission Safe JS displays a plain-text blocked message instead. HTML output is passed through Obsidian's `sanitizeHTMLToDom` before it is displayed.

## Vault scripts

Add vault `.js` files in **Settings → Safe JS → Vault scripts**. Each configured script gets a command named **Run script: <name>**. Scripts run through the same worker sandbox, permission comments, timeout settings, and approval flow as code blocks.

Startup scripts run after Obsidian reports the layout is ready. They do not open permission prompts during startup. If a startup script needs permissions that have not already been approved for its current source hash, Safe JS skips it and shows a notice. Run the script manually once to review and approve its permissions.

## Permissions

Scripts request permissions with leading comments:

```js
// @permission vault:read
// @permission ui:notify
```

Permission comments must appear before executable code. Use `namespace:*` to request every permission in a group, such as `// @permission vault:*`. Safe JS stores approvals per source hash and caller plugin, so changing the script or running it from a different plugin asks for approval again.

The approval modal describes the requested permissions and highlights network exfiltration risk when `network:request` is combined with vault, metadata, workspace, or editor read access.

The setting **Auto-allow low-risk permissions** can skip prompts for low-risk permissions. Safe JS still remembers the approval by script hash on the current device.

Execution timeouts are enabled by default. You can disable them in settings when a trusted script needs to keep running, but permission approval time is not counted as script run time.

## API Docs

In Obsidian, run **Open API docs** to view the available permissions and `api.*` functions.

Current API groups include vault, metadata, workspace, editor, file manager, UI, output, storage, network, path, link, search, and YAML helpers. Every host operation goes through a permission-gated RPC method or host-side permission.

## Plugin Integration

Other plugins can access Safe JS through the loaded `safe-js` plugin instance:

```ts
const safeJs = this.app.plugins.getPlugin('safe-js');
const safeJsApi = safeJs?.api.forPlugin(this);
const result = await safeJsApi?.execute(`// @permission ui:notify
await api.ui.notice("Hello from another plugin");`);
```

For TypeScript integrations, install the API helper package:

```sh
bun add -d @lemons_dev/obsidian-safe-js-api
```

It can also be installed from the dedicated package repository:

```sh
bun add -d github:mProjectsCode/obsidian-safe-js-api#v0.1.3
```

Use the helper to avoid writing the plugin lookup cast yourself:

```ts
import { getSafeJsApi } from '@lemons_dev/obsidian-safe-js-api';
import type { SafeJsCallerApi } from '@lemons_dev/obsidian-safe-js-api';

const safeJsApi: SafeJsCallerApi | undefined = getSafeJsApi(this.app, this);
```

Plugins can register custom permission definitions, permission-gated sandbox functions, and JSON-safe sandbox globals through the caller API returned by `forPlugin(this)`. Custom functions must use JSON-safe request and response validators, referenced by Safe JS validator ID or supplied as custom validation functions. Safe JS does not expose Zod on the public plugin API. Registered functions and globals are removed when the caller plugin unloads.

Built-in validator IDs include `json:value`, `json:record`, `rpc:emptyParams`, `rpc:pathParams`, `rpc:optionalPathParams`, `response:ok`, `storage:key`, `storage:value`, `vault:path`, and `vault:optionalPath`.

## Privacy And Security

Network requests are only available to scripts that declare and receive approval for `network:request`. The plugin does not fetch or execute remote code, and it does not auto-update outside normal plugin releases. See [SECURITY.md](SECURITY.md) for the full security policy.

Do not trust the sandbox to be perfect. Review scripts before you run them, only approve permissions you understand, and treat code from other people as untrusted even when it runs through Safe JS.

Rendered Markdown and HTML can cause Obsidian or the browser to load remote resources, such as images. Safe JS therefore requires `output:render-rich` before rendering script results as Markdown or HTML. The same class of issue can happen through vault writes: a script with `vault:create`, `vault:modify`, or editor write access can write Markdown or HTML that later loads remote resources when you open or preview the file. Treat write permissions as capable of creating content that phones home when rendered.

Vault read and write APIs reject paths inside the active Obsidian configuration folder, including custom config folder names reported by Obsidian.

The default storage API is scoped to the script source hash. Use `api.globalStorage.*` only when a script intentionally needs storage shared with other approved Safe JS scripts. Stored approvals and script storage keys can be inspected or cleared from **Settings → Safe JS**.

## Reporting Bugs And Security Issues

Please report bugs via the issues page on GitHub. Report security issues responsibly using the process in [SECURITY.md](SECURITY.md).

## AI Assistance Notice

Parts of this plugin were vibe coded with AI assistance. Security-sensitive code still requires human review, tests, and conservative judgment; AI assistance is not a security guarantee.

## Development

This repo uses `packages/safe-js-api` as a Git submodule for the installable API helper package. After cloning, initialize dependencies with:

```sh
bun run deps:init
```

When the public API changes, edit the submodule package source directly, run `bun run api:build`, commit and tag the API package repo, then commit the updated submodule pointer in this repo.

See [CONTRIBUTING.md](CONTRIBUTING.md).

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
