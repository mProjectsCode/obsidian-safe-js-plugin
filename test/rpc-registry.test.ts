import { expect, test } from 'bun:test';
import { z } from 'zod';
import { RpcRegistry } from 'packages/obsidian/src/rpc/rpc-registry';

function createTestRegistry(): RpcRegistry {
	return new RpcRegistry([
		{
			method: 'test:echo',
			permission: 'test:call',
			description: 'Echo a test value.',
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
