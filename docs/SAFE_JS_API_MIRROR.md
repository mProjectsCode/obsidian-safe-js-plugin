# Safe JS API mirror checklist

Source checked: local `obsidian` package typings, `node_modules/obsidian/obsidian.d.ts`, version `1.12.3`.

This is a planning checklist for the host methods that Safe JS should mirror. Keep the worker-facing API smaller than Obsidian's real API: expose JSON data and primitive values only, never live Obsidian objects.

## Permission contract

- A method listed under `vault:read` must not create, modify, move, trash, or delete anything in the vault.
- A read method may use Obsidian objects internally, but must return plain DTOs such as `{ path, type, stat }`, strings, numbers, booleans, arrays, or JSON objects.
- Never return `TFile`, `TFolder`, `TAbstractFile`, `Vault`, `DataAdapter`, `WorkspaceLeaf`, `Editor`, `View`, DOM nodes, or callback handles to worker code.
- Do not expose `app.vault.adapter` directly. Adapter methods include both reads and writes and can make permission boundaries harder to audit.
- Normalize and validate all vault paths at the RPC boundary. Reject absolute paths, parent traversal, empty file paths, and paths that resolve outside the vault model.
- Do not mirror Obsidian methods that require host callbacks, such as `Vault.process` or `FileManager.processFrontMatter`, by evaluating worker-supplied functions on the host.
- Event subscriptions are deferred until there is a lifecycle design for unsubscribe, plugin unload cleanup, and backpressure.
- If `network:request` or `output:render-rich` is ever combined with vault or editor read permissions, the approval UI and docs must clearly warn that script output can leave the device.
- Vault create, vault modify, and editor write permissions can also create Markdown or HTML that loads remote resources later when the user opens or previews the file.
- [x] Run a focused permission audit before expanding the RPC surface, especially for network requests, vault writes/deletes, editor writes, workspace navigation, and storage scope boundaries.

Focused audit note, 2026-05-15:

- Verified that RPC dispatch enforces each method's declared permission before request parsing or handler execution.
- Verified that vault read/create/modify/move/delete handlers use the vault path validation boundary and do not expose `app.vault.adapter`.
- Verified that network RPC methods require `network:request`, are limited to HTTP/HTTPS URLs, and the approval UI warns when network access is combined with vault, metadata, workspace, or editor reads.
- Tightened workspace read DTOs so recent/active/layout file paths are filtered through the Obsidian config-folder guard and layout output does not return arbitrary view state.
- Tightened storage key validation so script-provided keys cannot address the internal index key or collide with the scoped storage namespace from global storage.

## `core:read`

Non-mutating app and environment information. These methods must not reveal full filesystem paths.

- [x] `api.app.getVaultName()` mirrors `app.vault.getName()`.
- [x] `api.app.isDarkMode()` mirrors `app.isDarkMode()`.
- [x] `api.app.requireApiVersion(version)` mirrors `requireApiVersion(version)`.
- [x] `api.app.getLanguage()` mirrors `getLanguage()`.
- [x] `api.platform.get()` mirrors `Platform` booleans as a plain object.

Do not mirror:

- [ ] `app.vault.configDir`: low value and exposes config folder naming.
- [ ] `FileSystemAdapter.getBasePath()`: exposes the local filesystem path and is desktop-only.
- [ ] `app.secretStorage`: secrets are out of scope for note-owned scripts.

## `vault:read`

Read vault structure and file contents. These are allowed to call `Vault` read methods internally, but never `Vault` or `DataAdapter` write methods.

- [x] `api.vault.read(path)` mirrors `app.vault.cachedRead(file)` and returns `{ path, content }`.
- [x] `api.vault.readFresh(path)` mirrors `app.vault.read(file)` and returns `{ path, content }`.
- [x] `api.vault.readBinary(path)` mirrors `app.vault.readBinary(file)` and returns base64 or bytes encoded as JSON.
- [x] `api.vault.list(path?)` mirrors `app.vault.getAllLoadedFiles()` and returns file/folder DTOs.
- [x] `api.vault.stat(path)` mirrors `app.vault.getAbstractFileByPath(path)` plus `TFile.stat`.
- [x] `api.vault.exists(path)` mirrors `app.vault.getAbstractFileByPath(path) !== null`.

Read-only implementation guardrail:

