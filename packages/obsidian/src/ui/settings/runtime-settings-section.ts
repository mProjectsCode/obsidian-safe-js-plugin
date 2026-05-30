import type { SettingDefinitionItem } from 'obsidian';
import type SafeJsPlugin from 'packages/obsidian/src/main';
import type { PermissionSettingsStore } from 'packages/obsidian/src/permissions/approval-store';
import type { SafeJsSettings } from 'packages/obsidian/src/settings/settings-schema';
import { DEFAULT_SETTINGS } from 'packages/obsidian/src/settings/settings-schema';

export type RuntimeSettingsKey = keyof Pick<SafeJsSettings, 'debugBlocksEnabled' | 'executionTimeoutMs' | 'executionTimeoutsEnabled'>;
export const AUTO_ALLOW_LOW_RISK_PERMISSIONS_KEY = 'autoAllowLowRiskPermissions';
export type RuntimeControlKey = RuntimeSettingsKey | typeof AUTO_ALLOW_LOW_RISK_PERMISSIONS_KEY;

export class RuntimeSettingsSection {
	private readonly onSettingsChanged: () => void;
	private readonly permissionSettingsStore: PermissionSettingsStore;
	private readonly plugin: SafeJsPlugin;

	constructor(plugin: SafeJsPlugin, permissionSettingsStore: PermissionSettingsStore, onSettingsChanged: () => void) {
		this.onSettingsChanged = onSettingsChanged;
		this.permissionSettingsStore = permissionSettingsStore;
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem<RuntimeControlKey>[] {
		return [
			{
				type: 'group',
				items: [
					{
						name: 'Execution timeouts',
						desc: 'Cancel scripts that run longer than the configured timeout.',
						control: { type: 'toggle', key: 'executionTimeoutsEnabled' },
					},
					{
						name: 'Execution timeout',
						desc: this.executionTimeoutDescription(this.plugin.settings),
						control: {
							type: 'number',
							key: 'executionTimeoutMs',
							min: 1,
							placeholder: String(DEFAULT_SETTINGS.executionTimeoutMs),
							validate: value => (this.isValidTimeoutMs(value) ? undefined : 'Enter a positive timeout in milliseconds.'),
						},
					},
					{
						name: 'Debug blocks',
						desc: 'Enable support for the safe-js-debug code block language.',
						control: { type: 'toggle', key: 'debugBlocksEnabled' },
					},
					{
						name: 'Auto-allow low-risk permissions',
						desc: 'Allow low-risk permissions without prompting. Approvals are still remembered per script hash on this device.',
						control: { type: 'toggle', key: AUTO_ALLOW_LOW_RISK_PERMISSIONS_KEY },
					},
				],
			},
		];
	}

	getControlValue(key: string): unknown {
		if (!isRuntimeControlKey(key)) {
			return undefined;
		}

		if (key === AUTO_ALLOW_LOW_RISK_PERMISSIONS_KEY) {
			return this.permissionSettingsStore.loadAutoAllowLowRiskPermissions();
		}

		return this.plugin.settings[key];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (!isRuntimeControlKey(key)) {
			return;
		}

		if (key === AUTO_ALLOW_LOW_RISK_PERMISSIONS_KEY) {
			this.permissionSettingsStore.saveAutoAllowLowRiskPermissions(value === true);
			return;
		}

		if (key === 'executionTimeoutsEnabled') {
			await this.saveExecutionTimeoutsEnabled(value);
			return;
		}

		if (key === 'debugBlocksEnabled') {
			await this.saveDebugBlocksEnabled(value);
			return;
		}

		await this.saveExecutionTimeoutMs(value);
	}

	private executionTimeoutDescription(settings: SafeJsSettings): string {
		return settings.executionTimeoutsEnabled
			? 'Maximum time a worker-backed script may run before it is cancelled.'
			: 'Timeouts are disabled. This value is kept for later use.';
	}

	private isValidTimeoutMs(value: number): boolean {
		return Number.isFinite(value) && value > 0;
	}

	private async saveDebugBlocksEnabled(value: unknown): Promise<void> {
		if (typeof value !== 'boolean') {
			return;
		}

		this.plugin.settings.debugBlocksEnabled = value;
		await this.plugin.saveSettings();
	}

	private async saveExecutionTimeoutMs(value: unknown): Promise<void> {
		if (typeof value !== 'number' || !this.isValidTimeoutMs(value)) {
			return;
		}

		this.plugin.settings.executionTimeoutMs = value;
		await this.plugin.saveSettings();
	}

	private async saveExecutionTimeoutsEnabled(value: unknown): Promise<void> {
		if (typeof value !== 'boolean') {
			return;
		}

		this.plugin.settings.executionTimeoutsEnabled = value;
		await this.plugin.saveSettings();
		this.onSettingsChanged();
	}
}

function isRuntimeControlKey(key: string): key is RuntimeControlKey {
	return key === AUTO_ALLOW_LOW_RISK_PERMISSIONS_KEY || key === 'debugBlocksEnabled' || key === 'executionTimeoutMs' || key === 'executionTimeoutsEnabled';
}
