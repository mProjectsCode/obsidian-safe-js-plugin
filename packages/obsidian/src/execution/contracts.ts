import type { JsonValue, PermissionId, SafeJsExecutionOptions, SafeJsExecutionResult } from '@lemons_dev/obsidian-safe-js-api';
import type {
	ExecuteWorkerMessage,
	HostRpcRequestMessage,
	HostRpcResponseMessage,
	WorkerRpcBinding,
	WorkerSandboxGlobal,
	WorkerToHostMessage,
} from '@lemons_dev/obsidian-safe-js-api/internal';
import { z } from 'zod';

export const permissionSchema = z
	.string()
	.regex(/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/u)
	.transform(value => value as PermissionId);

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
	z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]),
);

export type {
	ExecuteWorkerMessage,
	HostRpcRequestMessage,
	HostRpcResponseMessage,
	JsonValue,
	SafeJsExecutionOptions,
	SafeJsExecutionResult,
	WorkerRpcBinding,
	WorkerSandboxGlobal,
	WorkerToHostMessage,
};

export const workerSandboxGlobalSchema: z.ZodType<WorkerSandboxGlobal> = z.object({
	name: z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/u),
	value: jsonValueSchema,
});

export const workerRpcBindingSchema: z.ZodType<WorkerRpcBinding> = z.object({
	method: z.string().min(1),
	namespace: z.string().min(1),
	functionName: z.string().min(1),
	permission: permissionSchema,
	paramStyle: z.enum(['object', 'path', 'optionalPath', 'args']),
	argNames: z.array(z.string().min(1)).optional(),
});

export const executeWorkerMessageSchema: z.ZodType<ExecuteWorkerMessage> = z.object({
	type: z.literal('execute'),
	executionId: z.string().min(1),
	code: z.string(),
	mode: z.enum(['script', 'expression']),
	inputs: z.record(z.string(), jsonValueSchema),
	rpcBindings: z.array(workerRpcBindingSchema),
	sandboxGlobals: z.array(workerSandboxGlobalSchema).default([]),
});

export const hostRpcRequestMessageSchema: z.ZodType<HostRpcRequestMessage> = z.object({
	type: z.literal('rpc-request'),
	executionId: z.string().min(1),
	rpcRequestId: z.string().min(1),
	method: z.string().min(1),
	params: jsonValueSchema,
});

export const hostRpcResponseMessageSchema: z.ZodType<HostRpcResponseMessage> = z.discriminatedUnion('ok', [
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

export const workerToHostMessageSchema: z.ZodType<WorkerToHostMessage> = z.union([hostRpcRequestMessageSchema, workerExecutionResultMessageSchema]);
