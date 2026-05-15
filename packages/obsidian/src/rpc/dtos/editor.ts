import type { EditorPosition, EditorRange, EditorSelection } from 'obsidian';
import { z } from 'zod';

export const editorPositionSchema = z.object({
	line: z.number().int().min(0),
	ch: z.number().int().min(0),
});

export const editorRangeSchema = z.object({
	from: editorPositionSchema,
	to: editorPositionSchema,
});

export const editorSelectionSchema = z.object({
	anchor: editorPositionSchema,
	head: editorPositionSchema,
});

export function positionFromDto(position: z.infer<typeof editorPositionSchema>): EditorPosition {
	return {
		line: position.line,
		ch: position.ch,
	};
}

export function rangeFromDto(range: z.infer<typeof editorRangeSchema>): EditorRange {
	return {
		from: positionFromDto(range.from),
		to: positionFromDto(range.to),
	};
}

export function selectionFromDto(selection: z.infer<typeof editorSelectionSchema>): EditorSelection {
	return {
		anchor: positionFromDto(selection.anchor),
		head: positionFromDto(selection.head),
	};
}
