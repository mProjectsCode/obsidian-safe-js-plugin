import { Temporal } from 'temporal-polyfill/implementation';

interface DurationParts extends Temporal.DurationLikeObject {
	years: number;
	months: number;
	weeks: number;
	days: number;
	hours: number;
	minutes: number;
	seconds: number;
	milliseconds: number;
	microseconds: number;
	nanoseconds: number;
}

type DurationPart = keyof DurationParts;

const ISO_DURATION_PATTERN = /^[+-]?P/iu;
const SHORTHAND_DURATION_PATTERN = /([+-]?\d+)\s*(mo|ms|us|ns|y|w|d|h|m|s)\b/giu;
const SHORTHAND_DURATION_PARTS: Record<string, DurationPart> = {
	y: 'years',
	mo: 'months',
	w: 'weeks',
	d: 'days',
	h: 'hours',
	m: 'minutes',
	s: 'seconds',
	ms: 'milliseconds',
	us: 'microseconds',
	ns: 'nanoseconds',
};
const EMPTY_DURATION: DurationParts = {
	years: 0,
	months: 0,
	weeks: 0,
	days: 0,
	hours: 0,
	minutes: 0,
	seconds: 0,
	milliseconds: 0,
	microseconds: 0,
	nanoseconds: 0,
};

export function createToday(timeZone?: Temporal.TimeZoneLike): Temporal.PlainDate {
	return Temporal.Now.plainDateISO(timeZone);
}

export function createYesterday(timeZone?: Temporal.TimeZoneLike): Temporal.PlainDate {
	return createToday(timeZone).subtract({ days: 1 });
}

export function createTomorrow(timeZone?: Temporal.TimeZoneLike): Temporal.PlainDate {
	return createToday(timeZone).add({ days: 1 });
}

export function createNow(timeZone?: Temporal.TimeZoneLike): Temporal.ZonedDateTime {
	return Temporal.Now.zonedDateTimeISO(timeZone);
}

export function createDuration(value: unknown): Temporal.Duration {
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) throw new Error('Duration must be a finite number of milliseconds.');
		return Temporal.Duration.from({ milliseconds: value });
	}

	if (typeof value === 'string') {
		const input = value.trim();
		return Temporal.Duration.from(ISO_DURATION_PATTERN.test(input) ? input : parseShorthandDuration(input));
	}

	return Temporal.Duration.from(value as Temporal.DurationLike);
}

export function getTemporalApi(): typeof Temporal {
	return Temporal;
}

function parseShorthandDuration(value: string): DurationParts {
	const parts = { ...EMPTY_DURATION };
	let consumed = '';
	for (const match of value.matchAll(SHORTHAND_DURATION_PATTERN)) {
		parts[SHORTHAND_DURATION_PARTS[match[2].toLowerCase()]] += Number(match[1]);
		consumed += match[0];
	}

	if (consumed === '' || consumed.replace(/\s+/gu, '') !== value.replace(/\s+/gu, '')) {
		throw new Error(`Invalid duration shorthand '${value}'.`);
	}

	return parts;
}
