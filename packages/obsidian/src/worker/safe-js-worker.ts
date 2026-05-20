'use strict';

// eslint-disable-next-line import/order -- SES lockdown must run before the worker's other runtime dependencies.
import { SesCompartment, sesHarden } from 'packages/obsidian/src/worker/ses-runtime';
import type { ExecuteWorkerMessage, HostRpcResponseMessage, JsonValue, WorkerRpcBinding } from 'packages/obsidian/src/execution/contracts';
import { executeWorkerMessageSchema, hostRpcResponseMessageSchema } from 'packages/obsidian/src/execution/contracts';
import { isJsonValue, toJsonValue } from 'packages/obsidian/src/execution/json';
import { SANDBOX_GLOBALS } from 'packages/obsidian/src/execution/sandbox-globals';

interface PendingRpc {
	resolve(value: JsonValue): void;
	reject(error: Error): void;
}

type WorkerApi = Record<string, Record<string, (...args: unknown[]) => Promise<JsonValue>>>;

const pendingRpcRequests = new Map<string, PendingRpc>();
const safeConsole = sesHarden({
	debug: console.debug.bind(console),
	error: console.error.bind(console),
	info: console.info.bind(console),
	log: console.log.bind(console),
	warn: console.warn.bind(console),
});

function nextRpcRequestId(): string {
	return crypto.randomUUID();
}

function postMessageToHost(message: unknown): void {
	self.postMessage(message);
}

function normalizeParams(binding: WorkerRpcBinding, args: unknown[]): JsonValue {
	if (binding.paramStyle === 'args') {
		return normalizeNamedArgs(binding, args);
	}

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

function normalizeNamedArgs(binding: WorkerRpcBinding, args: unknown[]): JsonValue {
	const argNames = binding.argNames ?? [];
	const params: Record<string, JsonValue> = {};
	for (const [index, name] of argNames.entries()) {
		const value = args[index];
		if (value !== undefined) {
			params[name] = isJsonValue(value) ? value : null;
		}
	}

	return params;
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

	return sesHarden(api);
}

async function executeUserCode(message: ExecuteWorkerMessage): Promise<void> {
	const api = createApi(message.executionId, message.rpcBindings);
	const sandboxGlobals: Record<string, unknown> = {
		api,
		console: safeConsole,
	};

	for (const global of message.sandboxGlobals) {
		if (global.name === 'api' || global.name === 'console') {
			throw new Error(`Sandbox global '${global.name}' is reserved.`);
		}

		sandboxGlobals[global.name] = sesHarden(global.value);
	}

	try {
		const compartment = new SesCompartment({
			globals: sesHarden(sandboxGlobals),
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
			message: `Worker received an invalid host message. Sandbox globals: ${SANDBOX_GLOBALS.map(global => global.name).join(', ')}.`,
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
