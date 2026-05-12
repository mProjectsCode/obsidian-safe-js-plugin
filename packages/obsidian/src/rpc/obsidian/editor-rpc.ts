import type { App } from 'obsidian';
import {
	editorPositionSchema,
	editorRangeSchema,
	editorSelectionSchema,
	emptyParamsSchema,
	positionFromDto,
	rangeFromDto,
	requireActiveEditor,
	selectionFromDto,
	toJsonValue,
} from 'packages/obsidian/src/rpc/rpc-common';
import {
	booleanResponseSchema,
	editorRead,
	editorWrite,
	jsonValueResponseSchema,
	numberResponseSchema,
	optionalBooleanSchema,
	optionalNumberSchema,
	optionalStringSchema,
	stringResponseSchema,
} from 'packages/obsidian/src/rpc/rpc-method-helpers';
import type { RpcMethodDefinition } from 'packages/obsidian/src/rpc/rpc-registry';
import { z } from 'zod';

export function createEditorMethods(app: App): RpcMethodDefinition[] {
	return [
		editorRead('editor:getValue', 'getValue', 'Read all active editor text.', 'api.editor.getValue()', emptyParamsSchema, stringResponseSchema, () => ({
			value: requireActiveEditor(app).getValue(),
		})),
		editorRead(
			'editor:getLine',
			'getLine',
			'Read one active editor line.',
			'api.editor.getLine(line)',
			z.object({ line: z.number().int().min(0) }),
			stringResponseSchema,
			params => ({
				value: requireActiveEditor(app).getLine(params.line),
			}),
			['line'],
		),
		editorRead(
			'editor:lineCount',
			'lineCount',
			'Read the number of active editor lines.',
			'api.editor.lineCount()',
			emptyParamsSchema,
			numberResponseSchema,
			() => ({
				value: requireActiveEditor(app).lineCount(),
			}),
		),
		editorRead(
			'editor:lastLine',
			'lastLine',
			'Read the last active editor line index.',
			'api.editor.lastLine()',
			emptyParamsSchema,
			numberResponseSchema,
			() => ({
				value: requireActiveEditor(app).lastLine(),
			}),
		),
		editorRead(
			'editor:getSelection',
			'getSelection',
			'Read selected text in the active editor.',
			'api.editor.getSelection()',
			emptyParamsSchema,
			stringResponseSchema,
			() => ({
				value: requireActiveEditor(app).getSelection(),
			}),
		),
		editorRead(
			'editor:getRange',
			'getRange',
			'Read text from an active editor range.',
			'api.editor.getRange(from, to)',
			z.object({ from: editorPositionSchema, to: editorPositionSchema }),
			stringResponseSchema,
			params => ({ value: requireActiveEditor(app).getRange(positionFromDto(params.from), positionFromDto(params.to)) }),
			['from', 'to'],
		),
		editorRead(
			'editor:getCursor',
			'getCursor',
			'Read the active editor cursor position.',
			'api.editor.getCursor(side?)',
			z.object({ side: z.enum(['from', 'to', 'head', 'anchor']).optional() }),
			z.object({ line: z.number(), ch: z.number() }),
			params => requireActiveEditor(app).getCursor(params.side),
			['side'],
		),
		editorRead(
			'editor:listSelections',
			'listSelections',
			'Read active editor selections.',
			'api.editor.listSelections()',
			emptyParamsSchema,
			z.object({ selections: z.array(editorSelectionSchema) }),
			() => ({
				selections: requireActiveEditor(app).listSelections(),
			}),
		),
		editorRead(
			'editor:hasFocus',
			'hasFocus',
			'Read whether the active editor has focus.',
			'api.editor.hasFocus()',
			emptyParamsSchema,
			booleanResponseSchema,
			() => ({
				value: requireActiveEditor(app).hasFocus(),
			}),
		),
		editorRead(
			'editor:getScrollInfo',
			'getScrollInfo',
			'Read active editor scroll position.',
			'api.editor.getScrollInfo()',
			emptyParamsSchema,
			jsonValueResponseSchema,
			() => ({
				value: toJsonValue(requireActiveEditor(app).getScrollInfo()),
			}),
		),
		editorRead(
			'editor:wordAt',
			'wordAt',
			'Read the active editor word range at a position.',
			'api.editor.wordAt(pos)',
			z.object({ pos: editorPositionSchema }),
			jsonValueResponseSchema,
			params => ({
				value: toJsonValue(requireActiveEditor(app).wordAt(positionFromDto(params.pos))),
			}),
			['pos'],
		),
		editorRead(
			'editor:posToOffset',
			'posToOffset',
			'Convert an editor position to an offset.',
			'api.editor.posToOffset(pos)',
			z.object({ pos: editorPositionSchema }),
			numberResponseSchema,
			params => ({
				value: requireActiveEditor(app).posToOffset(positionFromDto(params.pos)),
			}),
			['pos'],
		),
		editorRead(
			'editor:offsetToPos',
			'offsetToPos',
			'Convert an editor offset to a position.',
			'api.editor.offsetToPos(offset)',
			z.object({ offset: z.number().int().min(0) }),
			z.object({ line: z.number(), ch: z.number() }),
			params => requireActiveEditor(app).offsetToPos(params.offset),
			['offset'],
		),
		...createEditorWriteMethods(app),
	];
}

