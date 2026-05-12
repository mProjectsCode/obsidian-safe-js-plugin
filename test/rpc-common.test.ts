import { expect, test } from 'bun:test';
import { validateVaultPath } from 'packages/obsidian/src/rpc/path-validation';

test('normalizes safe vault paths', () => {
	expect(validateVaultPath('Folder//Note.md')).toBe('Folder/Note.md');
	expect(validateVaultPath('./Folder/Note.md')).toBe('Folder/Note.md');
});

test('rejects paths outside the vault model', () => {
	expect(() => validateVaultPath('/tmp/Note.md')).toThrow('relative to the vault');
	expect(() => validateVaultPath('C:/Users/Note.md')).toThrow('relative to the vault');
	expect(() => validateVaultPath('../Note.md')).toThrow('parent traversal');
	expect(() => validateVaultPath('Folder/../Note.md')).toThrow('parent traversal');
	expect(() => validateVaultPath('')).toThrow('must not be empty');
});

test('rejects Obsidian config folder paths', () => {
	expect(() => validateVaultPath('.obsidian/plugins/safe-js/data.json')).toThrow('configuration folder');
	expect(() => validateVaultPath('_config/plugins/safe-js/data.json', { configDir: '_config' })).toThrow('configuration folder');
	expect(validateVaultPath('Notes/.obsidian.md')).toBe('Notes/.obsidian.md');
});
