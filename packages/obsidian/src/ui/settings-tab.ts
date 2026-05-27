import type { App } from 'obsidian';
import { PluginSettingTab } from 'obsidian';
import type SafeJsPlugin from 'packages/obsidian/src/main';
import type { PermissionSettingsStore } from 'packages/obsidian/src/permissions/approval-store';
import {
	AppPermissionStorage,
	LocalStoragePermissionApprovalStore,
	LocalStoragePermissionSettingsStore,
} from 'packages/obsidian/src/permissions/approval-store';
import type { VaultScriptManager } from 'packages/obsidian/src/scripts/vault-script-manager';
import { RuntimeSettingsSection } from 'packages/obsidian/src/ui/settings/runtime-settings-section';
import { StoredDataSettingsSection } from 'packages/obsidian/src/ui/settings/stored-data-settings-section';
import { VaultScriptsSettingsSection } from 'packages/obsidian/src/ui/settings/vault-scripts-settings-section';

export class SafeJsSettingTab extends PluginSettingTab {
	plugin: SafeJsPlugin;
	private readonly approvalStore: LocalStoragePermissionApprovalStore;
	private readonly permissionSettingsStore: PermissionSettingsStore;
	private readonly scriptManager?: VaultScriptManager;

	constructor(
		app: App,
		plugin: SafeJsPlugin,
		permissionSettingsStore: PermissionSettingsStore = new LocalStoragePermissionSettingsStore(new AppPermissionStorage(app)),
		scriptManager?: VaultScriptManager,
	) {
		super(app, plugin);
		this.plugin = plugin;
		this.approvalStore = new LocalStoragePermissionApprovalStore(new AppPermissionStorage(app));
		this.permissionSettingsStore = permissionSettingsStore;
		this.scriptManager = scriptManager;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new RuntimeSettingsSection(this.plugin, this.permissionSettingsStore, () => {
			this.display();
		}).render(containerEl);
		new VaultScriptsSettingsSection(
			this.app,
			this.plugin,
			() => {
				this.display();
			},
			this.scriptManager,
		).render(containerEl);
		new StoredDataSettingsSection(this.app, this.approvalStore, () => {
			this.display();
		}).render(containerEl);
	}
}
