import { fileURLToPath } from 'node:url';
import { createCIConfig } from '@lemons_dev/eslint-config-obsidian';

export default createCIConfig({
	root: fileURLToPath(new URL('.', import.meta.url)),
	// Test execution and type checking remain enabled; lint covers implementation and tools.
	ignores: [
		'**/*.test.*',
		'**/*.tests.*',
		'**/*.spec.*',
		'**/*.specs.*',
		'**/test/**',
		'**/tests/**',
		'**/__tests__/**',
		'**/mocks/**',
		'**/__mocks__/**',
		'**/testUtils**',
		'**/e2e-tests/**',
	],
	host: ['packages/obsidian/src/**'],
	workers: ['packages/obsidian/src/worker/**'],
	overrides: [
		// Permission-gated deletion is confined to the vault; file-manager trash may use system trash.
		{ files: ['packages/obsidian/src/host/vault-service.ts'], rules: { 'obsidianmd/prefer-file-manager-trash-file': 'off' } },
	],
});
