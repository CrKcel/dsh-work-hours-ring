# Repository Guidelines

## Project Structure & Module Organization

`@local/dsh-work-hours-ring` is a DeepSeek Harness client plugin that renders a work-hours ring beside the composer's model selector.

- `worktime.js` — pure Beijing-time model: work periods, `HOLIDAYS`, next-start/next-end, tooltip text.
- `client.source.js` — authored client half: ring SVG, ticking component, slot registration.
- `build.mjs` — inlines `worktime.js` into `client.source.js` and emits the browser artifact.
- `client.js` — generated bundle loaded by the page. **Do not edit by hand.**
- `index.js` — Host half; pure UI.
- `cordis.patch.yml` — bundle patch inserting the `work-hours-ring` row.
- `test/` — Node scripts covering the time model and the bundle protocol.
- `icon.svg`, `README.md` — plugin icon and user-facing docs.

## Build, Test, and Development Commands

```sh
npm run build   # regenerate client.js after editing client.source.js or worktime.js
npm test        # build, then run both test scripts
node test/worktime.test.js   # time-model cases only
```

Rebuild `client.js` before manual check in the Harness.

## Testing

Tests use Node's built-in `node:assert/strict` — no framework, no coverage threshold.
`test/worktime.test.js` is table-driven: add a `{ at, working, text, why }` case for each new
time rule. `test/client.test.js` asserts bundle protocol (loader id, baseline-only requires,
slot registration). Both must pass via `npm test`.
