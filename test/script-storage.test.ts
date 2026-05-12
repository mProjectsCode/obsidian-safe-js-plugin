import { expect, test } from 'bun:test';
import type { App } from 'obsidian';
import { ScriptStorageManager, scriptStorageKey } from 'packages/obsidian/src/storage/script-storage';

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

class FakeBrowserStorage {
	constructor(private readonly keys: string[]) {}

	get length(): number {
		return this.keys.length;
	}

	key(index: number): string | null {
		return this.keys[index] ?? null;
	}
}

test('indexes script storage writes for inspection and cleanup', () => {
	let now = 100;
	const app = new FakeAppLocalStorage() as App;
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

test('lists legacy script storage keys found in localStorage', () => {
	const app = new FakeAppLocalStorage() as App;
	const browserStorage = new FakeBrowserStorage([scriptStorageKey('legacy-key'), scriptStorageKey('__index'), 'other-key']);
	const storage = new ScriptStorageManager(app, () => 100, browserStorage);

	expect(storage.list()).toEqual([{ key: 'legacy-key', updatedAt: 0, sizeBytes: 4 }]);
});

test('uses the stable Safe JS script storage prefix', () => {
	expect(scriptStorageKey('example')).toBe('safe-js:script-storage:v1:example');
});
