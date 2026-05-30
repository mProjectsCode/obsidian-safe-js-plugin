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
	private readonly storedDataSettingsSection: StoredDataSettingsSection;
	private readonly vaultScriptsSettingsSection: VaultScriptsSettingsSection;

	constructor(app: App, plugin: SafeJsPlugin, permissionSettingsStore?: PermissionSettingsStore, scriptManager?: VaultScriptManager) {
		super(app, plugin);
		this.plugin = plugin;
		const permissionStorage = new AppPermissionStorage(app);
		const resolvedPermissionSettingsStore = permissionSettingsStore ?? new LocalStoragePermissionSettingsStore(permissionStorage);
		this.approvalStore = new LocalStoragePermissionApprovalStore(permissionStorage);
		this.runtimeSettingsSection = new RuntimeSettingsSection(plugin, resolvedPermissionSettingsStore, () => {
			this.update();
		});
		this.storedDataSettingsSection = new StoredDataSettingsSection(this.app, this.approvalStore, () => {
			this.update();
		});
		this.vaultScriptsSettingsSection = new VaultScriptsSettingsSection(
			this.app,
			this.plugin,
			() => {
				this.update();
			},
			scriptManager,
		);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			...this.runtimeSettingsSection.getSettingDefinitions(),
			...this.vaultScriptsSettingsSection.getSettingDefinitions(),
			...this.storedDataSettingsSection.getSettingDefinitions(),
		];
	}

	getControlValue(key: string): unknown {
		return this.runtimeSettingsSection.getControlValue(key);
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		await this.runtimeSettingsSection.setControlValue(key, value);
	}

	display(): void {
		// intentional fallback for when a user somehow manages to circumvent the minimum Obsidian version check and gets here with an unsupported version
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('p', {
			text: 'Safe JS settings require Obsidian 1.13.0 or newer. This app appears to be running an older version.',
		});
	}
}
