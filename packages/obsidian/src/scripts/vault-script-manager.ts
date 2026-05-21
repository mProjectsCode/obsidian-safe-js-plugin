import type { TFile } from 'obsidian';
import { Notice } from 'obsidian';
import type { SafeJsExecutionService } from 'packages/obsidian/src/execution/execution-service';
import type SafeJsPlugin from 'packages/obsidian/src/main';
import { SafeJsOutputFormatter } from 'packages/obsidian/src/output/output-format';
import { SafeJsOutputModal } from 'packages/obsidian/src/output/rendered-output';
import { validateVaultPath } from 'packages/obsidian/src/rpc/rpc-common';
import type { SafeJsScriptConfig } from 'packages/obsidian/src/scripts/script-settings';
import { isJavaScriptVaultScriptPath } from 'packages/obsidian/src/scripts/script-settings';

type ScriptRunMode = 'manual' | 'startup';

export class VaultScriptManager {
	private readonly executionService: SafeJsExecutionService;
	private readonly plugin: SafeJsPlugin;
	private readonly registeredCommandIds = new Set<string>();
	private unloaded = false;

	constructor(plugin: SafeJsPlugin, executionService: SafeJsExecutionService) {
		this.plugin = plugin;
		this.executionService = executionService;
	}

	registerCommands(): void {
		this.removeCommands();

		for (const script of this.plugin.settings.scripts) {
			const commandId = `run-script-${script.id}`;
			this.plugin.addCommand({
				id: commandId,
				name: `Run script: ${script.name}`,
				callback: () => {
					void this.runScript(script, 'manual');
				},
			});
			this.registeredCommandIds.add(commandId);
		}
	}

	reloadCommands(): void {
		if (this.unloaded) {
			return;
		}

		this.registerCommands();
	}

	unload(): void {
		this.unloaded = true;
		this.removeCommands();
	}

	async runStartupScripts(): Promise<void> {
		for (const script of this.plugin.settings.scripts.filter(script => script.runOnStartup)) {
			if (this.unloaded) {
				return;
			}

			await this.runScript(script, 'startup');
		}
	}

	async runScript(script: SafeJsScriptConfig, mode: ScriptRunMode): Promise<void> {
		try {
			const file = this.requireScriptFile(script);
			const code = await this.plugin.app.vault.cachedRead(file);
			const result = await this.executionService.execute(code, {
				approvalMode: mode === 'startup' ? 'skip-missing' : 'prompt',
				source: {
					path: file.path,
				},
			});

			if (mode === 'startup') {
				if (result.status === 'success') {
					return;
				}

				this.handleStartupResult(script, result.status, result.message);
				return;
			}

			if (result.status !== 'success') {
				new Notice(`Safe JS ${result.status}: ${result.message}`);
				return;
			}

			const output = SafeJsOutputFormatter.fromExecutionResult(result);
			if (!SafeJsOutputFormatter.hasVisibleContent(output)) {
				new Notice(`Ran Safe JS script: ${script.name}`);
				return;
			}

			new SafeJsOutputModal(this.plugin.app, script.name, output, file.path).open();
		} catch (error) {
			new Notice(`Safe JS script failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private handleStartupResult(script: SafeJsScriptConfig, status: string, message: string): void {
		if (status === 'permission-denied') {
			new Notice(`Skipped startup script "${script.name}". Run it manually to approve permissions.`);
			return;
		}

		new Notice(`Startup script "${script.name}" failed: ${message}`);
	}

	private requireScriptFile(script: SafeJsScriptConfig): TFile {
		const path = validateVaultPath(script.path, {
			configDir: this.plugin.app.vault.configDir,
			label: 'Script path',
		});

		if (!isJavaScriptVaultScriptPath(path)) {
			throw new Error('Script path must point to a .js file.');
		}

		const file = this.plugin.app.vault.getFileByPath(path);
		if (file === null) {
			throw new Error(`Script file not found: ${path}`);
		}

		if (file.extension.toLowerCase() !== 'js') {
			throw new Error('Script path must point to a .js file.');
		}

		return file;
	}

	private removeCommands(): void {
		for (const commandId of this.registeredCommandIds) {
			this.plugin.removeCommand(commandId);
		}
		this.registeredCommandIds.clear();
	}
}
