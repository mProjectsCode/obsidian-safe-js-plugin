import { expect, test } from 'bun:test';
import { z } from 'zod';
import { SafeJsExecutionService } from 'packages/obsidian/src/execution/execution-service';
import type { PermissionPrompt, PermissionPromptRequest } from 'packages/obsidian/src/execution/execution-service';
import type { HostWorkerMessage, WorkerClient, WorkerClientMessage, WorkerFactory } from 'packages/obsidian/src/execution/worker-client';
import { MemoryPermissionApprovalStore } from 'packages/obsidian/src/permissions/approval-store';
import { RpcRegistry } from 'packages/obsidian/src/rpc/rpc-registry';

class FakePrompt implements PermissionPrompt {
	requests: PermissionPromptRequest[] = [];

	constructor(private readonly approved: boolean) {}

	async requestApproval(request: PermissionPromptRequest): Promise<boolean> {
		this.requests.push(request);
		return this.approved;
	}
}

class FakeWorker implements WorkerClient {
	private messageListener: ((message: WorkerClientMessage) => void) | null = null;
	private errorListener: ((error: Error) => void) | null = null;
	terminated = false;

	postMessage(message: HostWorkerMessage): void {
		if (message.type === 'execute') {
			queueMicrotask(() => {
				this.messageListener?.({
					type: 'rpc-request',
					executionId: message.executionId,
					rpcRequestId: 'rpc-1',
					method: 'test:echo',
					params: { value: 'from-worker' },
				});
			});
			return;
		}

		if (message.type === 'rpc-response' && message.ok) {
			queueMicrotask(() => {
				this.messageListener?.({
					type: 'execution-result',
					executionId: message.executionId,
					ok: true,
					value: message.result,
				});
			});
		}
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

	emitError(error: Error): void {
		this.errorListener?.(error);
	}
}

class FakeWorkerFactory implements WorkerFactory {
	workers: FakeWorker[] = [];

	create(): WorkerClient {
		const worker = new FakeWorker();
		this.workers.push(worker);
		return worker;
	}
}

class HangingWorker extends FakeWorker {
	override postMessage(_message: HostWorkerMessage): void {}
}

class HangingWorkerFactory implements WorkerFactory {
	workers: HangingWorker[] = [];

