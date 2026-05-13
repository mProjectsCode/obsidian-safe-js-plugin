import { expect, test } from 'bun:test';
import { validateVaultPath, type VaultPathValidationOptions } from 'packages/obsidian/src/rpc/path-validation';

const validatePathOptions: VaultPathValidationOptions = {
	configDir: '.obsidian',
};

test('normalizes safe vault paths', () => {
	expect(validateVaultPath('Folder//Note.md', validatePathOptions)).toBe('Folder/Note.md');
	expect(validateVaultPath('./Folder/Note.md', validatePathOptions)).toBe('Folder/Note.md');
});

test('rejects paths outside the vault model', () => {
	expect(() => validateVaultPath('/tmp/Note.md', validatePathOptions)).toThrow('relative to the vault');
	expect(() => validateVaultPath('C:/Users/Note.md', validatePathOptions)).toThrow('relative to the vault');
	expect(() => validateVaultPath('../Note.md', validatePathOptions)).toThrow('parent traversal');
	expect(() => validateVaultPath('Folder/../Note.md', validatePathOptions)).toThrow('parent traversal');
	expect(() => validateVaultPath('', validatePathOptions)).toThrow('must not be empty');
});

test('rejects Obsidian config folder paths', () => {
	expect(() => validateVaultPath('.obsidian/plugins/safe-js/data.json', validatePathOptions)).toThrow('configuration folder');
	expect(() => validateVaultPath('_config/plugins/safe-js/data.json', { configDir: '_config' })).toThrow('configuration folder');
	expect(validateVaultPath('Notes/.obsidian.md', validatePathOptions)).toBe('Notes/.obsidian.md');
});
