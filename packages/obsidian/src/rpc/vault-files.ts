import type { App, Editor, TAbstractFile, TFile, TFolder } from 'obsidian';
import { isSafeVaultPath as isSafePath, validateVaultPath } from 'packages/obsidian/src/rpc/path-validation';

export function requireFile(app: App, path: string): TFile {
	const normalizedPath = validateVaultPath(path, { configDir: app.vault.configDir, label: 'File path' });
	const file = app.vault.getFileByPath(normalizedPath);
	if (file === null) {
		throw new Error(`Vault file '${normalizedPath}' was not found.`);
	}

	return file;
}

export function requireFolder(app: App, path: string): TFolder {
	const normalizedPath = validateVaultPath(path, { allowEmpty: true, configDir: app.vault.configDir, label: 'Folder path' });
	const folder = normalizedPath === '' ? app.vault.getRoot() : app.vault.getFolderByPath(normalizedPath);
	if (folder === null) {
		throw new Error(`Vault folder '${normalizedPath}' was not found.`);
	}

	return folder;
}

export function requireAbstractFile(app: App, path: string): TAbstractFile {
	const normalizedPath = validateVaultPath(path, { configDir: app.vault.configDir });
	const file = app.vault.getAbstractFileByPath(normalizedPath);
	if (file === null) {
		throw new Error(`Vault path '${normalizedPath}' was not found.`);
	}

	return file;
}

export function assertTargetDoesNotExist(app: App, path: string): string {
	const normalizedPath = validateVaultPath(path, { configDir: app.vault.configDir });
	if (app.vault.getAbstractFileByPath(normalizedPath) !== null) {
		throw new Error(`Vault path '${normalizedPath}' already exists.`);
	}

	return normalizedPath;
}

export function isSafeVaultPath(app: App, path: string): boolean {
	return isSafePath(path, { allowEmpty: true, configDir: app.vault.configDir });
}

export function requireActiveEditor(app: App): Editor {
	const editor = app.workspace.activeEditor?.editor;
	if (editor === undefined) {
		throw new Error('There is no active editor.');
	}

	return editor;
}
