/**
 * Pure Beijing-time ("北京时间", UTC+8) working-hours model.
 *
 * A working day is a day the Chinese official calendar marks as a workday.
 * Since 2026 the State Council publishes a year's holiday *and* makeup-workday
 * (调休上班) arrangement only in the preceding autumn, so the model reads the
 * calendar from a pluggable **holiday source** instead of a hand-kept list:
 * `holiday-source.js` supplies the real one (the `chinese-days` npm package,
 * inlined into the browser bundle by `build.mjs`), and tests may pass their own.
 *
 * When the source has no data for a year, the model falls back to the fixed-date
 * statutory holidays — New Year's Day, Labour Day, and National Day — plus the
 * plain Monday–Friday rule.
 *
 * Its working periods are 09:00–12:00 and 14:00–18:00; every other instant is
 * idle time — non-workdays, the lunch break, and the hours outside those two
 * periods.
 *
 * @module worktime
 */
import { createHolidaySource } from "./holiday-source.js";

/** Beijing is UTC+8 with no daylight saving, so the offset is a constant. */
const BEIJING_OFFSET_MINUTES = 8 * 60;

/** Working periods of a working day, in minutes since Beijing midnight. */
const WORK_PERIODS = [
	{ start: 9 * 60, end: 12 * 60 },
	{ start: 14 * 60, end: 18 * 60 }
];

/** Milliseconds in one Beijing day. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How many days ahead `nextWorkStart` will walk. A year of statutory breaks is
 * far shorter than this, so the search always lands on a working day.
 */
const SEARCH_HORIZON_DAYS = 370;

/** Per-year memo behind `fallbackHolidays`, keyed by four-digit year. */
const FALLBACK_HOLIDAY_CACHE = new Map();

/**
 * Fixed-date statutory holidays for a year the holiday source does not cover:
 * New Year's Day (1 day), Labour Day (3 days), and National Day (3 days).
 *
 * The keys are built once per year: `isWorkingDay` consults them for every
 * candidate day a `nextWorkStart` search walks, so rebuilding the list per call
 * would allocate hundreds of strings on every tick.
 * @param year - four-digit Beijing year.
 * @returns the memoized off-weekday date keys of that year.
 */
function fallbackHolidays(year) {
	let dates = FALLBACK_HOLIDAY_CACHE.get(year);
	if (dates === undefined) {
		const at = (month, day) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
		dates = new Set([at(1, 1), at(5, 1), at(5, 2), at(5, 3), at(10, 1), at(10, 2), at(10, 3)]);
		FALLBACK_HOLIDAY_CACHE.set(year, dates);
	}
	return dates;
}

/** Weekday labels for date text, indexed by `Date#getUTCDay`. */
const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/**
 * Normalize a calendar source into a lookup set.
 *
 * @param options - optional calendar definition.
 * @param options.holidays - extra dates to force idle, in `YYYY-MM-DD`; they win
 *   over the holiday source, so a caller can patch a single day without knowing
 *   which source is underneath.
 * @param options.source - holiday source; defaults to the real one built from
 *   `chinese-days`. Pass `null` to opt out and use the fixed-date fallback only.
 * @returns the frozen calendar.
 */
function createCalendar(options = {}) {
	return Object.freeze({
		extraHolidays: new Set(options.holidays ?? []),
		source: options.source === undefined ? createHolidaySource() : options.source
	});
}

/** The built-in calendar: the real holiday source, no per-day overrides. */
const DEFAULT_CALENDAR = createCalendar({ source: createHolidaySource() });

/**
 * Read the Beijing wall clock for an instant.
 * @param nowMs - epoch milliseconds.
 * @returns Beijing calendar fields plus the minute of day.
 */
function beijingParts(nowMs) {
	const shifted = new Date(nowMs + BEIJING_OFFSET_MINUTES * 60_000);
	return {
		year: shifted.getUTCFullYear(),
		month: shifted.getUTCMonth() + 1,
		day: shifted.getUTCDate(),
		weekday: shifted.getUTCDay(),
		minuteOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes()
	};
}

