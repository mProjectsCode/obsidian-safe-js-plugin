import type { App } from 'obsidian';
import {
	abstractFileDtoSchema,
	abstractFileToDto,
	assertTargetDoesNotExist,
	decodeArrayBuffer,
	fileDtoSchema,
	fileToDto,
	folderDtoSchema,
	folderToDto,
	pathParamsSchema,
	requireAbstractFile,
	writeOptionsFromDto,
	writeOptionsSchema,
} from 'packages/obsidian/src/rpc/rpc-common';
import { base64StringSchema, method } from 'packages/obsidian/src/rpc/rpc-method-helpers';
import type { RpcMethodDefinition } from 'packages/obsidian/src/rpc/rpc-registry';
import { z } from 'zod';

export function createVaultCreateMethods(app: App): RpcMethodDefinition[] {
	return [
		method({
			method: 'vault:create',
			permission: 'vault:create',
			description: 'Create a new text file. Existing paths are rejected.',
			usage: 'api.vault.create(path, content, options?)',
			namespace: 'vault',
			functionName: 'create',
			argNames: ['path', 'content', 'options'],
			requestSchema: z.object({ path: z.string(), content: z.string(), options: writeOptionsSchema }),
			responseSchema: fileDtoSchema,
			async handler(params) {
				const path = assertTargetDoesNotExist(app, params.path);
				return fileToDto(await app.vault.create(path, params.content, writeOptionsFromDto(params.options)));
			},
		}),
		method({
			method: 'vault:createBinary',
			permission: 'vault:create',
			description: 'Create a new binary file from base64 content. Existing paths are rejected.',
			usage: 'api.vault.createBinary(path, base64, options?)',
			namespace: 'vault',
			functionName: 'createBinary',
			argNames: ['path', 'base64', 'options'],
			requestSchema: z.object({ path: z.string(), base64: base64StringSchema, options: writeOptionsSchema }),
			responseSchema: fileDtoSchema,
			async handler(params) {
				const path = assertTargetDoesNotExist(app, params.path);
				return fileToDto(await app.vault.createBinary(path, decodeArrayBuffer(params.base64), writeOptionsFromDto(params.options)));
			},
		}),
		method({
			method: 'vault:createFolder',
			permission: 'vault:create',
			description: 'Create a new folder. Existing paths are rejected.',
			usage: 'api.vault.createFolder(path)',
			namespace: 'vault',
			functionName: 'createFolder',
			argNames: ['path'],
			requestSchema: pathParamsSchema,
			responseSchema: folderDtoSchema,
			async handler(params) {
				const path = assertTargetDoesNotExist(app, params.path);
				return folderToDto(await app.vault.createFolder(path));
			},
		}),
		method({
			method: 'vault:copy',
			permission: 'vault:create',
			description: 'Copy a vault file or folder to a new path. Existing targets are rejected.',
			usage: 'api.vault.copy(path, newPath)',
			namespace: 'vault',
			functionName: 'copy',
			argNames: ['path', 'newPath'],
			requestSchema: z.object({ path: z.string(), newPath: z.string() }),
			responseSchema: abstractFileDtoSchema,
			async handler(params) {
				const source = requireAbstractFile(app, params.path);
				const newPath = assertTargetDoesNotExist(app, params.newPath);
				return abstractFileToDto(await app.vault.copy(source, newPath));
			},
		}),
	];
}
