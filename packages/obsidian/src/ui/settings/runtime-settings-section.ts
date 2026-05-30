import type { SettingDefinitionControl, SettingDefinitionItem } from 'obsidian';
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
					this.createExecutionTimeoutsSetting(),
					this.createExecutionTimeoutSetting(),
					this.createDebugBlocksSetting(),
					this.createAutoAllowLowRiskPermissionsSetting(),
				],
			},
		];
	}

	getControlValue(key: string): unknown {
		switch (key) {
			case AUTO_ALLOW_LOW_RISK_PERMISSIONS_KEY:
				return this.permissionSettingsStore.loadAutoAllowLowRiskPermissions();
			case 'debugBlocksEnabled':
			case 'executionTimeoutMs':
			case 'executionTimeoutsEnabled':
				return this.plugin.settings[key];
			default:
				return undefined;
		}
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		switch (key) {
			case AUTO_ALLOW_LOW_RISK_PERMISSIONS_KEY:
				this.permissionSettingsStore.saveAutoAllowLowRiskPermissions(value === true);
				return;
			case 'debugBlocksEnabled':
			case 'executionTimeoutsEnabled':
				await this.saveBooleanSetting(key, value);
				return;
			case 'executionTimeoutMs':
				await this.saveExecutionTimeoutMs(value);
				return;
			default:
				return;
		}
	}

	private createAutoAllowLowRiskPermissionsSetting(): SettingDefinitionControl<RuntimeControlKey> {
		return {
			name: 'Auto-allow low-risk permissions',
			desc: 'Allow low-risk permissions without prompting. Approvals are still remembered per script hash on this device.',
			control: { type: 'toggle', key: AUTO_ALLOW_LOW_RISK_PERMISSIONS_KEY },
		};
	}

	private createDebugBlocksSetting(): SettingDefinitionControl<RuntimeControlKey> {
		return {
			name: 'Debug blocks',
			desc: 'Enable support for the safe-js-debug code block language.',
			control: { type: 'toggle', key: 'debugBlocksEnabled' },
		};
	}

	private createExecutionTimeoutSetting(): SettingDefinitionControl<RuntimeControlKey> {
		return {
			name: 'Execution timeout',
			desc: this.executionTimeoutDescription(),
			control: {
				type: 'number',
				key: 'executionTimeoutMs',
				min: 1,
				placeholder: String(DEFAULT_SETTINGS.executionTimeoutMs),
				validate: value => (this.isValidTimeoutMs(value) ? undefined : 'Enter a positive timeout in milliseconds.'),
			},
		};
	}

	private createExecutionTimeoutsSetting(): SettingDefinitionControl<RuntimeControlKey> {
		return {
			name: 'Execution timeouts',
			desc: 'Cancel scripts that run longer than the configured timeout.',
			control: { type: 'toggle', key: 'executionTimeoutsEnabled' },
		};
	}

	private executionTimeoutDescription(): string {
		return this.plugin.settings.executionTimeoutsEnabled
			? 'Maximum time a worker-backed script may run before it is cancelled.'
			: 'Timeouts are disabled. This value is kept for later use.';
	}

	private isValidTimeoutMs(value: number): boolean {
		return Number.isFinite(value) && value > 0;
	}

	private async saveBooleanSetting(key: 'debugBlocksEnabled' | 'executionTimeoutsEnabled', value: unknown): Promise<void> {
		if (typeof value !== 'boolean') {
			return;
		}

		this.plugin.settings[key] = value;
		await this.plugin.saveSettings();
		if (key === 'executionTimeoutsEnabled') {
			this.onSettingsChanged();
		}
	}

	private async saveExecutionTimeoutMs(value: unknown): Promise<void> {
		if (typeof value !== 'number' || !this.isValidTimeoutMs(value)) {
			return;
		}

		this.plugin.settings.executionTimeoutMs = value;
		await this.plugin.saveSettings();
	}
}
