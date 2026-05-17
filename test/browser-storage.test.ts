import { beforeEach, expect, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import type { App } from 'obsidian';
import { LocalStoragePermissionApprovalStore, LocalStoragePermissionSettingsStore } from 'packages/obsidian/src/permissions/approval-store';
import { ScriptStorageManager, scopedScriptStorageKey, scriptStorageKey } from 'packages/obsidian/src/storage/script-storage';

GlobalRegistrator.register();

class BrowserBackedAppStorage {
	loadLocalStorage(key: string): unknown {
		const rawValue = window.localStorage.getItem(key);
		return rawValue === null ? null : JSON.parse(rawValue);
	}

	saveLocalStorage(key: string, value: unknown): void {
		if (value === null) {
			window.localStorage.removeItem(key);
			return;
		}

		window.localStorage.setItem(key, JSON.stringify(value));
	}
}

beforeEach(() => {
	window.localStorage.clear();
});

test('permission approvals use the real browser localStorage key order and removal APIs', () => {
	const store = new LocalStoragePermissionApprovalStore();

	store.save({ codeHash: 'old-hash', permissions: ['vault:read'], updatedAt: 10 });
	store.save({ codeHash: 'new-hash', permissions: ['storage:read', 'vault:read'], updatedAt: 100 });

	expect(window.localStorage.length).toBe(2);
	expect(window.localStorage.key(0)).toBe('safe-js:permissions:v1:old-hash');
	expect(store.list().map(approval => approval.codeHash)).toEqual(['new-hash', 'old-hash']);
	expect(store.load('new-hash')?.permissions).toEqual(['storage:read', 'vault:read']);

	expect(store.deleteOlderThan(50)).toBe(1);
	expect(window.localStorage.getItem('safe-js:permissions:v1:old-hash')).toBeNull();
	expect(store.deleteAll()).toBe(1);
	expect(window.localStorage.length).toBe(0);
});

test('permission settings persist through real browser localStorage string values', () => {
	const store = new LocalStoragePermissionSettingsStore();

	expect(store.loadAutoAllowLowRiskPermissions()).toBe(false);
	store.saveAutoAllowLowRiskPermissions(true);

	expect(window.localStorage.getItem('safe-js:settings:v1:auto-allow-low-risk-permissions')).toBe('true');
	expect(store.loadAutoAllowLowRiskPermissions()).toBe(true);
});

test('script storage lists and clears indexed global keys only', () => {
	const app = new BrowserBackedAppStorage() as unknown as App;
	const globalStorage = new ScriptStorageManager(app, () => 100);
	const scopedStorage = new ScriptStorageManager(app, () => 200, 'hash:a');

	globalStorage.set('shared-key', 'global');
	scopedStorage.set('shared-key', 'scoped');
	window.localStorage.setItem(scriptStorageKey('legacy-key'), JSON.stringify('legacy'));
	window.localStorage.setItem(scopedScriptStorageKey('hash:b', 'legacy-scoped-key'), JSON.stringify('legacy-scoped'));

	expect(globalStorage.list().map(entry => entry.key)).toEqual(['shared-key']);
	expect(scopedStorage.list().map(entry => entry.key)).toEqual(['shared-key']);
	expect(ScriptStorageManager.listAll(app, () => 300).map(entry => `${entry.scope ?? 'global'}:${entry.key}`)).toEqual(['global:shared-key']);

	expect(ScriptStorageManager.deleteOlderThanAll(app, 150, () => 300)).toBe(1);
	expect(window.localStorage.getItem(scriptStorageKey('legacy-key'))).toBe(JSON.stringify('legacy'));
	expect(window.localStorage.getItem(scriptStorageKey('shared-key'))).toBeNull();
	expect(window.localStorage.getItem(scopedScriptStorageKey('hash:b', 'legacy-scoped-key'))).toBe(JSON.stringify('legacy-scoped'));
	expect(scopedStorage.get('shared-key')).toBe('scoped');
});
