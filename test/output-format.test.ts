import { expect, test } from 'bun:test';
import { SafeJsOutputFormatter } from 'packages/obsidian/src/output/output-format';

test('formats plain strings as text output', () => {
	expect(SafeJsOutputFormatter.fromValue('hello')).toEqual({
		format: 'text',
		content: 'hello',
	});
});

test('formats ordinary JSON values as pretty text output', () => {
	expect(SafeJsOutputFormatter.fromValue({ ok: true, count: 2 })).toEqual({
		format: 'text',
		content: JSON.stringify({ ok: true, count: 2 }, null, 2),
	});
});

test('accepts typed markdown and html output objects', () => {
	expect(SafeJsOutputFormatter.fromValue({ format: 'markdown', content: '**ok**' }, { allowRichOutput: true })).toEqual({
		format: 'markdown',
		content: '**ok**',
	});
	expect(SafeJsOutputFormatter.fromValue({ format: 'html', content: '<strong>ok</strong>' }, { allowRichOutput: true })).toEqual({
		format: 'html',
		content: '<strong>ok</strong>',
	});
});

test('blocks rich execution output without rich output permission', () => {
	const output = SafeJsOutputFormatter.fromExecutionResult({
		status: 'success',
		codeHash: 'hash',
		value: { format: 'markdown', content: '![x](https://example.com)' },
		permissions: [],
		elapsedMs: 1,
	});

	expect(output).toEqual({
		format: 'text',
		content: "Safe JS rich output blocked: add '// @permission output:render-rich' and approve it before returning Markdown or HTML output.",
	});
});

test('allows rich execution output with rich output permission', () => {
	expect(
		SafeJsOutputFormatter.fromExecutionResult({
			status: 'success',
			codeHash: 'hash',
			value: { format: 'html', content: '<img src="https://example.com/x.png">' },
			permissions: ['output:render-rich'],
			elapsedMs: 1,
		}),
	).toEqual({
		format: 'html',
		content: '<img src="https://example.com/x.png">',
	});
});

test('falls back to JSON text for invalid output objects', () => {
	const value = { format: 'markdown', content: 1 };
	expect(SafeJsOutputFormatter.fromValue(value)).toEqual({
		format: 'text',
		content: JSON.stringify(value, null, 2),
	});
});

test('detects empty command output', () => {
	expect(SafeJsOutputFormatter.hasVisibleContent({ format: 'text', content: '' })).toBe(false);
	expect(SafeJsOutputFormatter.hasVisibleContent({ format: 'markdown', content: '  ' })).toBe(false);
	expect(SafeJsOutputFormatter.hasVisibleContent({ format: 'html', content: '<p>x</p>' })).toBe(true);
});
