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
}
