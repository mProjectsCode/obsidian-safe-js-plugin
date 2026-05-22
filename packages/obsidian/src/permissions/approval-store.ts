import type { App } from 'obsidian';
import type { PermissionId } from 'packages/obsidian/src/permissions/permissions';

export interface PermissionApproval {
	codeHash: string;
	callerPluginId?: string;
	permissions: PermissionId[];
	updatedAt: number;
}

export interface PermissionApprovalSubject {
	codeHash: string;
	callerPluginId?: string;
}

export interface PermissionApprovalStore {
	load(subject: PermissionApprovalSubject): PermissionApproval | null;
	save(approval: PermissionApproval): void;
}

export interface PermissionSettingsStore {
	loadAutoAllowLowRiskPermissions(): boolean;
	saveAutoAllowLowRiskPermissions(value: boolean): void;
}

export interface PermissionStorage {
	delete(key: string): void;
	get(key: string): unknown;
	keys(): string[];
	set(key: string, value: unknown): void;
}

const STORAGE_PREFIX = 'safe-js:permissions:v1:';
const SETTINGS_PREFIX = 'safe-js:settings:v1:';
const AUTO_ALLOW_LOW_RISK_PERMISSIONS_KEY = `${SETTINGS_PREFIX}auto-allow-low-risk-permissions`;

function normalizePermissions(permissions: readonly PermissionId[]): PermissionId[] {
	return [...new Set(permissions)].sort();
}

function approvalStorageId(subject: PermissionApprovalSubject): string {
	if (subject.callerPluginId === undefined || subject.callerPluginId === '') {
		return subject.codeHash;
	}

	return `${encodeURIComponent(subject.callerPluginId)}:${encodeURIComponent(subject.codeHash)}`;
}

export class AppPermissionStorage implements PermissionStorage {
	private readonly app: App;

	constructor(app: App) {
		this.app = app;
	}

	delete(key: string): void {
		this.app.saveLocalStorage(key, null);
		const keys = new Set(this.keys());
		keys.delete(key);
		this.app.saveLocalStorage(PERMISSION_STORAGE_INDEX_KEY, [...keys].sort());
	}

	get(key: string): unknown {
		return this.app.loadLocalStorage(key);
	}

	keys(): string[] {
		const rawIndex: unknown = this.app.loadLocalStorage(PERMISSION_STORAGE_INDEX_KEY);
		return parseStorageIndex(rawIndex);
	}

	set(key: string, value: unknown): void {
		this.app.saveLocalStorage(key, value);
		const keys = new Set(this.keys());
		keys.add(key);
		this.app.saveLocalStorage(PERMISSION_STORAGE_INDEX_KEY, [...keys].sort());
	}
}

export class MemoryPermissionStorage implements PermissionStorage {
	private readonly values = new Map<string, unknown>();

	delete(key: string): void {
		this.values.delete(key);
	}

	get(key: string): unknown {
		return this.values.get(key) ?? null;
	}

	keys(): string[] {
		return [...this.values.keys()].sort();
	}

	set(key: string, value: unknown): void {
		this.values.set(key, value);
	}
}

export class LocalStoragePermissionSettingsStore implements PermissionSettingsStore {
	private readonly storage: PermissionStorage;

	constructor(storage: PermissionStorage) {
		this.storage = storage;
	}

	loadAutoAllowLowRiskPermissions(): boolean {
		return this.storage.get(AUTO_ALLOW_LOW_RISK_PERMISSIONS_KEY) === true;
	}

	saveAutoAllowLowRiskPermissions(value: boolean): void {
		this.storage.set(AUTO_ALLOW_LOW_RISK_PERMISSIONS_KEY, value);
	}
}

export class LocalStoragePermissionApprovalStore implements PermissionApprovalStore {
	private readonly storage: PermissionStorage;

	constructor(storage: PermissionStorage) {
		this.storage = storage;
	}

	load(subject: PermissionApprovalSubject): PermissionApproval | null {
		const key = `${STORAGE_PREFIX}${approvalStorageId(subject)}`;
		if (!this.isApprovalIndexed(key)) {
			if (this.storage.get(key) !== null) {
				this.storage.delete(key);
			}

			return null;
		}

		const rawValue = this.storage.get(key);
		if (!isPermissionApprovalRecord(rawValue)) {
			return null;
		}

		try {
			if (rawValue.codeHash !== subject.codeHash || rawValue.callerPluginId !== subject.callerPluginId) {
				return null;
			}

			return {
				codeHash: subject.codeHash,
				callerPluginId: subject.callerPluginId,
				permissions: normalizePermissions(rawValue.permissions),
				updatedAt: rawValue.updatedAt,
			};
		} catch {
			return null;
		}
	}

