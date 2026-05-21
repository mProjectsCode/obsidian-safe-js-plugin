import { z } from 'zod';

export interface SafeJsScriptConfig {
	id: string;
	name: string;
	path: string;
	runOnStartup: boolean;
}

const scriptIdPattern = /^[a-z0-9][a-z0-9-]*$/u;
const scriptConfigSchema = z.object({
	id: z.string().regex(scriptIdPattern),
	name: z.string().min(1),
	path: z.string().min(1),
	runOnStartup: z.boolean(),
});

export function normalizeSafeJsScripts(value: unknown): SafeJsScriptConfig[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const scripts: SafeJsScriptConfig[] = [];
	for (const item of value) {
		const normalized = normalizeScriptConfig(
			item,
			scripts.map(script => script.id),
		);
		if (normalized !== null) {
			scripts.push(normalized);
		}
	}

	return scripts;
}

export function createScriptConfig(path: string, name: string, existingScripts: readonly SafeJsScriptConfig[]): SafeJsScriptConfig {
	const normalizedPath = path.trim();
	const normalizedName = name.trim() || displayNameFromPath(normalizedPath);
	return {
		id: createScriptId(
			normalizedPath,
			existingScripts.map(script => script.id),
		),
		name: normalizedName,
		path: normalizedPath,
		runOnStartup: false,
	};
}

export function isJavaScriptVaultScriptPath(path: string): boolean {
	return path.trim().toLowerCase().endsWith('.js');
}

function normalizeScriptConfig(value: unknown, existingIds: readonly string[]): SafeJsScriptConfig | null {
	if (typeof value !== 'object' || value === null) {
		return null;
	}

	const record = value as Record<string, unknown>;
	const path = typeof record.path === 'string' ? record.path.trim() : '';
	if (path === '') {
		return null;
	}

	const name = typeof record.name === 'string' && record.name.trim() !== '' ? record.name.trim() : displayNameFromPath(path);
	const rawId = typeof record.id === 'string' && scriptIdPattern.test(record.id) ? record.id : createScriptId(path, existingIds);
	const runOnStartup = typeof record.runOnStartup === 'boolean' ? record.runOnStartup : false;
	const parsed = scriptConfigSchema.safeParse({
		id: uniqueScriptId(rawId, existingIds),
		name,
		path,
		runOnStartup,
	});

	return parsed.success ? parsed.data : null;
}

function createScriptId(path: string, existingIds: readonly string[]): string {
	const withoutExtension = path.replace(/\.js$/iu, '');
	const slug = withoutExtension
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-|-$/gu, '');
	return uniqueScriptId(slug || 'script', existingIds);
}

function uniqueScriptId(baseId: string, existingIds: readonly string[]): string {
	const usedIds = new Set(existingIds);
	if (!usedIds.has(baseId)) {
		return baseId;
	}

	let index = 2;
	while (usedIds.has(`${baseId}-${index}`)) {
		index += 1;
	}

	return `${baseId}-${index}`;
}

function displayNameFromPath(path: string): string {
	const fileName = path.split('/').pop() ?? path;
	return fileName.replace(/\.js$/iu, '') || 'Script';
}
