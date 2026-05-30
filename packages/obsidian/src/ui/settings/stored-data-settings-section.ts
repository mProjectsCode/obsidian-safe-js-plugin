import type { App } from 'obsidian';
import type { SettingDefinitionItem } from 'obsidian';
import type { LocalStoragePermissionApprovalStore } from 'packages/obsidian/src/permissions/approval-store';
import { ScriptStorageManager } from 'packages/obsidian/src/storage/script-storage';
import { ApprovedHashesSettingPage } from 'packages/obsidian/src/ui/settings/approved-hashes-settings-page';
import { ScriptStorageSettingPage } from 'packages/obsidian/src/ui/settings/script-storage-settings-page';

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

	getSettingDefinitions(): SettingDefinitionItem[] {
		const approvals = this.approvalStore.list();
		const entries = ScriptStorageManager.listAll(this.app);

		return [
			{
				type: 'page',
				name: 'Approved script hashes',
				desc: `${approvals.length} stored`,
				page: () => new ApprovedHashesSettingPage(this.approvalStore, this.staleEntryAgeMs, this.onStorageChanged),
			},
			{
				type: 'page',
				name: 'Script storage',
				desc: `${entries.length} indexed`,
				page: () => new ScriptStorageSettingPage(this.app, this.staleEntryAgeMs, this.onStorageChanged),
			},
		];
	}
}
