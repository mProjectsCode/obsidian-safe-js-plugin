import { MarkdownRenderChild } from 'obsidian';
import type { SafeJsExecutionService } from 'packages/obsidian/src/execution/execution-service';
import type SafeJsPlugin from 'packages/obsidian/src/main';
import { SafeJsOutputFormatter } from 'packages/obsidian/src/output/output-format';
import { SafeJsOutputRenderer } from 'packages/obsidian/src/output/rendered-output';

export function registerSafeJsMarkdownProcessors(plugin: SafeJsPlugin, executionService: SafeJsExecutionService): void {
	plugin.registerMarkdownCodeBlockProcessor('safe-js', (source, element, context) => {
		context.addChild(new SafeJsBlockExecutionChild(plugin, executionService, source, element, context.sourcePath, false));
	});
	plugin.registerMarkdownCodeBlockProcessor('safe-js-debug', (source, element, context) => {
		context.addChild(new SafeJsBlockExecutionChild(plugin, executionService, source, element, context.sourcePath, true));
	});
}

class SafeJsBlockExecutionChild extends MarkdownRenderChild {
	private readonly abortController = new AbortController();
	private readonly debug: boolean;
	private readonly executionService: SafeJsExecutionService;
	private readonly plugin: SafeJsPlugin;
	private readonly source: string;
	private readonly sourcePath: string;

	constructor(plugin: SafeJsPlugin, executionService: SafeJsExecutionService, source: string, containerEl: HTMLElement, sourcePath: string, debug: boolean) {
		super(containerEl);
		this.plugin = plugin;
		this.executionService = executionService;
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

		const result = await this.executionService.execute(this.source, {
			debug: this.debug,
			signal: this.abortController.signal,
			source: {
				path: this.sourcePath,
			},
		});

		if (this.abortController.signal.aborted) {
			return;
		}

		await new SafeJsOutputRenderer(this.plugin.app).render(
			SafeJsOutputFormatter.fromExecutionResult(result, this.debug),
			this.containerEl,
			this.sourcePath,
			this,
		);
	}
}
