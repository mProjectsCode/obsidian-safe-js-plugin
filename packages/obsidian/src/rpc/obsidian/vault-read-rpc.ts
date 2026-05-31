import type { App } from 'obsidian';
import {
	abstractFileDtoSchema,
	abstractFileToDto,
	encodeArrayBuffer,
	optionalPathParamsSchema,
	pathParamsSchema,
	requireAbstractFile,
	requireFile,
	isSafeVaultPath,
	validateVaultPath,
} from 'packages/obsidian/src/rpc/rpc-common';
import { booleanResponseSchema, method } from 'packages/obsidian/src/rpc/rpc-method-helpers';
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
	];
}
