import type { DataWriteOptions } from 'obsidian';
import { jsonValueSchema } from 'packages/obsidian/src/execution/contracts';
import { z } from 'zod';

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

export const jsonRecordSchema = z.record(z.string(), jsonValueSchema);

export interface OkResponse {
	ok: true;
}

export function ok(): OkResponse {
	return { ok: true };
}

export function writeOptionsFromDto(options: z.infer<typeof writeOptionsSchema>): DataWriteOptions | undefined {
	return options;
}
