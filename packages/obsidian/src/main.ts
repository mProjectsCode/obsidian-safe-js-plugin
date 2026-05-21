import { Plugin } from 'obsidian';
import { SafeJsExecutionService } from 'packages/obsidian/src/execution/execution-service';
import { BrowserWorkerFactory } from 'packages/obsidian/src/execution/worker-client';
import { registerSafeJsMarkdownProcessors } from 'packages/obsidian/src/markdown';
import {
	AppPermissionStorage,
	LocalStoragePermissionApprovalStore,
	LocalStoragePermissionSettingsStore,
} from 'packages/obsidian/src/permissions/approval-store';
import type { SafeJsPublicApi } from 'packages/obsidian/src/public-api/safe-js-public-api';
import { DefaultSafeJsPublicApi } from 'packages/obsidian/src/public-api/safe-js-public-api';
import { createSafeJsRpcRegistry } from 'packages/obsidian/src/rpc/safe-js-rpc';
import { VaultScriptManager } from 'packages/obsidian/src/scripts/vault-script-manager';
import type { SafeJsSettings } from 'packages/obsidian/src/settings';
import { normalizeSafeJsSettings, SafeJsSettingTab } from 'packages/obsidian/src/settings';
import { SAFE_JS_DOCS_VIEW_TYPE, SafeJsDocsView } from 'packages/obsidian/src/ui/docs-view';
import { ObsidianPermissionPrompt } from 'packages/obsidian/src/ui/permission-modal';

export default class SafeJsPlugin extends Plugin {
	api!: SafeJsPublicApi;
	private executionService!: SafeJsExecutionService;
	private scriptManager!: VaultScriptManager;
	settings!: SafeJsSettings;

	async onload(): Promise<void> {
		await this.loadSettings();
		const rpcRegistry = createSafeJsRpcRegistry(this.app);
		const permissionStorage = new AppPermissionStorage(this.app);
		const permissionSettingsStore = new LocalStoragePermissionSettingsStore(permissionStorage);
		this.executionService = new SafeJsExecutionService({
			rpcRegistry,
			approvalStore: new LocalStoragePermissionApprovalStore(permissionStorage),
			permissionPrompt: new ObsidianPermissionPrompt(this.app, rpcRegistry),
			workerFactory: new BrowserWorkerFactory(),
			getDefaultTimeoutMs: (): number | null => (this.settings.executionTimeoutsEnabled ? this.settings.executionTimeoutMs : null),
			getAutoAllowLowRiskPermissions: (): boolean => permissionSettingsStore.loadAutoAllowLowRiskPermissions(),
		});
		this.api = new DefaultSafeJsPublicApi({
			executionService: this.executionService,
			rpcRegistry,
		});
		this.scriptManager = new VaultScriptManager(this, this.executionService);

		this.addSettingTab(new SafeJsSettingTab(this.app, this, permissionSettingsStore, this.scriptManager));
		this.registerView(SAFE_JS_DOCS_VIEW_TYPE, leaf => new SafeJsDocsView(leaf, rpcRegistry));
		this.addCommand({
			id: 'open-api-docs',
			name: 'Open API docs',
			callback: () => {
				void this.openDocsView();
			},
		});
		this.scriptManager.registerCommands();
		this.app.workspace.onLayoutReady(() => {
			void this.scriptManager.runStartupScripts();
		});
		registerSafeJsMarkdownProcessors(this, this.executionService);
	}

	onunload(): void {
		this.scriptManager.unload();
		this.executionService.cancelAll();
	}

	async loadSettings(): Promise<void> {
		this.settings = normalizeSafeJsSettings(await this.loadData());
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
