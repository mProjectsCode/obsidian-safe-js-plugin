import type { App } from 'obsidian';
import { TFile, TFolder } from 'obsidian';
import { RpcRegistry } from 'packages/obsidian/src/rpc/rpc-registry';
import { z } from 'zod';

const vaultPathParamsSchema = z.object({
	path: z.string().min(1),
});
type VaultPathParams = z.infer<typeof vaultPathParamsSchema>;

const vaultListParamsSchema = z.object({
	path: z.string().optional(),
});
type VaultListParams = z.infer<typeof vaultListParamsSchema>;

const vaultFileResponseSchema = z.object({
	path: z.string(),
	content: z.string(),
});
type VaultFileResponse = z.infer<typeof vaultFileResponseSchema>;

const vaultListResponseSchema = z.object({
	files: z.array(
		z.object({
			path: z.string(),
			type: z.enum(['file', 'folder']),
		}),
	),
});
type VaultListResponse = z.infer<typeof vaultListResponseSchema>;

const vaultStatResponseSchema = z.object({
	path: z.string(),
	type: z.enum(['file', 'folder']),
	size: z.number().optional(),
	ctime: z.number().optional(),
	mtime: z.number().optional(),
});
type VaultStatResponse = z.infer<typeof vaultStatResponseSchema>;

export function createVaultReadRegistry(app: App): RpcRegistry {
	return new RpcRegistry([
		{
			method: 'vault:read',
			permission: 'vault:read',
			description: 'Read a file from the current vault.',
			requestSchema: vaultPathParamsSchema,
			responseSchema: vaultFileResponseSchema,
			binding: {
				namespace: 'vault',
				functionName: 'read',
				paramStyle: 'path',
			},
			async handler(params: VaultPathParams): Promise<VaultFileResponse> {
				const file = app.vault.getAbstractFileByPath(params.path);
				if (!(file instanceof TFile)) {
					throw new Error(`Vault file '${params.path}' was not found.`);
				}

				return {
					path: file.path,
					content: await app.vault.cachedRead(file),
				};
			},
		},
		{
			method: 'vault:list',
			permission: 'vault:read',
			description: 'List files and folders in the current vault.',
			requestSchema: vaultListParamsSchema,
			responseSchema: vaultListResponseSchema,
			binding: {
				namespace: 'vault',
				functionName: 'list',
				paramStyle: 'optionalPath',
			},
			handler(params: VaultListParams): VaultListResponse {
				const prefix = params.path === undefined || params.path === '' ? '' : `${params.path.replace(/\/$/u, '')}/`;
				const files = app.vault
					.getAllLoadedFiles()
					.filter(file => prefix === '' || file.path === params.path || file.path.startsWith(prefix))
					.map(file => ({
						path: file.path,
						type: file instanceof TFolder ? ('folder' as const) : ('file' as const),
					}))
					.sort((left, right) => left.path.localeCompare(right.path));

				return { files };
			},
		},
		{
			method: 'vault:stat',
			permission: 'vault:read',
			description: 'Read metadata for a vault file or folder.',
			requestSchema: vaultPathParamsSchema,
			responseSchema: vaultStatResponseSchema,
			binding: {
				namespace: 'vault',
				functionName: 'stat',
				paramStyle: 'path',
			},
			handler(params: VaultPathParams): VaultStatResponse {
				const file = app.vault.getAbstractFileByPath(params.path);
				if (file === null) {
					throw new Error(`Vault path '${params.path}' was not found.`);
				}

				if (file instanceof TFile) {
					return {
						path: file.path,
						type: 'file' as const,
						size: file.stat.size,
						ctime: file.stat.ctime,
						mtime: file.stat.mtime,
					};
				}

				return {
					path: file.path,
					type: 'folder' as const,
				};
			},
		},
	]);
}
