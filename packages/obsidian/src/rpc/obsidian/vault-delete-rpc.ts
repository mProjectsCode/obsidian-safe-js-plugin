import type { App } from 'obsidian';
import { ok, okResponseSchema, pathParamsSchema, requireAbstractFile } from 'packages/obsidian/src/rpc/rpc-common';
import { method } from 'packages/obsidian/src/rpc/rpc-method-helpers';
import type { RpcMethodDefinition } from 'packages/obsidian/src/rpc/rpc-registry';
import { z } from 'zod';

export function createVaultDeleteMethods(app: App): RpcMethodDefinition[] {
	return [
		method({
			method: 'vault:trash',
			permission: 'vault:delete',
			description: 'Move a vault file or folder to system trash.',
			usage: 'api.vault.trash(path, system)',
			namespace: 'vault',
			functionName: 'trash',
			argNames: ['path', 'system'],
			requestSchema: z.object({ path: z.string(), system: z.boolean() }),
			responseSchema: okResponseSchema,
			async handler(params) {
				await app.vault.trash(requireAbstractFile(app, params.path), params.system);
				return ok();
			},
		}),
		method({
			method: 'vault:delete',
			permission: 'vault:delete',
			description: 'Permanently delete a vault file or folder.',
			usage: 'api.vault.delete(path, options?)',
			namespace: 'vault',
			functionName: 'delete',
			argNames: ['path', 'options'],
			requestSchema: z.object({ path: z.string(), options: z.object({ force: z.boolean().optional() }).optional() }),
			responseSchema: okResponseSchema,
			async handler(params) {
				await app.vault.delete(requireAbstractFile(app, params.path), params.options?.force);
				return ok();
			},
		}),
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