- [x] `vault:read` handlers may call only `getName`, `getFileByPath`, `getFolderByPath`, `getAbstractFileByPath`, `getRoot`, `read`, `cachedRead`, `readBinary`, `getAllLoadedFiles`, `getAllFolders`, `getMarkdownFiles`, and `getFiles`.
- [x] `vault:read` handlers must not call `create`, `createBinary`, `createFolder`, `delete`, `trash`, `rename`, `modify`, `modifyBinary`, `append`, `appendBinary`, `process`, `copy`, any `DataAdapter` mutator, or any `FileManager` mutator.

Do not mirror under `vault:read`:

- [x] `app.vault.getFileByPath`, `getFolderByPath`, `getRoot`, `getFiles`, `getMarkdownFiles`, and `getAllFolders` as separate script methods: `api.vault.list`, `api.vault.stat`, and `api.vault.exists` cover the same read surface with fewer aliases.
- [ ] `app.vault.getResourcePath(file)`: returns a browser resource URI for vault content. Consider a separate `vault:resource` permission if needed.
- [ ] `app.vault.adapter.read/list/stat/exists`: prefer `Vault` methods so the boundary stays inside Obsidian's vault model.
- [ ] Vault events: defer until subscription cleanup and data volume limits are designed.

## `metadata:read`

Read Obsidian's parsed cache. This can reveal filenames, links, tags, headings, blocks, frontmatter, and note structure, so keep it separate from pure vault existence checks.

- [x] `api.metadata.getFileCache(path)` mirrors `app.metadataCache.getFileCache(file)` and returns a JSON-safe cache DTO.
- [x] `api.metadata.getFirstLinkpathDest(linkpath, sourcePath)` mirrors `app.metadataCache.getFirstLinkpathDest(...)` and returns a file DTO or `null`.
- [x] `api.metadata.fileToLinktext(path, sourcePath, options?)` mirrors `app.metadataCache.fileToLinktext(...)`.
- [x] `api.metadata.getResolvedLinks()` mirrors `app.metadataCache.resolvedLinks`.
- [x] `api.metadata.getUnresolvedLinks()` mirrors `app.metadataCache.unresolvedLinks`.
- [x] `api.metadata.getAllTags(path)` mirrors `getAllTags(cache)`.
- [x] `api.metadata.resolveSubpath(path, subpath)` mirrors `resolveSubpath(cache, subpath)`.
- [x] `api.frontmatter.getInfo(content)` mirrors `getFrontMatterInfo(content)`.
- [x] `api.frontmatter.parseAliases(frontmatter)` mirrors `parseFrontMatterAliases(frontmatter)`.
- [x] `api.frontmatter.parseTags(frontmatter)` mirrors `parseFrontMatterTags(frontmatter)`.
- [x] `api.frontmatter.parseStringArray(frontmatter, key)` mirrors `parseFrontMatterStringArray(frontmatter, key)`.
- [x] `api.frontmatter.parseEntry(frontmatter, key)` mirrors `parseFrontMatterEntry(frontmatter, key)`.

Do not mirror:

- [x] `app.metadataCache.getCache(path)` as a separate script method: `api.metadata.getFileCache(path)` is the safer existing-file path.
- [ ] Metadata events: defer until subscription cleanup and throttling are designed.
- [ ] `LinkValue.parseFromString(app, ...)`: returns an Obsidian value object. Use plain link parsing DTOs instead.

## `vault:create`

Create new vault entries without modifying existing content.

- [x] `api.vault.create(path, content, options?)` mirrors `app.vault.create(...)`.
- [x] `api.vault.createBinary(path, data, options?)` mirrors `app.vault.createBinary(...)`.
- [x] `api.vault.createFolder(path)` mirrors `app.vault.createFolder(...)`.
- [x] `api.vault.copy(path, newPath)` mirrors `app.vault.copy(...)`.

Implementation guardrail:

- [x] `vault:create` must fail if the target path already exists, except where Obsidian's mirrored method already guarantees that behavior.
- [x] `vault:create` must not overwrite or append existing file contents.

## `vault:modify`

Modify existing vault file content.

