import { getLinkpath, normalizePath, parseLinktext, parseYaml, prepareFuzzySearch, prepareSimpleSearch, stringifyYaml } from 'obsidian';
import { jsonValueSchema } from 'packages/obsidian/src/execution/contracts';
import { method } from 'packages/obsidian/src/rpc/rpc-method-helpers';
import type { RpcMethodDefinition } from 'packages/obsidian/src/rpc/rpc-registry';
import { z } from 'zod';

const linktextPartsSchema = z.object({
	path: z.string(),
	subpath: z.string(),
});
const searchResultSchema = z
	.object({
		score: z.number(),
		matches: z.array(z.tuple([z.number(), z.number()])),
	})
	.nullable();

export function createHelperMethods(): RpcMethodDefinition[] {
	return [
		method({
			method: 'path:normalize',
			permission: 'helpers:use',
			description: 'Normalize path separators and duplicate path segments using Obsidian path rules.',
			usage: 'api.path.normalize(path)',
			namespace: 'path',
			functionName: 'normalize',
			argNames: ['path'],
			requestSchema: z.object({ path: z.string() }),
			responseSchema: z.string(),
			handler: params => normalizePath(params.path),
		}),
		method({
			method: 'link:parseLinktext',
			permission: 'helpers:use',
			description: 'Parse wikilink text into path and subpath parts.',
			usage: 'api.link.parseLinktext(linktext)',
			namespace: 'link',
			functionName: 'parseLinktext',
			argNames: ['linktext'],
			requestSchema: z.object({ linktext: z.string() }),
			responseSchema: linktextPartsSchema,
			handler: params => parseLinktext(params.linktext),
		}),
		method({
			method: 'link:getLinkpath',
			permission: 'helpers:use',
			description: 'Return the path portion of wikilink text.',
			usage: 'api.link.getLinkpath(linktext)',
			namespace: 'link',
			functionName: 'getLinkpath',
			argNames: ['linktext'],
			requestSchema: z.object({ linktext: z.string() }),
			responseSchema: z.string(),
			handler: params => getLinkpath(params.linktext),
		}),
		method({
			method: 'search:prepareSimpleSearch',
			permission: 'helpers:use',
			description: 'Run Obsidian simple search matching for a query and text.',
			usage: 'api.search.prepareSimpleSearch(query, text)',
			namespace: 'search',
			functionName: 'prepareSimpleSearch',
			argNames: ['query', 'text'],
			requestSchema: z.object({ query: z.string(), text: z.string() }),
			responseSchema: searchResultSchema,
			handler: params => prepareSimpleSearch(params.query)(params.text),
		}),
		method({
			method: 'search:prepareFuzzySearch',
			permission: 'helpers:use',
			description: 'Run Obsidian fuzzy search matching for a query and text.',
			usage: 'api.search.prepareFuzzySearch(query, text)',
			namespace: 'search',
			functionName: 'prepareFuzzySearch',
			argNames: ['query', 'text'],
			requestSchema: z.object({ query: z.string(), text: z.string() }),
			responseSchema: searchResultSchema,
			handler: params => prepareFuzzySearch(params.query)(params.text),
		}),
		method({
			method: 'yaml:parse',
			permission: 'helpers:use',
			description: 'Parse YAML text using Obsidian YAML parsing.',
			usage: 'api.yaml.parse(yaml)',
			namespace: 'yaml',
			functionName: 'parse',
			argNames: ['yaml'],
			requestSchema: z.object({ yaml: z.string() }),
			responseSchema: jsonValueSchema,
			handler: params => toJsonValue(parseYaml(params.yaml)),
		}),
		method({
			method: 'yaml:stringify',
			permission: 'helpers:use',
			description: 'Stringify a JSON-safe value using Obsidian YAML formatting.',
			usage: 'api.yaml.stringify(value)',
			namespace: 'yaml',
			functionName: 'stringify',
			argNames: ['value'],
			requestSchema: z.object({ value: jsonValueSchema }),
			responseSchema: z.string(),
			handler: params => stringifyYaml(params.value),
		}),
	];
}

function toJsonValue(value: unknown): z.infer<typeof jsonValueSchema> {
	if (value === undefined) {
		return null;
	}

	const parsedValue = jsonValueSchema.safeParse(value);
	if (parsedValue.success) {
		return parsedValue.data;
	}

	return JSON.parse(JSON.stringify(value)) as z.infer<typeof jsonValueSchema>;
}
