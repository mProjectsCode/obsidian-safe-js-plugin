import type { JsonValue } from '@lemons_dev/obsidian-safe-js-api';
import type { Harden } from 'ses';

const DECIMAL_BYTE_BASE = 1000;
const BINARY_BYTE_BASE = 1024;
const DECIMAL_BYTE_UNITS = ['B', 'kB', 'MB', 'GB', 'TB'] as const;
const BINARY_BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'] as const;
const DEFAULT_BYTE_DECIMALS = 1;
const MAX_BYTE_DECIMALS = 10;
const DEFAULT_SLUG_SEPARATOR = '-';
const LATIN_COMBINING_MARKS_PATTERN = /(\p{Script=Latin})\p{M}+/gu;
const NON_SLUG_CHARACTERS_PATTERN = /[^\p{L}\p{N}\p{M}]+/gu;
const SLUG_SEPARATOR_CONTENT_PATTERN = /[\p{L}\p{N}\p{M}\s]/u;

export function createLinkUtility(target: unknown, display: unknown, options: unknown, hardenValue: Harden): unknown {
	let raw = typeof target === 'string' ? target.trim() : '';
	let embed = readRecord(options)?.embed === true;
	if (raw.startsWith('!')) {
		embed = true;
		raw = raw.slice(1);
	}
	if (raw.startsWith('[[') && raw.endsWith(']]')) raw = raw.slice(2, -2);

	const [destination, parsedDisplay] = splitOnce(raw, '|');
	const [path, subpath] = splitSubpath(destination);
	const resolvedDisplay = typeof display === 'string' ? display : parsedDisplay;
	if (path.trim() === '') throw new Error('Link target must not be empty.');

	const markdown = `${embed ? '!' : ''}[[${path}${subpath}${resolvedDisplay === undefined ? '' : `|${resolvedDisplay}`}]]`;
	return hardenValue({
		kind: 'link',
		path,
		subpath: subpath === '' ? null : subpath,
		display: resolvedDisplay ?? null,
		embed,
		toMarkdown: (): string => markdown,
		toJSON: (): JsonValue => markdown,
		toString: (): string => markdown,
	});
}

export function createFileUtility(value: unknown, hardenValue: Harden): unknown {
	const record = readRecord(value);
	const path = typeof value === 'string' ? value.trim() : typeof record?.path === 'string' ? record.path : '';
	if (path === '') throw new Error('File value requires a vault-relative path.');

	const name = path.split('/').at(-1) ?? path;
	const dot = name.lastIndexOf('.');
	const extension = dot > 0 ? name.slice(dot + 1) : '';
	const basename = extension === '' ? name : name.slice(0, -(extension.length + 1));
	const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
	const descriptor: Record<string, JsonValue> = { path, name, basename, extension, parent };
	if (record?.type === 'file' || record?.type === 'folder') descriptor.type = record.type;
	const stat = readRecord(record?.stat);
	if (stat !== undefined) descriptor.stat = stat as JsonValue;

	return hardenValue({
		kind: 'file',
		...descriptor,
		link(display?: unknown, options?: unknown): unknown {
			return createLinkUtility(path, display, options, hardenValue);
		},
		toJSON: (): JsonValue => descriptor,
		toString: (): string => path,
	});
}

export function createTagUtility(input: unknown, hardenValue: Harden): unknown {
	if (typeof input !== 'string') throw new Error('Tag value must be a string.');
	const name = input.trim().replace(/^#+/u, '').replace(/\s+/gu, '-');
	if (name === '') throw new Error('Tag value must not be empty.');
	const text = `#${name}`;
	return hardenValue({ kind: 'tag', name, levels: name.split('/'), toJSON: (): JsonValue => text, toString: (): string => text });
}

export function formatByteCount(value: unknown, options: unknown): string {
	const bytes = requireFiniteNumber(value, 'Byte count');
	if (bytes === 0) return '0 B';

	const config = readRecord(options);
	const binary = config?.binary === true;
	const base = binary ? BINARY_BYTE_BASE : DECIMAL_BYTE_BASE;
	const units = binary ? BINARY_BYTE_UNITS : DECIMAL_BYTE_UNITS;
	const decimals = typeof config?.decimals === 'number' ? Math.max(0, Math.min(MAX_BYTE_DECIMALS, Math.trunc(config.decimals))) : DEFAULT_BYTE_DECIMALS;
	const calculatedIndex = Math.floor(Math.log(Math.abs(bytes)) / Math.log(base));
	const unitIndex = Math.max(0, Math.min(calculatedIndex, units.length - 1));
	return `${(bytes / base ** unitIndex).toFixed(unitIndex === 0 ? 0 : decimals)} ${units[unitIndex]}`;
}

export function slugifyText(value: unknown, options: unknown): string {
	if (typeof value !== 'string') throw new Error('Slug value must be a string.');

	const config = readRecord(options);
	const separator = config?.separator ?? DEFAULT_SLUG_SEPARATOR;
	if (typeof separator !== 'string' || separator === '' || SLUG_SEPARATOR_CONTENT_PATTERN.test(separator)) {
		throw new Error('Slug separator must be a non-empty string containing only non-whitespace punctuation or symbols.');
	}

	const normalized = value.normalize('NFKD').replace(LATIN_COMBINING_MARKS_PATTERN, '$1');
	const cased = config?.lowercase === false ? normalized : normalized.toLowerCase();
	let slug = cased.replace(NON_SLUG_CHARACTERS_PATTERN, separator);
	if (slug.startsWith(separator)) slug = slug.slice(separator.length);
	if (slug.endsWith(separator)) slug = slug.slice(0, -separator.length);
	return slug.normalize('NFC');
}

function splitOnce(value: string, separator: string): [string, string | undefined] {
	const index = value.indexOf(separator);
	return index < 0 ? [value, undefined] : [value.slice(0, index), value.slice(index + separator.length)];
}

function splitSubpath(value: string): [string, string] {
	const heading = value.indexOf('#');
	const block = value.indexOf('^');
	const indexes = [heading, block].filter(index => index >= 0);
	const index = indexes.length === 0 ? -1 : Math.min(...indexes);
	return index < 0 ? [value, ''] : [value.slice(0, index), value.slice(index)];
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function requireFiniteNumber(value: unknown, label: string): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
	return value;
}
