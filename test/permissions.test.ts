import { expect, test } from 'bun:test';
import { LocalStoragePermissionApprovalStore } from 'packages/obsidian/src/permissions/approval-store';
import { assertKnownPermissions, parseLeadingPermissions } from 'packages/obsidian/src/permissions/permissions';

test('parses contiguous leading permission comments', () => {
	const parsed = parseLeadingPermissions(`// @permission vault:read
// a normal leading comment

return await api.vault.read("Daily.md");`);

	expect(parsed.permissions).toEqual(['vault:read']);
	expect(parsed.bodyStartsAtLine).toBe(4);
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

test('stores approvals in localStorage-compatible storage keyed by code hash', () => {
	const values = new Map<string, string>();
	const store = new LocalStoragePermissionApprovalStore({
		getItem: key => values.get(key) ?? null,
		setItem: (key, value) => {
			values.set(key, value);
		},
	});

	store.save({
		codeHash: 'hash-a',
		permissions: ['vault:read'],
		updatedAt: 42,
	});

	expect(store.load('hash-a')).toEqual({
		codeHash: 'hash-a',
		permissions: ['vault:read'],
		updatedAt: 42,
	});
	expect(store.load('hash-b')).toBeNull();
	expect([...values.keys()]).toEqual(['safe-js:permissions:v1:hash-a']);
});
