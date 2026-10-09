import assert from "node:assert/strict";
import {
	createCalendar,
	durationText,
	holidayLabel,
	nextWorkStart,
	stateAt,
	tooltipText
} from "../worktime.js";
import { COVERED_YEARS, createHolidaySource, nameOf } from "../holiday-source.js";

const calendar = createCalendar();

/**
 * Epoch milliseconds of a Beijing wall-clock instant.
 * @param {string} text - `YYYY-MM-DDTHH:MM` in Beijing time.
 * @returns {number} epoch milliseconds.
 */
function beijing(text) {
	return Date.parse(`${text}:00+08:00`);
}

const cases = [
	// Thursday 2026-10-08 is a working day. The hand-kept list this model used to
	// carry wrongly listed it as National Day leave; the official arrangement ends
	// the National Day break on 10-07.
	{ at: "2026-10-08T10:00", working: true, text: "距离下班还有 2h", why: "workday after National Day" },
	// Friday 2026-10-09 is a working day; Saturday 10-10 is a makeup workday.
	{ at: "2026-10-09T10:00", working: true, text: "距离下班还有 2h", why: "mid-morning" },
	{ at: "2026-10-09T11:30", working: true, text: "距离下班还有 30min", why: "before lunch" },
	{ at: "2026-10-09T12:00", working: false, text: "距离上班还有 2h", why: "lunch starts" },
	{ at: "2026-10-09T12:30", working: false, text: "距离上班还有 1h 30min", why: "lunch middle" },
	{ at: "2026-10-09T13:59", working: false, text: "距离上班还有 1min", why: "lunch end" },
	{ at: "2026-10-09T14:00", working: true, text: "距离下班还有 4h", why: "afternoon starts" },
	{ at: "2026-10-09T17:59", working: true, text: "距离下班还有 1min", why: "one minute left" },
	{ at: "2026-10-09T18:00", working: false, text: "下次上班：10月10日（周六） 09:00（还有 15h）", why: "makeup Saturday follows" },
	{ at: "2026-10-09T08:00", working: false, text: "距离上班还有 1h", why: "before work, same day" },
	{ at: "2026-10-09T09:00", working: true, text: "距离下班还有 3h", why: "work starts" },
	// 调休上班: an official makeup workday lands on a weekend and is worked.
	{ at: "2026-10-10T10:00", working: true, text: "距离下班还有 2h", why: "makeup workday" },
	{ at: "2026-10-10T12:30", working: false, text: "距离上班还有 1h 30min", why: "makeup workday lunch" },
	{ at: "2026-10-11T10:00", working: false, text: "下次上班：10月12日（周一） 09:00（还有 23h）", why: "Sunday is idle" },
	{ at: "2026-10-11T09:00", working: false, text: "下次上班：10月12日（周一） 09:00（还有 24h）", why: "weekend 09:00 is not work" },
	// National Day 2026 runs 10-01 … 10-07, so the wait is named for the holiday and
	// ends on the Thursday, not on the makeup Saturday that follows it.
	{ at: "2026-10-01T10:00", working: false, text: "下次上班：10月8日（周四） 09:00（国庆节）（还有 167h）", why: "holiday Thursday" },
	{ at: "2026-10-07T15:00", working: false, text: "下次上班：10月8日（周四） 09:00（国庆节）（还有 18h）", why: "last holiday day" },
	// Spring Festival 2026 runs 02-15 … 02-23, with makeup workdays either side.
	{ at: "2026-02-13T10:00", working: true, text: "距离下班还有 2h", why: "Friday before the break" },
	{ at: "2026-02-13T18:00", working: false, text: "下次上班：2月14日（周六） 09:00（还有 15h）", why: "makeup Saturday follows" },
	{ at: "2026-02-14T10:00", working: true, text: "距离下班还有 2h", why: "makeup workday before Spring Festival" },
	{ at: "2026-02-15T10:00", working: false, text: "下次上班：2月24日（周二） 09:00（春节）（还有 215h）", why: "first holiday day, a Sunday" },
	{ at: "2026-02-23T10:00", working: false, text: "下次上班：2月24日（周二） 09:00（春节）（还有 23h）", why: "last break day" },
	{ at: "2026-02-24T10:00", working: true, text: "距离下班还有 2h", why: "back from Spring Festival" },
	{ at: "2026-02-28T10:00", working: true, text: "距离下班还有 2h", why: "makeup workday after Spring Festival" },
	// A year the package has no arrangement for uses the fixed-date fallback.
	{ at: "2027-05-01T10:00", working: false, text: "下次上班：5月4日（周二） 09:00（还有 71h）", why: "fallback Labour Day" },
	{ at: "2027-05-04T10:00", working: true, text: "距离下班还有 2h", why: "fallback ends" },
	{ at: "2027-01-01T10:00", working: false, text: "下次上班：1月4日（周一） 09:00（还有 71h）", why: "fallback New Year" }
];

