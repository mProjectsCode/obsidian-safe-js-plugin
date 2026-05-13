import { MarkdownRenderChild } from 'obsidian';
import type { SafeJsExecutionResult } from 'packages/obsidian/src/execution/contracts';
import type SafeJsPlugin from 'packages/obsidian/src/main';

export function registerSafeJsMarkdownProcessors(plugin: SafeJsPlugin): void {
	plugin.registerMarkdownCodeBlockProcessor('safe-js', (source, element, context) => {
		context.addChild(new SafeJsBlockExecutionChild(plugin, source, element, context.sourcePath, false));
	});
	plugin.registerMarkdownCodeBlockProcessor('safe-js-debug', (source, element, context) => {
		context.addChild(new SafeJsBlockExecutionChild(plugin, source, element, context.sourcePath, true));
	});
}

class SafeJsBlockExecutionChild extends MarkdownRenderChild {
	private readonly abortController = new AbortController();
	private readonly debug: boolean;
	private readonly plugin: SafeJsPlugin;
	private readonly source: string;
	private readonly sourcePath: string;

	constructor(plugin: SafeJsPlugin, source: string, containerEl: HTMLElement, sourcePath: string, debug: boolean) {
		super(containerEl);
		this.plugin = plugin;
		this.source = source;
		this.sourcePath = sourcePath;
		this.debug = debug;
	}

	override onload(): void {
		void this.render();
	}

	override onunload(): void {
		this.abortController.abort();
	}

	private async render(): Promise<void> {
		this.containerEl.empty();
		const outputElement = this.containerEl.createEl('pre');

		if (this.debug && !this.plugin.settings.debugBlocksEnabled) {
			outputElement.setText('Debug blocks are disabled in settings.');
			return;
		}

		outputElement.setText('Running safe js...');

		const result = await this.plugin.api.execute(this.source, {
			debug: this.debug,
			signal: this.abortController.signal,
			source: {
				path: this.sourcePath,
			},
		});

		if (this.abortController.signal.aborted) {
			return;
		}

		outputElement.setText(this.debug ? this.formatDebugResult(result) : this.formatUserResult(result));
	}

	private formatUserResult(result: SafeJsExecutionResult): string {
		if (result.status === 'success') {
			return this.formatValue(result.value);
		}

		return `Safe JS ${result.status}: ${result.message}`;
	}

	private formatDebugResult(result: SafeJsExecutionResult): string {
		const lines = [
			`status: ${result.status}`,
			`codeHash: ${result.codeHash}`,
			`permissions: ${result.permissions.length === 0 ? '(none)' : result.permissions.join(', ')}`,
			`elapsedMs: ${result.elapsedMs}`,
		];

		if (result.status === 'success') {
			lines.push('value:', this.formatValue(result.value));
		} else {
			lines.push(`message: ${result.message}`);
		}

		return lines.join('\n');
	}

	private formatValue(value: unknown): string {
		if (typeof value === 'string') {
			return value;
		}

		return JSON.stringify(value, null, 2);
	}
}
