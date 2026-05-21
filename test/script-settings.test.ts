import { expect, test } from 'bun:test';
import { createScriptConfig, isJavaScriptVaultScriptPath, normalizeSafeJsScripts } from 'packages/obsidian/src/scripts/script-settings';

test('normalizes missing script settings to an empty list', () => {
	expect(normalizeSafeJsScripts(undefined)).toEqual([]);
	expect(normalizeSafeJsScripts({})).toEqual([]);
});

test('normalizes persisted scripts and fills missing names', () => {
	expect(
		normalizeSafeJsScripts([
			{
				id: 'daily-summary',
				path: 'Scripts/Daily summary.js',
				runOnStartup: true,
			},
		]),
	).toEqual([
		{
			id: 'daily-summary',
			name: 'Daily summary',
			path: 'Scripts/Daily summary.js',
			runOnStartup: true,
		},
	]);
});

test('creates stable unique script ids from vault paths', () => {
	const first = createScriptConfig('Scripts/Daily summary.js', '', []);
	const second = createScriptConfig('Scripts/Daily summary.js', 'Second summary', [first]);

	expect(first).toEqual({
		id: 'scripts-daily-summary',
		name: 'Daily summary',
		path: 'Scripts/Daily summary.js',
		runOnStartup: false,
	});
	expect(second.id).toBe('scripts-daily-summary-2');
	expect(second.name).toBe('Second summary');
});

test('checks JavaScript vault script paths case-insensitively', () => {
	expect(isJavaScriptVaultScriptPath('Scripts/example.js')).toBe(true);
	expect(isJavaScriptVaultScriptPath('Scripts/example.JS')).toBe(true);
	expect(isJavaScriptVaultScriptPath('Scripts/example.md')).toBe(false);
});
