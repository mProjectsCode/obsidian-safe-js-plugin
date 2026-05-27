import type { SafeJsScriptConfig } from 'packages/obsidian/src/scripts/script-settings';
import { normalizeSafeJsScripts } from 'packages/obsidian/src/scripts/script-settings';

export interface SafeJsSettings {
	executionTimeoutsEnabled: boolean;
	executionTimeoutMs: number;
	debugBlocksEnabled: boolean;
	scripts: SafeJsScriptConfig[];
}

export const DEFAULT_SETTINGS: SafeJsSettings = {
	executionTimeoutsEnabled: true,
	executionTimeoutMs: 5000,
	debugBlocksEnabled: true,
	scripts: [],
};

export function normalizeSafeJsSettings(value: unknown): SafeJsSettings {
	const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
	const executionTimeoutMs =
		typeof record.executionTimeoutMs === 'number' && Number.isFinite(record.executionTimeoutMs) && record.executionTimeoutMs > 0
			? record.executionTimeoutMs
			: DEFAULT_SETTINGS.executionTimeoutMs;

	return {
		executionTimeoutsEnabled:
			typeof record.executionTimeoutsEnabled === 'boolean' ? record.executionTimeoutsEnabled : DEFAULT_SETTINGS.executionTimeoutsEnabled,
		executionTimeoutMs,
		debugBlocksEnabled: typeof record.debugBlocksEnabled === 'boolean' ? record.debugBlocksEnabled : DEFAULT_SETTINGS.debugBlocksEnabled,
		scripts: normalizeSafeJsScripts(record.scripts),
	};
}
