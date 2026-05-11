"use strict";
/* global Compartment, harden, lockdown */

import 'ses';
import type { ExecuteWorkerMessage, HostRpcResponseMessage, JsonValue, WorkerRpcBinding } from 'packages/obsidian/src/execution/contracts';
import { executeWorkerMessageSchema, hostRpcResponseMessageSchema } from 'packages/obsidian/src/execution/contracts';

interface PendingRpc {
	resolve(value: JsonValue): void;
	reject(error: Error): void;
}

type WorkerApi = Record<string, Record<string, (...args: unknown[]) => Promise<JsonValue>>>;

const pendingRpcRequests = new Map<string, PendingRpc>();

lockdown();

function nextRpcRequestId(): string {
	return crypto.randomUUID();
}

function postMessageToHost(message: unknown): void {
	self.postMessage(message);
}

function normalizeParams(binding: WorkerRpcBinding, args: unknown[]): JsonValue {
	if (binding.paramStyle === 'path') {
		return {
			path: readPathArgument(args[0] ?? ''),
		};
	}

	if (binding.paramStyle === 'optionalPath') {
		if (args[0] === undefined || args[0] === null || args[0] === '') {
			return {};
		}

		return {
			path: readPathArgument(args[0]),
		};
	}

	const params = args[0] ?? {};
	return isJsonValue(params) ? params : {};
}

function createApi(executionId: string, bindings: readonly WorkerRpcBinding[]): WorkerApi {
	const api: WorkerApi = {};
	for (const binding of bindings) {
		api[binding.namespace] ??= {};
		api[binding.namespace][binding.functionName] = async (...args: unknown[]): Promise<JsonValue> => {
			const rpcRequestId = nextRpcRequestId();
			const params = normalizeParams(binding, args);

			return await new Promise<JsonValue>((resolve, reject) => {
				pendingRpcRequests.set(rpcRequestId, { resolve, reject });
				postMessageToHost({
					type: 'rpc-request',
					executionId,
					rpcRequestId,
					method: binding.method,
					params,
				});
			});
		};
	}

	return harden(api);
}

async function executeUserCode(message: ExecuteWorkerMessage): Promise<void> {
	const api = createApi(message.executionId, message.rpcBindings);

	try {
		const compartment = new Compartment({
			globals: harden({ api }),
			__options__: true,
		});
		const rawValue = (await compartment.evaluate(`"use strict";
(async () => {
${message.code}
})();`)) as unknown;
		postMessageToHost({
			type: 'execution-result',
			executionId: message.executionId,
			ok: true,
			value: toJsonValue(rawValue),
		});
	} catch (error) {
		postMessageToHost({
			type: 'execution-result',
			executionId: message.executionId,
			ok: false,
			error: serializeError(error),
		});
	}
}

function readPathArgument(value: unknown): string {
	if (typeof value === 'string') {
		return value;
	}

	throw new Error('Path arguments must be strings.');
}

function serializeError(error: unknown): { name: string; message: string; stack?: string } {
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
			stack: error.stack,
		};
	}

	return {
		name: 'Error',
		message: String(error),
	};
}

function toJsonValue(value: unknown): JsonValue {
	if (isJsonValue(value)) {
		return value;
	}

	if (value === undefined) {
		return null;
	}

	return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function isJsonValue(value: unknown): value is JsonValue {
	if (value === null) {
		return true;
	}

	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		return Number.isFinite(value) || typeof value !== 'number';
	}

	if (Array.isArray(value)) {
		return value.every(isJsonValue);
	}

	if (typeof value === 'object') {
		return Object.values(value).every(isJsonValue);
	}

	return false;
}

self.addEventListener('message', event => {
	const responseMessage = hostRpcResponseMessageSchema.safeParse(event.data);
	if (responseMessage.success) {
		handleRpcResponse(responseMessage.data);
		return;
	}

	const executeMessage = executeWorkerMessageSchema.safeParse(event.data);
	if (executeMessage.success) {
		void executeUserCode(executeMessage.data);
		return;
	}

	postMessageToHost({
		type: 'execution-result',
		executionId: 'unknown',
		ok: false,
		error: {
			name: 'ValidationError',
			message: 'Worker received an invalid host message.',
		},
	});
});

function handleRpcResponse(message: HostRpcResponseMessage): void {
	const pendingRequest = pendingRpcRequests.get(message.rpcRequestId);
	if (pendingRequest === undefined) {
		return;
	}

	pendingRpcRequests.delete(message.rpcRequestId);
	if (message.ok) {
		pendingRequest.resolve(message.result);
		return;
	}

	pendingRequest.reject(new Error(message.error.message));
}
