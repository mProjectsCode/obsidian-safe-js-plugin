import type { App } from 'obsidian';
import type { SettingDefinitionItem } from 'obsidian';
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
	private readonly runtimeSettingsSection: RuntimeSettingsSection;
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
		this.runtimeSettingsSection = new RuntimeSettingsSection(plugin, permissionSettingsStore, () => {
			this.update();
		});
		this.scriptManager = scriptManager;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			...this.runtimeSettingsSection.getSettingDefinitions(),
			...new VaultScriptsSettingsSection(
				this.app,
				this.plugin,
				() => {
					this.update();
				},
				this.scriptManager,
			).getSettingDefinitions(),
			...new StoredDataSettingsSection(this.app, this.approvalStore, () => {
				this.update();
			}).getSettingDefinitions(),
		];
	}

	getControlValue(key: string): unknown {
		return this.runtimeSettingsSection.getControlValue(key);
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		await this.runtimeSettingsSection.setControlValue(key, value);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('p', {
			text: 'Safe JS settings require Obsidian 1.13.0 or newer. This app appears to be running an older version.',
		});
	}
}
