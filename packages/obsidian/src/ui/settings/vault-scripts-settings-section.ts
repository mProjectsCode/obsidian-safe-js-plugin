import type { App } from 'obsidian';
import { Setting, SettingGroup } from 'obsidian';
import type SafeJsPlugin from 'packages/obsidian/src/main';
import type { SafeJsScriptConfig } from 'packages/obsidian/src/scripts/script-settings';
import { createScriptConfig, displayNameFromPath, isJavaScriptVaultScriptPath } from 'packages/obsidian/src/scripts/script-settings';
import type { VaultScriptManager } from 'packages/obsidian/src/scripts/vault-script-manager';
import type { AddVaultScriptModalValues } from 'packages/obsidian/src/ui/add-vault-script-modal';
import { AddVaultScriptModal } from 'packages/obsidian/src/ui/add-vault-script-modal';

export class VaultScriptsSettingsSection {
	private readonly app: App;
	private readonly onSettingsChanged: () => void;
	private readonly plugin: SafeJsPlugin;
	private readonly scriptManager?: VaultScriptManager;

	constructor(app: App, plugin: SafeJsPlugin, onSettingsChanged: () => void, scriptManager?: VaultScriptManager) {
		this.app = app;
		this.onSettingsChanged = onSettingsChanged;
		this.plugin = plugin;
		this.scriptManager = scriptManager;
	}

	render(containerEl: HTMLElement): void {
		this.createSection(containerEl, 'Vault scripts');
		const group = new SettingGroup(containerEl);

		for (const script of this.plugin.settings.scripts) {
			this.renderVaultScript(group, script);
		}

		this.renderAddVaultScript(group);
	}

	private renderVaultScript(group: SettingGroup, script: SafeJsScriptConfig): void {
		group.addSetting(setting => {
			setting
				.setName(script.name)
				.setDesc(formatVaultScriptDescription(script))
				.addButton(button =>
					button.setButtonText('Edit').onClick(() => {
						this.openEditVaultScriptModal(script);
					}),
				)
				.addButton(button =>
					button.setButtonText('Remove').onClick(() => {
						void this.removeVaultScript(script);
					}),
				);
		});
	}

	private renderAddVaultScript(group: SettingGroup): void {
		group.addSetting(setting => {
			setting
				.setName('Add script')
				.setDesc('Configure a vault .js file as a command.')
				.addButton(button =>
					button
						.setButtonText('Add script')
						.setCta()
						.onClick(() => {
							this.openAddVaultScriptModal();
						}),
				);
		});
	}

	private openAddVaultScriptModal(): void {
		new AddVaultScriptModal(
			this.app,
			{
				actionText: 'Add',
				initialValues: {
					name: '',
					path: '',
					runOnStartup: false,
				},
				title: 'Add script',
			},
			async values => await this.addVaultScript(values),
		).open();
	}

	private async removeVaultScript(script: SafeJsScriptConfig): Promise<void> {
		this.plugin.settings.scripts = this.plugin.settings.scripts.filter(candidate => candidate.id !== script.id);
		await this.saveScriptSettings();
		this.onSettingsChanged();
	}

	private openEditVaultScriptModal(script: SafeJsScriptConfig): void {
		new AddVaultScriptModal(
			this.app,
			{
				actionText: 'Save',
				initialValues: {
					name: script.name,
					path: script.path,
					runOnStartup: script.runOnStartup,
				},
				title: 'Edit script',
			},
			async values => await this.editVaultScript(script, values),
		).open();
	}

	private async addVaultScript(values: AddVaultScriptModalValues): Promise<{ message?: string; saved: boolean }> {
		const normalizedPath = values.path.trim();
		if (normalizedPath === '' || !isJavaScriptVaultScriptPath(normalizedPath)) {
			return { message: 'Enter a vault path ending in .js.', saved: false };
		}

		if (this.plugin.settings.scripts.some(script => script.path === normalizedPath)) {
			return { message: 'That script is already configured.', saved: false };
		}

		const script = createScriptConfig(normalizedPath, values.name, this.plugin.settings.scripts);
		script.runOnStartup = values.runOnStartup;
		this.plugin.settings.scripts = [...this.plugin.settings.scripts, script];
		await this.saveScriptSettings();
		this.onSettingsChanged();
		return { saved: true };
	}

	private async editVaultScript(script: SafeJsScriptConfig, values: AddVaultScriptModalValues): Promise<{ message?: string; saved: boolean }> {
		const normalizedPath = values.path.trim();
		if (normalizedPath === '' || !isJavaScriptVaultScriptPath(normalizedPath)) {
			return { message: 'Enter a vault path ending in .js.', saved: false };
		}

		if (this.plugin.settings.scripts.some(candidate => candidate.id !== script.id && candidate.path === normalizedPath)) {
			return { message: 'That script is already configured.', saved: false };
		}

		script.name = values.name.trim() || displayNameFromPath(normalizedPath);
		script.path = normalizedPath;
		script.runOnStartup = values.runOnStartup;
		await this.saveScriptSettings();
		this.onSettingsChanged();
		return { saved: true };
	}

	private async saveScriptSettings(): Promise<void> {
		await this.plugin.saveSettings();
		this.scriptManager?.reloadCommands();
	}

	private createSection(containerEl: HTMLElement, heading: string): void {
		new Setting(containerEl).setName(heading).setHeading();
	}
}

function formatVaultScriptDescription(script: SafeJsScriptConfig): string {
	return script.runOnStartup ? `${script.path} - Runs on startup` : script.path;
}