let failed = 0;
for (const item of cases) {
	const at = beijing(item.at);
	const actualWorking = stateAt(at, calendar).working;
	try {
		assert.equal(actualWorking, item.working, `${item.at} (${item.why}) working-state`);
		assert.equal(tooltipText(at, calendar), item.text, `${item.at} (${item.why}) tooltip`);
		process.stdout.write(`ok   ${item.at}  ${item.text}\n`);
	} catch (error) {
		failed += 1;
		process.stdout.write(`FAIL ${item.at} (${item.why}): ${error.message}\n`);
	}
}

// Direct next-start checks, independent of the text formatting. The 10-09 evening
// start is the makeup Saturday, not the following Monday.
assert.deepEqual(nextWorkStart(beijing("2026-10-09T12:30"), calendar), {
	atMs: beijing("2026-10-09T14:00"),
	sameDay: true
});
assert.deepEqual(nextWorkStart(beijing("2026-10-09T18:30"), calendar), {
	atMs: beijing("2026-10-10T09:00"),
	sameDay: false
});
assert.deepEqual(nextWorkStart(beijing("2026-10-11T18:30"), calendar), {
	atMs: beijing("2026-10-12T09:00"),
	sameDay: false
});
process.stdout.write("ok   nextWorkStart checkpoints\n");

// Duration edge cases: a partial minute rounds up, zero hours collapse.
assert.equal(durationText(0), "0min");
assert.equal(durationText(59_000), "1min");
assert.equal(durationText(60 * 60_000), "1h");
assert.equal(durationText(90 * 60_000), "1h 30min");
assert.equal(durationText(63 * 60 * 60_000), "63h");
process.stdout.write("ok   durationText edge cases\n");

// The holiday source is the installed package's own table, not a hand-kept list.
assert.equal(COVERED_YEARS.has(2026), true, "the package ships the 2026 arrangement");
assert.equal(COVERED_YEARS.has(2004), true, "coverage starts in 2004");
assert.equal(COVERED_YEARS.has(2027), false, "2027 has not been published yet");
assert.equal(typeof createHolidaySource().isWorkday, "function");
process.stdout.write(`ok   holiday-source coverage (${COVERED_YEARS.size} years)\n`);

// The package labels every date, so its detail string is reduced to a holiday name
// only when a Chinese name is present.
assert.equal(nameOf("Friday"), null, "an ordinary weekday has no holiday name");
assert.equal(nameOf("National Day,国庆节,3"), "国庆节");
assert.equal(nameOf(undefined), null);
assert.equal(holidayLabel({ year: 2026, month: 10, day: 1 }, calendar), "国庆节");
assert.equal(holidayLabel({ year: 2026, month: 6, day: 10 }, calendar), null, "a plain Wednesday is unnamed");
process.stdout.write("ok   holiday naming\n");

// A per-day override wins over the source, so a caller can still patch one date.
const patched = createCalendar({ holidays: ["2026-06-10"] });
assert.equal(stateAt(beijing("2026-06-10T10:00"), calendar).working, true, "an ordinary Wednesday is worked");
assert.equal(stateAt(beijing("2026-06-10T10:00"), patched).working, false, "the override moves it to idle");
assert.equal(stateAt(beijing("2026-06-11T10:00"), patched).working, true, "the override does not spill over");
process.stdout.write("ok   per-day holiday override\n");

// An explicit `null` source opts out of the package and uses fixed dates only:
// National Day then covers just 10-01 … 10-03, so 10-08 becomes an ordinary
// Thursday and the Dragon Boat holiday disappears entirely.
const fallbackOnly = createCalendar({ source: null });
assert.equal(stateAt(beijing("2026-10-02T10:00"), fallbackOnly).working, false, "a fixed National Day date is idle");
assert.equal(stateAt(beijing("2026-10-08T10:00"), fallbackOnly).working, true, "beyond the fixed dates it is worked");
assert.equal(stateAt(beijing("2026-06-19T10:00"), fallbackOnly).working, true, "Dragon Boat is unknown without the source");
assert.equal(stateAt(beijing("2026-06-19T10:00"), calendar).working, false, "but the source knows it");
process.stdout.write("ok   source can be opted out of\n");

if (failed > 0) {
	process.stdout.write(`\n${failed} case(s) failed\n`);
	process.exitCode = 1;
} else {
	process.stdout.write(`\nall ${cases.length} cases passed\n`);
}
