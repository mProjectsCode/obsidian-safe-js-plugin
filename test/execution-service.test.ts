import { expect, test } from 'bun:test';
import type { SafeJsValidationResult } from '@lemons_dev/obsidian-safe-js-api';
import { SafeJsExecutionService } from 'packages/obsidian/src/execution/execution-service';
import type { PermissionPrompt, PermissionPromptRequest } from 'packages/obsidian/src/execution/execution-service';
import type { HostWorkerMessage, WorkerClient, WorkerClientMessage, WorkerFactory } from 'packages/obsidian/src/execution/worker-client';
import { MemoryPermissionApprovalStore } from 'packages/obsidian/src/permissions/approval-store';
import { RpcRegistry } from 'packages/obsidian/src/rpc/rpc-registry';

const testValidatorOptions = {
	getConfigDir: (): string => '.obsidian',
};

interface EchoValue {
	value: string;
}

function echoValueValidator(value: unknown): SafeJsValidationResult<EchoValue> {
	if (typeof value === 'object' && value !== null && 'value' in value && typeof value.value === 'string') {
		return { success: true, data: { value: value.value } };
	}

	return { success: false, message: 'Expected an object with a string value.' };
}

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
	postedMessages: HostWorkerMessage[] = [];

	postMessage(message: HostWorkerMessage): void {
		this.postedMessages.push(message);
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
	return new RpcRegistry({
		methods: [
			{
				method: 'test:echo',
				permission: 'test:call',
				description: 'Echo a test value.',
				usage: 'api.test.echo({ value })',
				requestValidator: echoValueValidator,
				responseValidator: echoValueValidator,
				binding: {
					namespace: 'test',
					functionName: 'echo',
					paramStyle: 'object',
				},
				handler: params => params,
			},
		],
		validators: testValidatorOptions,
	});
}

