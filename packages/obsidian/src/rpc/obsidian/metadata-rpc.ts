import type { JsonValue } from '@lemons_dev/obsidian-safe-js-api';
import type { App } from 'obsidian';
import {
	getAllTags,
	getFrontMatterInfo,
	parseFrontMatterAliases,
	parseFrontMatterEntry,
	parseFrontMatterStringArray,
	parseFrontMatterTags,
	resolveSubpath,
} from 'obsidian';
import {
	emptyParamsSchema,
	jsonRecordSchema,
	nullableFileDtoSchema,
	pathParamsSchema,
	requireFile,
	fileToDto,
	isSafeVaultPath,
	toJsonValue,
	validateVaultPath,
} from 'packages/obsidian/src/rpc/rpc-common';
import { jsonValueResponseSchema, method, stringResponseSchema } from 'packages/obsidian/src/rpc/rpc-method-helpers';
import type { RpcMethodDefinition } from 'packages/obsidian/src/rpc/rpc-registry';
import { z } from 'zod';

export function createMetadataMethods(app: App): RpcMethodDefinition[] {
	return [
		method({
			method: 'metadata:getFileCache',
			permission: 'metadata:read',
			description: 'Read Obsidian metadata cache for a vault file.',
			usage: 'api.metadata.getFileCache(path)',
			namespace: 'metadata',
			functionName: 'getFileCache',
			paramStyle: 'path',
			requestSchema: pathParamsSchema,
			responseSchema: jsonValueResponseSchema,
			handler: params => ({ value: toJsonValue(app.metadataCache.getFileCache(requireFile(app, params.path))) }),
		}),
		method({
			method: 'metadata:getFirstLinkpathDest',
			permission: 'metadata:read',
			description: 'Resolve a wiki-style link path from a source note.',
			usage: 'api.metadata.getFirstLinkpathDest(linkpath, sourcePath)',
			namespace: 'metadata',
			functionName: 'getFirstLinkpathDest',
			argNames: ['linkpath', 'sourcePath'],
			requestSchema: z.object({ linkpath: z.string().min(1), sourcePath: z.string() }),
			responseSchema: nullableFileDtoSchema,
			handler(params) {
				const sourcePath = validateVaultPath(params.sourcePath, { configDir: app.vault.configDir });
				const file = app.metadataCache.getFirstLinkpathDest(params.linkpath, sourcePath);
				return file === null || !isSafeVaultPath(app, file.path) ? null : fileToDto(file);
			},
		}),
		method({
			method: 'metadata:fileToLinktext',
			permission: 'metadata:read',
			description: 'Generate link text for a file from a source note.',
			usage: 'api.metadata.fileToLinktext(path, sourcePath, options?)',
			namespace: 'metadata',
			functionName: 'fileToLinktext',
			argNames: ['path', 'sourcePath', 'options'],
			requestSchema: z.object({
				path: z.string(),
				sourcePath: z.string(),
				options: z.object({ omitMdExtension: z.boolean().optional() }).optional(),
			}),
			responseSchema: stringResponseSchema,
			handler(params) {
				const file = requireFile(app, params.path);
				const sourcePath = validateVaultPath(params.sourcePath, { configDir: app.vault.configDir });
				return { value: app.metadataCache.fileToLinktext(file, sourcePath, params.options?.omitMdExtension) };
			},
		}),
		method({
			method: 'metadata:getResolvedLinks',
			permission: 'metadata:read',
			description: 'Read Obsidian resolved link counts.',
			usage: 'api.metadata.getResolvedLinks()',
			namespace: 'metadata',
			functionName: 'getResolvedLinks',
			requestSchema: emptyParamsSchema,
			responseSchema: z.object({ links: jsonRecordSchema }),
			handler: () => ({ links: filterMetadataLinkMap(app, app.metadataCache.resolvedLinks) }),
		}),
		method({
			method: 'metadata:getUnresolvedLinks',
			permission: 'metadata:read',
			description: 'Read Obsidian unresolved link counts.',
			usage: 'api.metadata.getUnresolvedLinks()',
			namespace: 'metadata',
			functionName: 'getUnresolvedLinks',
			requestSchema: emptyParamsSchema,
			responseSchema: z.object({ links: jsonRecordSchema }),
			handler: () => ({ links: filterMetadataLinkMap(app, app.metadataCache.unresolvedLinks) }),
		}),
		method({
			method: 'metadata:getAllTags',
			permission: 'metadata:read',
			description: 'Read all tags from a note metadata cache.',
			usage: 'api.metadata.getAllTags(path)',
			namespace: 'metadata',
			functionName: 'getAllTags',
			paramStyle: 'path',
			requestSchema: pathParamsSchema,
			responseSchema: z.object({ tags: z.array(z.string()).nullable() }),
			handler(params) {
				const cache = app.metadataCache.getFileCache(requireFile(app, params.path));
				return { tags: cache === null ? null : getAllTags(cache) };
			},
		}),
		method({
			method: 'metadata:resolveSubpath',
			permission: 'metadata:read',
			description: 'Resolve a heading, block, or footnote subpath inside a note.',
			usage: 'api.metadata.resolveSubpath(path, subpath)',
			namespace: 'metadata',
			functionName: 'resolveSubpath',
			argNames: ['path', 'subpath'],
			requestSchema: z.object({ path: z.string(), subpath: z.string().min(1) }),
			responseSchema: jsonValueResponseSchema,
			handler(params) {
				const cache = app.metadataCache.getFileCache(requireFile(app, params.path));
				return { value: cache === null ? null : toJsonValue(resolveSubpath(cache, params.subpath)) };
			},
		}),
		...createFrontmatterReadMethods(),
	];
}

