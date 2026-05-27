import type { App } from 'obsidian';
import { Notice, Setting, SettingGroup } from 'obsidian';
import type { PermissionApproval } from 'packages/obsidian/src/permissions/approval-store';
import type { LocalStoragePermissionApprovalStore } from 'packages/obsidian/src/permissions/approval-store';
import type { ScriptStorageEntry } from 'packages/obsidian/src/storage/script-storage';
import { ScriptStorageManager } from 'packages/obsidian/src/storage/script-storage';

export class StoredDataSettingsSection {
	private readonly app: App;
	private readonly approvalStore: LocalStoragePermissionApprovalStore;
	private readonly onStorageChanged: () => void;
	private readonly staleEntryAgeMs = 30 * 24 * 60 * 60 * 1000;

	constructor(app: App, approvalStore: LocalStoragePermissionApprovalStore, onStorageChanged: () => void) {
		this.app = app;
		this.approvalStore = approvalStore;
		this.onStorageChanged = onStorageChanged;
	}

	render(containerEl: HTMLElement): void {
		this.renderApprovalStorage(containerEl);
		this.renderScriptStorage(containerEl);
	}

	private renderApprovalStorage(containerEl: HTMLElement): void {
		const approvals = this.approvalStore.list();
		this.createSection(containerEl, 'Approved script hashes');

		new Setting(containerEl)
			.setName('Clear approved hashes')
			.setDesc('Remove remembered permission approvals for changed or old scripts.')
			.addButton(button =>
				button.setButtonText('Clear older than 30 days').onClick(() => {
					const deletedCount = this.approvalStore.deleteOlderThan(Date.now() - this.staleEntryAgeMs);
					new Notice(`Cleared ${deletedCount} approved script ${deletedCount === 1 ? 'hash' : 'hashes'}.`);
					this.onStorageChanged();
				}),
			)
			.addButton(button =>
				button.setButtonText('Clear all').onClick(() => {
					const deletedCount = this.approvalStore.deleteAll();
					new Notice(`Cleared ${deletedCount} approved script ${deletedCount === 1 ? 'hash' : 'hashes'}.`);
					this.onStorageChanged();
				}),
			);

		this.renderApprovalList(new SettingGroup(containerEl), approvals);
	}

	private renderApprovalList(group: SettingGroup, approvals: PermissionApproval[]): void {
		if (approvals.length === 0) {
			group.addSetting(setting => {
				setting.setName('No approved script hashes are stored.');
			});
			return;
		}

		for (const approval of approvals.slice(0, 20)) {
			group.addSetting(setting => {
				setting
					.setName(approval.codeHash)
					.setDesc(`${formatCaller(approval.callerPluginId)} - ${approval.permissions.join(', ')} - ${formatDate(approval.updatedAt)}`)
					.addButton(button =>
						button.setButtonText('Revoke').onClick(() => {
							this.approvalStore.delete(approval);
							new Notice(`Revoked approval for script hash ${approval.codeHash}.`);
							this.onStorageChanged();
						}),
					);
			});
		}

		if (approvals.length > 20) {
			group.addSetting(setting => {
				setting.setName(`${approvals.length - 20} more approved hashes are hidden.`);
			});
		}
	}

	private renderScriptStorage(containerEl: HTMLElement): void {
		const entries = ScriptStorageManager.listAll(this.app);
		this.createSection(containerEl, 'Script storage');

		new Setting(containerEl)
			.setName('Clear script storage')
			.setDesc('Remove data written through the storage API by scripts.')
			.addButton(button =>
				button.setButtonText('Clear older than 30 days').onClick(() => {
					const deletedCount = ScriptStorageManager.deleteOlderThanAll(this.app, Date.now() - this.staleEntryAgeMs);
					new Notice(`Cleared ${deletedCount} script storage ${deletedCount === 1 ? 'key' : 'keys'}.`);
					this.onStorageChanged();
				}),
			)
			.addButton(button =>
				button.setButtonText('Clear all').onClick(() => {
					const deletedCount = ScriptStorageManager.deleteAllKnown(this.app);
					new Notice(`Cleared ${deletedCount} script storage ${deletedCount === 1 ? 'key' : 'keys'}.`);
					this.onStorageChanged();
				}),
			);

		this.renderScriptStorageList(new SettingGroup(containerEl), entries);
	}

	private renderScriptStorageList(group: SettingGroup, entries: ScriptStorageEntry[]): void {
		if (entries.length === 0) {
			group.addSetting(setting => {
				setting.setName('No indexed script storage keys are stored.');
			});
			return;
		}

		for (const entry of entries.slice(0, 20)) {
			group.addSetting(setting => {
				setting.setName(entry.key).setDesc(`${formatScope(entry.scope)} - ${formatBytes(entry.sizeBytes)} - ${formatDate(entry.updatedAt)}`);
			});
		}

		if (entries.length > 20) {
			group.addSetting(setting => {
				setting.setName(`${entries.length - 20} more storage keys are hidden.`);
			});
		}
	}

	private createSection(containerEl: HTMLElement, heading: string): void {
		new Setting(containerEl).setName(heading).setHeading();
	}
}

function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleString();
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}

	return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatCaller(callerPluginId: string | undefined): string {
	return callerPluginId ?? 'notes';
}

function formatScope(scope: string | null): string {
	return scope === null ? 'global' : `scoped ${scope.slice(0, 12)}`;
}
