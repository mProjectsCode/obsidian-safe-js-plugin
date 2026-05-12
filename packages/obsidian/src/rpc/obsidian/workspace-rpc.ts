import type { App, PaneType } from 'obsidian';
import { jsonValueSchema } from 'packages/obsidian/src/execution/contracts';
import {
	emptyParamsSchema,
	fileToDto,
	leafToDto,
	nullableFileDtoSchema,
	ok,
	okResponseSchema,
	requireFile,
	sanitizeOpenViewState,
	toJsonValue,
	validateVaultPath,
} from 'packages/obsidian/src/rpc/rpc-common';
import { jsonValueResponseSchema, method, paneTypeSchema } from 'packages/obsidian/src/rpc/rpc-method-helpers';
import type { RpcMethodDefinition } from 'packages/obsidian/src/rpc/rpc-registry';
import { z } from 'zod';

export function createWorkspaceMethods(app: App): RpcMethodDefinition[] {
	return [
		method({
			method: 'workspace:getActiveFile',
			permission: 'workspace:read',
			description: 'Read the currently active file, if any.',
			usage: 'api.workspace.getActiveFile()',
			namespace: 'workspace',
			functionName: 'getActiveFile',
			requestSchema: emptyParamsSchema,
			responseSchema: nullableFileDtoSchema,
			handler: () => {
				const file = app.workspace.getActiveFile();
				return file === null ? null : fileToDto(file);
			},
		}),
		method({
			method: 'workspace:getLastOpenFiles',
			permission: 'workspace:read',
			description: "Read Obsidian's recently opened file list.",
			usage: 'api.workspace.getLastOpenFiles()',
			namespace: 'workspace',
			functionName: 'getLastOpenFiles',
			requestSchema: emptyParamsSchema,
			responseSchema: z.object({ files: z.array(z.string()) }),
			handler: () => ({ files: app.workspace.getLastOpenFiles() }),
		}),
		method({
			method: 'workspace:getLeavesOfType',
			permission: 'workspace:read',
			description: 'Read workspace leaves for a view type.',
			usage: 'api.workspace.getLeavesOfType(viewType)',
			namespace: 'workspace',
			functionName: 'getLeavesOfType',
			argNames: ['viewType'],
			requestSchema: z.object({ viewType: z.string().min(1) }),
			responseSchema: z.object({ leaves: z.array(jsonValueSchema) }),
			handler: params => ({ leaves: app.workspace.getLeavesOfType(params.viewType).map(leafToDto) }),
		}),
		method({
			method: 'workspace:getLayout',
			permission: 'workspace:read',
			description: 'Read the JSON-safe workspace layout.',
			usage: 'api.workspace.getLayout()',
			namespace: 'workspace',
			functionName: 'getLayout',
			requestSchema: emptyParamsSchema,
			responseSchema: jsonValueResponseSchema,
			handler: () => ({ value: toJsonValue(app.workspace.getLayout()) }),
		}),
		method({
			method: 'workspace:getActiveViewInfo',
			permission: 'workspace:read',
			description: 'Read safe active view and editor state.',
			usage: 'api.workspace.getActiveViewInfo()',
			namespace: 'workspace',
			functionName: 'getActiveViewInfo',
			requestSchema: emptyParamsSchema,
			responseSchema: jsonValueResponseSchema,
			handler: () => {
				const activeFile = app.workspace.getActiveFile();
				const activeLeaf = app.workspace.getMostRecentLeaf();
				return {
					value: toJsonValue({
						activeFile: activeFile === null ? null : fileToDto(activeFile),
						activeLeaf: activeLeaf === null ? null : leafToDto(activeLeaf),
						hasEditor: app.workspace.activeEditor?.editor !== undefined,
					}),
				};
			},
		}),
		method({
			method: 'workspace:openLinkText',
			permission: 'workspace:navigate',
			description: 'Open an existing link target from a source path.',
			usage: 'api.workspace.openLinkText(linktext, sourcePath, options?)',
			namespace: 'workspace',
			functionName: 'openLinkText',
			argNames: ['linktext', 'sourcePath', 'options'],
			requestSchema: z.object({
				linktext: z.string().min(1),
				sourcePath: z.string(),
				options: z.object({ newLeaf: paneTypeSchema, openState: z.unknown().optional() }).optional(),
			}),
			responseSchema: okResponseSchema,
			async handler(params) {
				const sourcePath = validateVaultPath(params.sourcePath, { configDir: app.vault.configDir });
				if (app.metadataCache.getFirstLinkpathDest(params.linktext, sourcePath) === null) {
					throw new Error(`Link '${params.linktext}' does not resolve to an existing file.`);
				}
				await app.workspace.openLinkText(params.linktext, sourcePath, params.options?.newLeaf, sanitizeOpenViewState(params.options?.openState));
				return ok();
			},
		}),
		method({
			method: 'workspace:openFile',
			permission: 'workspace:navigate',
			description: 'Open an existing file in a host-selected leaf.',
			usage: 'api.workspace.openFile(path, openState?)',
			namespace: 'workspace',
			functionName: 'openFile',
			argNames: ['path', 'openState'],
			requestSchema: z.object({ path: z.string(), openState: z.unknown().optional() }),
			responseSchema: okResponseSchema,
			async handler(params) {
				await app.workspace.getLeaf(false).openFile(requireFile(app, params.path), sanitizeOpenViewState(params.openState));
				return ok();
			},
		}),
		method({
			method: 'workspace:revealLeaf',
			permission: 'workspace:navigate',
			description: 'Reveal an existing workspace leaf.',
			usage: 'api.workspace.revealLeaf(leafId)',
			namespace: 'workspace',
			functionName: 'revealLeaf',
			argNames: ['leafId'],
			requestSchema: z.object({ leafId: z.string().min(1) }),
			responseSchema: okResponseSchema,
			async handler(params) {
				const leaf = app.workspace.getLeafById(params.leafId);
				if (leaf === null) {
					throw new Error(`Workspace leaf '${params.leafId}' was not found.`);
				}
				await app.workspace.revealLeaf(leaf);
				return ok();
			},
		}),
		method({
			method: 'workspace:setActiveLeaf',
			permission: 'workspace:navigate',
			description: 'Set an existing workspace leaf as active.',
			usage: 'api.workspace.setActiveLeaf(leafId, options?)',
			namespace: 'workspace',
			functionName: 'setActiveLeaf',
			argNames: ['leafId', 'options'],
			requestSchema: z.object({ leafId: z.string().min(1), options: z.object({ focus: z.boolean().optional() }).optional() }),
			responseSchema: okResponseSchema,
			handler(params) {
				const leaf = app.workspace.getLeafById(params.leafId);
				if (leaf === null) {
					throw new Error(`Workspace leaf '${params.leafId}' was not found.`);
				}
				app.workspace.setActiveLeaf(leaf, { focus: params.options?.focus });
				return ok();
			},
		}),
		method({
			method: 'workspace:newLeaf',
			permission: 'workspace:navigate',
			description: 'Create or retrieve a safe tab or split leaf.',
			usage: 'api.workspace.newLeaf(options?)',
			namespace: 'workspace',
			functionName: 'newLeaf',
			requestSchema: z.object({ type: paneTypeSchema, direction: z.enum(['vertical', 'horizontal']).optional() }),
			responseSchema: jsonValueSchema,
			handler(params) {
				const leaf =
					params.type === 'split' ? app.workspace.getLeaf('split', params.direction) : app.workspace.getLeaf((params.type ?? 'tab') as PaneType);
				return leafToDto(leaf);
			},
		}),
	];
}
