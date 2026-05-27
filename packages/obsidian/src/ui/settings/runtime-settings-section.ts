import { Setting } from 'obsidian';
import type SafeJsPlugin from 'packages/obsidian/src/main';
import type { PermissionSettingsStore } from 'packages/obsidian/src/permissions/approval-store';
import type { SafeJsSettings } from 'packages/obsidian/src/settings/settings-schema';
import { DEFAULT_SETTINGS } from 'packages/obsidian/src/settings/settings-schema';

export class RuntimeSettingsSection {
	private readonly onSettingsChanged: () => void;
	private readonly permissionSettingsStore: PermissionSettingsStore;
	private readonly plugin: SafeJsPlugin;

	constructor(plugin: SafeJsPlugin, permissionSettingsStore: PermissionSettingsStore, onSettingsChanged: () => void) {
		this.onSettingsChanged = onSettingsChanged;
		this.permissionSettingsStore = permissionSettingsStore;
		this.plugin = plugin;
	}

	render(containerEl: HTMLElement): void {
		this.createSection(containerEl, 'Runtime settings');
		new Setting(containerEl)
			.setName('Execution timeouts')
			.setDesc('Cancel scripts that run longer than the configured timeout.')
			.addToggle(toggle =>
				toggle.setValue(this.plugin.settings.executionTimeoutsEnabled).onChange(async value => {
					this.plugin.settings.executionTimeoutsEnabled = value;
					await this.plugin.saveSettings();
					this.onSettingsChanged();
				}),
			);

		new Setting(containerEl)
			.setName('Execution timeout')
			.setDesc(this.executionTimeoutDescription(this.plugin.settings))
			.addText(text =>
				text
					.setPlaceholder(String(DEFAULT_SETTINGS.executionTimeoutMs))
					.setValue(String(this.plugin.settings.executionTimeoutMs))
					.onChange(async value => {
						this.plugin.settings.executionTimeoutMs = this.normalizeTimeoutMs(value);
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

		new Setting(containerEl)
			.setName('Auto-allow low-risk permissions')
			.setDesc('Allow low-risk permissions without prompting. Approvals are still remembered per script hash on this device.')
			.addToggle(toggle =>
				toggle.setValue(this.permissionSettingsStore.loadAutoAllowLowRiskPermissions()).onChange(value => {
					this.permissionSettingsStore.saveAutoAllowLowRiskPermissions(value);
				}),
			);
	}

	private createSection(containerEl: HTMLElement, heading: string): void {
		new Setting(containerEl).setName(heading).setHeading();
	}

	private executionTimeoutDescription(settings: SafeJsSettings): string {
		return settings.executionTimeoutsEnabled
			? 'Maximum time a worker-backed script may run before it is cancelled.'
			: 'Timeouts are disabled. This value is kept for later use.';
	}

	private normalizeTimeoutMs(value: string): number {
		const parsedValue = Number.parseInt(value, 10);
		return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : DEFAULT_SETTINGS.executionTimeoutMs;
	}
}
