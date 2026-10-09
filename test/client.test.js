import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const client = readFileSync(join(root, "client.js"), "utf8");
const source = readFileSync(join(root, "client.source.js"), "utf8");

/** Baseline module table the shell seeds for every client bundle. */
const baseline = [
	"react",
	"react/jsx-runtime",
	"react-dom",
	"react-dom/client",
	"@deepseek-ai/cordis",
	"@deepseek-ai/dsh-client-store",
	"@deepseek-ai/dsh-client-ui-slots",
	"@deepseek-ai/dsh-client-ui-primitives",
	"@deepseek-ai/dsh-client-ui-dockkit"
];

// 1. The bundle registers its factory under the package id.
let registration;
new Function("window", client)({ __ModuleLoader__: { load(entry) { registration = entry; } } });
assert.equal(registration?.id, "@local/dsh-work-hours-ring", "registers under its package id");
assert.equal(typeof registration.factory, "function", "registers a lazy factory");
assert.ok(!/^\s*(import|export)\s/m.test(client), "the artifact is a plain script, not an ES module");
process.stdout.write("ok   client.js registers a loader factory\n");

// 2. Its require calls stay on the baseline module table.
const required = [...client.matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1]);
assert.deepEqual([...new Set(required)].sort(), ["@deepseek-ai/dsh-client-ui-primitives", "react"], "requires only baseline modules");
for (const specifier of required) assert.ok(baseline.includes(specifier), `"${specifier}" is baseline`);
assert.ok(!/require\("\.\//.test(client), "no relative requires, so the bundle is self-contained");
process.stdout.write(`ok   requires stay on the baseline (${[...new Set(required)].join(", ")})\n`);

// 3. The factory returns the client half and needs no session data.
const REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref");
const fakeReact = {
	forwardRef(render) {
		return { $$typeof: REACT_FORWARD_REF_TYPE, render };
	},
	createElement: (type, props) => ({ type, props }),
	useMemo: (factory) => factory(),
	useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}],
	useEffect: () => {}
};
const loaded = registration.factory((specifier) => {
	if (specifier === "react") return fakeReact;
	if (specifier === "@deepseek-ai/dsh-client-ui-primitives") return { Tooltip: (props) => props };
	throw new Error(`unexpected require("${specifier}")`);
});
assert.equal(typeof loaded.apply, "function", "client half exports apply");
assert.deepEqual(loaded.inject, ["slots"], "client half declares the slots service it mounts on");
assert.equal(typeof loaded.WorkHoursRing, "function", "client half exports the ring component");
process.stdout.write("ok   factory resolves and exports apply() + inject\n");

// 4. apply() registers one entry into the composer's trailing list.
const registered = [];
const effects = [];
const ctx = {
	effect(factory, label) {
		effects.push(label);
		return factory();
	},
	injected: [],
	slots: {
		inject(name, register) {
			ctx.injected.push(name);
			return register();
		},
		register(options, component) {
			registered.push({ options, component });
			return () => {};
		}
	}
};
const style = { id: "", textContent: "", attributes: {}, setAttribute(name, value) { this.attributes[name] = value; }, remove() {} };
globalThis.document = {
	head: { append() {} },
	getElementById: () => null,
	createElement: () => style
};
loaded.apply(ctx);
assert.deepEqual(ctx.injected, ["conversation.input.right"], "injects the slot rendered just before the model selector");
assert.equal(registered.length, 1, "registers exactly one entry");
assert.equal(registered[0].options.name, "conversation.input.right");
assert.equal(registered[0].options.id, "work-hours-ring");
assert.equal(registered[0].options.order, 100, "orders nearest the model selector");
assert.equal(typeof registered[0].component, "function", "registers a component");
assert.equal(effects.length, 1, "owns its keyframes through one effect");
assert.ok(style.textContent.includes("prefers-reduced-motion"), "the working pulse respects reduced motion");