- [x] `api.vault.modify(path, content, options?)` mirrors `app.vault.modify(...)`.
- [x] `api.vault.modifyBinary(path, data, options?)` mirrors `app.vault.modifyBinary(...)`.
- [x] `api.vault.append(path, content, options?)` mirrors `app.vault.append(...)`.
- [x] `api.vault.appendBinary(path, data, options?)` mirrors `app.vault.appendBinary(...)`.
- [x] `api.frontmatter.replace(path, frontmatter, options?)` is a safe DTO alternative to `app.fileManager.processFrontMatter(...)`.

Do not mirror directly:

- [ ] `app.vault.process(file, fn, options?)`: would require a host callback. Use explicit read/modify RPCs or a declarative operation instead.
- [ ] `app.fileManager.processFrontMatter(file, fn, options?)`: would require a host callback. Use `api.frontmatter.replace` or specific patch operations instead.

## `vault:move`

Rename or move files and folders.

- [x] `api.fileManager.renameFile(path, newPath)` mirrors `app.fileManager.renameFile(...)` and may update links according to user settings.

Implementation guardrail:

- [x] Do not expose `app.vault.rename(...)` as a separate script method; `api.fileManager.renameFile` is the safer default because it uses Obsidian's link-update behavior.
- [x] Document that `api.fileManager.renameFile` can modify links in other notes and should not be treated as a simple path metadata change.

## `vault:delete`

Trash vault entries using Obsidian deletion settings.

- [x] `api.fileManager.trashFile(path)` mirrors `app.fileManager.trashFile(...)`.

Do not mirror:

- [x] `app.vault.trash(...)` as a separate script method: it asks scripts to choose Obsidian vs system trash instead of respecting the user's configured deletion behavior.
- [x] `app.vault.delete(...)` as a separate script method: permanent deletion is unnecessary while `api.fileManager.trashFile` exists.
- [ ] `app.fileManager.promptForDeletion(file)`: host UI flow is better owned by Safe JS permission approval or a dedicated confirmation API.

## `workspace:read`

Read workspace state and active file identity. This can reveal filenames and user activity.

- [x] `api.workspace.getActiveFile()` mirrors `app.workspace.getActiveFile()` and returns a file DTO or `null`.
- [x] `api.workspace.getLastOpenFiles()` mirrors `app.workspace.getLastOpenFiles()`.
- [x] `api.workspace.getLeavesOfType(viewType)` mirrors `app.workspace.getLeavesOfType(...)` and returns leaf DTOs.
- [x] `api.workspace.getLayout()` mirrors `app.workspace.getLayout()` after stripping plugin-private or non-JSON values.
- [x] `api.workspace.getActiveViewInfo()` mirrors safe parts of `getActiveViewOfType`, active leaf, and active editor state.

Do not mirror:

- [ ] `WorkspaceLeaf`, `View`, or `MarkdownView` objects. Return DTOs only.
- [ ] Workspace events: defer until subscription cleanup and throttling are designed.

## `workspace:navigate`

Change Obsidian UI focus, panes, or opened files without editing vault content.

- [x] `api.workspace.openLinkText(linktext, sourcePath, options?)` mirrors `app.workspace.openLinkText(...)`.
- [x] `api.workspace.openFile(path, openState?)` mirrors `WorkspaceLeaf.openFile(...)` through a host-selected leaf.
- [x] `api.workspace.revealLeaf(leafId)` mirrors `app.workspace.revealLeaf(...)`.
- [x] `api.workspace.setActiveLeaf(leafId, options?)` mirrors `app.workspace.setActiveLeaf(...)`.
- [x] `api.workspace.newLeaf(options?)` mirrors safe cases of `app.workspace.getLeaf(...)`.

Implementation guardrail:

- [x] `workspace:navigate` methods must only open existing files or views. If an unresolved link or path would create a note, require `vault:create` too or reject the call.
- [x] `workspace:navigate` methods must not call vault create, modify, move, trash, or delete methods as a side effect.

Do not mirror:

- [ ] `app.workspace.changeLayout(workspace)`: arbitrary layout mutation is too broad.
- [ ] `app.workspace.detachLeavesOfType(viewType)`: destructive UI operation; add only with a specific use case.
- [ ] Popout methods as mobile-safe defaults: `moveLeafToPopout` and `openPopoutLeaf` are desktop-only.

## `editor:read`

Read the active editor, including unsaved content.

