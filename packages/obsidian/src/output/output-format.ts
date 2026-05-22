import type { JsonValue, SafeJsExecutionResult, SafeJsRenderedOutput } from '@lemons_dev/obsidian-safe-js-api';
import { RICH_OUTPUT_PERMISSION } from 'packages/obsidian/src/permissions/permissions';

export type { SafeJsRenderedOutput } from '@lemons_dev/obsidian-safe-js-api';

export class SafeJsOutputFormatter {
	static fromExecutionResult(result: SafeJsExecutionResult, debug: boolean = false): SafeJsRenderedOutput {
		if (debug) {
			return {
				format: 'text',
				content: this.formatDebugResult(result),
			};
		}

		if (result.status === 'success') {
			return this.fromValue(result.value, { allowRichOutput: result.permissions.includes(RICH_OUTPUT_PERMISSION) });
		}

		return {
			format: 'text',
			content: `Safe JS ${result.status}: ${result.message}`,
		};
	}

	static fromValue(value: JsonValue, options: { allowRichOutput?: boolean } = {}): SafeJsRenderedOutput {
		if (this.isRenderedOutput(value)) {
			if ((value.format === 'markdown' || value.format === 'html') && options.allowRichOutput !== true) {
				return {
					format: 'text',
					content: `Safe JS rich output blocked: add '// @permission ${RICH_OUTPUT_PERMISSION}' and approve it before returning Markdown or HTML output.`,
				};
			}

			return value;
		}

		return {
			format: 'text',
			content: this.formatValue(value),
		};
	}

	static hasVisibleContent(output: SafeJsRenderedOutput): boolean {
		return output.content.trim() !== '';
	}

	private static isRenderedOutput(value: JsonValue): value is SafeJsRenderedOutput {
		if (typeof value !== 'object' || value === null || Array.isArray(value)) {
			return false;
		}

		const record = value as Record<string, JsonValue>;
		return (record.format === 'text' || record.format === 'markdown' || record.format === 'html') && typeof record.content === 'string';
	}

	private static formatValue(value: JsonValue): string {
		if (typeof value === 'string') {
			return value;
		}

		return JSON.stringify(value, null, 2);
	}

	private static formatDebugResult(result: SafeJsExecutionResult): string {
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
}