	save(approval: PermissionApproval): void {
		this.storage.set(`${STORAGE_PREFIX}${approvalStorageId(approval)}`, {
			codeHash: approval.codeHash,
			callerPluginId: approval.callerPluginId,
			permissions: normalizePermissions(approval.permissions),
			updatedAt: approval.updatedAt,
		});
	}

	list(): PermissionApproval[] {
		return this.getApprovalKeys()
			.map(key => this.loadByStorageId(key.slice(STORAGE_PREFIX.length)))
			.filter((approval): approval is PermissionApproval => approval !== null)
			.sort((left, right) => right.updatedAt - left.updatedAt);
	}

	delete(subject: PermissionApprovalSubject): boolean {
		const key = `${STORAGE_PREFIX}${approvalStorageId(subject)}`;
		if (this.storage.get(key) === null) {
			return false;
		}

		this.storage.delete(key);
		return true;
	}

	deleteOlderThan(cutoffTime: number): number {
		let deletedCount = 0;

		for (const approval of this.list()) {
			if (approval.updatedAt < cutoffTime && this.delete(approval)) {
				deletedCount += 1;
			}
		}

		return deletedCount;
	}

	deleteAll(): number {
		let deletedCount = 0;

		for (const approval of this.list()) {
			if (this.delete(approval)) {
				deletedCount += 1;
			}
		}

		return deletedCount;
	}

	private getApprovalKeys(): string[] {
		return this.storage.keys().filter(key => key.startsWith(STORAGE_PREFIX));
	}

	private isApprovalIndexed(key: string): boolean {
		return this.getApprovalKeys().includes(key);
	}

	private loadByStorageId(storageId: string): PermissionApproval | null {
		const rawValue = this.storage.get(`${STORAGE_PREFIX}${storageId}`);
		if (!isPermissionApprovalRecord(rawValue)) {
			return null;
		}

		try {
			return {
				codeHash: rawValue.codeHash,
				callerPluginId: rawValue.callerPluginId,
				permissions: normalizePermissions(rawValue.permissions),
				updatedAt: rawValue.updatedAt,
			};
		} catch {
			return null;
		}
	}
}

const PERMISSION_STORAGE_INDEX_KEY = `${SETTINGS_PREFIX}__index`;

function parseStorageIndex(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.filter((key): key is string => typeof key === 'string');
}

function isPermissionApprovalRecord(value: unknown): value is PermissionApproval {
	return (
		typeof value === 'object' &&
		value !== null &&
		'codeHash' in value &&
		typeof value.codeHash === 'string' &&
		(!('callerPluginId' in value) || typeof value.callerPluginId === 'string' || value.callerPluginId === undefined) &&
		'permissions' in value &&
		Array.isArray(value.permissions) &&
		'updatedAt' in value &&
		typeof value.updatedAt === 'number'
	);
}

export class MemoryPermissionApprovalStore implements PermissionApprovalStore {
	private readonly approvals = new Map<string, PermissionApproval>();

	load(subject: PermissionApprovalSubject): PermissionApproval | null {
		return this.approvals.get(approvalStorageId(subject)) ?? null;
	}

	save(approval: PermissionApproval): void {
		this.approvals.set(approvalStorageId(approval), {
			codeHash: approval.codeHash,
			callerPluginId: approval.callerPluginId,
			permissions: normalizePermissions(approval.permissions),
			updatedAt: approval.updatedAt,
		});
	}

	list(): PermissionApproval[] {
		return [...this.approvals.values()].sort((left, right) => right.updatedAt - left.updatedAt);
	}

	delete(subject: PermissionApprovalSubject): boolean {
		return this.approvals.delete(approvalStorageId(subject));
	}

	deleteOlderThan(cutoffTime: number): number {
		let deletedCount = 0;

		for (const approval of this.list()) {
			if (approval.updatedAt < cutoffTime && this.delete(approval)) {
				deletedCount += 1;
			}
		}

		return deletedCount;
	}

	deleteAll(): number {
		const deletedCount = this.approvals.size;
		this.approvals.clear();
		return deletedCount;
	}
}