- [x] `api.editor.getValue()` mirrors `editor.getValue()`.
- [x] `api.editor.getLine(line)` mirrors `editor.getLine(...)`.
- [x] `api.editor.lineCount()` mirrors `editor.lineCount()`.
- [x] `api.editor.lastLine()` mirrors `editor.lastLine()`.
- [x] `api.editor.getSelection()` mirrors `editor.getSelection()`.
- [x] `api.editor.getRange(from, to)` mirrors `editor.getRange(...)`.
- [x] `api.editor.getCursor(side?)` mirrors `editor.getCursor(...)`.
- [x] `api.editor.listSelections()` mirrors `editor.listSelections()`.
- [x] `api.editor.hasFocus()` mirrors `editor.hasFocus()`.
- [x] `api.editor.getScrollInfo()` mirrors `editor.getScrollInfo()`.
- [x] `api.editor.wordAt(pos)` mirrors `editor.wordAt(...)`.
- [x] `api.editor.posToOffset(pos)` mirrors `editor.posToOffset(...)`.
- [x] `api.editor.offsetToPos(offset)` mirrors `editor.offsetToPos(...)`.

## `editor:write`

Modify active editor content or editor UI state. This can change unsaved note content and may later be persisted by Obsidian.

- [x] `api.editor.setValue(content)` mirrors `editor.setValue(...)`.
- [x] `api.editor.setLine(line, text)` mirrors `editor.setLine(...)`.
- [x] `api.editor.replaceSelection(replacement, origin?)` mirrors `editor.replaceSelection(...)`.
- [x] `api.editor.replaceRange(replacement, from, to?, origin?)` mirrors `editor.replaceRange(...)`.
- [x] `api.editor.setCursor(pos)` mirrors `editor.setCursor(...)`.
- [x] `api.editor.setSelection(anchor, head?)` mirrors `editor.setSelection(...)`.
- [x] `api.editor.setSelections(ranges, main?)` mirrors `editor.setSelections(...)`.
- [x] `api.editor.scrollTo(x?, y?)` mirrors `editor.scrollTo(...)`.
- [x] `api.editor.scrollIntoView(range, center?)` mirrors `editor.scrollIntoView(...)`.
- [x] `api.editor.focus()` mirrors `editor.focus()`.
- [x] `api.editor.blur()` mirrors `editor.blur()`.
- [x] `api.editor.undo()` mirrors `editor.undo()`.
- [x] `api.editor.redo()` mirrors `editor.redo()`.
- [x] `api.editor.exec(command)` mirrors `editor.exec(...)` with an allowlist of `EditorCommandName`.

Do not mirror directly:

- [ ] `editor.transaction(tx, origin?)` until each transaction field is validated and proven no broader than the explicit editor write methods.
- [ ] `editor.processLines(read, write, ignoreEmpty?)`: requires host callbacks.
- [ ] CodeMirror `EditorView` access through `editorEditorField`: too broad for safe JS.

## `file-manager:read`

Read link and destination helpers from `FileManager`.

- [x] `api.fileManager.getNewFileParent(sourcePath, newFilePath?)` mirrors `app.fileManager.getNewFileParent(...)` and returns a folder DTO.
- [x] `api.fileManager.generateMarkdownLink(path, sourcePath, options?)` mirrors `app.fileManager.generateMarkdownLink(...)`.

Do not mirror under read:

- [ ] `app.fileManager.getAvailablePathForAttachment(filename, sourcePath?)`: docs say it ensures the parent directory exists, so treat it as write-capable unless verified otherwise.

## `ui:notify`

Display short user-visible notifications.

- [x] `api.ui.notice(message, duration?)` mirrors `new Notice(message, duration)`.

Do not mirror:

- [ ] Arbitrary `Modal`, `Menu`, `Setting`, or DOM construction APIs. They expose DOM objects and lifecycle complexity.
- [ ] `setIcon`, `addIcon`, `removeIcon`, `setTooltip`, and related DOM helpers. These mutate host UI/global icon state.

## `network:request`

Network is off by default and must be explicitly requested and documented.

- [x] `api.network.requestUrl(urlOrOptions)` mirrors `requestUrl(...)` and returns a JSON-safe response DTO.

Implementation guardrail:

