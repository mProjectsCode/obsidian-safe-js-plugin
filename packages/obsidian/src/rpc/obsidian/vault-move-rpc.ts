import type { App } from 'obsidian';
import { assertTargetDoesNotExist, ok, okResponseSchema, requireAbstractFile } from 'packages/obsidian/src/rpc/rpc-common';
import { method } from 'packages/obsidian/src/rpc/rpc-method-helpers';
import type { RpcMethodDefinition } from 'packages/obsidian/src/rpc/rpc-registry';
import { z } from 'zod';

export function createVaultMoveMethods(app: App): RpcMethodDefinition[] {
	return [
		method({
			method: 'vault:rename',
			permission: 'vault:move',
			description: 'Rename or move a vault file or folder without automatic link updates.',
			usage: 'api.vault.rename(path, newPath)',
			namespace: 'vault',
			functionName: 'rename',
			argNames: ['path', 'newPath'],
			requestSchema: z.object({ path: z.string(), newPath: z.string() }),
			responseSchema: okResponseSchema,
			async handler(params) {
				await app.vault.rename(requireAbstractFile(app, params.path), assertTargetDoesNotExist(app, params.newPath));
				return ok();
			},
		}),
		method({
			method: 'fileManager:renameFile',
			permission: 'vault:move',
			description: 'Rename or move a vault item using Obsidian link-update behavior.',
			usage: 'api.fileManager.renameFile(path, newPath)',
			namespace: 'fileManager',
			functionName: 'renameFile',
			argNames: ['path', 'newPath'],
			requestSchema: z.object({ path: z.string(), newPath: z.string() }),
			responseSchema: okResponseSchema,
			async handler(params) {
				await app.fileManager.renameFile(requireAbstractFile(app, params.path), assertTargetDoesNotExist(app, params.newPath));
				return ok();
			},
		}),
	];
}