export function createEditorWriteMethods(app: App): RpcMethodDefinition[] {
	const commandSchema = z.enum([
		'goUp',
		'goDown',
		'goLeft',
		'goRight',
		'goStart',
		'goEnd',
		'goWordLeft',
		'goWordRight',
		'indentMore',
		'indentLess',
		'newlineAndIndent',
		'swapLineUp',
		'swapLineDown',
		'deleteLine',
		'toggleFold',
		'foldAll',
		'unfoldAll',
	]);

	return [
		editorWrite(
			'editor:setValue',
			'setValue',
			'Replace all active editor text.',
			'api.editor.setValue(content)',
			z.object({ content: z.string() }),
			params => {
				requireActiveEditor(app).setValue(params.content);
			},
			['content'],
		),
		editorWrite(
			'editor:setLine',
			'setLine',
			'Replace one active editor line.',
			'api.editor.setLine(line, text)',
			z.object({ line: z.number().int().min(0), text: z.string() }),
			params => {
				requireActiveEditor(app).setLine(params.line, params.text);
			},
			['line', 'text'],
		),
		editorWrite(
			'editor:replaceSelection',
			'replaceSelection',
			'Replace the active editor selection.',
			'api.editor.replaceSelection(replacement, origin?)',
			z.object({ replacement: z.string(), origin: optionalStringSchema }),
			params => {
				requireActiveEditor(app).replaceSelection(params.replacement, params.origin);
			},
			['replacement', 'origin'],
		),
		editorWrite(
			'editor:replaceRange',
			'replaceRange',
			'Replace an active editor range.',
			'api.editor.replaceRange(replacement, from, to?, origin?)',
			z.object({ replacement: z.string(), from: editorPositionSchema, to: editorPositionSchema.optional(), origin: optionalStringSchema }),
			params => {
				requireActiveEditor(app).replaceRange(
					params.replacement,
					positionFromDto(params.from),
					params.to === undefined ? undefined : positionFromDto(params.to),
					params.origin,
				);
			},
			['replacement', 'from', 'to', 'origin'],
		),
		editorWrite(
			'editor:setCursor',
			'setCursor',
			'Move the active editor cursor.',
			'api.editor.setCursor(pos)',
			z.object({ pos: editorPositionSchema }),
			params => {
				requireActiveEditor(app).setCursor(positionFromDto(params.pos));
			},
			['pos'],
		),
		editorWrite(
			'editor:setSelection',
			'setSelection',
			'Set the active editor selection.',
			'api.editor.setSelection(anchor, head?)',
			z.object({ anchor: editorPositionSchema, head: editorPositionSchema.optional() }),
			params => {
				requireActiveEditor(app).setSelection(positionFromDto(params.anchor), params.head === undefined ? undefined : positionFromDto(params.head));
			},
			['anchor', 'head'],
		),
		editorWrite(
			'editor:setSelections',
			'setSelections',
			'Set active editor selections.',
			'api.editor.setSelections(ranges, main?)',
			z.object({ ranges: z.array(editorSelectionSchema), main: optionalNumberSchema }),
			params => {
				requireActiveEditor(app).setSelections(params.ranges.map(selectionFromDto), params.main);
			},
			['ranges', 'main'],
		),
		editorWrite(
			'editor:scrollTo',
			'scrollTo',
			'Scroll the active editor.',
			'api.editor.scrollTo(x?, y?)',
			z.object({ x: z.number().nullable().optional(), y: z.number().nullable().optional() }),
			params => {
				requireActiveEditor(app).scrollTo(params.x, params.y);
			},
			['x', 'y'],
		),
		editorWrite(
			'editor:scrollIntoView',
			'scrollIntoView',
			'Scroll an active editor range into view.',
			'api.editor.scrollIntoView(range, center?)',
			z.object({ range: editorRangeSchema, center: optionalBooleanSchema }),
			params => {
				requireActiveEditor(app).scrollIntoView(rangeFromDto(params.range), params.center);
			},
			['range', 'center'],
		),
		editorWrite('editor:focus', 'focus', 'Focus the active editor.', 'api.editor.focus()', emptyParamsSchema, () => {
			requireActiveEditor(app).focus();
		}),
		editorWrite('editor:blur', 'blur', 'Blur the active editor.', 'api.editor.blur()', emptyParamsSchema, () => {
			requireActiveEditor(app).blur();
		}),
		editorWrite('editor:undo', 'undo', 'Undo active editor changes.', 'api.editor.undo()', emptyParamsSchema, () => {
			requireActiveEditor(app).undo();
		}),
		editorWrite('editor:redo', 'redo', 'Redo active editor changes.', 'api.editor.redo()', emptyParamsSchema, () => {
			requireActiveEditor(app).redo();
		}),
		editorWrite(
			'editor:exec',
			'exec',
			'Run an allowlisted active editor command.',
			'api.editor.exec(command)',
			z.object({ command: commandSchema }),
			params => {
				requireActiveEditor(app).exec(params.command);
			},
			['command'],
		),
	];
}
