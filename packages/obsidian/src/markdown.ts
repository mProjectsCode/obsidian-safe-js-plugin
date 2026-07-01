import { MarkdownRenderChild } from 'obsidian';
import type { SafeJsExecutionService } from 'packages/obsidian/src/execution/execution-service';
import type SafeJsPlugin from 'packages/obsidian/src/main';
import { SafeJsOutputFormatter } from 'packages/obsidian/src/output/output-format';
import { SafeJsOutputRenderer } from 'packages/obsidian/src/output/rendered-output';

type MarkdownExecutionMode = 'script' | 'debug' | 'expression';

const SCRIPT_BLOCK_LANGUAGE = 'safe-js';
const DEBUG_BLOCK_LANGUAGE = 'safe-js-debug';
const EXPRESSION_BLOCK_LANGUAGE = 'safe-js-expression';

export function registerSafeJsMarkdownProcessors(plugin: SafeJsPlugin, executionService: SafeJsExecutionService): void {
	plugin.registerMarkdownCodeBlockProcessor(SCRIPT_BLOCK_LANGUAGE, (source, element, context) => {
		context.addChild(new SafeJsBlockExecutionChild(plugin, executionService, source, element, context.sourcePath, 'script'));
	});
	plugin.registerMarkdownCodeBlockProcessor(DEBUG_BLOCK_LANGUAGE, (source, element, context) => {
		context.addChild(new SafeJsBlockExecutionChild(plugin, executionService, source, element, context.sourcePath, 'debug'));
	});
	plugin.registerMarkdownCodeBlockProcessor(EXPRESSION_BLOCK_LANGUAGE, (source, element, context) => {
		context.addChild(new SafeJsBlockExecutionChild(plugin, executionService, source, element, context.sourcePath, 'expression'));
	});
}

class SafeJsBlockExecutionChild extends MarkdownRenderChild {
	private readonly abortController = new AbortController();
	private readonly executionService: SafeJsExecutionService;
	private readonly mode: MarkdownExecutionMode;
	private readonly plugin: SafeJsPlugin;
	private readonly source: string;
	private readonly sourcePath: string;

	constructor(
		plugin: SafeJsPlugin,
		executionService: SafeJsExecutionService,
		source: string,
		containerEl: HTMLElement,
		sourcePath: string,
		mode: MarkdownExecutionMode,
	) {
		super(containerEl);
		this.plugin = plugin;
		this.executionService = executionService;
		this.source = source;
		this.sourcePath = sourcePath;
		this.mode = mode;
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

		if (this.mode === 'debug' && !this.plugin.settings.debugBlocksEnabled) {
			outputElement.setText('Debug blocks are disabled in settings.');
			return;
		}

		outputElement.setText('Running safe js...');

		const commonOptions = {
			debug: this.mode === 'debug',
			signal: this.abortController.signal,
			source: { path: this.sourcePath },
		};
		const result =
			this.mode === 'expression'
				? await this.executionService.executeExpression(this.source, {
						...commonOptions,
						permissions: this.executionService.getExpressionBlockPermissions(),
					})
				: await this.executionService.execute(this.source, commonOptions);

		if (this.abortController.signal.aborted) {
			return;
		}

		await new SafeJsOutputRenderer(this.plugin.app).render(
			SafeJsOutputFormatter.fromExecutionResult(result, this.mode === 'debug'),
			this.containerEl,
			this.sourcePath,
			this,
		);
	}
}
