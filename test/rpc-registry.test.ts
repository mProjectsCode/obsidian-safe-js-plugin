import { expect, test } from 'bun:test';
import { z } from 'zod';
import { RpcRegistry } from 'packages/obsidian/src/rpc/rpc-registry';

function createTestRegistry(): RpcRegistry {
	return new RpcRegistry([
		{
			method: 'test:echo',
			permission: 'test:call',
			description: 'Echo a test value.',
			usage: 'api.test.echo(value)',
			requestSchema: z.object({ value: z.string() }),
			responseSchema: z.object({ value: z.string() }),
			binding: {
				namespace: 'test',
				functionName: 'echo',
				paramStyle: 'object',
				argNames: ['value'],
			},
			handler: params => params,
		},
	]);
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
	const registry = new RpcRegistry(
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
	);
	const docs = registry.getDocs();

	expect(docs).toHaveLength(1);
	expect(docs[0]?.permission.id).toBe('test:call');
	expect(docs[0]?.methods[0]?.usage).toBe('api.test.echo({ value })');
});
