import type { App } from 'obsidian';
import { getFrontMatterInfo, stringifyYaml } from 'obsidian';
import {
	decodeArrayBuffer,
	jsonRecordSchema,
	ok,
	okResponseSchema,
	requireFile,
	writeOptionsFromDto,
	writeOptionsSchema,
} from 'packages/obsidian/src/rpc/rpc-common';
import { base64StringSchema, method } from 'packages/obsidian/src/rpc/rpc-method-helpers';
import type { RpcMethodDefinition } from 'packages/obsidian/src/rpc/rpc-registry';
import { z } from 'zod';

export function createVaultModifyMethods(app: App): RpcMethodDefinition[] {
	return [
		method({
			method: 'vault:modify',
			permission: 'vault:modify',
			description: 'Replace the full text content of an existing vault file.',
			usage: 'api.vault.modify(path, content, options?)',
			namespace: 'vault',
			functionName: 'modify',
			argNames: ['path', 'content', 'options'],
			requestSchema: z.object({ path: z.string(), content: z.string(), options: writeOptionsSchema }),
			responseSchema: okResponseSchema,
			async handler(params) {
				await app.vault.modify(requireFile(app, params.path), params.content, writeOptionsFromDto(params.options));
				return ok();
			},
		}),
		method({
			method: 'vault:modifyBinary',
			permission: 'vault:modify',
			description: 'Replace the full binary content of an existing vault file from base64 text.',
			usage: 'api.vault.modifyBinary(path, base64, options?)',
			namespace: 'vault',
			functionName: 'modifyBinary',
			argNames: ['path', 'base64', 'options'],
			requestSchema: z.object({ path: z.string(), base64: base64StringSchema, options: writeOptionsSchema }),
			responseSchema: okResponseSchema,
			async handler(params) {
				await app.vault.modifyBinary(requireFile(app, params.path), decodeArrayBuffer(params.base64), writeOptionsFromDto(params.options));
				return ok();
			},
		}),
		method({
			method: 'vault:append',
			permission: 'vault:modify',
			description: 'Append text content to an existing vault file.',
			usage: 'api.vault.append(path, content, options?)',
			namespace: 'vault',
			functionName: 'append',
			argNames: ['path', 'content', 'options'],
			requestSchema: z.object({ path: z.string(), content: z.string(), options: writeOptionsSchema }),
			responseSchema: okResponseSchema,
			async handler(params) {
				await app.vault.append(requireFile(app, params.path), params.content, writeOptionsFromDto(params.options));
				return ok();
			},
		}),
		method({
			method: 'vault:appendBinary',
			permission: 'vault:modify',
			description: 'Append binary content to an existing vault file from base64 text.',
			usage: 'api.vault.appendBinary(path, base64, options?)',
			namespace: 'vault',
			functionName: 'appendBinary',
			argNames: ['path', 'base64', 'options'],
			requestSchema: z.object({ path: z.string(), base64: base64StringSchema, options: writeOptionsSchema }),
			responseSchema: okResponseSchema,
			async handler(params) {
				await app.vault.appendBinary(requireFile(app, params.path), decodeArrayBuffer(params.base64), writeOptionsFromDto(params.options));
				return ok();
			},
		}),
		method({
			method: 'frontmatter:replace',
			permission: 'vault:modify',
			description: 'Replace a Markdown file frontmatter block with a JSON object.',
			usage: 'api.frontmatter.replace(path, frontmatter, options?)',
			namespace: 'frontmatter',
			functionName: 'replace',
			argNames: ['path', 'frontmatter', 'options'],
			requestSchema: z.object({ path: z.string(), frontmatter: jsonRecordSchema, options: writeOptionsSchema }),
			responseSchema: okResponseSchema,
			async handler(params) {
				const file = requireFile(app, params.path);
				const content = await app.vault.read(file);
				const info = getFrontMatterInfo(content);
				const yaml = stringifyYaml(params.frontmatter);
				const nextFrontmatter = `---\n${yaml.trimEnd()}\n---\n`;
				const nextContent = info.exists
					? `${content.slice(0, info.from - 4)}${nextFrontmatter}${content.slice(info.contentStart)}`
					: `${nextFrontmatter}${content}`;
				await app.vault.modify(file, nextContent, writeOptionsFromDto(params.options));
				return ok();
			},
		}),
	];
}