/**
 * Epoch milliseconds of a Beijing midnight, given an instant inside that day.
 * @param nowMs - epoch milliseconds.
 * @returns epoch milliseconds of 00:00 Beijing on that date.
 */
function beijingDayStart(nowMs) {
	const parts = beijingParts(nowMs);
	return Date.UTC(parts.year, parts.month - 1, parts.day) - BEIJING_OFFSET_MINUTES * 60_000;
}

/**
 * Format a Beijing date as `YYYY-MM-DD`.
 * @param parts - Beijing calendar fields.
 * @returns the date key.
 */
function dateKey(parts) {
	return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/**
 * Test whether a Beijing date is a working day.
 *
 * A per-day override wins. Otherwise a year the source covers is answered
 * *entirely* by the source: makeup workdays (调休上班) fall on weekends and are
 * genuinely working days, so a Monday–Friday test must not be applied first. Only a
 * year the source does not cover falls back to Monday–Friday minus the fixed-date
 * holidays.
 * @param parts - Beijing calendar fields.
 * @param calendar - calendar lookup.
 * @returns true for a working day.
 */
function isWorkingDay(parts, calendar) {
	const key = dateKey(parts);
	if (calendar.extraHolidays.has(key)) return false;
	const source = calendar.source;
	if (source !== null && source.yearCovered(parts.year)) return source.isWorkday(key);
	if (parts.weekday === 0 || parts.weekday === 6) return false;
	return !fallbackHolidays(parts.year).has(key);
}

/**
 * Name of the statutory holiday a Beijing date belongs to.
 *
 * Used to enrich the tooltip while the surrounding gap is a holiday. A plain
 * weekend, and any date outside the holiday source's data, has no name.
 * @param parts - Beijing calendar fields.
 * @param calendar - calendar lookup.
 * @returns the holiday name, or `null`.
 */
function holidayLabel(parts, calendar) {
	const source = calendar.source;
	if (source === null) return null;
	return source.holidayName(dateKey(parts));
}

/**
 * Test whether a Beijing minute of day falls inside a working period.
 * @param minuteOfDay - minutes since Beijing midnight.
 * @returns true inside 09:00–12:00 or 14:00–18:00.
 */
function inWorkPeriod(minuteOfDay) {
	return WORK_PERIODS.some((period) => minuteOfDay >= period.start && minuteOfDay < period.end);
}

/**
 * Describe the working state at an instant.
 * @param nowMs - epoch milliseconds; defaults to the current time.
 * @param calendar - calendar lookup; defaults to the built-in one.
 * @returns `{ working, minuteOfDay, weekday }`.
 */
function stateAt(nowMs = Date.now(), calendar = DEFAULT_CALENDAR) {
	const parts = beijingParts(nowMs);
	const working = isWorkingDay(parts, calendar) && inWorkPeriod(parts.minuteOfDay);
	return { working, minuteOfDay: parts.minuteOfDay, weekday: parts.weekday };
}

/**
 * Find the next instant work starts.
 * @param nowMs - reference instant.
 * @param calendar - calendar lookup.
 * @returns `{ atMs, sameDay }` — the next period start and whether it is still
 *   the reference day in Beijing.
 */
function nextWorkStart(nowMs, calendar = DEFAULT_CALENDAR) {
	const today = beijingParts(nowMs);
	const dayStart = beijingDayStart(nowMs);
	for (let offset = 0; offset <= SEARCH_HORIZON_DAYS; offset += 1) {
		const start = dayStart + offset * DAY_MS;
		const parts = beijingParts(start + 60_000);
		if (!isWorkingDay(parts, calendar)) continue;
		for (const period of WORK_PERIODS) {
			if (offset === 0 && period.start <= today.minuteOfDay) continue;
			return { atMs: start + period.start * 60_000, sameDay: offset === 0 };
		}
	}
	/* v8 ignore next -- an unbounded search always finds a working day */
	return { atMs: nowMs, sameDay: false };
}

/**
 * Find the next instant work ends.
 * @param nowMs - reference instant inside a working period.
 * @param calendar - calendar lookup.
 * @returns epoch milliseconds of the end of the current working period.
 */
function nextWorkEnd(nowMs, calendar = DEFAULT_CALENDAR) {
	const parts = beijingParts(nowMs);
	const period = WORK_PERIODS.find((candidate) => parts.minuteOfDay >= candidate.start && parts.minuteOfDay < candidate.end);
	/* v8 ignore next -- callers only ask while a working period is active */
	if (period === undefined) return nowMs;
	return beijingDayStart(nowMs) + period.end * 60_000;
}

/**
 * Split a duration into whole hours and minutes.
 * @param ms - non-negative duration in milliseconds.
 * @returns `{ hours, minutes }`, with minutes rounded up so a remaining minute
 *   never reads as `0h 0min`.
 */
function splitDuration(ms) {
	const totalMinutes = Math.max(0, Math.ceil(ms / 60_000));
	return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

/**
 * Render a duration as `3h 12min`, dropping a zero hour or minute part.
 * @param ms - non-negative duration in milliseconds.
 * @returns the duration text.
 */
function durationText(ms) {
	const { hours, minutes } = splitDuration(ms);
	if (hours > 0 && minutes > 0) return `${hours}h ${minutes}min`;
	if (hours > 0) return `${hours}h`;
	return `${minutes}min`;
}

/**
 * Render a Beijing date as `10月12日（周一）`.
 * @param atMs - instant inside the day to render.
 * @returns the date text.
 */
function dateText(atMs) {
	const parts = beijingParts(atMs);
	return `${parts.month}月${parts.day}日（${WEEKDAY_LABELS[parts.weekday]}）`;
}

/**
 * Render a Beijing clock time as `09:00`.
 * @param atMs - instant to render.
 * @returns the clock text.
 */
function clockText(atMs) {
	const parts = beijingParts(atMs);
	return `${String(Math.floor(parts.minuteOfDay / 60)).padStart(2, "0")}:${String(parts.minuteOfDay % 60).padStart(2, "0")}`;
}

/**
 * Describe the holiday gap a next-start instant belongs to.
 *
 * The holiday name is read from the *previous* day: a break's last day carries
 * its own name, whereas the working day it returns on carries none.
 * @param atMs - next-start instant.
 * @param calendar - calendar lookup.
 * @returns ` （春节）`-style suffix, or `""` outside a named holiday.
 */
function holidaySuffix(atMs, calendar) {
	const label = holidayLabel(beijingParts(atMs - DAY_MS), calendar);
	return label === null ? "" : `（${label}）`;
}

/**
 * Build the ring's hover text for the current state.
 *
 * While a working period is active the text counts down to its end. While idle
 * it counts up to the next start, dropping the date when that start is still
 * today (before work or the lunch break), naming it otherwise, and naming the
 * holiday that caused the wait.
 * @param nowMs - reference instant; defaults to the current time.
 * @param calendar - calendar lookup; defaults to the built-in one.
 * @returns the tooltip text.
 */
function tooltipText(nowMs = Date.now(), calendar = DEFAULT_CALENDAR) {
	if (stateAt(nowMs, calendar).working) return `距离下班还有 ${durationText(nextWorkEnd(nowMs, calendar) - nowMs)}`;

	const next = nextWorkStart(nowMs, calendar);
	const remaining = durationText(next.atMs - nowMs);
	if (next.sameDay) return `距离上班还有 ${remaining}`;
	return `下次上班：${dateText(next.atMs)} ${clockText(next.atMs)}${holidaySuffix(next.atMs, calendar)}（还有 ${remaining}）`;
}

export {
	BEIJING_OFFSET_MINUTES,
	DAY_MS,
	SEARCH_HORIZON_DAYS,
	WORK_PERIODS,
	beijingDayStart,
	beijingParts,
	clockText,
	createCalendar,
	dateText,
	durationText,
	fallbackHolidays,
	holidayLabel,
	inWorkPeriod,
	isWorkingDay,
	nextWorkEnd,
	nextWorkStart,
	splitDuration,
	stateAt,
	tooltipText
};
