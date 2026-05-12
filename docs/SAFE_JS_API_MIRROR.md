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
- If `network:request` is ever combined with vault or editor read permissions, the approval UI and docs must clearly warn that script output can leave the device.

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
- [x] `api.vault.getFile(path)` mirrors `app.vault.getFileByPath(path)` and returns a file DTO or `null`.
- [x] `api.vault.getFolder(path)` mirrors `app.vault.getFolderByPath(path)` and returns a folder DTO or `null`.
- [x] `api.vault.getRoot()` mirrors `app.vault.getRoot()` and returns a folder DTO.
- [x] `api.vault.getFiles()` mirrors `app.vault.getFiles()` and returns file DTOs.
- [x] `api.vault.getMarkdownFiles()` mirrors `app.vault.getMarkdownFiles()` and returns file DTOs.
- [x] `api.vault.getFolders(options?)` mirrors `app.vault.getAllFolders(includeRoot?)` and returns folder DTOs.

Read-only implementation guardrail:

- [x] `vault:read` handlers may call only `getName`, `getFileByPath`, `getFolderByPath`, `getAbstractFileByPath`, `getRoot`, `read`, `cachedRead`, `readBinary`, `getAllLoadedFiles`, `getAllFolders`, `getMarkdownFiles`, and `getFiles`.
- [x] `vault:read` handlers must not call `create`, `createBinary`, `createFolder`, `delete`, `trash`, `rename`, `modify`, `modifyBinary`, `append`, `appendBinary`, `process`, `copy`, any `DataAdapter` mutator, or any `FileManager` mutator.

Do not mirror under `vault:read`:

- [ ] `app.vault.getResourcePath(file)`: returns a browser resource URI for vault content. Consider a separate `vault:resource` permission if needed.
- [ ] `app.vault.adapter.read/list/stat/exists`: prefer `Vault` methods so the boundary stays inside Obsidian's vault model.
- [ ] Vault events: defer until subscription cleanup and data volume limits are designed.

## `metadata:read`

Read Obsidian's parsed cache. This can reveal filenames, links, tags, headings, blocks, frontmatter, and note structure, so keep it separate from pure vault existence checks.

- [x] `api.metadata.getFileCache(path)` mirrors `app.metadataCache.getFileCache(file)` and returns a JSON-safe cache DTO.
- [x] `api.metadata.getCache(path)` mirrors `app.metadataCache.getCache(path)` and returns a JSON-safe cache DTO.
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

- [x] `api.vault.rename(path, newPath)` mirrors `app.vault.rename(...)`.
- [x] `api.fileManager.renameFile(path, newPath)` mirrors `app.fileManager.renameFile(...)` and may update links according to user settings.

Implementation guardrail:

- [x] Document that `api.fileManager.renameFile` can modify links in other notes and should not be treated as a simple path metadata change.

## `vault:delete`

Trash or delete vault entries.

- [x] `api.vault.trash(path, system)` mirrors `app.vault.trash(...)`.
- [x] `api.vault.delete(path, options?)` mirrors `app.vault.delete(...)`.
- [x] `api.fileManager.trashFile(path)` mirrors `app.fileManager.trashFile(...)`.

Do not mirror:

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

- [x] `api.network.request(urlOrOptions)` mirrors `request(...)`.
- [x] `api.network.requestUrl(urlOrOptions)` mirrors `requestUrl(...)` and returns a JSON-safe response DTO.

Implementation guardrail:

- [x] Approval copy must say that network access can send script-provided data to external services.
- [x] If combined with `vault:read`, `metadata:read`, `workspace:read`, or `editor:read`, approval copy must say vault or editor data can be exfiltrated.

## `storage:read`

Read Safe JS plugin-scoped storage only. Do not expose arbitrary vault localStorage keys. Do NOT expose the permission storage.

- [x] `api.storage.get(key)` mirrors a Safe JS-owned wrapper over `app.loadLocalStorage(...)`.

## `storage:write`

Write Safe JS plugin-scoped storage only.

- [x] `api.storage.set(key, value)` mirrors a Safe JS-owned wrapper over `app.saveLocalStorage(...)`.
- [x] `api.storage.delete(key)` mirrors `app.saveLocalStorage(key, null)` through a Safe JS-owned wrapper.

Implementation guardrail:

- [x] Prefix all keys with a Safe JS namespace and validate key length and value size.
- [x] Do not expose raw `app.loadLocalStorage` or `app.saveLocalStorage`.

## Pure worker helpers

These can be implemented inside the worker without host RPC or permissions. They are not exposed yet; this iteration focused on host RPC permissions, generated docs, and sandbox globals.

- [ ] `api.path.normalize(path)` mirrors `normalizePath(path)`.
- [ ] `api.link.parseLinktext(linktext)` mirrors `parseLinktext(linktext)`.
- [ ] `api.link.getLinkpath(linktext)` mirrors `getLinkpath(linktext)`.
- [ ] `api.search.prepareSimpleSearch(query, text)` mirrors `prepareSimpleSearch(query)(text)`.
- [ ] `api.search.prepareFuzzySearch(query, text)` mirrors `prepareFuzzySearch(query)(text)`.
- [ ] `api.yaml.parse(yaml)` mirrors `parseYaml(yaml)`.
- [ ] `api.yaml.stringify(value)` mirrors `stringifyYaml(value)`.
- [ ] `api.html.toMarkdown(html)` mirrors `htmlToMarkdown(html)` if it can run without DOM leakage.
- [ ] `api.html.sanitize(html)` mirrors `sanitizeHTMLToDom(html)` only if returning sanitized HTML text, not DOM nodes.
- [ ] `api.binary.arrayBufferToBase64(buffer)` mirrors `arrayBufferToBase64(buffer)`.
- [ ] `api.binary.base64ToArrayBuffer(base64)` mirrors `base64ToArrayBuffer(base64)`.
- [ ] `api.binary.arrayBufferToHex(buffer)` mirrors `arrayBufferToHex(buffer)`.
- [ ] `api.binary.hexToArrayBuffer(hex)` mirrors `hexToArrayBuffer(hex)`.

## Explicitly out of scope

- [ ] Full `app` access.
- [ ] Full `Vault`, `DataAdapter`, `FileManager`, `Workspace`, `WorkspaceLeaf`, `Editor`, `MetadataCache`, `Component`, `Plugin`, or DOM object access.
- [ ] Node, Electron, shell, filesystem paths outside the vault, or Obsidian internals.
- [ ] Remote code loading, script auto-update, `eval` on host, or fetching and executing code.
- [ ] APIs that register long-lived host callbacks until a cleanup and resource limit design exists.