// 5. The Tooltip contract: it clones its child, measures the anchor through a
//    ref, and delivers hover through the cloned handlers. A component that
//    swallows the ref never opens a tooltip.
{
	const React = fakeReact;
	assert.equal(typeof loaded.Ring, "object", "Ring is a forwardRef component");
	assert.equal(typeof loaded.Ring.render, "function", "so React hands it the Tooltip anchor ref");
	const wrapper = loaded.Ring.render({ working: true, onMouseEnter: () => {}, "aria-describedby": "tip" }, { current: null });
	assert.equal(wrapper.type, "span", "the ring renders one hit-testable wrapper element");
	assert.equal(wrapper.props["data-work-hours-state"], "working", "the wrapper carries its state marker");
	assert.equal(typeof wrapper.props.onMouseEnter, "function", "the Tooltip's cloned hover handler reaches the wrapper");
	assert.equal(wrapper.props["aria-describedby"], "tip", "the Tooltip's ARIA link reaches the wrapper");
	assert.equal(wrapper.props.style.pointerEvents, undefined, "the wrapper stays hit-testable so hover opens the tooltip");
}
process.stdout.write("ok   Ring forwards the Tooltip anchor ref and the cloned hover handlers\n");

// 6. The module-level inject gate: Cordis refuses an undeclared service, and the
//    ring needs `ctx.slots`, so losing this declaration fails the whole plugin
//    with "cannot get property \"slots\" without inject".
{
	const notAService = new Set(["effect", "on", "inject", "provide", "get", "set", "logger", "fiber", "scope", "reflect", "extend", "isolate", "intercept", "waterfall", "emit", "parallel", "bail", "start", "stop"]);
	const declared = new Set(loaded.inject ?? []);
	const used = [...source.matchAll(/ctx\.([A-Za-z_$][\w$]*)/g)].map((match) => match[1]);
	for (const name of new Set(used)) {
		if (notAService.has(name)) continue;
		assert.ok(declared.has(name), `ctx.${name} is a service, so inject must declare "${name}"`);
	}
	assert.ok(declared.has("slots"), "the ring mounts on the slots service");
}
process.stdout.write("ok   apply() registers into conversation.input.right with owned styles\n");

// 7. The authored source and the artifact stay in sync.
assert.ok(source.includes("// __WORKTIME_MODEL__"), "the source carries the inline marker");
assert.ok(client.includes("function tooltipText("), "the artifact inlines the time model");
assert.ok(!client.includes("// __WORKTIME_MODEL__"), "the marker is consumed by the build");
process.stdout.write("ok   artifact inlines the tested time model\n");

// 8. The holiday package is vendored into the artifact, not fetched at runtime.
assert.ok(client.includes("chinese-days@"), "the artifact records the vendored package version");
assert.ok(client.includes("const chineseDays = (function ()"), "the package is evaluated into a private binding");
assert.ok(client.includes("BROWSER_COVERED_YEARS"), "the covered years are injected at build time");
assert.ok(/BROWSER_COVERED_YEARS = \[[^\]]*\b2026\b/.test(client), "the injected range reaches 2026");
assert.ok(!/^\s*import\s/m.test(client), "the vendored package never becomes an ES import");
assert.ok(!client.includes("import.meta"), "no import.meta survives into a classic script");
assert.ok(Buffer.byteLength(client) < 200_000, "the artifact stays a small, self-contained script");
process.stdout.write("ok   chinese-days is vendored with build-time year coverage\n");

// 9. End to end: the model the bundle actually ships follows the official calendar,
//    including a 调休 makeup workday that the old hand-kept list called idle.
{
	const at = (text) => Date.parse(`${text}:00+08:00`);
	const tooltipAt = (text) => {
		const tree = loaded.WorkHoursRing({ now: at(text) });
		return tree.props.label;
	};
	assert.equal(tooltipAt("2026-10-09T10:00"), "距离下班还有 2h", "a Friday inside National Day week is worked");
	assert.equal(tooltipAt("2026-10-10T10:00"), "距离下班还有 2h", "the makeup Saturday is worked");
	assert.equal(tooltipAt("2026-10-11T10:00"), "下次上班：10月12日（周一） 09:00（还有 23h）", "the Sunday after is idle");
	assert.equal(
		tooltipAt("2026-02-23T10:00"),
		"下次上班：2月24日（周二） 09:00（春节）（还有 23h）",
		"the last Spring Festival day is named in the tooltip"
	);
	assert.equal(tooltipAt("2026-10-08T10:00"), "距离下班还有 2h", "the day the hand-kept list over-counted is worked");
	process.stdout.write("ok   the shipped model matches the official 2026 calendar\n");
}

process.stdout.write("\nall client checks passed\n");
