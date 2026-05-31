import { expect, mock, test } from 'bun:test';
import type { App } from 'obsidian';
import { RpcRegistry } from 'packages/obsidian/src/rpc/rpc-registry';
import { storageKeySchema } from 'packages/obsidian/src/storage/storage-validation';
import { ScriptStorageManager, scopedScriptStorageKey, scriptStorageKey } from 'packages/obsidian/src/storage/script-storage';

mock.module('obsidian', () => ({
	TFile: class TFile {},
	TFolder: class TFolder {},
	arrayBufferToBase64(_buffer: ArrayBuffer): string {
		return '';
	},
	base64ToArrayBuffer(_base64: string): ArrayBuffer {
		return new ArrayBuffer(0);
	},
	normalizePath(path: string): string {
		return path.replace(/\\/gu, '/').replace(/\/+/gu, '/').replace('/./', '/');
	},
	parseLinktext(linktext: string): { path: string; subpath: string } {
		const withoutAlias = linktext.split('|')[0] ?? '';
		const [path = '', subpath = ''] = withoutAlias.split('#');
		return { path, subpath: subpath === '' ? '' : `#${subpath}` };
	},
	parseYaml(_yaml: string): unknown {
		return {
			fruit: 'apple',
			count: 2,
		};
	},
	prepareFuzzySearch(_query: string): (text: string) => { score: number; matches: [number, number][] } | null {
		return text => (text.length > 0 ? { score: 1, matches: [[0, 5]] } : null);
	},
	prepareSimpleSearch(_query: string): (text: string) => { score: number; matches: [number, number][] } | null {
		return text => (text.length > 0 ? { score: 1, matches: [[0, 5]] } : null);
	},
	stringifyYaml(value: unknown): string {
		const record = value as { fruit?: string };
		return `fruit: ${record.fruit ?? ''}\n`;
	},
}));

class FakeAppLocalStorage {
	private readonly values = new Map<string, unknown>();

	loadLocalStorage(key: string): unknown {
		return this.values.get(key) ?? null;
	}

	saveLocalStorage(key: string, value: unknown): void {
		if (value === null) {
			this.values.delete(key);
			return;
		}

		this.values.set(key, value);
	}
}

test('indexes script storage writes for inspection and cleanup', () => {
	let now = 100;
	const app = new FakeAppLocalStorage() as unknown as App;
	const storage = new ScriptStorageManager(app, () => now);

	storage.set('old-key', { ok: true });
	now = 200;
	storage.set('new-key', 'value');

	expect(storage.get('old-key')).toEqual({ ok: true });
	expect(storage.list().map(entry => entry.key)).toEqual(['new-key', 'old-key']);

	expect(storage.deleteOlderThan(150)).toBe(1);
	expect(storage.get('old-key')).toBeNull();
	expect(storage.get('new-key')).toBe('value');
});

test('separates scoped storage from global storage', () => {
	const app = new FakeAppLocalStorage() as unknown as App;
	const globalStorage = new ScriptStorageManager(app, () => 100);
	const scopedStorage = new ScriptStorageManager(app, () => 200, 'hash:a');

	globalStorage.set('shared-key', 'global');
	scopedStorage.set('shared-key', 'scoped');

	expect(globalStorage.get('shared-key')).toBe('global');
	expect(scopedStorage.get('shared-key')).toBe('scoped');
	expect(ScriptStorageManager.listAll(app).map(entry => `${entry.scope ?? 'global'}:${entry.key}`)).toEqual(['hash:a:shared-key', 'global:shared-key']);
	expect(scopedScriptStorageKey('hash:a', 'shared-key')).toBe('safe-js:script-storage:v1:scoped:hash%3Aa:shared-key');
});

test('uses the stable Safe JS script storage prefix', () => {
	expect(scriptStorageKey('example')).toBe('safe-js:script-storage:v1:example');
});

test('rejects reserved storage keys that can cross storage scopes', () => {
	expect(storageKeySchema.safeParse('regular-key').success).toBe(true);
	expect(storageKeySchema.safeParse('__index').success).toBe(false);
	expect(storageKeySchema.safeParse('__scopes').success).toBe(false);
	expect(storageKeySchema.safeParse('scoped:hash:key').success).toBe(false);
});

test('storage RPC can list and clear scoped and global keys', async () => {
	const app = new FakeAppLocalStorage() as unknown as App;
	const { createStorageMethods } = await import('packages/obsidian/src/rpc/obsidian/storage-rpc');
	const registry = new RpcRegistry({
		methods: createStorageMethods(app),
		validators: { getConfigDir: () => '.obsidian' },
	});

	await registry.dispatch('storage:set', { key: 'scoped-key', value: 'scoped' }, { codeHash: 'hash:a', grantedPermissions: new Set(['storage:write']) });
	await registry.dispatch('globalStorage:set', { key: 'global-key', value: 'global' }, { grantedPermissions: new Set(['storage:global-write']) });

	expect(await registry.dispatch('storage:keys', {}, { codeHash: 'hash:a', grantedPermissions: new Set(['storage:read']) })).toEqual({
		ok: true,
		result: { keys: ['scoped-key'] },
	});
	expect(await registry.dispatch('globalStorage:keys', {}, { grantedPermissions: new Set(['storage:global-read']) })).toEqual({
		ok: true,
		result: { keys: ['global-key'] },
	});
	expect(await registry.dispatch('storage:clear', {}, { codeHash: 'hash:a', grantedPermissions: new Set(['storage:write']) })).toEqual({
		ok: true,
		result: { deleted: 1 },
	});
	expect(await registry.dispatch('globalStorage:clear', {}, { grantedPermissions: new Set(['storage:global-write']) })).toEqual({
		ok: true,
		result: { deleted: 1 },
	});
});
