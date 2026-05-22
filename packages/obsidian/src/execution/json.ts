import type { JsonValue } from '@lemons_dev/obsidian-safe-js-api';

export function toJsonValue(value: unknown): JsonValue {
	if (isJsonValue(value)) {
		return value;
	}

	if (value === undefined) {
		return null;
	}

	return JSON.parse(JSON.stringify(value)) as JsonValue;
}

export function isJsonValue(value: unknown): value is JsonValue {
	if (value === null) {
		return true;
	}

	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		return Number.isFinite(value) || typeof value !== 'number';
	}

	if (Array.isArray(value)) {
		return value.every(isJsonValue);
	}

	if (typeof value === 'object') {
		return Object.values(value).every(isJsonValue);
	}

	return false;
}
