import type { MarkdownPostProcessorContext } from 'obsidian';
import type { SafeJsExecutionResult } from 'packages/obsidian/src/execution/contracts';
import type SafeJsPlugin from 'packages/obsidian/src/main';

export function registerSafeJsMarkdownProcessors(plugin: SafeJsPlugin): void {
	plugin.registerMarkdownCodeBlockProcessor('safe-js', (source, element, context) => {
		void renderSafeJsBlock(plugin, source, element, context, false);
	});
	plugin.registerMarkdownCodeBlockProcessor('safe-js-debug', (source, element, context) => {
		void renderSafeJsBlock(plugin, source, element, context, true);
	});
}

async function renderSafeJsBlock(
	plugin: SafeJsPlugin,
	source: string,
	element: HTMLElement,
	context: MarkdownPostProcessorContext,
	debug: boolean,
): Promise<void> {
	element.empty();
	const outputElement = element.createEl('pre');

	if (debug && !plugin.settings.debugBlocksEnabled) {
		outputElement.setText('Debug blocks are disabled in settings.');
		return;
	}

	outputElement.setText('Running safe js...');

	const result = await plugin.api.execute(source, {
		debug,
		source: {
			path: context.sourcePath,
		},
	});

	if (debug) {
		outputElement.setText(formatDebugResult(result));
		return;
	}

	outputElement.setText(formatUserResult(result));
}

function formatUserResult(result: SafeJsExecutionResult): string {
	if (result.status === 'success') {
		return formatValue(result.value);
	}

	return `Safe JS ${result.status}: ${result.message}`;
}

function formatDebugResult(result: SafeJsExecutionResult): string {
	const lines = [
		`status: ${result.status}`,
		`codeHash: ${result.codeHash}`,
		`permissions: ${result.permissions.length === 0 ? '(none)' : result.permissions.join(', ')}`,
		`elapsedMs: ${result.elapsedMs}`,
	];

	if (result.status === 'success') {
		lines.push('value:', formatValue(result.value));
	} else {
		lines.push(`message: ${result.message}`);
	}

	return lines.join('\n');
}

function formatValue(value: unknown): string {
	if (typeof value === 'string') {
		return value;
	}

	return JSON.stringify(value, null, 2);
}
