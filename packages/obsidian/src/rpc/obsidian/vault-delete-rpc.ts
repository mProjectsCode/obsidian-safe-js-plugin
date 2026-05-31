import type { App } from 'obsidian';
import { ok, okResponseSchema, pathParamsSchema, requireAbstractFile } from 'packages/obsidian/src/rpc/rpc-common';
import { method } from 'packages/obsidian/src/rpc/rpc-method-helpers';
import type { RpcMethodDefinition } from 'packages/obsidian/src/rpc/rpc-registry';

export function createVaultDeleteMethods(app: App): RpcMethodDefinition[] {
	return [
		method({
			method: 'fileManager:trashFile',
			permission: 'vault:delete',
			description: 'Trash a vault file or folder respecting the users "trash" settings.',
			usage: 'api.fileManager.trashFile(path)',
			namespace: 'fileManager',
			functionName: 'trashFile',
			argNames: ['path'],
			requestSchema: pathParamsSchema,
			responseSchema: okResponseSchema,
			async handler(params) {
				await app.fileManager.trashFile(requireAbstractFile(app, params.path));
				return ok();
			},
		}),
	];
}
