import type { App } from 'obsidian';
import type { JsonValue } from 'packages/obsidian/src/execution/contracts';

export interface ScriptStorageEntry {
	key: string;
	updatedAt: number;
	sizeBytes: number;
}

interface ScriptStorageIndex {
	keys: Record<string, { updatedAt: number }>;
}

interface BrowserStorageLike {
	readonly length: number;
	key(index: number): string | null;
}

const STORAGE_PREFIX = 'safe-js:script-storage:v1:';
const STORAGE_INDEX_KEY = `${STORAGE_PREFIX}__index`;

export class ScriptStorageManager {
	private readonly app: App;
	private readonly now: () => number;
	private readonly browserStorage: BrowserStorageLike | null;

	constructor(app: App, now: () => number = Date.now, browserStorage: BrowserStorageLike | null = getBrowserLocalStorage()) {
		this.app = app;
		this.now = now;
		this.browserStorage = browserStorage;
	}

	get(key: string): JsonValue {
		return toJsonValue(this.app.loadLocalStorage(scriptStorageKey(key)));
	}

	set(key: string, value: JsonValue): void {
		this.app.saveLocalStorage(scriptStorageKey(key), value);
		this.upsertIndexEntry(key, this.now());
	}

	delete(key: string): void {
		this.app.saveLocalStorage(scriptStorageKey(key), null);
		this.removeIndexEntry(key);
	}

	list(): ScriptStorageEntry[] {
		const index = this.loadIndex();
		const keys = new Map<string, { updatedAt: number }>(Object.entries(index.keys));
		for (const legacyKey of this.getLegacyStorageKeys()) {
			if (!keys.has(legacyKey)) {
				keys.set(legacyKey, { updatedAt: 0 });
			}
		}

		return [...keys.entries()]
			.map(([key, entry]) => ({
				key,
				updatedAt: entry.updatedAt,
				sizeBytes: this.getSizeBytes(key),
			}))
			.sort((left, right) => right.updatedAt - left.updatedAt);
	}

	deleteOlderThan(cutoffTime: number): number {
		let deletedCount = 0;

		for (const entry of this.list()) {
			if (entry.updatedAt < cutoffTime) {
				this.delete(entry.key);
				deletedCount += 1;
			}
		}

		return deletedCount;
	}

	deleteAll(): number {
		const entries = this.list();
		for (const entry of entries) {
			this.app.saveLocalStorage(scriptStorageKey(entry.key), null);
		}

		this.saveIndex({ keys: {} });
		return entries.length;
	}

	private getSizeBytes(key: string): number {
		const rawValue: unknown = this.app.loadLocalStorage(scriptStorageKey(key));
		return new Blob([JSON.stringify(rawValue)]).size;
	}

	private loadIndex(): ScriptStorageIndex {
		const rawIndex: unknown = this.app.loadLocalStorage(STORAGE_INDEX_KEY);
		if (rawIndex === null || typeof rawIndex !== 'object' || Array.isArray(rawIndex)) {
			return { keys: {} };
		}

		const keys = (rawIndex as Partial<ScriptStorageIndex>).keys;
		if (keys === undefined || typeof keys !== 'object' || Array.isArray(keys)) {
			return { keys: {} };
		}

		const index: ScriptStorageIndex = { keys: {} };
		for (const [key, entry] of Object.entries(keys)) {
			if (typeof entry === 'object' && entry !== null && 'updatedAt' in entry && typeof entry.updatedAt === 'number') {
				index.keys[key] = { updatedAt: entry.updatedAt };
			}
		}

		return index;
	}

	private saveIndex(index: ScriptStorageIndex): void {
		this.app.saveLocalStorage(STORAGE_INDEX_KEY, index);
	}

	private upsertIndexEntry(key: string, updatedAt: number): void {
		const index = this.loadIndex();
		index.keys[key] = { updatedAt };
		this.saveIndex(index);
	}

	private removeIndexEntry(key: string): void {
		const index = this.loadIndex();
		delete index.keys[key];
		this.saveIndex(index);
	}

	private getLegacyStorageKeys(): string[] {
		if (this.browserStorage === null) {
			return [];
		}

		const keys: string[] = [];
		for (let index = 0; index < this.browserStorage.length; index += 1) {
			const key = this.browserStorage.key(index);
			if (key?.startsWith(STORAGE_PREFIX) === true && key !== STORAGE_INDEX_KEY) {
				keys.push(key.slice(STORAGE_PREFIX.length));
			}
		}

		return keys;
	}
}

export function scriptStorageKey(key: string): string {
	return `${STORAGE_PREFIX}${key}`;
}

function getBrowserLocalStorage(): BrowserStorageLike | null {
	return typeof window === 'undefined' ? null : window.localStorage;
}

function toJsonValue(value: unknown): JsonValue {
	if (value === undefined) {
		return null;
	}

	return JSON.parse(JSON.stringify(value)) as JsonValue;
}
