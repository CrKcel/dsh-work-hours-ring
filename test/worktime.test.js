import assert from "node:assert/strict";
import {
	HOLIDAYS,
	createCalendar,
	durationText,
	nextWorkStart,
	stateAt,
	tooltipText
} from "../worktime.js";

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
	// Friday 2026-10-09 is a working day; National Day ended on 10-07.
	{ at: "2026-10-09T10:00", working: true, text: "距离下班还有 2h", why: "mid-morning" },
	{ at: "2026-10-09T11:30", working: true, text: "距离下班还有 30min", why: "before lunch" },
	{ at: "2026-10-09T12:00", working: false, text: "距离上班还有 2h", why: "lunch starts" },
	{ at: "2026-10-09T12:30", working: false, text: "距离上班还有 1h 30min", why: "lunch middle" },
	{ at: "2026-10-09T13:59", working: false, text: "距离上班还有 1min", why: "lunch end" },
	{ at: "2026-10-09T14:00", working: true, text: "距离下班还有 4h", why: "afternoon starts" },
	{ at: "2026-10-09T17:59", working: true, text: "距离下班还有 1min", why: "one minute left" },
	{ at: "2026-10-09T18:00", working: false, text: "下次上班：10月12日（周一） 09:00（还有 63h）", why: "weekend follows" },
	{ at: "2026-10-09T08:00", working: false, text: "距离上班还有 1h", why: "before work, same day" },
	{ at: "2026-10-10T10:00", working: false, text: "下次上班：10月12日（周一） 09:00（还有 47h）", why: "Saturday is idle" },
	{ at: "2026-10-11T08:00", working: false, text: "下次上班：10月12日（周一） 09:00（还有 25h）", why: "Sunday before next workday" },
	{ at: "2026-10-11T09:00", working: false, text: "下次上班：10月12日（周一） 09:00（还有 24h）", why: "weekend 09:00 is not work" },
	// Holidays: National Day 2026.
	{ at: "2026-10-01T10:00", working: false, text: "下次上班：10月9日（周五） 09:00（还有 191h）", why: "holiday Thursday" },
	{ at: "2026-10-07T15:00", working: false, text: "下次上班：10月9日（周五） 09:00（还有 42h）", why: "last holiday day" },
	// Spring Festival break 2026-02-15 … 02-23.
	{ at: "2026-02-13T10:00", working: true, text: "距离下班还有 2h", why: "Friday before the break" },
	{ at: "2026-02-13T18:00", working: false, text: "下次上班：2月24日（周二） 09:00（还有 255h）", why: "break follows" },
	{ at: "2026-02-23T10:00", working: false, text: "下次上班：2月24日（周二） 09:00（还有 23h）", why: "last break day" },
	// A year without an announcement uses the fixed-date fallback.
	{ at: "2027-05-01T10:00", working: false, text: "下次上班：5月4日（周二） 09:00（还有 71h）", why: "fallback Labour Day" },
	{ at: "2027-05-04T10:00", working: true, text: "距离下班还有 2h", why: "fallback ends" },
	{ at: "2027-01-01T10:00", working: false, text: "下次上班：1月4日（周一） 09:00（还有 71h）", why: "fallback New Year" },
	// Boundary minutes belong to the working period that starts on them.
	{ at: "2026-10-09T09:00", working: true, text: "距离下班还有 3h", why: "work starts" }
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

// Direct next-start checks, independent of the text formatting.
assert.deepEqual(nextWorkStart(beijing("2026-10-09T12:30"), calendar), {
	atMs: beijing("2026-10-09T14:00"),
	sameDay: true
});
assert.deepEqual(nextWorkStart(beijing("2026-10-09T18:30"), calendar), {
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

// The built-in 2026 list holds the official off-weekday windows.
assert.equal(HOLIDAYS.includes("2026-02-16"), true);
assert.equal(HOLIDAYS.includes("2026-02-15"), false, "a Sunday needs no holiday row");
assert.equal(HOLIDAYS.includes("2026-10-08"), true, "National Day 2026 runs through 10-08");
process.stdout.write(`ok   calendar rows (${HOLIDAYS.length})\n`);

if (failed > 0) {
	process.stdout.write(`\n${failed} case(s) failed\n`);
	process.exitCode = 1;
} else {
	process.stdout.write(`\nall ${cases.length} cases passed\n`);
}
