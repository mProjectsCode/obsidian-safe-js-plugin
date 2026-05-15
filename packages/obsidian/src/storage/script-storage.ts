import type { App } from 'obsidian';
import type { JsonValue } from 'packages/obsidian/src/execution/contracts';
import { toJsonValue } from 'packages/obsidian/src/execution/json';
import { z } from 'zod';

export interface ScriptStorageEntry {
	key: string;
	scope: string | null;
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
const SCOPED_STORAGE_PREFIX = `${STORAGE_PREFIX}scoped:`;
const scriptStorageIndexSchema: z.ZodType<ScriptStorageIndex> = z.object({
	keys: z.record(
		z.string(),
		z.object({
			updatedAt: z.number(),
		}),
	),
});

export class ScriptStorageManager {
	private readonly app: App;
	private readonly browserStorage: BrowserStorageLike | null;
	private readonly now: () => number;
	private readonly scope: string | null;

	constructor(app: App, now: () => number = Date.now, browserStorage: BrowserStorageLike | null = getBrowserLocalStorage(), scope: string | null = null) {
		this.app = app;
		this.now = now;
		this.browserStorage = browserStorage;
		this.scope = scope;
	}

	get(key: string): JsonValue {
		return toJsonValue(this.app.loadLocalStorage(this.storageKey(key)));
	}

	set(key: string, value: JsonValue): void {
		this.app.saveLocalStorage(this.storageKey(key), value);
		this.upsertIndexEntry(key, this.now());
	}

	delete(key: string): void {
		this.app.saveLocalStorage(this.storageKey(key), null);
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
				scope: this.scope,
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
			this.app.saveLocalStorage(this.storageKey(entry.key), null);
		}

		this.saveIndex({ keys: {} });
		return entries.length;
	}

	static listAll(app: App, now: () => number = Date.now, browserStorage: BrowserStorageLike | null = getBrowserLocalStorage()): ScriptStorageEntry[] {
		return ScriptStorageManager.createKnownManagers(app, now, browserStorage)
			.flatMap(manager => manager.list())
			.sort((left, right) => right.updatedAt - left.updatedAt);
	}

	static deleteOlderThanAll(
		app: App,
		cutoffTime: number,
		now: () => number = Date.now,
		browserStorage: BrowserStorageLike | null = getBrowserLocalStorage(),
	): number {
		return ScriptStorageManager.createKnownManagers(app, now, browserStorage).reduce(
			(deletedCount, manager) => deletedCount + manager.deleteOlderThan(cutoffTime),
			0,
		);
	}

	static deleteAllKnown(app: App, now: () => number = Date.now, browserStorage: BrowserStorageLike | null = getBrowserLocalStorage()): number {
		return ScriptStorageManager.createKnownManagers(app, now, browserStorage).reduce((deletedCount, manager) => deletedCount + manager.deleteAll(), 0);
	}

	private getSizeBytes(key: string): number {
		const rawValue: unknown = this.app.loadLocalStorage(this.storageKey(key));
		return new Blob([JSON.stringify(rawValue)]).size;
	}

	private loadIndex(): ScriptStorageIndex {
		const rawIndex: unknown = this.app.loadLocalStorage(this.storageIndexKey());
		return scriptStorageIndexSchema.safeParse(rawIndex).data ?? { keys: {} };
	}

	private saveIndex(index: ScriptStorageIndex): void {
		this.app.saveLocalStorage(this.storageIndexKey(), index);
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
			if (this.scope === null && key?.startsWith(SCOPED_STORAGE_PREFIX) === true) {
				continue;
			}

			if (key?.startsWith(this.storagePrefix()) === true && key !== this.storageIndexKey()) {
				keys.push(key.slice(this.storagePrefix().length));
			}
		}

		return keys;
	}

	private storageIndexKey(): string {
		return `${this.storagePrefix()}__index`;
	}

	private storageKey(key: string): string {
		return `${this.storagePrefix()}${key}`;
	}

	private storagePrefix(): string {
		return this.scope === null ? STORAGE_PREFIX : `${SCOPED_STORAGE_PREFIX}${encodeURIComponent(this.scope)}:`;
	}

	private static createKnownManagers(app: App, now: () => number, browserStorage: BrowserStorageLike | null): ScriptStorageManager[] {
		return [
			new ScriptStorageManager(app, now, browserStorage),
			...ScriptStorageManager.getKnownScopes(browserStorage).map(scope => new ScriptStorageManager(app, now, browserStorage, scope)),
		];
	}

	private static getKnownScopes(browserStorage: BrowserStorageLike | null): string[] {
		if (browserStorage === null) {
			return [];
		}

		const scopes = new Set<string>();
		for (let index = 0; index < browserStorage.length; index += 1) {
			const key = browserStorage.key(index);
			if (key?.startsWith(SCOPED_STORAGE_PREFIX) !== true) {
				continue;
			}

			const scopeEndIndex = key.indexOf(':', SCOPED_STORAGE_PREFIX.length);
			if (scopeEndIndex > SCOPED_STORAGE_PREFIX.length) {
				scopes.add(decodeURIComponent(key.slice(SCOPED_STORAGE_PREFIX.length, scopeEndIndex)));
			}
		}

		return [...scopes].sort();
	}
}

export function scriptStorageKey(key: string): string {
	return `${STORAGE_PREFIX}${key}`;
}

export function scopedScriptStorageKey(scope: string, key: string): string {
	return `${SCOPED_STORAGE_PREFIX}${encodeURIComponent(scope)}:${key}`;
}

function getBrowserLocalStorage(): BrowserStorageLike | null {
	return typeof window === 'undefined' ? null : window.localStorage;
}
