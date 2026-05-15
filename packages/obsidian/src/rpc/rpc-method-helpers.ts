import { jsonValueSchema } from 'packages/obsidian/src/execution/contracts';
import { ok, okResponseSchema } from 'packages/obsidian/src/rpc/rpc-common';
import type { RpcContext, RpcMethodDefinition } from 'packages/obsidian/src/rpc/rpc-registry';
export { storageKeySchema, storageValueSchema } from 'packages/obsidian/src/storage/storage-validation';
import { z } from 'zod';

export const booleanResponseSchema = z.object({ value: z.boolean() });
export const stringResponseSchema = z.object({ value: z.string() });
export const numberResponseSchema = z.object({ value: z.number() });
export const jsonValueResponseSchema = z.object({ value: jsonValueSchema });
export const optionalStringSchema = z.string().optional();
export const optionalBooleanSchema = z.boolean().optional();
export const optionalNumberSchema = z.number().optional();
export const paneTypeSchema = z.enum(['tab', 'split']).optional();
export const base64StringSchema = z.string();
export const httpUrlSchema = z.url().refine(url => url.startsWith('http://') || url.startsWith('https://'), {
	message: 'Only HTTP and HTTPS URLs are allowed.',
});
export interface MethodOptions<TParams, TResult> {
	method: string;
	permission: RpcMethodDefinition<TParams, TResult>['permission'];
	description: string;
	usage: string;
	namespace: string;
	functionName: string;
	paramStyle?: 'object' | 'path' | 'optionalPath' | 'args';
	argNames?: string[];
	requestSchema: z.ZodType<TParams>;
	responseSchema: z.ZodType<TResult>;
	handler(params: TParams, context: RpcContext): Promise<TResult> | TResult;
}

export function method<TParams, TResult>(options: MethodOptions<TParams, TResult>): RpcMethodDefinition<TParams, TResult> {
	return {
		method: options.method,
		permission: options.permission,
		description: options.description,
		usage: options.usage,
		requestSchema: options.requestSchema,
		responseSchema: options.responseSchema,
		binding: {
			namespace: options.namespace,
			functionName: options.functionName,
			paramStyle: options.paramStyle ?? (options.argNames === undefined ? 'object' : 'args'),
			argNames: options.argNames,
		},
		handler: (params, context) => options.handler(params, context),
	};
}

export function editorRead<TParams, TResult>(
	methodName: string,
	functionName: string,
	description: string,
	usage: string,
	requestSchema: z.ZodType<TParams>,
	responseSchema: z.ZodType<TResult>,
	handler: (params: TParams) => TResult,
	argNames?: string[],
): RpcMethodDefinition<TParams, TResult> {
	return method({
		method: methodName,
		permission: 'editor:read',
		description,
		usage,
		namespace: 'editor',
		functionName,
		argNames,
		requestSchema,
		responseSchema,
		handler,
	});
}

export function editorWrite<TParams>(
	methodName: string,
	functionName: string,
	description: string,
	usage: string,
	requestSchema: z.ZodType<TParams>,
	handler: (params: TParams) => void,
	argNames?: string[],
): RpcMethodDefinition<TParams, { ok: true }> {
	return method({
		method: methodName,
		permission: 'editor:write',
		description,
		usage,
		namespace: 'editor',
		functionName,
		argNames,
		requestSchema,
		responseSchema: okResponseSchema,
		handler(params) {
			handler(params);
			return ok();
		},
	});
}

export function sortByPath<T extends { path: string }>(left: T, right: T): number {
	return left.path.localeCompare(right.path);
}
