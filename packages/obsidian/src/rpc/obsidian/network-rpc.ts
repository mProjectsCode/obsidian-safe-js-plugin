import { requestUrl } from 'obsidian';
import { jsonValueSchema } from 'packages/obsidian/src/execution/contracts';
import { encodeArrayBuffer, toJsonValue } from 'packages/obsidian/src/rpc/rpc-common';
import { httpUrlSchema, method, optionalBooleanSchema, optionalStringSchema } from 'packages/obsidian/src/rpc/rpc-method-helpers';
import type { RpcMethodDefinition } from 'packages/obsidian/src/rpc/rpc-registry';
import { z } from 'zod';

export function createNetworkMethods(): RpcMethodDefinition[] {
	const requestParamsSchema = z.object({
		url: httpUrlSchema,
		method: optionalStringSchema,
		contentType: optionalStringSchema,
		body: z.string().optional(),
		headers: z.record(z.string(), z.string()).optional(),
		throw: optionalBooleanSchema,
	});

	return [
		method({
			method: 'network:requestUrl',
			permission: 'network:request',
			description: 'Make an HTTP or HTTPS request and return status, headers, text, and JSON response data.',
			usage: 'api.network.requestUrl(urlOrOptions)',
			namespace: 'network',
			functionName: 'requestUrl',
			argNames: ['urlOrOptions'],
			requestSchema: z.object({ urlOrOptions: z.union([httpUrlSchema, requestParamsSchema]) }),
			responseSchema: z.object({
				status: z.number(),
				headers: z.record(z.string(), z.string()),
				text: z.string(),
				json: jsonValueSchema,
				base64: z.string(),
			}),
			async handler(params) {
				const response = await requestUrl(params.urlOrOptions);
				return {
					status: response.status,
					headers: response.headers,
					text: response.text,
					json: toJsonValue(response.json),
					base64: encodeArrayBuffer(response.arrayBuffer),
				};
			},
		}),
	];
}
