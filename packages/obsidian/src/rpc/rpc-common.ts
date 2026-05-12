import type {
	App,
	DataWriteOptions,
	Editor,
	EditorPosition,
	EditorRange,
	EditorSelection,
	OpenViewState,
	TAbstractFile,
	ViewState,
	WorkspaceLeaf,
} from 'obsidian';
import { TFile, TFolder, arrayBufferToBase64, base64ToArrayBuffer } from 'obsidian';
import type { JsonValue } from 'packages/obsidian/src/execution/contracts';
import { jsonValueSchema } from 'packages/obsidian/src/execution/contracts';
import { isConfigVaultPath, validateVaultPath } from 'packages/obsidian/src/rpc/path-validation';
import { z } from 'zod';

export { validateVaultPath } from 'packages/obsidian/src/rpc/path-validation';

export const emptyParamsSchema = z.object({});
export const pathParamsSchema = z.object({ path: z.string() });
export const optionalPathParamsSchema = z.object({ path: z.string().optional() });
export const okResponseSchema = z.object({ ok: z.literal(true) });

export const writeOptionsSchema = z
	.object({
		ctime: z.number().optional(),
		mtime: z.number().optional(),
	})
	.optional();

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

export const fileDtoSchema = z.object({
	path: z.string(),
	name: z.string(),
	basename: z.string(),
	extension: z.string(),
	type: z.literal('file'),
	stat: z.object({
		size: z.number(),
		ctime: z.number(),
		mtime: z.number(),
	}),
});

export const folderDtoSchema = z.object({
	path: z.string(),
	name: z.string(),
	type: z.literal('folder'),
	isRoot: z.boolean(),
	children: z.array(z.string()).optional(),
});

export const abstractFileDtoSchema = z.union([fileDtoSchema, folderDtoSchema]);
export const nullableFileDtoSchema = fileDtoSchema.nullable();
export const nullableFolderDtoSchema = folderDtoSchema.nullable();
export const jsonRecordSchema = z.record(z.string(), jsonValueSchema);

export interface FileDto {
	path: string;
	name: string;
	basename: string;
	extension: string;
	type: 'file';
	stat: {
		size: number;
		ctime: number;
		mtime: number;
	};
}

export interface FolderDto {
	path: string;
	name: string;
	type: 'folder';
	isRoot: boolean;
	children?: string[];
}

export type AbstractFileDto = FileDto | FolderDto;

export interface OkResponse {
	ok: true;
}

export function ok(): OkResponse {
	return { ok: true };
}

export function fileToDto(file: TFile): FileDto {
	return {
		path: file.path,
		name: file.name,
		basename: file.basename,
		extension: file.extension,
		type: 'file',
		stat: {
			size: file.stat.size,
			ctime: file.stat.ctime,
			mtime: file.stat.mtime,
		},
	};
}

export function folderToDto(folder: TFolder, includeChildren = false, shouldIncludeChild: (child: TAbstractFile) => boolean = () => true): FolderDto {
	const dto: FolderDto = {
		path: folder.path,
		name: folder.name,
		type: 'folder',
		isRoot: folder.isRoot(),
	};

	if (includeChildren) {
		dto.children = folder.children
			.filter(shouldIncludeChild)
			.map(child => child.path)
			.sort((left, right) => left.localeCompare(right));
	}

	return dto;
}

export function abstractFileToDto(file: TAbstractFile): AbstractFileDto {
	if (file instanceof TFile) {
		return fileToDto(file);
	}

	if (file instanceof TFolder) {
		return folderToDto(file);
	}

	throw new Error(`Unsupported vault entry '${file.path}'.`);
}

export function requireFile(app: App, path: string): TFile {
	const normalizedPath = validateVaultPath(path, { configDir: app.vault.configDir, label: 'File path' });
	const file = app.vault.getFileByPath(normalizedPath);
	if (file === null) {
		throw new Error(`Vault file '${normalizedPath}' was not found.`);
	}

	return file;
}

export function requireFolder(app: App, path: string): TFolder {
	const normalizedPath = validateVaultPath(path, { allowEmpty: true, configDir: app.vault.configDir, label: 'Folder path' });
	const folder = normalizedPath === '' ? app.vault.getRoot() : app.vault.getFolderByPath(normalizedPath);
	if (folder === null) {
		throw new Error(`Vault folder '${normalizedPath}' was not found.`);
	}

	return folder;
}

export function requireAbstractFile(app: App, path: string): TAbstractFile {
	const normalizedPath = validateVaultPath(path, { configDir: app.vault.configDir });
	const file = app.vault.getAbstractFileByPath(normalizedPath);
	if (file === null) {
		throw new Error(`Vault path '${normalizedPath}' was not found.`);
	}

	return file;
}

export function assertTargetDoesNotExist(app: App, path: string): string {
	const normalizedPath = validateVaultPath(path, { configDir: app.vault.configDir });
	if (app.vault.getAbstractFileByPath(normalizedPath) !== null) {
		throw new Error(`Vault path '${normalizedPath}' already exists.`);
	}

	return normalizedPath;
}

export function isSafeVaultPath(app: App, path: string): boolean {
	return !isConfigVaultPath(path, app.vault.configDir);
}

export function encodeArrayBuffer(buffer: ArrayBuffer): string {
	return arrayBufferToBase64(buffer);
}

export function decodeArrayBuffer(base64: string): ArrayBuffer {
	return base64ToArrayBuffer(base64);
}

export function toJsonValue(value: unknown): JsonValue {
	if (isJsonValue(value)) {
		return value;
	}

	if (value === undefined) {
		return null;
	}

	return JSON.parse(JSON.stringify(value)) as JsonValue;
}

export function isJsonValue(value: unknown): value is JsonValue {
	if (value === null) {
		return true;
	}

	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		return Number.isFinite(value) || typeof value !== 'number';
	}

	if (Array.isArray(value)) {
		return value.every(isJsonValue);
	}

	if (typeof value === 'object') {
		return Object.values(value).every(isJsonValue);
	}

	return false;
}

export function requireActiveEditor(app: App): Editor {
	const editor = app.workspace.activeEditor?.editor;
	if (editor === undefined) {
		throw new Error('There is no active editor.');
	}

	return editor;
}

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

export function writeOptionsFromDto(options: z.infer<typeof writeOptionsSchema>): DataWriteOptions | undefined {
	return options;
}

export function leafToDto(leaf: WorkspaceLeaf): JsonValue {
	const state = leaf.getViewState();
	const leafId = (leaf as { id?: string }).id ?? '';
	const fileView = leaf.view as { file?: unknown };
	return toJsonValue({
		id: leafId,
		viewType: state.type,
		active: state.active ?? false,
		pinned: state.pinned ?? false,
		file: fileView.file instanceof TFile ? fileToDto(fileView.file) : null,
	});
}

export function sanitizeOpenViewState(openState: unknown): OpenViewState | undefined {
	if (!isJsonValue(openState) || openState === null || typeof openState !== 'object' || Array.isArray(openState)) {
		return undefined;
	}

	const state = openState as Record<string, JsonValue>;
	return {
		state: typeof state.state === 'object' && state.state !== null && !Array.isArray(state.state) ? state.state : undefined,
		eState: typeof state.eState === 'object' && state.eState !== null && !Array.isArray(state.eState) ? state.eState : undefined,
		active: typeof state.active === 'boolean' ? state.active : undefined,
	};
}

export function sanitizeViewState(state: ViewState): JsonValue {
	return toJsonValue({
		type: state.type,
		state: state.state,
		active: state.active,
		pinned: state.pinned,
	});
}
