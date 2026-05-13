import type { App } from 'obsidian';
import { Notice, PluginSettingTab, Setting } from 'obsidian';
import type SafeJsPlugin from 'packages/obsidian/src/main';
import type { PermissionApproval, PermissionSettingsStore } from 'packages/obsidian/src/permissions/approval-store';
import { LocalStoragePermissionApprovalStore, LocalStoragePermissionSettingsStore } from 'packages/obsidian/src/permissions/approval-store';
import type { ScriptStorageEntry } from 'packages/obsidian/src/storage/script-storage';
import { ScriptStorageManager } from 'packages/obsidian/src/storage/script-storage';

export interface SafeJsSettings {
	executionTimeoutsEnabled: boolean;
	executionTimeoutMs: number;
	debugBlocksEnabled: boolean;
}

export const DEFAULT_SETTINGS: SafeJsSettings = {
	executionTimeoutsEnabled: true,
	executionTimeoutMs: 5000,
	debugBlocksEnabled: true,
};

export class SafeJsSettingTab extends PluginSettingTab {
	plugin: SafeJsPlugin;
	private readonly approvalStore = new LocalStoragePermissionApprovalStore();
	private readonly permissionSettingsStore: PermissionSettingsStore;
	private readonly staleEntryAgeMs = 30 * 24 * 60 * 60 * 1000;

	constructor(app: App, plugin: SafeJsPlugin, permissionSettingsStore: PermissionSettingsStore = new LocalStoragePermissionSettingsStore()) {
		super(app, plugin);
		this.plugin = plugin;
		this.permissionSettingsStore = permissionSettingsStore;
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

		this.renderApprovalStorage(containerEl);
		this.renderScriptStorage(containerEl);
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
			item.createSpan({ text: ` - ${approval.permissions.join(', ')} - ${formatDate(approval.updatedAt)}` });
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

function formatScope(scope: string | null): string {
	return scope === null ? 'global' : `scoped ${scope.slice(0, 12)}`;
}
