import { jsonValueSchema } from 'packages/obsidian/src/execution/contracts';
import { z } from 'zod';

export const storageKeySchema = z
	.string()
	.min(1)
	.max(200)
	.regex(/^[a-zA-Z0-9._:-]+$/u)
	.refine(key => key !== '__index', { message: 'Storage key is reserved.' })
	.refine(key => key !== '__scopes', { message: 'Storage key is reserved.' })
	.refine(key => !key.startsWith('scoped:'), { message: 'Storage key must not use the scoped storage namespace.' });

export const storageValueSchema = jsonValueSchema.refine(value => JSON.stringify(value).length <= 200_000, {
	message: 'Storage values must be 200KB or smaller.',
});
