/**
 * Adapter between the `chinese-days` npm package and the `worktime` model.
 *
 * `chinese-days` is the holiday database: it ships the State Council's official
 * arrangements (2004 onward, including 调休 makeup workdays, refreshed upstream
 * from gov.cn by an automated workflow) and answers the questions the model needs
 * — is this date a workday, which holiday does it belong to, and does the
 * database cover this year at all.
 *
 * The package is CommonJS with no ES-module entry, so the browser never resolves it
 * at runtime. `build.mjs` inlines the package's UMD build into `client.js` and
 * strips this module's imports, handing the names in as wrapper parameters — the
 * inlined package arrives as `chineseDays`, exactly as the default import reads.
 *
 * @module holiday-source
 */
import chineseDays from "chinese-days";
// Node-only, and both lines are stripped by `build.mjs`: the browser bundle receives
// `createRequire` as `undefined` and this URL as an empty string, which the guard
// below turns into "no resolver" instead of a crash. See `hasYearData`.
import { createRequire } from "node:module";
const importMetaUrl = import.meta.url;

/** First year the package has arrangements for. */
const FIRST_COVERED_YEAR = 2004;

/** Range the installed package is probed over: every shipped year, plus headroom. */
const PROBE_LAST_YEAR = new Date().getUTCFullYear() + 6;

/**
 * Node's resolver, created once; subpath probing runs it once per year.
 *
 * `createRequire` is absent from the browser bundle, and the empty `importMetaUrl`
 * there would be rejected by it anyway, so the guard is not defensive padding.
 */
const nodeRequire = typeof createRequire === "function" && importMetaUrl !== "" ? createRequire(importMetaUrl) : null;

/**
 * Probe the package's per-year JSON through Node's resolver.
 *
 * Deep subpath access works because the package declares no `exports` map.
 * @param year - four-digit year.
 * @returns true when the package ships that year's arrangement.
 */
function hasYearData(year) {
	try {
		return nodeRequire !== null && nodeRequire(`chinese-days/dist/years/${year}.json`) !== null;
	} catch {
		return false;
	}
}

/**
 * Years the installed package actually has arrangements for.
 *
 * The probe has to agree with the package's internal behaviour: outside its table
 * it silently degrades to a plain Monday–Friday test, which would quietly call a
 * future National Day a workday. Anything not covered therefore falls back to the
 * fixed-date holidays instead.
 *
 * The browser cannot probe a filesystem, so `build.mjs` prefixes the module with
 * `BROWSER_COVERED_YEARS` — the same probe, run once at build time. That constant
 * does not exist in Node, where the probe runs live against the installed package.
 */
const COVERED_YEARS = (() => {
	/* eslint-disable-next-line no-undef -- injected by build.mjs into the browser bundle. */
	if (typeof BROWSER_COVERED_YEARS !== "undefined") return new Set(BROWSER_COVERED_YEARS);
	const years = new Set();
	// The horizon reaches past any plausible clock skew, so a machine with a wrong
	// system date still reports every year the package ships data for.
	for (let year = FIRST_COVERED_YEAR; year <= PROBE_LAST_YEAR; year += 1) {
		if (hasYearData(year)) years.add(year);
	}
	return years;
})();

/**
 * The real holiday source, backed by `chinese-days`.
 * @returns a source to pass as `createCalendar({ source })`.
 */
function createHolidaySource() {
	if (typeof chineseDays?.isWorkday !== "function") {
		throw new Error("chinese-days is unavailable: build.mjs must inline its UMD bundle into client.js");
	}
	return {
		/**
		 * Whether the package has an official arrangement for a year.
		 * @param year - four-digit year.
		 * @returns true when the year is covered.
		 */
		yearCovered(year) {
			return COVERED_YEARS.has(year);
		},

		/**
		 * Whether an official arrangement marks a date as a workday.
		 * @param key - `YYYY-MM-DD`.
		 * @returns true for a workday, including makeup workdays on weekends.
		 */
		isWorkday(key) {
			return chineseDays.isWorkday(key);
		},

		/**
		 * The statutory holiday a date belongs to.
		 * @param key - `YYYY-MM-DD`.
		 * @returns the Chinese holiday name, or `null` when the model cannot name it.
		 */
		holidayName(key) {
			return nameOf(chineseDays.getDayDetail(key)?.name);
		}
	};
}

/**
 * Reduce the package's `"English,中文,index"` detail label to a display name.
 *
 * The package labels every date, including ordinary weekdays (`"Friday"`) and the
 * working day a holiday window returns on (which inherits the holiday's label). A
 * statutory holiday always has a Chinese name, so requiring one is exactly the
 * test for "this date is inside a named holiday".
 * @param detail - the `name` field of `getDayDetail`, or undefined.
 * @returns the Chinese name, or `null`.
 */
function nameOf(detail) {
	if (typeof detail !== "string") return null;
	return detail.split(",").find((part) => /[\u4e00-\u9fa5]/.test(part)) ?? null;
}

export { COVERED_YEARS, FIRST_COVERED_YEAR, createHolidaySource, nameOf };
