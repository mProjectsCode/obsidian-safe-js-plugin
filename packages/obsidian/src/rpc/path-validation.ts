export interface VaultPathValidationOptions {
	allowEmpty?: boolean;
	label?: string;
	configDir: string;
}

export function validateVaultPath(path: string, options: VaultPathValidationOptions): string {
	const label = options.label ?? 'Vault path';
	const normalizedPath = normalizeVaultPath(path);

	if (normalizedPath === '') {
		if (options.allowEmpty === true) {
			return '';
		}

		throw new Error(`${label} must not be empty.`);
	}

	if (normalizedPath.startsWith('/') || /^[a-zA-Z]:/u.test(normalizedPath)) {
		throw new Error(`${label} must be relative to the vault.`);
	}

	const parts = normalizedPath.split('/');
	if (parts.some(part => part === '..' || part === '.')) {
		throw new Error(`${label} must not contain parent traversal.`);
	}

	if (isConfigVaultPath(normalizedPath, options.configDir)) {
		throw new Error(`${label} must not touch the Obsidian configuration folder.`);
	}

	return normalizedPath;
}

export function isConfigVaultPath(path: string, configDir: string): boolean {
	if (configDir === '') {
		throw new Error('Attempted to validate vault path against empty config directory.');
	}

	const normalizedPath = normalizeVaultPath(path).toLowerCase();
	const normalizedConfigDir = normalizeVaultPath(configDir).toLowerCase();

	return normalizedPath === normalizedConfigDir || normalizedPath.startsWith(`${normalizedConfigDir}/`);
}

export function isSafeVaultPath(path: string, options: VaultPathValidationOptions): boolean {
	try {
		validateVaultPath(path, options);
		return true;
	} catch {
		return false;
	}
}

function normalizeVaultPath(path: string): string {
	return path.replace(/\\/gu, '/').replace(/\/+/gu, '/').replace(/^\.\//u, '').replace(/\/$/u, '');
}
