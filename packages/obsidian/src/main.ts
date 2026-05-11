import { Plugin } from 'obsidian';
import type { SafeJsSettings } from 'packages/obsidian/src/settings';
import { DEFAULT_SETTINGS, SafeJsSettingTab } from 'packages/obsidian/src/settings';

export default class SafeJsPlugin extends Plugin {
	settings!: SafeJsSettings;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new SafeJsSettingTab(this.app, this));
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<SafeJsSettings>);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