function filterMetadataLinkMap(app: App, links: Record<string, Record<string, number>>): Record<string, JsonValue> {
	const filteredLinks: Record<string, JsonValue> = {};

	for (const [sourcePath, destinations] of Object.entries(links)) {
		if (!isSafeVaultPath(app, sourcePath)) {
			continue;
		}

		filteredLinks[sourcePath] = toJsonValue(destinations);
	}

	return filteredLinks;
}

export function createFrontmatterReadMethods(): RpcMethodDefinition[] {
	return [
		method({
			method: 'frontmatter:getInfo',
			permission: 'metadata:read',
			description: 'Parse frontmatter location and raw text from note content.',
			usage: 'api.frontmatter.getInfo(content)',
			namespace: 'frontmatter',
			functionName: 'getInfo',
			argNames: ['content'],
			requestSchema: z.object({ content: z.string() }),
			responseSchema: jsonValueResponseSchema,
			handler: params => ({ value: toJsonValue(getFrontMatterInfo(params.content)) }),
		}),
		method({
			method: 'frontmatter:parseAliases',
			permission: 'metadata:read',
			description: 'Read aliases from a parsed frontmatter object.',
			usage: 'api.frontmatter.parseAliases(frontmatter)',
			namespace: 'frontmatter',
			functionName: 'parseAliases',
			argNames: ['frontmatter'],
			requestSchema: z.object({ frontmatter: jsonRecordSchema.nullable() }),
			responseSchema: z.object({ aliases: z.array(z.string()).nullable() }),
			handler: params => ({ aliases: parseFrontMatterAliases(params.frontmatter) }),
		}),
		method({
			method: 'frontmatter:parseTags',
			permission: 'metadata:read',
			description: 'Read tags from a parsed frontmatter object.',
			usage: 'api.frontmatter.parseTags(frontmatter)',
			namespace: 'frontmatter',
			functionName: 'parseTags',
			argNames: ['frontmatter'],
			requestSchema: z.object({ frontmatter: jsonRecordSchema.nullable() }),
			responseSchema: z.object({ tags: z.array(z.string()).nullable() }),
			handler: params => ({ tags: parseFrontMatterTags(params.frontmatter) }),
		}),
		method({
			method: 'frontmatter:parseStringArray',
			permission: 'metadata:read',
			description: 'Read a string array field from a parsed frontmatter object.',
			usage: 'api.frontmatter.parseStringArray(frontmatter, key)',
			namespace: 'frontmatter',
			functionName: 'parseStringArray',
			argNames: ['frontmatter', 'key'],
			requestSchema: z.object({ frontmatter: jsonRecordSchema.nullable(), key: z.string().min(1) }),
			responseSchema: z.object({ value: z.array(z.string()).nullable() }),
			handler: params => ({ value: parseFrontMatterStringArray(params.frontmatter, params.key) }),
		}),
		method({
			method: 'frontmatter:parseEntry',
			permission: 'metadata:read',
			description: 'Read a field from a parsed frontmatter object.',
			usage: 'api.frontmatter.parseEntry(frontmatter, key)',
			namespace: 'frontmatter',
			functionName: 'parseEntry',
			argNames: ['frontmatter', 'key'],
			requestSchema: z.object({ frontmatter: jsonRecordSchema.nullable(), key: z.string().min(1) }),
			responseSchema: jsonValueResponseSchema,
			handler: params => ({ value: toJsonValue(parseFrontMatterEntry(params.frontmatter, params.key)) }),
		}),
	];
}
