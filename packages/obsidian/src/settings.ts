import type { App } from 'obsidian';
import { PluginSettingTab, Setting } from 'obsidian';
import type SafeJsPlugin from 'packages/obsidian/src/main';

export interface SafeJsSettings {
	executionTimeoutMs: number;
	debugBlocksEnabled: boolean;
}

export const DEFAULT_SETTINGS: SafeJsSettings = {
	executionTimeoutMs: 5000,
	debugBlocksEnabled: true,
};

export class SafeJsSettingTab extends PluginSettingTab {
	plugin: SafeJsPlugin;

	constructor(app: App, plugin: SafeJsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Execution timeout')
			.setDesc('Maximum time a worker-backed script may run before it is cancelled.')
			.addText(text =>
				text
					.setPlaceholder(String(DEFAULT_SETTINGS.executionTimeoutMs))
					.setValue(String(this.plugin.settings.executionTimeoutMs))
					.onChange(async value => {
						const parsedValue = Number.parseInt(value, 10);
						this.plugin.settings.executionTimeoutMs =
							Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : DEFAULT_SETTINGS.executionTimeoutMs;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Debug blocks')
			.setDesc('Enable support for the safe-js-debug code block language.')
			.addToggle(toggle =>
				toggle.setValue(this.plugin.settings.debugBlocksEnabled).onChange(async value => {
					this.plugin.settings.debugBlocksEnabled = value;
					await this.plugin.saveSettings();
				}),
			);
	}
}
