import type { App } from 'obsidian';
import { Notice, PluginSettingTab, Setting } from 'obsidian';
import type SafeJsPlugin from 'packages/obsidian/src/main';
import type { PermissionApproval, PermissionSettingsStore } from 'packages/obsidian/src/permissions/approval-store';
import {
	AppPermissionStorage,
	LocalStoragePermissionApprovalStore,
	LocalStoragePermissionSettingsStore,
} from 'packages/obsidian/src/permissions/approval-store';
import type { SafeJsScriptConfig } from 'packages/obsidian/src/scripts/script-settings';
import { createScriptConfig, isJavaScriptVaultScriptPath, normalizeSafeJsScripts } from 'packages/obsidian/src/scripts/script-settings';
import type { VaultScriptManager } from 'packages/obsidian/src/scripts/vault-script-manager';
import type { ScriptStorageEntry } from 'packages/obsidian/src/storage/script-storage';
import { ScriptStorageManager } from 'packages/obsidian/src/storage/script-storage';

export interface SafeJsSettings {
	executionTimeoutsEnabled: boolean;
	executionTimeoutMs: number;
	debugBlocksEnabled: boolean;
	scripts: SafeJsScriptConfig[];
}

export const DEFAULT_SETTINGS: SafeJsSettings = {
	executionTimeoutsEnabled: true,
	executionTimeoutMs: 5000,
	debugBlocksEnabled: true,
	scripts: [],
};

export class SafeJsSettingTab extends PluginSettingTab {
	plugin: SafeJsPlugin;
	private readonly approvalStore: LocalStoragePermissionApprovalStore;
	private readonly permissionSettingsStore: PermissionSettingsStore;
	private readonly scriptManager?: VaultScriptManager;
	private readonly staleEntryAgeMs = 30 * 24 * 60 * 60 * 1000;

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

		new Setting(containerEl)
			.setName('Execution timeouts')
			.setDesc('Cancel scripts that run longer than the configured timeout.')
			.addToggle(toggle =>
				toggle.setValue(this.plugin.settings.executionTimeoutsEnabled).onChange(async value => {
					this.plugin.settings.executionTimeoutsEnabled = value;
					await this.plugin.saveSettings();
					this.display();
				}),
			);

		new Setting(containerEl)
			.setName('Execution timeout')
			.setDesc(
				this.plugin.settings.executionTimeoutsEnabled
					? 'Maximum time a worker-backed script may run before it is cancelled.'
					: 'Timeouts are disabled. This value is kept for later use.',
			)
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

		new Setting(containerEl)
			.setName('Auto-allow low-risk permissions')
			.setDesc('Allow low-risk permissions without prompting. Approvals are still remembered per script hash on this device.')
			.addToggle(toggle =>
				toggle.setValue(this.permissionSettingsStore.loadAutoAllowLowRiskPermissions()).onChange(value => {
					this.permissionSettingsStore.saveAutoAllowLowRiskPermissions(value);
				}),
			);

