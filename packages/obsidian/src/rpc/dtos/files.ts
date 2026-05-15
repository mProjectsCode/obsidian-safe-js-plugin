import type { TAbstractFile } from 'obsidian';
import { TFile, TFolder } from 'obsidian';
import { z } from 'zod';

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

export type FileDto = z.infer<typeof fileDtoSchema>;
export type FolderDto = z.infer<typeof folderDtoSchema>;
export type AbstractFileDto = z.infer<typeof abstractFileDtoSchema>;

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