function createService(options: {
	promptApproved: boolean;
	store?: MemoryPermissionApprovalStore;
	workerFactory?: FakeWorkerFactory;
	registry?: RpcRegistry;
	autoAllowLowRiskPermissions?: boolean;
}) {
	const prompt = new FakePrompt(options.promptApproved);
	const workerFactory = options.workerFactory ?? new FakeWorkerFactory();
	const store = options.store ?? new MemoryPermissionApprovalStore();
	const service = new SafeJsExecutionService({
		rpcRegistry: options.registry ?? createRegistry(),
		approvalStore: store,
		permissionPrompt: prompt,
		workerFactory,
		getDefaultTimeoutMs: () => 1000,
		getAutoAllowLowRiskPermissions: () => options.autoAllowLowRiskPermissions ?? false,
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
		rpcRegistry: new RpcRegistry({
			methods: [
				{
					method: 'test:echo',
					permission: 'test:call',
					description: 'Echo a test value.',
					usage: 'api.test.echo({ value })',
					requestValidator: echoValueValidator,
					responseValidator: echoValueValidator,
					binding: {
						namespace: 'test',
						functionName: 'echo',
						paramStyle: 'object',
					},
					handler: params => params,
				},
			],
			permissionDefinitions: [
				{
					id: 'test:call',
					name: 'Test calls',
					description: 'Run test calls.',
					severity: 'low',
					grantGuidance: 'Grant in tests.',
				},
			],
			validators: testValidatorOptions,
		}),
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

test('skip-missing approval mode returns permission-denied without prompting', async () => {
	const { service, prompt, workerFactory } = createService({ promptApproved: true });

	const result = await service.execute(
		`// @permission test:call
return 'ok';`,
		{
			approvalMode: 'skip-missing',
		},
	);

	expect(result.status).toBe('permission-denied');
	if (result.status !== 'success') {
		expect(result.message).toBe('Execution skipped because permission approval is required for test:call.');
	}
	expect(prompt.requests).toHaveLength(0);
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
	expect(store.load({ codeHash: `hash:${code.length}` })?.permissions).toEqual(['test:call']);
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

test('scopes stored approvals by caller plugin id', async () => {
	const store = new MemoryPermissionApprovalStore();
	const code = `// @permission test:call
return await api.test.echo({ value: "x" });`;
	const first = createService({ promptApproved: true, store });

	const firstResult = await first.service.execute(code, {
		source: {
			callerPluginId: 'caller-a',
		},
	});
	const secondResult = await first.service.execute(code, {
		source: {
			callerPluginId: 'caller-a',
		},
	});
	const second = createService({ promptApproved: true, store });
	const thirdResult = await second.service.execute(code, {
		source: {
			callerPluginId: 'caller-b',
		},
	});

	expect(firstResult.status).toBe('success');
	expect(secondResult.status).toBe('success');
	expect(thirdResult.status).toBe('success');
	expect(first.prompt.requests).toHaveLength(1);
	expect(second.prompt.requests).toHaveLength(1);
	expect(store.load({ codeHash: `hash:${code.length}`, callerPluginId: 'caller-a' })?.permissions).toEqual(['test:call']);
	expect(store.load({ codeHash: `hash:${code.length}`, callerPluginId: 'caller-b' })?.permissions).toEqual(['test:call']);
});

test('expands permission groups before prompting and execution', async () => {
	const { service, prompt, store } = createService({ promptApproved: true });
	const code = `// @permission test:*
return await api.test.echo({ value: "x" });`;

	const result = await service.execute(code);

	expect(result.status).toBe('success');
	expect(prompt.requests[0]?.permissions).toEqual(['test:call']);
	expect(prompt.requests[0]?.allPermissions).toEqual(['test:call']);
	expect(store.load({ codeHash: `hash:${code.length}` })?.permissions).toEqual(['test:call']);
});

test('auto-allows low-risk permissions when enabled', async () => {
	const { service, prompt, store } = createLowRiskService({ autoAllowLowRiskPermissions: true });
	const code = `// @permission test:call
return await api.test.echo({ value: "x" });`;

	const result = await service.execute(code);

	expect(result.status).toBe('success');
	expect(prompt.requests).toHaveLength(0);
	expect(store.load({ codeHash: `hash:${code.length}` })?.permissions).toEqual(['test:call']);
});

test('compound severity prevents auto-allowing individually low-risk permissions', async () => {
	const registry = new RpcRegistry({
		permissionDefinitions: [
			{ id: 'test:call', name: 'Call', description: 'Call.', severity: 'low', grantGuidance: 'Test.', standalone: true },
			{ id: 'other:read', name: 'Read', description: 'Read.', severity: 'low', grantGuidance: 'Test.', standalone: true },
		],
		compoundPermissionRules: [{ id: 'call-with-read', permissions: ['test:call', 'other:read'], severity: 'high', description: 'Combined risk.' }],
		validators: testValidatorOptions,
	});
	const { service, prompt, workerFactory } = createService({
		promptApproved: false,
		registry,
		autoAllowLowRiskPermissions: true,
	});

	const result = await service.execute('// @permission test:call\n// @permission other:read\nreturn 1;');

	expect(result.status).toBe('permission-denied');
	expect(prompt.requests[0]?.permissions).toEqual(['test:call', 'other:read']);
	expect(prompt.requests[0]?.compoundRules.map(rule => rule.id)).toEqual(['call-with-read']);
	expect(workerFactory.workers).toHaveLength(0);
});

test('returns parse errors before creating a worker', async () => {
	const { service, workerFactory } = createService({ promptApproved: true });

	const result = await service.execute(`// @permission test:missing
return 1;`);

	expect(result.status).toBe('parse-error');
	expect(workerFactory.workers).toHaveLength(0);
});

test('set permission policies reject source permission comments before prompting', async () => {
	const { service, prompt, workerFactory } = createService({ promptApproved: true });
	const result = await service.execute('// @permission test:call\nreturn 1;', {
		permissionPolicy: { mode: 'set', permissions: ['test:call'] },
	});

	expect(result).toMatchObject({ status: 'policy-error', permissions: [] });
	expect(prompt.requests).toHaveLength(0);
	expect(workerFactory.workers).toHaveLength(0);
});

test('set permission policies supply the complete approved permission set', async () => {
	const { service, prompt } = createService({ promptApproved: true });
	const result = await service.execute('return await api.test.echo({ value: "x" });', {
		permissionPolicy: { mode: 'set', permissions: ['test:*'] },
	});

	expect(result.status).toBe('success');
	expect(prompt.requests[0]?.permissions).toEqual(['test:call']);
});

test('restrict policies enforce permission names and compound severity', async () => {
	const registry = new RpcRegistry({
		methods: [
			{
				method: 'test:echo',
				permission: 'test:call',
				description: 'Echo.',
				usage: 'api.test.echo({ value })',
				requestValidator: echoValueValidator,
				responseValidator: echoValueValidator,
				binding: { namespace: 'test', functionName: 'echo', paramStyle: 'object' },
				handler: params => params,
			},
		],
		permissionDefinitions: [
			{ id: 'test:call', name: 'Call', description: 'Call.', severity: 'low', grantGuidance: 'Test.', standalone: true },
			{ id: 'other:read', name: 'Read', description: 'Read.', severity: 'low', grantGuidance: 'Test.', standalone: true },
		],
		compoundPermissionRules: [{ id: 'call-with-read', permissions: ['test:call', 'other:read'], severity: 'high', description: 'Combined risk.' }],
		validators: testValidatorOptions,
	});
	const { service, workerFactory } = createService({ promptApproved: true, registry });

	const disallowed = await service.execute('// @permission other:read\nreturn 1;', {
		permissionPolicy: { mode: 'restrict', permissions: ['test:*'] },
	});
	const compound = await service.execute('// @permission test:call\n// @permission other:read\nreturn 1;', {
		permissionPolicy: { mode: 'restrict', maxSeverity: 'medium' },
	});

	expect(disallowed.status).toBe('policy-error');
	expect(compound).toMatchObject({ status: 'policy-error', message: expect.stringContaining('call-with-read') });
	expect(workerFactory.workers).toHaveLength(0);
});

test('expression execution uses set permissions, direct inputs, and expression worker mode', async () => {
	const { service, workerFactory } = createService({ promptApproved: true });
	const result = await service.executeExpression('await api.test.echo({ value: inputValue })', {
		permissions: ['test:call'],
		inputs: { duration: 'caller override', inputValue: 'hello', übergabe: true },
	});

	expect(result.status).toBe('success');
	expect(workerFactory.workers[0]?.postedMessages[0]).toMatchObject({
		type: 'execute',
		mode: 'expression',
		inputs: { duration: 'caller override', inputValue: 'hello', übergabe: true },
	});
});

test('expressions reject permission comments and unusable or conflicting input names', async () => {
	const { service, workerFactory } = createService({ promptApproved: true });
	const commentResult = await service.executeExpression('// @permission test:call\n1', { permissions: ['test:call'] });
	const conflictingInputResult = await service.executeExpression('Temporal', { inputs: { Temporal: 'collision' } });
	const immutableInputResult = await service.executeExpression('undefined', { inputs: { undefined: 1 } });
	const prototypeInputResult = await service.executeExpression('__proto__', {
		inputs: JSON.parse('{"__proto__":{"unsafe":true}}') as Record<string, never>,
	});

	expect(commentResult.status).toBe('policy-error');
	expect(conflictingInputResult.status).toBe('policy-error');
	expect(immutableInputResult).toMatchObject({ status: 'policy-error', message: expect.stringContaining("'undefined'") });
	expect(prototypeInputResult).toMatchObject({ status: 'policy-error', message: expect.stringContaining("'__proto__'") });
	expect(workerFactory.workers).toHaveLength(0);
});

test('expression blocks only inherit low-risk permissions from the initial registry', () => {
	const registry = new RpcRegistry({
		permissionDefinitions: [{ id: 'built-in:read', name: 'Read', description: 'Read.', severity: 'low', grantGuidance: 'Test.', standalone: true }],
		validators: testValidatorOptions,
	});
	registry.registerPermission({
		id: 'third-party:read',
		name: 'Third-party read',
		description: 'Read third-party data.',
		severity: 'low',
		grantGuidance: 'Test.',
		standalone: true,
	});
	const { service } = createService({ promptApproved: true, registry, autoAllowLowRiskPermissions: true });

	expect(service.getExpressionBlockPermissions()).toEqual(['built-in:read']);
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
		rpcRegistry: new RpcRegistry({
			methods: [
				{
					method: 'test:echo',
					permission: 'test:call',
					description: 'Echo a test value.',
					usage: 'api.test.echo({ value })',
					requestValidator: echoValueValidator,
					responseValidator: echoValueValidator,
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
			],
			validators: testValidatorOptions,
		}),
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
