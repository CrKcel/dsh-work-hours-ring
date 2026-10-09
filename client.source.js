/**
 * Authored source of the client half; `npm run build` inlines it into
 * `client.js`, the browser bundle the page loads.
 *
 * The ring renders in `conversation.input.right`, the list slot the composer
 * places immediately before the model selector, and recolors itself from the
 * Beijing working-hours model:
 *
 * - orange while a working period is active,
 * - blue while idle (weekends, holidays, lunch break, off hours).
 *
 * Hovering it shows how long is left until work ends, or when work starts next.
 *
 * @module client
 */
import * as React from "react";
import { Tooltip } from "@deepseek-ai/dsh-client-ui-primitives";
// __WORKTIME_MODEL__

/** The slot the composer renders just before the model selector. */
const SLOT_NAME = "conversation.input.right";

/**
 * Services this plugin mounts on. The Cordis loader refuses to hand a plugin a
 * service it did not declare, so `ctx.slots` is unavailable without this export;
 * shipped client plugins declare it the same way.
 */
const inject = ["slots"];

/** Ring geometry, in CSS pixels. */
const RING_EDGE = 16;
const RING_CENTER = RING_EDGE / 2;
/**
 * Edge thickness. SVG strokes straddle the path, so the radius sheds half the
 * stroke: `RING_RADIUS + RING_STROKE / 2` lands exactly on `RING_EDGE`, keeping
 * the thick outer edge inside the 16px box the composer lays out.
 */
const RING_STROKE = 3.5;
const RING_RADIUS = RING_CENTER - RING_STROKE / 2;

/** Active-working color and idle color. */
const WORKING_COLOR = "#f59e0b";
const IDLE_COLOR = "#3b82f6";

/** How often the ring re-reads the clock. */
const TICK_MS = 30_000;

/** Element id and keyframes name for the working pulse. */
const STYLE_ID = "dsh-work-hours-ring-style";
const PULSE_NAME = "dsh-work-hours-ring-pulse";

/**
 * Wrapper style. The wrapper must stay hit-testable: the host Tooltip attaches
 * its pointer handlers to this element, and `pointer-events: none` on it or on
 * the SVG would stop the hover text from ever opening.
 */
const ringStyle = {
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	alignSelf: "center",
	width: RING_EDGE,
	height: RING_EDGE,
	flex: "0 0 auto",
	cursor: "default"
};

/**
 * Build the ring artwork for a state.
 *
 * The artwork is a single stroked circle with a thick edge and no fill, so the
 * middle stays hollow. It is the only shape, so the working pulse animates this
 * stroke directly rather than a separate center dot.
 *
 * The host Tooltip clones its child and attaches both its pointer handlers and
 * a `ref`; it measures the anchor through that ref, so a component that drops
 * the ref makes the tooltip bail out at `getBoundingClientRect`. Forward it (and
 * spread the cloned handlers) onto the wrapper element.
 * @param props - cloned Tooltip props plus `working`, which selects the color
 *   and the pulse.
 * @param ref - the Tooltip's anchor ref.
 * @returns the ring element.
 */
const Ring = React.forwardRef(function Ring({ working, ...rest }, ref) {
	const color = working ? WORKING_COLOR : IDLE_COLOR;
	return React.createElement(
		"span",
		{
			...rest,
			ref,
			style: { ...ringStyle, ...rest.style },
			"data-work-hours-state": working ? "working" : "idle"
		},
		React.createElement(
			"svg",
			{
				width: RING_EDGE,
				height: RING_EDGE,
				viewBox: `0 0 ${RING_EDGE} ${RING_EDGE}`,
				"aria-hidden": "true",
				focusable: "false",
				style: { display: "block", overflow: "visible" }
			},
			React.createElement("circle", {
				cx: RING_CENTER,
				cy: RING_CENTER,
				r: RING_RADIUS,
				fill: "none",
				stroke: color,
				strokeWidth: RING_STROKE,
				style: working ? { animation: `${PULSE_NAME} 2.4s ease-in-out infinite` } : undefined
			})
		)
	);
});

/**
 * The ring plus its hover text, re-read on a fixed interval.
 * @returns the tooltip-wrapped ring.
 */
function WorkHoursRing() {
	const calendar = React.useMemo(() => createCalendar(), []);
	const [nowMs, setNowMs] = React.useState(() => Date.now());

	React.useEffect(() => {
		const timer = setInterval(() => setNowMs(Date.now()), TICK_MS);
		return () => clearInterval(timer);
	}, []);

	const working = stateAt(nowMs, calendar).working;
	const text = tooltipText(nowMs, calendar);

	return React.createElement(
		Tooltip,
		{ label: text, side: "top", delayMs: 200, children: React.createElement(Ring, { working }) }
	);
}

/** Registration id inside the slot. */
const ENTRY_ID = "work-hours-ring";

/**
 * Install the ring's keyframes once per document.
 *
 * The pulse fades the stroke instead of scaling it: CSS transforms on an SVG
 * shape resolve `transform-origin` against the viewBox, so a scale would drift
 * the ring toward the box corner rather than breathing about its own center.
 * @returns a disposer that removes the style element.
 */
function installStyle() {
	if (document.getElementById(STYLE_ID) !== null) return () => {};
	const style = document.createElement("style");
	style.id = STYLE_ID;
	style.setAttribute("data-plugin", ENTRY_ID);
	style.textContent = [
		`@keyframes ${PULSE_NAME} {`,
		"  0%, 100% { opacity: 1; }",
		"  50% { opacity: 0.3; }",
		"}",
		"@media (prefers-reduced-motion: reduce) {",
		`  [data-work-hours-state="working"] circle { animation: none !important; }`,
		"}"
	].join("\n");
	document.head.append(style);
	return () => style.remove();
}

/**
 * Register the ring in the composer's trailing list.
 *
 * The module-level `inject` beside this export is required: the Cordis loader
 * refuses to hand a plugin a service it did not declare, so `ctx.slots` throws
 * "cannot get property \"slots\" without inject" and the whole page fails its
 * boot audit without it.
 * @param ctx - client root context.
 */
function apply(ctx) {
	ctx.effect(() => installStyle(), "work-hours-ring: keyframes");
	ctx.slots.inject(SLOT_NAME, () =>
		ctx.slots.register(
			{
				name: SLOT_NAME,
				id: ENTRY_ID,
				order: 100,
				inject: () => ({})
			},
			WorkHoursRing
		)
	);
}

export { Ring, WorkHoursRing, apply };