		this.renderVaultScripts(containerEl);
		this.renderApprovalStorage(containerEl);
		this.renderScriptStorage(containerEl);
	}

	private renderVaultScripts(containerEl: HTMLElement): void {
		const section = containerEl.createEl('section');
		new Setting(section).setName('Vault scripts').setHeading();
		section.createEl('p', {
			text: `${this.plugin.settings.scripts.length} vault ${this.plugin.settings.scripts.length === 1 ? 'script is' : 'scripts are'} configured.`,
		});

		for (const script of this.plugin.settings.scripts) {
			this.renderVaultScript(section, script);
		}

		this.renderAddVaultScript(section);
	}

	private renderVaultScript(section: HTMLElement, script: SafeJsScriptConfig): void {
		new Setting(section)
			.setName(script.name)
			.setDesc(script.path)
			.addText(text =>
				text
					.setPlaceholder('Script name')
					.setValue(script.name)
					.onChange(async value => {
						script.name = value.trim() || script.path;
						await this.saveScriptSettings();
					}),
			)
			.addText(text =>
				text
					.setPlaceholder('Scripts/example.js')
					.setValue(script.path)
					.onChange(async value => {
						script.path = value.trim();
						await this.saveScriptSettings();
					}),
			)
			.addToggle(toggle =>
				toggle
					.setTooltip('Run on startup')
					.setValue(script.runOnStartup)
					.onChange(async value => {
						script.runOnStartup = value;
						await this.saveScriptSettings();
					}),
			)
			.addButton(button =>
				button.setButtonText('Remove').onClick(async () => {
					this.plugin.settings.scripts = this.plugin.settings.scripts.filter(candidate => candidate.id !== script.id);
					await this.saveScriptSettings();
					this.display();
				}),
			);
	}

	private renderAddVaultScript(section: HTMLElement): void {
		let path = '';
		let name = '';

		new Setting(section)
			.setName('Add script')
			.setDesc('Configure a vault .js file as a command.')
			.addText(text =>
				text.setPlaceholder('Scripts/example.js').onChange(value => {
					path = value;
				}),
			)
			.addText(text =>
				text.setPlaceholder('Command name').onChange(value => {
					name = value;
				}),
			)
			.addButton(button =>
				button.setButtonText('Add').onClick(async () => {
					const normalizedPath = path.trim();
					if (normalizedPath === '' || !isJavaScriptVaultScriptPath(normalizedPath)) {
						new Notice('Enter a vault path ending in .js.');
						return;
					}

					if (this.plugin.settings.scripts.some(script => script.path === normalizedPath)) {
						new Notice('That script is already configured.');
						return;
					}

					this.plugin.settings.scripts = [...this.plugin.settings.scripts, createScriptConfig(normalizedPath, name, this.plugin.settings.scripts)];
					await this.saveScriptSettings();
					this.display();
				}),
			);
	}

	private async saveScriptSettings(): Promise<void> {
		await this.plugin.saveSettings();
		this.scriptManager?.reloadCommands();
	}

	private renderApprovalStorage(containerEl: HTMLElement): void {
		const approvals = this.approvalStore.list();
		const section = containerEl.createEl('section');
		new Setting(section).setName('Approved script hashes').setHeading();
		section.createEl('p', {
			text: `${approvals.length} approved script ${approvals.length === 1 ? 'hash' : 'hashes'} are stored on this device.`,
		});

		new Setting(section)
			.setName('Clear approved hashes')
			.setDesc('Remove remembered permission approvals for changed or old scripts.')
			.addButton(button =>
				button.setButtonText('Clear older than 30 days').onClick(() => {
					const deletedCount = this.approvalStore.deleteOlderThan(Date.now() - this.staleEntryAgeMs);
					new Notice(`Cleared ${deletedCount} approved script ${deletedCount === 1 ? 'hash' : 'hashes'}.`);
					this.display();
				}),
			)
			.addButton(button =>
				button.setButtonText('Clear all').onClick(() => {
					const deletedCount = this.approvalStore.deleteAll();
					new Notice(`Cleared ${deletedCount} approved script ${deletedCount === 1 ? 'hash' : 'hashes'}.`);
					this.display();
				}),
			);

		this.renderApprovalList(section, approvals);
	}

	private renderApprovalList(section: HTMLElement, approvals: PermissionApproval[]): void {
		if (approvals.length === 0) {
			section.createEl('p', { text: 'No approved script hashes are stored.' });
			return;
		}

		const list = section.createEl('ul');
		for (const approval of approvals.slice(0, 20)) {
			const item = list.createEl('li');
			item.createEl('code', { text: approval.codeHash });
			item.createSpan({
				text: ` - ${formatCaller(approval.callerPluginId)} - ${approval.permissions.join(', ')} - ${formatDate(approval.updatedAt)}`,
			});
		}

		if (approvals.length > 20) {
			section.createEl('p', { text: `${approvals.length - 20} more approved hashes are hidden.` });
		}
	}

	private renderScriptStorage(containerEl: HTMLElement): void {
		const entries = ScriptStorageManager.listAll(this.app);
		const section = containerEl.createEl('section');
		new Setting(section).setName('Script storage').setHeading();
		section.createEl('p', {
			text: `${entries.length} Safe JS storage ${entries.length === 1 ? 'key is' : 'keys are'} indexed on this device.`,
		});

		new Setting(section)
			.setName('Clear script storage')
			.setDesc('Remove data written through the storage API by scripts.')
			.addButton(button =>
				button.setButtonText('Clear older than 30 days').onClick(() => {
					const deletedCount = ScriptStorageManager.deleteOlderThanAll(this.app, Date.now() - this.staleEntryAgeMs);
					new Notice(`Cleared ${deletedCount} script storage ${deletedCount === 1 ? 'key' : 'keys'}.`);
					this.display();
				}),
			)
			.addButton(button =>
				button.setButtonText('Clear all').onClick(() => {
					const deletedCount = ScriptStorageManager.deleteAllKnown(this.app);
					new Notice(`Cleared ${deletedCount} script storage ${deletedCount === 1 ? 'key' : 'keys'}.`);
					this.display();
				}),
			);

		this.renderScriptStorageList(section, entries);
	}

	private renderScriptStorageList(section: HTMLElement, entries: ScriptStorageEntry[]): void {
		if (entries.length === 0) {
			section.createEl('p', { text: 'No indexed script storage keys are stored.' });
			return;
		}

		const list = section.createEl('ul');
		for (const entry of entries.slice(0, 20)) {
			const item = list.createEl('li');
			item.createEl('code', { text: entry.key });
			item.createSpan({ text: ` - ${formatScope(entry.scope)} - ${formatBytes(entry.sizeBytes)} - ${formatDate(entry.updatedAt)}` });
		}

		if (entries.length > 20) {
			section.createEl('p', { text: `${entries.length - 20} more storage keys are hidden.` });
		}
	}
}

function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleString();
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}

	return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatCaller(callerPluginId: string | undefined): string {
	return callerPluginId ?? 'notes';
}

function formatScope(scope: string | null): string {
	return scope === null ? 'global' : `scoped ${scope.slice(0, 12)}`;
}

export function normalizeSafeJsSettings(value: unknown): SafeJsSettings {
	const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
	const executionTimeoutMs =
		typeof record.executionTimeoutMs === 'number' && Number.isFinite(record.executionTimeoutMs) && record.executionTimeoutMs > 0
			? record.executionTimeoutMs
			: DEFAULT_SETTINGS.executionTimeoutMs;

	return {
		executionTimeoutsEnabled:
			typeof record.executionTimeoutsEnabled === 'boolean' ? record.executionTimeoutsEnabled : DEFAULT_SETTINGS.executionTimeoutsEnabled,
		executionTimeoutMs,
		debugBlocksEnabled: typeof record.debugBlocksEnabled === 'boolean' ? record.debugBlocksEnabled : DEFAULT_SETTINGS.debugBlocksEnabled,
		scripts: normalizeSafeJsScripts(record.scripts),
	};
}
