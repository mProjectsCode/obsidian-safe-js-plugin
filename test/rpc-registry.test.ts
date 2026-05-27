import { expect, test } from 'bun:test';
import type { SafeJsValidationResult } from '@lemons_dev/obsidian-safe-js-api';
import { RpcRegistry } from 'packages/obsidian/src/rpc/rpc-registry';
import { createBuiltInValidators } from 'packages/obsidian/src/rpc/validators';

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

function createTestRegistry(): RpcRegistry {
	return new RpcRegistry({
		methods: [
			{
				method: 'test:echo',
				permission: 'test:call',
				description: 'Echo a test value.',
				usage: 'api.test.echo(value)',
				requestValidator: echoValueValidator,
				responseValidator: echoValueValidator,
				binding: {
					namespace: 'test',
					functionName: 'echo',
					paramStyle: 'object',
					argNames: ['value'],
				},
				handler: params => params,
			},
		],
		validators: testValidatorOptions,
	});
}

test('dispatches valid RPC calls', async () => {
	const result = await createTestRegistry().dispatch('test:echo', { value: 'ok' }, { grantedPermissions: new Set(['test:call']) });

	expect(result).toEqual({
		ok: true,
		result: { value: 'ok' },
	});
});

test('rejects unknown RPC methods', async () => {
	const result = await createTestRegistry().dispatch('test:missing', {}, { grantedPermissions: new Set(['test:call']) });

	expect(result.ok).toBe(false);
	if (!result.ok) {
		expect(result.error.code).toBe('unknown-rpc-method');
	}
});

test('rejects RPC calls with missing permissions using a clear message', async () => {
	const result = await createTestRegistry().dispatch('test:echo', { value: 'ok' }, { grantedPermissions: new Set() });

	expect(result.ok).toBe(false);
	if (!result.ok) {
		expect(result.error.code).toBe('missing-permission');
		expect(result.error.message).toContain("requires permission 'test:call'");
	}
});

test('rejects malformed RPC requests', async () => {
	const result = await createTestRegistry().dispatch('test:echo', { value: 1 }, { grantedPermissions: new Set(['test:call']) });

	expect(result.ok).toBe(false);
	if (!result.ok) {
		expect(result.error.code).toBe('invalid-rpc-request');
	}
});

test('exposes worker bindings with argument metadata', () => {
	expect(createTestRegistry().getWorkerBindings()).toEqual([
		{
			method: 'test:echo',
			permission: 'test:call',
			namespace: 'test',
			functionName: 'echo',
			paramStyle: 'object',
			argNames: ['value'],
		},
	]);
});

test('generates docs from registered permission and method definitions', () => {
	const registry = new RpcRegistry({
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
	});
	const docs = registry.getDocs();

	expect(docs).toHaveLength(1);
	expect(docs[0]?.permission.id).toBe('test:call');
	expect(docs[0]?.methods[0]?.usage).toBe('api.test.echo({ value })');
});

test('registers owned custom permissions, methods, and globals', () => {
	const registry = new RpcRegistry({ validators: testValidatorOptions });
	registry.registerPermission(
		{
			id: 'plugin:call',
			name: 'Plugin calls',
			description: 'Run plugin calls.',
			severity: 'medium',
			grantGuidance: 'Grant for plugin tests.',
		},
		{ pluginId: 'example-plugin', pluginName: 'Example plugin' },
	);
	registry.registerMethod(
		{
			method: 'plugin:echo',
			permission: 'plugin:call',
			description: 'Echo a value.',
			usage: 'api.plugin.echo({ value })',
			requestValidator: echoValueValidator,
			responseValidator: echoValueValidator,
			binding: {
				namespace: 'plugin',
				functionName: 'echo',
				paramStyle: 'object',
			},
			handler: params => params,
		},
		{ pluginId: 'example-plugin', pluginName: 'Example plugin' },
	);
	registry.registerSandboxGlobal(
		{
			name: 'examplePlugin',
			description: 'Static plugin data.',
			permission: 'plugin:call',
			value: { enabled: true },
		},
		{ pluginId: 'example-plugin', pluginName: 'Example plugin' },
	);

	expect(registry.getKnownPermissions()).toContain('plugin:call');
	expect(registry.getWorkerBindings()).toEqual([
		{
			method: 'plugin:echo',
			permission: 'plugin:call',
			namespace: 'plugin',
			functionName: 'echo',
			paramStyle: 'object',
		},
	]);
	expect(registry.getSandboxGlobals(new Set())).toEqual([]);
	expect(registry.getSandboxGlobals(new Set(['plugin:call']))).toEqual([{ name: 'examplePlugin', value: { enabled: true } }]);
	expect(registry.getDocs().find(group => group.permission.id === 'plugin:call')).toMatchObject({
		permission: {
			id: 'plugin:call',
		},
		ownerPluginId: 'example-plugin',
		globals: [
			{
				name: 'examplePlugin',
				ownerPluginId: 'example-plugin',
			},
		],
	});

	registry.unregisterOwner('example-plugin');

	expect(registry.getKnownPermissions()).not.toContain('plugin:call');
	expect(registry.getWorkerBindings()).toEqual([]);
	expect(registry.getSandboxGlobals(new Set(['plugin:call']))).toEqual([]);
});

