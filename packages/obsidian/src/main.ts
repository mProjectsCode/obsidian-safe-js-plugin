import { Plugin } from 'obsidian';
import { SafeJsExecutionService } from 'packages/obsidian/src/execution/execution-service';
import { BrowserWorkerFactory } from 'packages/obsidian/src/execution/worker-client';
import { registerSafeJsMarkdownProcessors } from 'packages/obsidian/src/markdown';
import { LocalStoragePermissionApprovalStore, LocalStoragePermissionSettingsStore } from 'packages/obsidian/src/permissions/approval-store';
import { createSafeJsRpcRegistry } from 'packages/obsidian/src/rpc/safe-js-rpc';
import type { SafeJsSettings } from 'packages/obsidian/src/settings';
import { DEFAULT_SETTINGS, SafeJsSettingTab } from 'packages/obsidian/src/settings';
import { SAFE_JS_DOCS_VIEW_TYPE, SafeJsDocsView } from 'packages/obsidian/src/ui/docs-view';
import { ObsidianPermissionPrompt } from 'packages/obsidian/src/ui/permission-modal';

export default class SafeJsPlugin extends Plugin {
	api!: SafeJsExecutionService;
	settings!: SafeJsSettings;

	async onload(): Promise<void> {
		await this.loadSettings();
		const rpcRegistry = createSafeJsRpcRegistry(this.app);
		const permissionSettingsStore = new LocalStoragePermissionSettingsStore();
		this.api = new SafeJsExecutionService({
			rpcRegistry,
			approvalStore: new LocalStoragePermissionApprovalStore(),
			permissionPrompt: new ObsidianPermissionPrompt(this.app, rpcRegistry),
			workerFactory: new BrowserWorkerFactory(),
			getDefaultTimeoutMs: (): number | null => (this.settings.executionTimeoutsEnabled ? this.settings.executionTimeoutMs : null),
			getAutoAllowLowRiskPermissions: (): boolean => permissionSettingsStore.loadAutoAllowLowRiskPermissions(),
		});

		this.addSettingTab(new SafeJsSettingTab(this.app, this, permissionSettingsStore));
		this.registerView(SAFE_JS_DOCS_VIEW_TYPE, leaf => new SafeJsDocsView(leaf, rpcRegistry));
		this.addCommand({
			id: 'open-api-docs',
			name: 'Open API docs',
			callback: () => {
				void this.openDocsView();
			},
		});
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

	private async openDocsView(): Promise<void> {
		const existingLeaves = this.app.workspace.getLeavesOfType(SAFE_JS_DOCS_VIEW_TYPE);
		const leaf = existingLeaves[0] ?? this.app.workspace.getLeaf('tab');
		await leaf.setViewState({ type: SAFE_JS_DOCS_VIEW_TYPE, active: true });
		await this.app.workspace.revealLeaf(leaf);
	}
}
