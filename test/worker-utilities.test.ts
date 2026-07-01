import { expect, test } from 'bun:test';
import { toJsonValue } from 'packages/obsidian/src/execution/json';
import { SesCompartment, sesHarden } from 'packages/obsidian/src/worker/ses-runtime';
import { createWorkerUtilities } from 'packages/obsidian/src/worker/worker-utilities';

interface LinkUtilityValue {
	path: string;
	subpath: string | null;
	display: string | null;
	toMarkdown(): string;
}

interface FileUtilityValue {
	path: string;
	basename: string;
	extension: string;
}

interface TagUtilityValue {
	name: string;
	levels: string[];
	toString(): string;
}

test('worker Temporal API and convenience factories return standard Temporal objects', () => {
	const { temporal, utils } = createWorkerUtilities(sesHarden);
	const today = utils.today('UTC');
	const yesterday = utils.yesterday('UTC');
	const tomorrow = utils.tomorrow('UTC');
	const now = utils.now('UTC');
	const duration = utils.duration('2w 3d');
	const preciseDuration = utils.duration('1ms 2us 3ns');
	const clampedMonth = temporal.PlainDate.from('2024-01-31').add(utils.duration('1mo'));

	expect(today).toBeInstanceOf(temporal.PlainDate);
	expect(now).toBeInstanceOf(temporal.ZonedDateTime);
	expect(duration).toBeInstanceOf(temporal.Duration);
	expect(yesterday.add({ days: 1 }).equals(today)).toBe(true);
	expect(tomorrow.subtract({ days: 1 }).equals(today)).toBe(true);
	expect(now.timeZoneId).toBe('UTC');
	expect(clampedMonth.toString()).toBe('2024-02-29');
	expect(duration.weeks).toBe(2);
	expect(duration.days).toBe(3);
	expect(duration.toString()).toBe('P2W3D');
	expect(preciseDuration.toString()).toBe('PT0.001002003S');
	expect(Object.isFrozen(temporal)).toBe(true);
	expect(Object.isFrozen(temporal.PlainDate.prototype)).toBe(true);
});

test('Temporal results serialize through their standard toJSON methods', () => {
	const { temporal, utils } = createWorkerUtilities(sesHarden);
	const date = temporal.PlainDate.from('2024-01-15');

	expect(toJsonValue(date)).toBe('2024-01-15');
	expect(toJsonValue({ date, duration: utils.duration('2h') })).toEqual({ date: '2024-01-15', duration: 'PT2H' });
});

test('worker Obsidian value helpers normalize without host access', () => {
	const { utils } = createWorkerUtilities(sesHarden);
	const link = utils.link('![[Folder/Note#Heading|Read me]]') as LinkUtilityValue;
	const file = utils.file('Folder/Note.md') as FileUtilityValue;
	const tag = utils.tag(' project/next step ') as TagUtilityValue;

	expect(link).toMatchObject({ path: 'Folder/Note', subpath: '#Heading', display: 'Read me' });
	expect(link.toMarkdown()).toBe('![[Folder/Note#Heading|Read me]]');
	expect(file).toMatchObject({ path: 'Folder/Note.md', basename: 'Note', extension: 'md' });
	expect(tag.levels).toEqual(['project', 'next-step']);
	expect(tag.toString()).toBe('#project/next-step');
	expect(utils.formatBytes(1536, { binary: true })).toBe('1.5 KiB');
	expect(utils.formatBytes(0.5)).toBe('1 B');
});

test('expression utility aliases are direct globals and caller inputs can override them', async () => {
	const { expressionGlobals, temporal } = createWorkerUtilities(sesHarden);
	const compartment = new SesCompartment({
		globals: sesHarden({ Temporal: temporal, ...expressionGlobals, duration: 'caller override', price: 12, quantity: 3 }),
		__options__: true,
	});

	const result = (await compartment.evaluate('(async () => ({ total: price * quantity, duration, formatted: formatBytes(1000) }))()')) as {
		total: number;
		duration: string;
		formatted: string;
	};
	expect(result.total).toBe(36);
	expect(result.duration).toBe('caller override');
	expect(result.formatted).toBe('1.0 kB');
});
