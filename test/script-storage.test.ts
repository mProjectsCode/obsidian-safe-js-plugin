import { expect, test } from 'bun:test';
import type { App } from 'obsidian';
import { storageKeySchema } from 'packages/obsidian/src/storage/storage-validation';
import { ScriptStorageManager, scopedScriptStorageKey, scriptStorageKey } from 'packages/obsidian/src/storage/script-storage';

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
	expect(scopedScriptStorageKey('hash:a', 'shared-key')).toBe('safe-js:script-storage:v1:scoped:hash%3Aa:shared-key');
});

test('uses the stable Safe JS script storage prefix', () => {
	expect(scriptStorageKey('example')).toBe('safe-js:script-storage:v1:example');
});

test('rejects reserved storage keys that can cross storage scopes', () => {
	expect(storageKeySchema.safeParse('regular-key').success).toBe(true);
	expect(storageKeySchema.safeParse('__index').success).toBe(false);
	expect(storageKeySchema.safeParse('scoped:hash:key').success).toBe(false);
});
