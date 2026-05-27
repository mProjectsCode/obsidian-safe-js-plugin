import { expect, test } from 'bun:test';
import type { Plugin } from 'obsidian';
import type { SafeJsExecutionOptions, SafeJsExecutionResult, SafeJsValidationResult } from '@lemons_dev/obsidian-safe-js-api';
import type { SafeJsExecutionService } from 'packages/obsidian/src/execution/execution-service';
import { DefaultSafeJsPublicApi } from 'packages/obsidian/src/public-api/safe-js-public-api';
import { RpcRegistry } from 'packages/obsidian/src/rpc/rpc-registry';

const testValidatorOptions = {
	getConfigDir: (): string => '.obsidian',
};

interface EchoRequest {
	value: string;
}

interface EchoResponse {
	value: string;
	callerPluginId: string;
}

function echoRequestValidator(value: unknown): SafeJsValidationResult<EchoRequest> {
	if (typeof value === 'object' && value !== null && 'value' in value && typeof value.value === 'string') {
		return { success: true, data: { value: value.value } };
	}

	return { success: false, message: 'Expected a string value.' };
}

function echoResponseValidator(value: unknown): SafeJsValidationResult<EchoResponse> {
	if (
		typeof value === 'object' &&
		value !== null &&
		'value' in value &&
		'callerPluginId' in value &&
		typeof value.value === 'string' &&
		typeof value.callerPluginId === 'string'
	) {
		return {
			success: true,
			data: {
				value: value.value,
				callerPluginId: value.callerPluginId,
			},
		};
	}

	return { success: false, message: 'Expected an echo response.' };
}

class FakeExecutionService {
	requests: { code: string; options: SafeJsExecutionOptions }[] = [];

	async execute(code: string, options: SafeJsExecutionOptions = {}): Promise<SafeJsExecutionResult> {
		this.requests.push({ code, options });
		return {
			status: 'success',
			codeHash: 'hash-a',
			value: null,
			permissions: [],
			elapsedMs: 1,
		};
	}
}

function createPlugin(): { plugin: Plugin; unload(): void } {
	const callbacks: (() => void)[] = [];
	return {
		plugin: {
			manifest: {
				id: 'caller-plugin',
				name: 'Caller plugin',
			},
			register(callback: () => void): void {
				callbacks.push(callback);
			},
		} as unknown as Plugin,
		unload(): void {
			for (const callback of callbacks) {
				callback();
			}
		},
	};
}

test('public caller API stamps execution source with caller plugin metadata', async () => {
	const executionService = new FakeExecutionService();
	const registry = new RpcRegistry({ validators: testValidatorOptions });
	const { plugin } = createPlugin();
	const safeJsApi = new DefaultSafeJsPublicApi({
		executionService: executionService as unknown as SafeJsExecutionService,
		rpcRegistry: registry,
	});

	await safeJsApi.forPlugin(plugin).execute('return 1;', {
		source: {
			path: 'Note.md',
		},
	});

	expect(executionService.requests[0]?.options.source).toEqual({
		path: 'Note.md',
		callerPluginId: 'caller-plugin',
		callerPluginName: 'Caller plugin',
	});
});

test('public caller API registers owned sandbox functions and cleans them up on unload', async () => {
	const executionService = new FakeExecutionService();
	const registry = new RpcRegistry({ validators: testValidatorOptions });
	const { plugin, unload } = createPlugin();
	const callerApi = new DefaultSafeJsPublicApi({
		executionService: executionService as unknown as SafeJsExecutionService,
		rpcRegistry: registry,
	}).forPlugin(plugin);

	callerApi.registerPermission({
		id: 'caller:echo',
		name: 'Caller echo',
		description: 'Echo caller information.',
		severity: 'low',
		grantGuidance: 'Grant for caller tests.',
	});
	callerApi.registerSandboxFunction({
		method: 'caller:echo',
		permission: 'caller:echo',
		namespace: 'caller',
		functionName: 'echo',
		description: 'Echo caller information.',
		usage: 'api.caller.echo({ value })',
		paramStyle: 'object',
		requestValidator: echoRequestValidator,
		responseValidator: echoResponseValidator,
		handler: (params, context) => ({
			value: params.value,
			callerPluginId: context.callerPluginId,
		}),
	});

	const result = await registry.dispatch('caller:echo', { value: 'ok' }, { grantedPermissions: new Set(['caller:echo']) });

	expect(result).toEqual({
		ok: true,
		result: {
			value: 'ok',
			callerPluginId: 'caller-plugin',
		},
	});

	unload();

	expect(registry.getWorkerBindings()).toEqual([]);
	expect(registry.getKnownPermissions()).not.toContain('caller:echo');
});

test('public caller API rejects sandbox functions with unknown permissions', () => {
	const executionService = new FakeExecutionService();
	const registry = new RpcRegistry({ validators: testValidatorOptions });
	const { plugin } = createPlugin();
	const callerApi = new DefaultSafeJsPublicApi({
		executionService: executionService as unknown as SafeJsExecutionService,
		rpcRegistry: registry,
	}).forPlugin(plugin);

	expect(() => {
		callerApi.registerSandboxFunction({
			method: 'caller:missing',
			permission: 'caller:missing',
			namespace: 'caller',
			functionName: 'missing',
			description: 'Missing permission.',
			usage: 'api.caller.missing({ value })',
			paramStyle: 'object',
			requestValidator: echoRequestValidator,
			responseValidator: echoResponseValidator,
			handler: params => ({
				value: params.value,
				callerPluginId: 'caller-plugin',
			}),
		});
	}).toThrow("Unknown permission 'caller:missing' for sandbox function 'caller:missing'");
});

test('public caller API exposes built-in validator IDs without exposing zod', () => {
	const executionService = new FakeExecutionService();
	const registry = new RpcRegistry({ validators: testValidatorOptions });
	const { plugin } = createPlugin();
	const callerApi = new DefaultSafeJsPublicApi({
		executionService: executionService as unknown as SafeJsExecutionService,
		rpcRegistry: registry,
	}).forPlugin(plugin);

	expect(callerApi.getValidatorIds()).toContain('vault:path');
	expect(callerApi.validate('vault:path', 'Folder/Note.md')).toEqual({
		success: true,
		data: 'Folder/Note.md',
	});
	expect(callerApi.validate('vault:path', '../outside.md')).toMatchObject({
		success: false,
	});
});