test('exposes standalone built-in permissions', () => {
	const registry = new RpcRegistry({ validators: testValidatorOptions });

	expect(registry.getKnownPermissions()).toContain('output:render-rich');
	expect(registry.getDocs().find(group => group.permission.id === 'output:render-rich')).toMatchObject({
		permission: {
			id: 'output:render-rich',
			standalone: true,
		},
		methods: [],
		globals: [],
	});
});

test('rejects duplicate sandbox API paths and reserved globals', () => {
	const registry = createTestRegistry();

	expect(() => {
		registry.registerMethod({
			method: 'test:echo-again',
			permission: 'test:call',
			description: 'Echo again.',
			usage: 'api.test.echo({ value })',
			requestValidator: echoValueValidator,
			responseValidator: echoValueValidator,
			binding: {
				namespace: 'test',
				functionName: 'echo',
				paramStyle: 'object',
			},
			handler: params => params,
		});
	}).toThrow("Duplicate sandbox API path 'api.test.echo'");

	expect(() => {
		registry.registerSandboxGlobal({
			name: 'api',
			description: 'Reserved.',
			value: {},
		});
	}).toThrow("Sandbox global 'api' is reserved");
});

test('rejects sandbox globals with non-json values', () => {
	const registry = new RpcRegistry({ validators: testValidatorOptions });

	expect(() => {
		registry.registerSandboxGlobal({
			name: 'pluginData',
			description: 'Invalid plugin data.',
			value: (() => true) as never,
		});
	}).toThrow("Sandbox global 'pluginData' must be JSON-safe");
});

test('keeps owned permissions while sandbox globals still reference them', () => {
	const registry = new RpcRegistry({ validators: testValidatorOptions });
	registry.registerPermission(
		{
			id: 'plugin:shared',
			name: 'Shared plugin data',
			description: 'Read shared plugin data.',
			severity: 'medium',
			grantGuidance: 'Grant for shared plugin tests.',
		},
		{ pluginId: 'permission-owner', pluginName: 'Permission owner' },
	);
	registry.registerSandboxGlobal(
		{
			name: 'sharedPluginData',
			description: 'Shared plugin data.',
			permission: 'plugin:shared',
			value: { enabled: true },
		},
		{ pluginId: 'global-owner', pluginName: 'Global owner' },
	);

	registry.unregisterOwner('permission-owner');

	expect(registry.getPermissionDefinition('plugin:shared')?.name).toBe('Shared plugin data');
	expect(registry.getKnownPermissions()).toContain('plugin:shared');
	expect(registry.getSandboxGlobals(new Set(['plugin:shared']))).toEqual([{ name: 'sharedPluginData', value: { enabled: true } }]);
});

test('dispatches methods that reference built-in validators by id', async () => {
	const registry = new RpcRegistry({
		methods: [
			{
				method: 'test:ping',
				permission: 'test:call',
				description: 'Ping test.',
				usage: 'api.test.ping()',
				requestValidator: 'rpc:emptyParams',
				responseValidator: 'response:ok',
				binding: {
					namespace: 'test',
					functionName: 'ping',
					paramStyle: 'object',
				},
				handler: () => ({ ok: true }),
			},
		],
		validators: testValidatorOptions,
	});

	expect(await registry.dispatch('test:ping', {}, { grantedPermissions: new Set(['test:call']) })).toEqual({
		ok: true,
		result: { ok: true },
	});
	expect((await registry.dispatch('test:ping', null, { grantedPermissions: new Set(['test:call']) })).ok).toBe(false);
});

test('built-in vault path validators read the current config directory', () => {
	let configDir = '_config-a';
	const registry = new RpcRegistry({ validators: createBuiltInValidators({ getConfigDir: () => configDir }) });

	expect(registry.validate('vault:path', '_config-a/plugins/safe-js/data.json')).toMatchObject({
		success: false,
	});
	expect(registry.validate('vault:path', '_config-b/plugins/safe-js/data.json')).toEqual({
		success: true,
		data: '_config-b/plugins/safe-js/data.json',
	});

	configDir = '_config-b';

	expect(registry.validate('vault:path', '_config-a/plugins/safe-js/data.json')).toEqual({
		success: true,
		data: '_config-a/plugins/safe-js/data.json',
	});
	expect(registry.validate('vault:path', '_config-b/plugins/safe-js/data.json')).toMatchObject({
		success: false,
	});
});

test('rejects methods that reference unknown validator ids', () => {
	expect(() => {
		new RpcRegistry({
			methods: [
				{
					method: 'test:bad',
					permission: 'test:call',
					description: 'Bad validator.',
					usage: 'api.test.bad()',
					requestValidator: 'missing:validator',
					responseValidator: 'response:ok',
					binding: {
						namespace: 'test',
						functionName: 'bad',
						paramStyle: 'object',
					},
					handler: () => ({ ok: true }),
				},
			],
			validators: testValidatorOptions,
		});
	}).toThrow("Unknown request validator 'missing:validator'");
});
