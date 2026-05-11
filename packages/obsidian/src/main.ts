import { Plugin } from 'obsidian';
import { SafeJsExecutionService } from 'packages/obsidian/src/execution/execution-service';
import { BrowserWorkerFactory } from 'packages/obsidian/src/execution/worker-client';
import { registerSafeJsMarkdownProcessors } from 'packages/obsidian/src/markdown';
import { LocalStoragePermissionApprovalStore } from 'packages/obsidian/src/permissions/approval-store';
import { createVaultReadRegistry } from 'packages/obsidian/src/rpc/vault-rpc';
import type { SafeJsSettings } from 'packages/obsidian/src/settings';
import { DEFAULT_SETTINGS, SafeJsSettingTab } from 'packages/obsidian/src/settings';
import { ObsidianPermissionPrompt } from 'packages/obsidian/src/ui/permission-modal';

export default class SafeJsPlugin extends Plugin {
	api!: SafeJsExecutionService;
	settings!: SafeJsSettings;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.api = new SafeJsExecutionService({
			rpcRegistry: createVaultReadRegistry(this.app),
			approvalStore: new LocalStoragePermissionApprovalStore(),
			permissionPrompt: new ObsidianPermissionPrompt(this.app),
			workerFactory: new BrowserWorkerFactory(),
			getDefaultTimeoutMs: (): number => this.settings.executionTimeoutMs,
		});

		this.addSettingTab(new SafeJsSettingTab(this.app, this));
		registerSafeJsMarkdownProcessors(this);
	}

	onunload(): void {
		this.api.cancelAll();
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<SafeJsSettings>);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
