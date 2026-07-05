import { createDuration, createNow, createToday, createTomorrow, createYesterday, getTemporalApi } from 'packages/obsidian/src/worker/worker-date-utilities';
import { createFileUtility, createLinkUtility, createTagUtility, formatByteCount, slugifyText } from 'packages/obsidian/src/worker/worker-value-utilities';
import type { Harden } from 'ses';
import type { Temporal } from 'temporal-polyfill/implementation';

interface UtilityFactories {
	today(timeZone?: Temporal.TimeZoneLike): Temporal.PlainDate;
	yesterday(timeZone?: Temporal.TimeZoneLike): Temporal.PlainDate;
	tomorrow(timeZone?: Temporal.TimeZoneLike): Temporal.PlainDate;
	now(timeZone?: Temporal.TimeZoneLike): Temporal.ZonedDateTime;
	duration(value: unknown): Temporal.Duration;
	link(target: unknown, display?: unknown, options?: unknown): unknown;
	file(value: unknown): unknown;
	tag(value: unknown): unknown;
	formatBytes(value: unknown, options?: unknown): string;
	slugify(value: unknown, options?: unknown): string;
}

interface WorkerUtilities {
	temporal: typeof Temporal;
	utils: UtilityFactories;
	expressionGlobals: Record<string, unknown>;
}

export function createWorkerUtilities(hardenValue: Harden): WorkerUtilities {
	const factories: UtilityFactories = {
		today(timeZone?: Temporal.TimeZoneLike): Temporal.PlainDate {
			return createToday(timeZone);
		},
		yesterday(timeZone?: Temporal.TimeZoneLike): Temporal.PlainDate {
			return createYesterday(timeZone);
		},
		tomorrow(timeZone?: Temporal.TimeZoneLike): Temporal.PlainDate {
			return createTomorrow(timeZone);
		},
		now(timeZone?: Temporal.TimeZoneLike): Temporal.ZonedDateTime {
			return createNow(timeZone);
		},
		duration(value: unknown): Temporal.Duration {
			return createDuration(value);
		},
		link(target: unknown, display?: unknown, options?: unknown): unknown {
			return createLinkUtility(target, display, options, hardenValue);
		},
		file(value: unknown): unknown {
			return createFileUtility(value, hardenValue);
		},
		tag(value: unknown): unknown {
			return createTagUtility(value, hardenValue);
		},
		formatBytes(value: unknown, options?: unknown): string {
			return formatByteCount(value, options);
		},
		slugify(value: unknown, options?: unknown): string {
			return slugifyText(value, options);
		},
	};

	const utils = hardenValue(factories);
	// Expression globals are wrappers rather than detached object methods, keeping their call semantics independent of `this`.
	function today(timeZone?: Temporal.TimeZoneLike): Temporal.PlainDate {
		return factories.today(timeZone);
	}
	function yesterday(timeZone?: Temporal.TimeZoneLike): Temporal.PlainDate {
		return factories.yesterday(timeZone);
	}
	function tomorrow(timeZone?: Temporal.TimeZoneLike): Temporal.PlainDate {
		return factories.tomorrow(timeZone);
	}
	function now(timeZone?: Temporal.TimeZoneLike): Temporal.ZonedDateTime {
		return factories.now(timeZone);
	}
	function duration(value: unknown): Temporal.Duration {
		return factories.duration(value);
	}
	function link(target: unknown, display?: unknown, options?: unknown): unknown {
		return factories.link(target, display, options);
	}
	function file(value: unknown): unknown {
		return factories.file(value);
	}
	function tag(value: unknown): unknown {
		return factories.tag(value);
	}
	function formatBytes(value: unknown, options?: unknown): string {
		return factories.formatBytes(value, options);
	}
	function slugify(value: unknown, options?: unknown): string {
		return factories.slugify(value, options);
	}

	return {
		temporal: hardenValue(getTemporalApi()),
		utils,
		expressionGlobals: hardenValue({ today, yesterday, tomorrow, now, duration, link, file, tag, formatBytes, slugify }),
	};
}
