import { expect, test } from 'bun:test';
import {
	LocalStoragePermissionApprovalStore,
	LocalStoragePermissionSettingsStore,
	MemoryPermissionStorage,
} from 'packages/obsidian/src/permissions/approval-store';
import { assertKnownPermissions, expandPermissionGroups, parseLeadingPermissions } from 'packages/obsidian/src/permissions/permissions';

test('parses contiguous leading permission comments', () => {
	const parsed = parseLeadingPermissions(`// @permission vault:read
// a normal leading comment

return await api.vault.read("Daily.md");`);

	expect(parsed.permissions).toEqual(['vault:read']);
	expect(parsed.bodyStartsAtLine).toBe(4);
});

test('parses permission group comments', () => {
	expect(parseLeadingPermissions('// @permission vault:*').permissions).toEqual(['vault:*']);
});

test('rejects malformed permission comments', () => {
	expect(() => parseLeadingPermissions('// @permission vault')).toThrow('Malformed permission comment on line 1');
});

test('rejects permission comments after executable code', () => {
	expect(() =>
		parseLeadingPermissions(`const value = 1;
// @permission vault:read`),
	).toThrow('Permission comments must appear before executable code');
});

test('rejects duplicate permissions', () => {
	expect(() =>
		parseLeadingPermissions(`// @permission vault:read
// @permission vault:read`),
	).toThrow("Duplicate permission 'vault:read'");
});

test('rejects unknown permissions against the registry permission set', () => {
	expect(() => assertKnownPermissions(['vault:write'], new Set(['vault:read']))).toThrow("Unknown permission 'vault:write'");
});

test('expands permission groups against known permissions', () => {
	expect(expandPermissionGroups(['vault:*'], new Set(['vault:read', 'vault:modify', 'ui:notify']))).toEqual(['vault:modify', 'vault:read']);
	expect(() => expandPermissionGroups(['network:*'], new Set(['vault:read']))).toThrow("Unknown permission group 'network:*'");
});

test('stores approvals in app-local storage keyed by code hash', () => {
	const storage = new MemoryPermissionStorage();
	const store = new LocalStoragePermissionApprovalStore(storage);

	store.save({
		codeHash: 'hash-a',
		permissions: ['vault:read'],
		updatedAt: 42,
	});

	expect(store.load({ codeHash: 'hash-a' })).toEqual({
		codeHash: 'hash-a',
		permissions: ['vault:read'],
		updatedAt: 42,
	});
	expect(store.load({ codeHash: 'hash-b' })).toBeNull();
	expect(storage.keys()).toEqual(['safe-js:permissions:v1:hash-a']);
});

test('stores auto-allow low-risk permission setting in app-local storage', () => {
	const storage = new MemoryPermissionStorage();
	const store = new LocalStoragePermissionSettingsStore(storage);

	expect(store.loadAutoAllowLowRiskPermissions()).toBe(false);
	store.saveAutoAllowLowRiskPermissions(true);

	expect(store.loadAutoAllowLowRiskPermissions()).toBe(true);
	expect(storage.get('safe-js:settings:v1:auto-allow-low-risk-permissions')).toBe(true);
});

test('lists and prunes stored permission approvals', () => {
	const storage = new MemoryPermissionStorage();
	const store = new LocalStoragePermissionApprovalStore(storage);

	store.save({ codeHash: 'old-hash', permissions: ['vault:read'], updatedAt: 10 });
	store.save({ codeHash: 'new-hash', permissions: ['storage:read'], updatedAt: 100 });

	expect(store.list().map(approval => approval.codeHash)).toEqual(['new-hash', 'old-hash']);
	expect(store.deleteOlderThan(50)).toBe(1);
	expect(store.load({ codeHash: 'old-hash' })).toBeNull();
	expect(store.load({ codeHash: 'new-hash' })?.permissions).toEqual(['storage:read']);
});
