import { Notice } from 'obsidian';
import { ok, okResponseSchema } from 'packages/obsidian/src/rpc/rpc-common';
import { method } from 'packages/obsidian/src/rpc/rpc-method-helpers';
import type { RpcMethodDefinition } from 'packages/obsidian/src/rpc/rpc-registry';
import { z } from 'zod';

export function createUiMethods(): RpcMethodDefinition[] {
	return [
		method({
			method: 'ui:notice',
			permission: 'ui:notify',
			description: 'Show a short Obsidian notice.',
			usage: 'api.ui.notice(message, duration?)',
			namespace: 'ui',
			functionName: 'notice',
			argNames: ['message', 'duration'],
			requestSchema: z.object({ message: z.string().min(1).max(500), duration: z.number().int().min(0).max(30000).optional() }),
			responseSchema: okResponseSchema,
			handler(params) {
				new Notice(params.message, params.duration);
				return ok();
			},
		}),
	];
}
