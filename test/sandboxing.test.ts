import { expect, test } from 'bun:test';
import '@happy-dom/global-registrator';
import { executeWorkerMessageSchema, hostRpcResponseMessageSchema, workerToHostMessageSchema } from 'packages/obsidian/src/execution/contracts';
import type { HostWorkerMessage, WorkerClient, WorkerClientMessage, WorkerFactory } from 'packages/obsidian/src/execution/worker-client';
import { WorkerExecutionSession } from 'packages/obsidian/src/execution/worker-execution-session';
import { RpcRegistry } from 'packages/obsidian/src/rpc/rpc-registry';
import { SANDBOX_GLOBALS } from 'packages/obsidian/src/execution/sandbox-globals';
import { SesCompartment, sesHarden } from 'packages/obsidian/src/worker/ses-runtime';

const testValidatorOptions = {
	getConfigDir: (): string => '.obsidian',
};

class RecordingWorker implements WorkerClient {
	private messageListener: ((message: WorkerClientMessage) => void) | null = null;
	private errorListener: ((error: Error) => void) | null = null;
	postedMessages: HostWorkerMessage[] = [];
	terminated = false;

	postMessage(message: HostWorkerMessage): void {
		this.postedMessages.push(message);
	}

	terminate(): void {
		this.terminated = true;
	}

	onMessage(listener: (message: WorkerClientMessage) => void): () => void {
		this.messageListener = listener;
		return () => {
			this.messageListener = null;
		};
	}

	onError(listener: (error: Error) => void): () => void {
		this.errorListener = listener;
		return () => {
			this.errorListener = null;
		};
	}

	emitMessage(message: unknown): void {
		this.messageListener?.(message);
	}

	emitError(error: Error): void {
		this.errorListener?.(error);
	}
}

class RecordingWorkerFactory implements WorkerFactory {
	worker = new RecordingWorker();

	create(): WorkerClient {
		return this.worker;
	}
}

function createSession(workerFactory: WorkerFactory, registry: RpcRegistry): WorkerExecutionSession {
	return new WorkerExecutionSession({
		activeExecutions: new Set(),
		clearExecutionTimeout: timeoutId => {
			clearTimeout(timeoutId);
		},
		createExecutionId: () => 'exec-1',
		now: () => 100,
		rpcRegistry: registry,
		setExecutionTimeout: (callback, timeoutMs) => setTimeout(callback, timeoutMs) as unknown as number,
		workerFactory,
	});
}

function createRegistry(): RpcRegistry {
	return new RpcRegistry({
		methods: [
			{
				method: 'vault:read',
				permission: 'vault:read',
				description: 'Read a file.',
				usage: 'api.vault.read(path)',
				requestValidator: 'rpc:pathParams',
				responseValidator: value => {
					if (typeof value === 'string') {
						return { success: true, data: value };
					}

					return { success: false, message: 'Expected a string.' };
				},
				binding: {
					namespace: 'vault',
					functionName: 'read',
					paramStyle: 'path',
				},
				handler: params => {
					const request = params as { path: string };
					return `read:${request.path}`;
				},
			},
		],
		validators: testValidatorOptions,
	});
}

test('sandbox global documentation only advertises the intentional host surface', () => {
	expect(SANDBOX_GLOBALS.map(global => global.name).sort()).toEqual(['api', 'console']);
});

test('SES compartment does not inherit browser, Bun, Node, or worker host globals', () => {
	const compartment = new SesCompartment({
		globals: sesHarden({
			api: sesHarden({}),
			console: sesHarden({ log() {} }),
		}),
		__options__: true,
	});

	const exposedGlobals = compartment.evaluate(`[
		'api',
		'console',
		'fetch',
		'document',
		'localStorage',
		'window',
		'self',
		'process',
		'Bun',
		'require',
		'importScripts',
		'Worker',
		'XMLHttpRequest'
	].map(name => [name, typeof globalThis[name]])`);

	expect(exposedGlobals).toEqual([
		['api', 'object'],
		['console', 'object'],
		['fetch', 'undefined'],
		['document', 'undefined'],
		['localStorage', 'undefined'],
		['window', 'undefined'],
		['self', 'undefined'],
		['process', 'undefined'],
		['Bun', 'undefined'],
		['require', 'undefined'],
		['importScripts', 'undefined'],
		['Worker', 'undefined'],
		['XMLHttpRequest', 'undefined'],
	]);
});

test('hardened sandbox globals cannot be expanded by user code', () => {
	const compartment = new SesCompartment({
		globals: sesHarden({
			api: sesHarden({ vault: sesHarden({}) }),
			console: sesHarden({ log() {} }),
		}),
		__options__: true,
	});

	const mutationResult = compartment.evaluate(`(() => {
		try {
			api.network = { request() {} };
		} catch {}
		try {
			api.vault.read = () => 'leaked';
		} catch {}
		return {
			apiKeys: Object.keys(api),
			vaultKeys: Object.keys(api.vault),
			hasNetwork: 'network' in api,
			hasVaultRead: 'read' in api.vault,
		};
	})()`);

	expect(mutationResult).toEqual({
		apiKeys: ['vault'],
		vaultKeys: [],
		hasNetwork: false,
		hasVaultRead: false,
	});
});