	create(): WorkerClient {
		const worker = new HangingWorker();
		this.workers.push(worker);
		return worker;
	}
}

async function waitForWorker(workerFactory: { workers: unknown[] }): Promise<void> {
	for (let attempt = 0; attempt < 10; attempt += 1) {
		if (workerFactory.workers.length > 0) {
			return;
		}

		await new Promise(resolve => {
			setTimeout(resolve, 0);
		});
	}

	throw new Error('Worker was not created.');
}

function createRegistry(): RpcRegistry {
	return new RpcRegistry([
		{
			method: 'test:echo',
			permission: 'test:call',
			description: 'Echo a test value.',
			usage: 'api.test.echo({ value })',
			requestSchema: z.object({ value: z.string() }),
			responseSchema: z.object({ value: z.string() }),
			binding: {
				namespace: 'test',
				functionName: 'echo',
				paramStyle: 'object',
			},
			handler: params => params,
		},
	]);
}

function createService(options: { promptApproved: boolean; store?: MemoryPermissionApprovalStore; workerFactory?: FakeWorkerFactory }) {
	const prompt = new FakePrompt(options.promptApproved);
	const workerFactory = options.workerFactory ?? new FakeWorkerFactory();
	const store = options.store ?? new MemoryPermissionApprovalStore();
	const service = new SafeJsExecutionService({
		rpcRegistry: createRegistry(),
		approvalStore: store,
		permissionPrompt: prompt,
		workerFactory,
		getDefaultTimeoutMs: () => 1000,
		hashSource: async code => `hash:${code.length}`,
		createExecutionId: () => 'exec-1',
		now: () => 100,
		setExecutionTimeout: (callback, timeoutMs) => setTimeout(callback, timeoutMs) as unknown as number,
		clearExecutionTimeout: timeoutId => {
			clearTimeout(timeoutId);
		},
	});

	return { service, prompt, workerFactory, store };
}

function createLowRiskService(options: { autoAllowLowRiskPermissions: boolean }) {
	const prompt = new FakePrompt(false);
	const workerFactory = new FakeWorkerFactory();
	const store = new MemoryPermissionApprovalStore();
	const service = new SafeJsExecutionService({
		rpcRegistry: new RpcRegistry(
			[
				{
					method: 'test:echo',
					permission: 'test:call',
					description: 'Echo a test value.',
					usage: 'api.test.echo({ value })',
					requestSchema: z.object({ value: z.string() }),
					responseSchema: z.object({ value: z.string() }),
					binding: {
						namespace: 'test',
						functionName: 'echo',
						paramStyle: 'object',
					},
					handler: params => params,
				},
			],
			[
				{
					id: 'test:call',
					name: 'Test calls',
					description: 'Run test calls.',
					severity: 'low',
					grantGuidance: 'Grant in tests.',
				},
			],
		),
		approvalStore: store,
		permissionPrompt: prompt,
		workerFactory,
		getDefaultTimeoutMs: () => 1000,
		getAutoAllowLowRiskPermissions: () => options.autoAllowLowRiskPermissions,
		hashSource: async code => `hash:${code.length}`,
		createExecutionId: () => 'exec-1',
		now: () => 100,
		setExecutionTimeout: (callback, timeoutMs) => setTimeout(callback, timeoutMs) as unknown as number,
		clearExecutionTimeout: timeoutId => {
			clearTimeout(timeoutId);
		},
	});

	return { service, prompt, workerFactory, store };
}

test('prompts before execution and does not create a worker when denied', async () => {
	const { service, prompt, workerFactory } = createService({ promptApproved: false });

	const result = await service.execute(`// @permission test:call
return await api.test.echo({ value: "x" });`);

	expect(result.status).toBe('permission-denied');
	expect(prompt.requests).toHaveLength(1);
	expect(workerFactory.workers).toHaveLength(0);
});

test('stores approvals and executes through the injected RPC registry', async () => {
	const { service, prompt, workerFactory, store } = createService({ promptApproved: true });
	const code = `// @permission test:call
return await api.test.echo({ value: "x" });`;

	const result = await service.execute(code);

	expect(result).toMatchObject({
		status: 'success',
		codeHash: `hash:${code.length}`,
		value: { value: 'from-worker' },
		permissions: ['test:call'],
	});
	expect(prompt.requests).toHaveLength(1);
	expect(store.load(`hash:${code.length}`)?.permissions).toEqual(['test:call']);
	expect(workerFactory.workers[0]?.terminated).toBe(true);
});

test('uses stored approval for the same code hash without prompting again', async () => {
	const store = new MemoryPermissionApprovalStore();
	const code = `// @permission test:call
return await api.test.echo({ value: "x" });`;
	store.save({
		codeHash: `hash:${code.length}`,
		permissions: ['test:call'],
		updatedAt: 1,
	});
	const { service, prompt } = createService({ promptApproved: false, store });

	const result = await service.execute(code);

	expect(result.status).toBe('success');
	expect(prompt.requests).toHaveLength(0);
});

test('expands permission groups before prompting and execution', async () => {
	const { service, prompt, store } = createService({ promptApproved: true });
	const code = `// @permission test:*
return await api.test.echo({ value: "x" });`;

	const result = await service.execute(code);

	expect(result.status).toBe('success');
	expect(prompt.requests[0]?.permissions).toEqual(['test:call']);
	expect(store.load(`hash:${code.length}`)?.permissions).toEqual(['test:call']);
});

test('auto-allows low-risk permissions when enabled', async () => {
	const { service, prompt, store } = createLowRiskService({ autoAllowLowRiskPermissions: true });
	const code = `// @permission test:call
return await api.test.echo({ value: "x" });`;

	const result = await service.execute(code);

	expect(result.status).toBe('success');
	expect(prompt.requests).toHaveLength(0);
	expect(store.load(`hash:${code.length}`)?.permissions).toEqual(['test:call']);
});

test('returns parse errors before creating a worker', async () => {
	const { service, workerFactory } = createService({ promptApproved: true });

	const result = await service.execute(`// @permission test:missing
return 1;`);

	expect(result.status).toBe('parse-error');
	expect(workerFactory.workers).toHaveLength(0);
});

test('terminates workers on timeout', async () => {
	const workerFactory = new HangingWorkerFactory();
	const { service } = createService({ promptApproved: true, workerFactory: workerFactory as unknown as FakeWorkerFactory });

	const result = await service.execute(
		`// @permission test:call
return await api.test.echo({ value: "x" });`,
		{ timeoutMs: 1 },
	);

	expect(result.status).toBe('timeout');
	expect(workerFactory.workers[0]?.terminated).toBe(true);
});

test('can disable timeouts and cancel with an abort signal', async () => {
	const workerFactory = new HangingWorkerFactory();
	const prompt = new FakePrompt(true);
	const store = new MemoryPermissionApprovalStore();
	let timeoutCalls = 0;
	const service = new SafeJsExecutionService({
		rpcRegistry: createRegistry(),
		approvalStore: store,
		permissionPrompt: prompt,
		workerFactory,
		getDefaultTimeoutMs: () => null,
		hashSource: async code => `hash:${code.length}`,
		createExecutionId: () => 'exec-1',
		now: () => 100,
		setExecutionTimeout: () => {
			timeoutCalls += 1;
			return 1;
		},
		clearExecutionTimeout: () => {},
	});
	const abortController = new AbortController();

	const resultPromise = service.execute(
		`// @permission test:call
return await api.test.echo({ value: "x" });`,
		{ signal: abortController.signal },
	);
	await waitForWorker(workerFactory);
	abortController.abort();
	const result = await resultPromise;

	expect(result.status).toBe('cancelled');
	expect(timeoutCalls).toBe(0);
	expect(workerFactory.workers[0]?.terminated).toBe(true);
});

test('cancelAll resolves active executions as cancelled', async () => {
	const workerFactory = new HangingWorkerFactory();
	const { service } = createService({ promptApproved: true, workerFactory: workerFactory as unknown as FakeWorkerFactory });

	const resultPromise = service.execute(`// @permission test:call
return await api.test.echo({ value: "x" });`);
	await waitForWorker(workerFactory);
	service.cancelAll();
	const result = await resultPromise;

	expect(result.status).toBe('cancelled');
	expect(workerFactory.workers[0]?.terminated).toBe(true);
});

test('measures execution elapsed time after permission approval', async () => {
	let now = 0;
	const prompt = new (class extends FakePrompt {
		override async requestApproval(request: PermissionPromptRequest): Promise<boolean> {
			now = 1000;
			return await super.requestApproval(request);
		}
	})(true);
	const workerFactory = new FakeWorkerFactory();
	const service = new SafeJsExecutionService({
		rpcRegistry: new RpcRegistry([
			{
				method: 'test:echo',
				permission: 'test:call',
				description: 'Echo a test value.',
				usage: 'api.test.echo({ value })',
				requestSchema: z.object({ value: z.string() }),
				responseSchema: z.object({ value: z.string() }),
				binding: {
					namespace: 'test',
					functionName: 'echo',
					paramStyle: 'object',
				},
				handler: params => {
					now = 1250;
					return params;
				},
			},
		]),
		approvalStore: new MemoryPermissionApprovalStore(),
		permissionPrompt: prompt,
		workerFactory,
		getDefaultTimeoutMs: () => 1000,
		hashSource: async code => `hash:${code.length}`,
		createExecutionId: () => 'exec-1',
		now: () => now,
		setExecutionTimeout: (callback, timeoutMs) => setTimeout(callback, timeoutMs) as unknown as number,
		clearExecutionTimeout: timeoutId => {
			clearTimeout(timeoutId);
		},
	});

	const result = await service.execute(`// @permission test:call
return await api.test.echo({ value: "x" });`);

	expect(result.status).toBe('success');
	expect(result.elapsedMs).toBe(250);
});
