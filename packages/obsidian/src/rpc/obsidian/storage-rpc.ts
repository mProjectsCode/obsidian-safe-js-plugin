import type { App } from 'obsidian';
import { ok, okResponseSchema } from 'packages/obsidian/src/rpc/rpc-common';
import { jsonValueResponseSchema, method, storageKeySchema, storageValueSchema } from 'packages/obsidian/src/rpc/rpc-method-helpers';
import type { RpcMethodDefinition } from 'packages/obsidian/src/rpc/rpc-registry';
import { ScriptStorageManager } from 'packages/obsidian/src/storage/script-storage';
import { z } from 'zod';

export function createStorageMethods(app: App): RpcMethodDefinition[] {
	const storageManager = new ScriptStorageManager(app);

	return [
		method({
			method: 'storage:get',
			permission: 'storage:read',
			description: 'Read a Safe JS plugin-scoped storage value.',
			usage: 'api.storage.get(key)',
			namespace: 'storage',
			functionName: 'get',
			argNames: ['key'],
			requestSchema: z.object({ key: storageKeySchema }),
			responseSchema: jsonValueResponseSchema,
			handler: params => ({ value: storageManager.get(params.key) }),
		}),
		method({
			method: 'storage:set',
			permission: 'storage:write',
			description: 'Write a Safe JS plugin-scoped storage value.',
			usage: 'api.storage.set(key, value)',
			namespace: 'storage',
			functionName: 'set',
			argNames: ['key', 'value'],
			requestSchema: z.object({ key: storageKeySchema, value: storageValueSchema }),
			responseSchema: okResponseSchema,
			handler(params) {
				storageManager.set(params.key, params.value);
				return ok();
			},
		}),
		method({
			method: 'storage:delete',
			permission: 'storage:write',
			description: 'Delete a Safe JS plugin-scoped storage value.',
			usage: 'api.storage.delete(key)',
			namespace: 'storage',
			functionName: 'delete',
			argNames: ['key'],
			requestSchema: z.object({ key: storageKeySchema }),
			responseSchema: okResponseSchema,
			handler(params) {
				storageManager.delete(params.key);
				return ok();
			},
		}),
	];
}