test('worker execute messages only include RPC binding metadata, not host app objects', async () => {
	const workerFactory = new RecordingWorkerFactory();
	const session = createSession(workerFactory, createRegistry());
	const resultPromise = session.execute({
		code: 'return 1;',
		codeHash: 'hash-a',
		executionOptions: {},
		grantedPermissions: new Set(['vault:read']),
		startedAt: 100,
		timeoutMs: null,
	});

	const executeMessage = executeWorkerMessageSchema.parse(workerFactory.worker.postedMessages[0]);
	expect(executeMessage).toEqual({
		type: 'execute',
		executionId: 'exec-1',
		code: 'return 1;',
		rpcBindings: [
			{
				method: 'vault:read',
				permission: 'vault:read',
				namespace: 'vault',
				functionName: 'read',
				paramStyle: 'path',
			},
		],
		sandboxGlobals: [],
	});

	workerFactory.worker.emitMessage({
		type: 'execution-result',
		executionId: 'exec-1',
		ok: true,
		value: null,
	});
	await resultPromise;
});

test('worker execute messages include only granted sandbox globals', async () => {
	const registry = createRegistry();
	registry.registerPermission({
		id: 'plugin:global',
		name: 'Plugin globals',
		description: 'Read plugin globals.',
		severity: 'medium',
		grantGuidance: 'Grant for plugin globals.',
	});
	registry.registerSandboxGlobal({
		name: 'pluginData',
		description: 'Plugin data.',
		permission: 'plugin:global',
		value: { enabled: true },
	});
	registry.registerSandboxGlobal({
		name: 'publicData',
		description: 'Public data.',
		value: { version: 1 },
	});
	const workerFactory = new RecordingWorkerFactory();
	const session = createSession(workerFactory, registry);
	const resultPromise = session.execute({
		code: 'return 1;',
		codeHash: 'hash-a',
		executionOptions: {},
		grantedPermissions: new Set(['vault:read']),
		startedAt: 100,
		timeoutMs: null,
	});

	const executeMessage = executeWorkerMessageSchema.parse(workerFactory.worker.postedMessages[0]);
	expect(executeMessage.sandboxGlobals).toEqual([{ name: 'publicData', value: { version: 1 } }]);

	workerFactory.worker.emitMessage({
		type: 'execution-result',
		executionId: 'exec-1',
		ok: true,
		value: null,
	});
	await resultPromise;
});

test('hardened custom sandbox globals cannot be mutated by user code', () => {
	const compartment = new SesCompartment({
		globals: sesHarden({
			pluginData: sesHarden({ settings: { enabled: true } }),
		}),
		__options__: true,
	});

	const result = compartment.evaluate(`(() => {
		try {
			pluginData.settings.enabled = false;
		} catch {}
		try {
			pluginData.extra = true;
		} catch {}
		return {
			enabled: pluginData.settings.enabled,
			hasExtra: 'extra' in pluginData,
		};
	})()`);

	expect(result).toEqual({
		enabled: true,
		hasExtra: false,
	});
});

test('worker session rejects malformed and cross-execution worker messages', async () => {
	const invalidWorkerFactory = new RecordingWorkerFactory();
	const invalidResultPromise = createSession(invalidWorkerFactory, createRegistry()).execute({
		code: 'return 1;',
		codeHash: 'hash-a',
		executionOptions: {},
		grantedPermissions: new Set(),
		startedAt: 100,
		timeoutMs: null,
	});
	invalidWorkerFactory.worker.emitMessage({ type: 'execution-result', executionId: 'exec-1', ok: true, value: undefined });

	await expect(invalidResultPromise).resolves.toMatchObject({
		status: 'validation-error',
		message: 'Worker sent an invalid message.',
	});

	const wrongExecutionWorkerFactory = new RecordingWorkerFactory();
	const wrongExecutionResultPromise = createSession(wrongExecutionWorkerFactory, createRegistry()).execute({
		code: 'return 1;',
		codeHash: 'hash-a',
		executionOptions: {},
		grantedPermissions: new Set(),
		startedAt: 100,
		timeoutMs: null,
	});
	wrongExecutionWorkerFactory.worker.emitMessage({ type: 'execution-result', executionId: 'exec-2', ok: true, value: null });

	await expect(wrongExecutionResultPromise).resolves.toMatchObject({
		status: 'validation-error',
		message: 'Worker sent a message for an unknown execution.',
	});
});

test('worker RPC requests are permission-gated before reaching host handlers', async () => {
	const workerFactory = new RecordingWorkerFactory();
	const session = createSession(workerFactory, createRegistry());
	const resultPromise = session.execute({
		code: 'return await api.vault.read("Secret.md");',
		codeHash: 'hash-a',
		executionOptions: {},
		grantedPermissions: new Set(),
		startedAt: 100,
		timeoutMs: null,
	});

	workerFactory.worker.emitMessage({
		type: 'rpc-request',
		executionId: 'exec-1',
		rpcRequestId: 'rpc-1',
		method: 'vault:read',
		params: { path: 'Secret.md' },
	});
	await Promise.resolve();

	const response = hostRpcResponseMessageSchema.parse(workerFactory.worker.postedMessages[1]);
	expect(response).toMatchObject({
		type: 'rpc-response',
		executionId: 'exec-1',
		rpcRequestId: 'rpc-1',
		ok: false,
		error: {
			code: 'missing-permission',
		},
	});

	workerFactory.worker.emitMessage({
		type: 'execution-result',
		executionId: 'exec-1',
		ok: false,
		error: {
			name: 'Error',
			message: 'RPC failed.',
		},
	});
	await resultPromise;
});

test('worker message schema rejects non-JSON values at the worker boundary', () => {
	expect(workerToHostMessageSchema.safeParse({ type: 'execution-result', executionId: 'exec-1', ok: true, value: undefined }).success).toBe(false);
	expect(workerToHostMessageSchema.safeParse({ type: 'execution-result', executionId: 'exec-1', ok: true, value: () => 'x' }).success).toBe(false);
	expect(workerToHostMessageSchema.safeParse({ type: 'execution-result', executionId: 'exec-1', ok: true, value: { ok: true } }).success).toBe(true);
});