- [x] Do not expose `request(...)` as a separate script method; `api.network.requestUrl(...)` returns response text plus status, headers, JSON, and base64 data.
- [x] Approval copy must say that network access can send script-provided data to external services.
- [x] If combined with `vault:read`, `metadata:read`, `workspace:read`, or `editor:read`, approval copy must say vault or editor data can be exfiltrated.

## `output:render-rich`

Render script results as Markdown or sanitized HTML in Obsidian.

- [x] Markdown and HTML result objects require `output:render-rich` before Safe JS renders them.
- [x] Without `output:render-rich`, Markdown and HTML result objects are displayed as a plain-text blocked message.

Implementation guardrail:

- [x] Approval copy must say that rendered Markdown or HTML can load remote resources.
- [x] If combined with `vault:read`, `metadata:read`, `workspace:read`, or `editor:read`, approval copy must say rendered output can include vault or editor data in remote resource URLs.
- [x] Docs must disclose that vault create, vault modify, and editor write permissions can write content that later loads remote resources when opened or previewed.

## `storage:read`

Read Safe JS storage scoped to the script source hash only. Do not expose arbitrary vault localStorage keys. Do NOT expose the permission storage.

- [x] `api.storage.get(key)` mirrors a Safe JS-owned source-scoped wrapper over `app.loadLocalStorage(...)`.
- [x] `api.storage.keys()` lists source-scoped Safe JS storage keys.

## `storage:write`

Write Safe JS storage scoped to the script source hash only.

- [x] `api.storage.set(key, value)` mirrors a Safe JS-owned source-scoped wrapper over `app.saveLocalStorage(...)`.
- [x] `api.storage.delete(key)` mirrors `app.saveLocalStorage(key, null)` through a Safe JS-owned source-scoped wrapper.
- [x] `api.storage.clear()` deletes all source-scoped Safe JS storage keys.

## `storage:global-read`

Read Safe JS storage shared across approved scripts on this device.

- [x] `api.globalStorage.get(key)` mirrors a Safe JS-owned global wrapper over `app.loadLocalStorage(...)`.
- [x] `api.globalStorage.keys()` lists global Safe JS storage keys.

## `storage:global-write`

Write Safe JS storage shared across approved scripts on this device.

- [x] `api.globalStorage.set(key, value)` mirrors a Safe JS-owned global wrapper over `app.saveLocalStorage(...)`.
- [x] `api.globalStorage.delete(key)` mirrors `app.saveLocalStorage(key, null)` through a Safe JS-owned global wrapper.
- [x] `api.globalStorage.clear()` deletes all global Safe JS storage keys.

Implementation guardrail:

- [x] Prefix all keys with a Safe JS namespace and validate key length and value size.
- [x] Do not expose raw `app.loadLocalStorage` or `app.saveLocalStorage`.

## Helper methods

These mirror pure Obsidian helper functions through normal permission-gated RPC methods.

- [x] `api.path.normalize(path)` mirrors `normalizePath(path)`.
- [x] `api.link.parseLinktext(linktext)` mirrors `parseLinktext(linktext)`.
- [x] `api.search.prepareSimpleSearch(query, text)` mirrors `prepareSimpleSearch(query)(text)`.
- [x] `api.search.prepareFuzzySearch(query, text)` mirrors `prepareFuzzySearch(query)(text)`.
- [x] `api.yaml.parse(yaml)` mirrors `parseYaml(yaml)`.
- [x] `api.yaml.stringify(value)` mirrors `stringifyYaml(value)`.
- [ ] `api.html.toMarkdown(html)` mirrors `htmlToMarkdown(html)` if it can run without DOM leakage.
- [ ] `api.html.sanitize(html)` mirrors `sanitizeHTMLToDom(html)` only if returning sanitized HTML text, not DOM nodes.
- [x] Do not expose `getLinkpath(linktext)` as a separate script method; `api.link.parseLinktext(linktext).path` covers it.

## Explicitly out of scope

- [ ] Full `app` access.
- [ ] Full `Vault`, `DataAdapter`, `FileManager`, `Workspace`, `WorkspaceLeaf`, `Editor`, `MetadataCache`, `Component`, `Plugin`, or DOM object access.
- [ ] Node, Electron, shell, filesystem paths outside the vault, or Obsidian internals.
- [ ] Remote code loading, script auto-update, `eval` on host, or fetching and executing code.
- [ ] APIs that register long-lived host callbacks until a cleanup and resource limit design exists.
