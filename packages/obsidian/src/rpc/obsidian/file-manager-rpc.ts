import type { App } from 'obsidian';
import { folderDtoSchema, folderToDto, requireFile, validateVaultPath } from 'packages/obsidian/src/rpc/rpc-common';
import { method, optionalStringSchema, stringResponseSchema } from 'packages/obsidian/src/rpc/rpc-method-helpers';
import type { RpcMethodDefinition } from 'packages/obsidian/src/rpc/rpc-registry';
import { z } from 'zod';

export function createFileManagerMethods(app: App): RpcMethodDefinition[] {
	return [
		method({
			method: 'fileManager:getNewFileParent',
			permission: 'file-manager:read',
			description: 'Read the folder Obsidian would use for a new file.',
			usage: 'api.fileManager.getNewFileParent(sourcePath, newFilePath?)',
			namespace: 'fileManager',
			functionName: 'getNewFileParent',
			argNames: ['sourcePath', 'newFilePath'],
			requestSchema: z.object({ sourcePath: z.string(), newFilePath: optionalStringSchema }),
			responseSchema: folderDtoSchema,
			handler(params) {
				const sourcePath = params.sourcePath === '' ? '' : validateVaultPath(params.sourcePath, { configDir: app.vault.configDir });
				const newFilePath = params.newFilePath === undefined ? undefined : validateVaultPath(params.newFilePath, { configDir: app.vault.configDir });
				return folderToDto(app.fileManager.getNewFileParent(sourcePath, newFilePath));
			},
		}),
		method({
			method: 'fileManager:generateMarkdownLink',
			permission: 'file-manager:read',
			description: 'Generate a Markdown link using Obsidian link preferences.',
			usage: 'api.fileManager.generateMarkdownLink(path, sourcePath, options?)',
			namespace: 'fileManager',
			functionName: 'generateMarkdownLink',
			argNames: ['path', 'sourcePath', 'options'],
			requestSchema: z.object({
				path: z.string(),
				sourcePath: z.string(),
				options: z.object({ subpath: optionalStringSchema, alias: optionalStringSchema }).optional(),
			}),
			responseSchema: stringResponseSchema,
			handler(params) {
				const file = requireFile(app, params.path);
				const sourcePath = validateVaultPath(params.sourcePath, { configDir: app.vault.configDir });
				return { value: app.fileManager.generateMarkdownLink(file, sourcePath, params.options?.subpath, params.options?.alias ?? '') };
			},
		}),
	];
}
