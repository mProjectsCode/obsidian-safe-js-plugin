import type { PermissionId } from 'packages/obsidian/src/permissions/permissions';
import { z } from 'zod';

export const permissionSchema = z
	.string()
	.regex(/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/u)
	.transform(value => value as PermissionId);

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
	z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]),
);

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const workerRpcBindingSchema = z.object({
	method: z.string().min(1),
	namespace: z.string().min(1),
	functionName: z.string().min(1),
	permission: permissionSchema,
	paramStyle: z.enum(['object', 'path', 'optionalPath', 'args']),
	argNames: z.array(z.string().min(1)).optional(),
});

export type WorkerRpcBinding = z.infer<typeof workerRpcBindingSchema>;

export const executeWorkerMessageSchema = z.object({
	type: z.literal('execute'),
	executionId: z.string().min(1),
	code: z.string(),
	rpcBindings: z.array(workerRpcBindingSchema),
});

export type ExecuteWorkerMessage = z.infer<typeof executeWorkerMessageSchema>;

export const hostRpcRequestMessageSchema = z.object({
	type: z.literal('rpc-request'),
	executionId: z.string().min(1),
	rpcRequestId: z.string().min(1),
	method: z.string().min(1),
	params: jsonValueSchema,
});

export type HostRpcRequestMessage = z.infer<typeof hostRpcRequestMessageSchema>;

export const hostRpcResponseMessageSchema = z.discriminatedUnion('ok', [
	z.object({
		type: z.literal('rpc-response'),
		executionId: z.string().min(1),
		rpcRequestId: z.string().min(1),
		ok: z.literal(true),
		result: jsonValueSchema,
	}),
	z.object({
		type: z.literal('rpc-response'),
		executionId: z.string().min(1),
		rpcRequestId: z.string().min(1),
		ok: z.literal(false),
		error: z.object({
			code: z.string().min(1),
			message: z.string().min(1),
		}),
	}),
]);

export type HostRpcResponseMessage = z.infer<typeof hostRpcResponseMessageSchema>;

export const workerExecutionResultMessageSchema = z.discriminatedUnion('ok', [
	z.object({
		type: z.literal('execution-result'),
		executionId: z.string().min(1),
		ok: z.literal(true),
		value: jsonValueSchema,
	}),
	z.object({
		type: z.literal('execution-result'),
		executionId: z.string().min(1),
		ok: z.literal(false),
		error: z.object({
			name: z.string().min(1),
			message: z.string().min(1),
			stack: z.string().optional(),
		}),
	}),
]);

export type WorkerExecutionResultMessage = z.infer<typeof workerExecutionResultMessageSchema>;

export const workerToHostMessageSchema = z.union([hostRpcRequestMessageSchema, workerExecutionResultMessageSchema]);

export type WorkerToHostMessage = z.infer<typeof workerToHostMessageSchema>;

export type SafeJsExecutionResult =
	| {
			status: 'success';
			codeHash: string;
			value: JsonValue;
			permissions: PermissionId[];
			elapsedMs: number;
	  }
	| {
			status: 'permission-denied';
			codeHash: string;
			message: string;
			permissions: PermissionId[];
			elapsedMs: number;
	  }
	| {
			status: 'parse-error' | 'validation-error' | 'runtime-error' | 'timeout' | 'cancelled';
			codeHash: string;
			message: string;
			permissions: PermissionId[];
			elapsedMs: number;
	  };

export interface SafeJsExecutionSource {
	path?: string;
	lineStart?: number;
	callerPluginId?: string;
}

export interface SafeJsExecutionOptions {
	source?: SafeJsExecutionSource;
	debug?: boolean;
	timeoutMs?: number;
}
