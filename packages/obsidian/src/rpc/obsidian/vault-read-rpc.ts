import type { App } from 'obsidian';
import {
	abstractFileDtoSchema,
	abstractFileToDto,
	emptyParamsSchema,
	encodeArrayBuffer,
	fileDtoSchema,
	fileToDto,
	folderDtoSchema,
	folderToDto,
	nullableFileDtoSchema,
	nullableFolderDtoSchema,
	optionalPathParamsSchema,
	pathParamsSchema,
	requireAbstractFile,
	requireFile,
	isSafeVaultPath,
	validateVaultPath,
} from 'packages/obsidian/src/rpc/rpc-common';
import { booleanResponseSchema, method, sortByPath } from 'packages/obsidian/src/rpc/rpc-method-helpers';
import type { RpcMethodDefinition } from 'packages/obsidian/src/rpc/rpc-registry';
import { z } from 'zod';

export function createVaultReadMethods(app: App): RpcMethodDefinition[] {
	return [
		method({
			method: 'vault:read',
			permission: 'vault:read',
			description: 'Read cached text content from a vault file.',
			usage: 'api.vault.read(path)',
			namespace: 'vault',
			functionName: 'read',
			paramStyle: 'path',
			requestSchema: pathParamsSchema,
			responseSchema: z.object({ path: z.string(), content: z.string() }),
			async handler(params) {
				const file = requireFile(app, params.path);
				return { path: file.path, content: await app.vault.cachedRead(file) };
			},
		}),
		method({
			method: 'vault:readFresh',
			permission: 'vault:read',
			description: 'Read fresh text content from disk for a vault file.',
			usage: 'api.vault.readFresh(path)',
			namespace: 'vault',
			functionName: 'readFresh',
			paramStyle: 'path',
			requestSchema: pathParamsSchema,
			responseSchema: z.object({ path: z.string(), content: z.string() }),
			async handler(params) {
				const file = requireFile(app, params.path);
				return { path: file.path, content: await app.vault.read(file) };
			},
		}),
		method({
			method: 'vault:readBinary',
			permission: 'vault:read',
			description: 'Read binary vault file content as base64 text.',
			usage: 'api.vault.readBinary(path)',
			namespace: 'vault',
			functionName: 'readBinary',
			paramStyle: 'path',
			requestSchema: pathParamsSchema,
			responseSchema: z.object({ path: z.string(), base64: z.string() }),
			async handler(params) {
				const file = requireFile(app, params.path);
				return { path: file.path, base64: encodeArrayBuffer(await app.vault.readBinary(file)) };
			},
		}),
		method({
			method: 'vault:list',
			permission: 'vault:read',
			description: 'List vault files and folders, optionally under a folder path.',
			usage: 'api.vault.list(path?)',
			namespace: 'vault',
			functionName: 'list',
			paramStyle: 'optionalPath',
			requestSchema: optionalPathParamsSchema,
			responseSchema: z.object({ files: z.array(abstractFileDtoSchema) }),
			handler(params) {
				const folderPath = validateVaultPath(params.path ?? '', { allowEmpty: true, configDir: app.vault.configDir, label: 'Folder path' });
				const prefix = folderPath === '' ? '' : `${folderPath}/`;
				const files = app.vault
					.getAllLoadedFiles()
					.filter(file => isSafeVaultPath(app, file.path))
					.filter(file => folderPath === '' || file.path === folderPath || file.path.startsWith(prefix))
					.map(file => abstractFileToDto(file))
					.sort((left, right) => left.path.localeCompare(right.path));
				return { files };
			},
		}),
		method({
			method: 'vault:stat',
			permission: 'vault:read',
			description: 'Read metadata for a vault file or folder.',
			usage: 'api.vault.stat(path)',
			namespace: 'vault',
			functionName: 'stat',
			paramStyle: 'path',
			requestSchema: pathParamsSchema,
			responseSchema: abstractFileDtoSchema,
			handler: params => abstractFileToDto(requireAbstractFile(app, params.path)),
		}),
		method({
			method: 'vault:exists',
			permission: 'vault:read',
			description: 'Check whether a vault path exists.',
			usage: 'api.vault.exists(path)',
			namespace: 'vault',
			functionName: 'exists',
			paramStyle: 'path',
			requestSchema: pathParamsSchema,
			responseSchema: booleanResponseSchema,
			handler(params) {
				const path = validateVaultPath(params.path, { configDir: app.vault.configDir });
				return { value: app.vault.getAbstractFileByPath(path) !== null };
			},
		}),
		method({
			method: 'vault:getFile',
			permission: 'vault:read',
			description: 'Read file metadata for a path, or null when it is not a file.',
			usage: 'api.vault.getFile(path)',
			namespace: 'vault',
			functionName: 'getFile',
			paramStyle: 'path',
			requestSchema: pathParamsSchema,
			responseSchema: nullableFileDtoSchema,
			handler(params) {
				const path = validateVaultPath(params.path, { configDir: app.vault.configDir });
				const file = app.vault.getFileByPath(path);
				return file === null ? null : fileToDto(file);
			},
		}),
		method({
			method: 'vault:getFolder',
			permission: 'vault:read',
			description: 'Read folder metadata for a path, or null when it is not a folder.',
			usage: 'api.vault.getFolder(path)',
			namespace: 'vault',
			functionName: 'getFolder',
			paramStyle: 'path',
			requestSchema: pathParamsSchema,
			responseSchema: nullableFolderDtoSchema,
			handler(params) {
				const path = validateVaultPath(params.path, { allowEmpty: true, configDir: app.vault.configDir, label: 'Folder path' });
				const folder = path === '' ? app.vault.getRoot() : app.vault.getFolderByPath(path);
				return folder === null ? null : folderToDto(folder, true, child => isSafeVaultPath(app, child.path));
			},
		}),
		method({
			method: 'vault:getRoot',
			permission: 'vault:read',
			description: 'Read metadata for the vault root folder.',
			usage: 'api.vault.getRoot()',
			namespace: 'vault',
			functionName: 'getRoot',
			requestSchema: emptyParamsSchema,
			responseSchema: folderDtoSchema,
			handler: () => folderToDto(app.vault.getRoot(), true, child => isSafeVaultPath(app, child.path)),
		}),
		method({
			method: 'vault:getFiles',
			permission: 'vault:read',
			description: 'List all vault files.',
			usage: 'api.vault.getFiles()',
			namespace: 'vault',
			functionName: 'getFiles',
			requestSchema: emptyParamsSchema,
			responseSchema: z.object({ files: z.array(fileDtoSchema) }),
			handler: () => ({
				files: app.vault
					.getFiles()
					.filter(file => isSafeVaultPath(app, file.path))
					.map(fileToDto)
					.sort(sortByPath),
			}),
		}),
		method({
			method: 'vault:getMarkdownFiles',
			permission: 'vault:read',
			description: 'List all Markdown files in the vault.',
			usage: 'api.vault.getMarkdownFiles()',
			namespace: 'vault',
			functionName: 'getMarkdownFiles',
			requestSchema: emptyParamsSchema,
			responseSchema: z.object({ files: z.array(fileDtoSchema) }),
			handler: () => ({
				files: app.vault
					.getMarkdownFiles()
					.filter(file => isSafeVaultPath(app, file.path))
					.map(fileToDto)
					.sort(sortByPath),
			}),
		}),
		method({
			method: 'vault:getFolders',
			permission: 'vault:read',
			description: 'List all vault folders, optionally including the root folder.',
			usage: 'api.vault.getFolders({ includeRoot: true })',
			namespace: 'vault',
			functionName: 'getFolders',
			requestSchema: z.object({ includeRoot: z.boolean().optional() }),
			responseSchema: z.object({ folders: z.array(folderDtoSchema) }),
			handler: params => ({
				folders: app.vault
					.getAllFolders(params.includeRoot)
					.filter(folder => folder.isRoot() || isSafeVaultPath(app, folder.path))
					.map(folder => folderToDto(folder))
					.sort(sortByPath),
			}),
		}),
	];
}
