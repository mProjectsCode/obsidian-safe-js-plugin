import type { PermissionId } from 'packages/obsidian/src/permissions/permissions';

export interface PermissionApproval {
	codeHash: string;
	permissions: PermissionId[];
	updatedAt: number;
}

export interface PermissionApprovalStore {
	load(codeHash: string): PermissionApproval | null;
	save(approval: PermissionApproval): void;
}

export interface StorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem?(key: string): void;
	key?(index: number): string | null;
	readonly length?: number;
}

const STORAGE_PREFIX = 'safe-js:permissions:v1:';

function normalizePermissions(permissions: readonly PermissionId[]): PermissionId[] {
	return [...new Set(permissions)].sort();
}

export class LocalStoragePermissionApprovalStore implements PermissionApprovalStore {
	private readonly storage: StorageLike;

	constructor(storage: StorageLike = window.localStorage) {
		this.storage = storage;
	}

	load(codeHash: string): PermissionApproval | null {
		const rawValue = this.storage.getItem(`${STORAGE_PREFIX}${codeHash}`);
		if (rawValue === null) {
			return null;
		}

		try {
			const parsedValue = JSON.parse(rawValue) as Partial<PermissionApproval>;
			if (parsedValue.codeHash !== codeHash || !Array.isArray(parsedValue.permissions) || typeof parsedValue.updatedAt !== 'number') {
				return null;
			}

			return {
				codeHash,
				permissions: normalizePermissions(parsedValue.permissions),
				updatedAt: parsedValue.updatedAt,
			};
		} catch {
			return null;
		}
	}

	save(approval: PermissionApproval): void {
		this.storage.setItem(
			`${STORAGE_PREFIX}${approval.codeHash}`,
			JSON.stringify({
				codeHash: approval.codeHash,
				permissions: normalizePermissions(approval.permissions),
				updatedAt: approval.updatedAt,
			}),
		);
	}

	list(): PermissionApproval[] {
		return this.getApprovalKeys()
			.map(key => this.load(key.slice(STORAGE_PREFIX.length)))
			.filter((approval): approval is PermissionApproval => approval !== null)
			.sort((left, right) => right.updatedAt - left.updatedAt);
	}

	delete(codeHash: string): boolean {
		const key = `${STORAGE_PREFIX}${codeHash}`;
		if (this.storage.getItem(key) === null) {
			return false;
		}

		if (this.storage.removeItem !== undefined) {
			this.storage.removeItem(key);
		} else {
			this.storage.setItem(key, '');
		}

		return true;
	}

	deleteOlderThan(cutoffTime: number): number {
		let deletedCount = 0;

		for (const approval of this.list()) {
			if (approval.updatedAt < cutoffTime && this.delete(approval.codeHash)) {
				deletedCount += 1;
			}
		}

		return deletedCount;
	}

	deleteAll(): number {
		let deletedCount = 0;

		for (const approval of this.list()) {
			if (this.delete(approval.codeHash)) {
				deletedCount += 1;
			}
		}

		return deletedCount;
	}

	private getApprovalKeys(): string[] {
		if (this.storage.key === undefined || typeof this.storage.length !== 'number') {
			return [];
		}

		const keys: string[] = [];
		for (let index = 0; index < this.storage.length; index += 1) {
			const key = this.storage.key(index);
			if (key?.startsWith(STORAGE_PREFIX) === true) {
				keys.push(key);
			}
		}

		return keys;
	}
}

export class MemoryPermissionApprovalStore implements PermissionApprovalStore {
	private readonly approvals = new Map<string, PermissionApproval>();

	load(codeHash: string): PermissionApproval | null {
		return this.approvals.get(codeHash) ?? null;
	}

	save(approval: PermissionApproval): void {
		this.approvals.set(approval.codeHash, {
			codeHash: approval.codeHash,
			permissions: normalizePermissions(approval.permissions),
			updatedAt: approval.updatedAt,
		});
	}

	list(): PermissionApproval[] {
		return [...this.approvals.values()].sort((left, right) => right.updatedAt - left.updatedAt);
	}

	delete(codeHash: string): boolean {
		return this.approvals.delete(codeHash);
	}

	deleteOlderThan(cutoffTime: number): number {
		let deletedCount = 0;

		for (const approval of this.list()) {
			if (approval.updatedAt < cutoffTime && this.delete(approval.codeHash)) {
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
