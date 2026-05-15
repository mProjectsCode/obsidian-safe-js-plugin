import type { JsonValue } from 'packages/obsidian/src/execution/contracts';

export type JsonFieldType = 'string' | 'number' | 'boolean';

export function pickJsonFields(source: Record<string, unknown>, fields: Record<string, JsonFieldType>): Record<string, JsonValue> {
	const target: Record<string, JsonValue> = {};

	for (const [key, type] of Object.entries(fields)) {
		const value = source[key];
		if (type === 'number') {
			if (typeof value === 'number' && Number.isFinite(value)) {
				target[key] = value;
			}
			continue;
		}

		if (type === 'string' && typeof value === 'string') {
			target[key] = value;
			continue;
		}

		if (type === 'boolean' && typeof value === 'boolean') {
			target[key] = value;
		}
	}

	return target;
}
