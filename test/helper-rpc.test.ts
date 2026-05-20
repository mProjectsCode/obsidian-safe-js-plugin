import { expect, mock, test } from 'bun:test';
import { RpcRegistry } from 'packages/obsidian/src/rpc/rpc-registry';

const testValidatorOptions = {
	getConfigDir: (): string => '.obsidian',
};

mock.module('obsidian', () => ({
	TFile: class TFile {},
	TFolder: class TFolder {},
	arrayBufferToBase64(_buffer: ArrayBuffer): string {
		return '';
	},
	base64ToArrayBuffer(_base64: string): ArrayBuffer {
		return new ArrayBuffer(0);
	},
	getLinkpath(linktext: string): string {
		return linktext.split('#')[0]?.split('|')[0] ?? '';
	},
	normalizePath(path: string): string {
		return path.replace(/\\/gu, '/').replace(/\/+/gu, '/').replace('/./', '/');
	},
	parseLinktext(linktext: string): { path: string; subpath: string } {
		const withoutAlias = linktext.split('|')[0] ?? '';
		const [path = '', subpath = ''] = withoutAlias.split('#');
		return { path, subpath: subpath === '' ? '' : `#${subpath}` };
	},
	parseYaml(_yaml: string): unknown {
		return {
			fruit: 'apple',
			count: 2,
		};
	},
	prepareFuzzySearch(_query: string): (text: string) => { score: number; matches: [number, number][] } | null {
		return text => (text.length > 0 ? { score: 1, matches: [[0, 5]] } : null);
	},
	prepareSimpleSearch(_query: string): (text: string) => { score: number; matches: [number, number][] } | null {
		return text => (text.length > 0 ? { score: 1, matches: [[0, 5]] } : null);
	},
	stringifyYaml(value: unknown): string {
		const record = value as { fruit?: string };
		return `fruit: ${record.fruit ?? ''}\n`;
	},
}));

async function createRegistry(): Promise<RpcRegistry> {
	const { createHelperMethods } = await import('packages/obsidian/src/rpc/obsidian/helper-rpc');
	return new RpcRegistry(createHelperMethods(), undefined, testValidatorOptions);
}

test('registers helper methods under the helper permission', async () => {
	const bindings = (await createRegistry()).getWorkerBindings();

	expect(bindings.map(binding => binding.method)).toContain('path:normalize');
	expect(bindings.map(binding => binding.method)).toContain('yaml:parse');
	expect(bindings.every(binding => binding.permission === 'helpers:use')).toBe(true);
});

test('normalizes paths through the Obsidian helper RPC', async () => {
	const result = await (
		await createRegistry()
	).dispatch('path:normalize', { path: 'Folder\\\\Nested//./Note.md' }, { grantedPermissions: new Set(['helpers:use']) });

	expect(result).toEqual({
		ok: true,
		result: 'Folder/Nested/Note.md',
	});
});

test('parses linktext through the Obsidian helper RPC', async () => {
	const result = await (
		await createRegistry()
	).dispatch('link:parseLinktext', { linktext: 'Folder/Note#Heading|Alias' }, { grantedPermissions: new Set(['helpers:use']) });

	expect(result).toEqual({
		ok: true,
		result: {
			path: 'Folder/Note',
			subpath: '#Heading',
		},
	});
});

test('runs search helpers through RPC', async () => {
	const result = await (
		await createRegistry()
	).dispatch('search:prepareSimpleSearch', { query: 'apple pie', text: 'Apple crumble and pie' }, { grantedPermissions: new Set(['helpers:use']) });

	expect(result.ok).toBe(true);
	if (result.ok) {
		expect(result.result).toEqual({
			matches: [[0, 5]],
			score: 1,
		});
	}
});

test('parses and stringifies YAML through RPC', async () => {
	const registry = await createRegistry();
	const parseResult = await registry.dispatch('yaml:parse', { yaml: 'fruit: apple\ncount: 2' }, { grantedPermissions: new Set(['helpers:use']) });
	const stringifyResult = await registry.dispatch(
		'yaml:stringify',
		{ value: { fruit: 'apple', count: 2 } },
		{ grantedPermissions: new Set(['helpers:use']) },
	);

	expect(parseResult).toEqual({
		ok: true,
		result: {
			fruit: 'apple',
			count: 2,
		},
	});
	expect(stringifyResult).toEqual({
		ok: true,
		result: 'fruit: apple\n',
	});
});
