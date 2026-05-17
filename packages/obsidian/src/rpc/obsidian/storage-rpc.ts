import type { App } from 'obsidian';
import { ok, okResponseSchema } from 'packages/obsidian/src/rpc/rpc-common';
import { jsonValueResponseSchema, method, storageKeySchema, storageValueSchema } from 'packages/obsidian/src/rpc/rpc-method-helpers';
import type { RpcContext, RpcMethodDefinition } from 'packages/obsidian/src/rpc/rpc-registry';
import { ScriptStorageManager } from 'packages/obsidian/src/storage/script-storage';
import { z } from 'zod';

export function createStorageMethods(app: App): RpcMethodDefinition[] {
	const storageManager = new ScriptStorageManager(app);

	return [
		method({
			method: 'storage:get',
			permission: 'storage:read',
			description: 'Read a Safe JS storage value scoped to this script source.',
			usage: 'api.storage.get(key)',
			namespace: 'storage',
			functionName: 'get',
			argNames: ['key'],
			requestSchema: z.object({ key: storageKeySchema }),
			responseSchema: jsonValueResponseSchema,
			handler: (params, context) => ({ value: createScopedStorageManager(app, context).get(params.key) }),
		}),
		method({
			method: 'storage:set',
			permission: 'storage:write',
			description: 'Write a Safe JS storage value scoped to this script source.',
			usage: 'api.storage.set(key, value)',
			namespace: 'storage',
			functionName: 'set',
			argNames: ['key', 'value'],
			requestSchema: z.object({ key: storageKeySchema, value: storageValueSchema }),
			responseSchema: okResponseSchema,
			handler(params, context) {
				createScopedStorageManager(app, context).set(params.key, params.value);
				return ok();
			},
		}),
		method({
			method: 'storage:delete',
			permission: 'storage:write',
			description: 'Delete a Safe JS storage value scoped to this script source.',
			usage: 'api.storage.delete(key)',
			namespace: 'storage',
			functionName: 'delete',
			argNames: ['key'],
			requestSchema: z.object({ key: storageKeySchema }),
			responseSchema: okResponseSchema,
			handler(params, context) {
				createScopedStorageManager(app, context).delete(params.key);
				return ok();
			},
		}),
		method({
			method: 'globalStorage:get',
			permission: 'storage:global-read',
			description: 'Read a Safe JS storage value shared across scripts on this device.',
			usage: 'api.globalStorage.get(key)',
			namespace: 'globalStorage',
			functionName: 'get',
			argNames: ['key'],
			requestSchema: z.object({ key: storageKeySchema }),
			responseSchema: jsonValueResponseSchema,
			handler: params => ({ value: storageManager.get(params.key) }),
		}),
		method({
			method: 'globalStorage:set',
			permission: 'storage:global-write',
			description: 'Write a Safe JS storage value shared across scripts on this device.',
			usage: 'api.globalStorage.set(key, value)',
			namespace: 'globalStorage',
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
			method: 'globalStorage:delete',
			permission: 'storage:global-write',
			description: 'Delete a Safe JS storage value shared across scripts on this device.',
			usage: 'api.globalStorage.delete(key)',
			namespace: 'globalStorage',
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

function createScopedStorageManager(app: App, context: RpcContext): ScriptStorageManager {
	if (context.codeHash === undefined) {
		throw new Error('Scoped storage requires a script source hash.');
	}

	return new ScriptStorageManager(app, Date.now, context.codeHash);
}
