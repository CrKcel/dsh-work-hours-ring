# Repository Guidelines

## Project Structure & Module Organization

`@local/dsh-work-hours-ring` is a DeepSeek Harness client plugin that renders a work-hours ring beside the composer's model selector.

- `holiday-source.js` — adapter over the `chinese-days` npm package: workday test, holiday name, year coverage.
- `worktime.js` — pure Beijing-time model: work periods, working-day rule, next-start/next-end, tooltip text.
- `client.source.js` — authored client half: ring SVG, ticking component, slot registration.
- `build.mjs` — wraps and inlines the two model modules plus the vendored `chinese-days` UMD build into `client.source.js`'s marker, then emits the browser artifact.
- `client.js` — generated bundle loaded by the page. **Do not edit by hand.**
- `index.js` — Host half; pure UI.
- `cordis.patch.yml` — bundle patch inserting the `work-hours-ring` row.
- `test/` — Node scripts covering the time model, the bundle protocol, and the committed artifact's freshness.
- `.github/workflows/ci.yml` — build + test on every pull request and on pushes to `main`.
- `.github/workflows/autobuild.yml` — rebuilds and commits `client.js` after a push to any branch.
- `.gitattributes` — forces LF so the committed bundle compares byte for byte on any platform.
- `icon.svg`, `README.md` — plugin icon and user-facing docs.

`package.json`'s `files` ships only the runtime half — `index.js`, `client.js`,
`cordis.patch.yml`, `icon.svg`, `README.md`. The build inputs stay in the repository and out of
an installed profile. A `file:` install hard-links the whole directory, so only git installs see
the `files` list.

## Build, Test, and Development Commands

```sh
npm install     # first run only: fetches the chinese-days holiday database
npm run build   # regenerate client.js after editing client.source.js, worktime.js or holiday-source.js
npm test        # verify the committed client.js is current, then run both test scripts
node test/worktime.test.js   # time-model cases only
```

Rebuild `client.js` before manual check in the Harness. The artifact is self-contained: the
build inlines `node_modules/chinese-days` (~24 KB), so the profile needs no runtime dependency
and the page makes no network request.

A local `npm run build` is a convenience, not a requirement for a push: the `Auto-build bundle`
workflow rebuilds on the runner and commits the result back (see Continuous Integration).

Holiday data is a **build-time** input. To pick up a newly published year, bump
`chinese-days` and rebuild — the build re-probes the shipped years and bakes the covered
range into the bundle.

## Distribution

`dsh plugin --profile <profile> add github:CrKcel/dsh-work-hours-ring` installs the repository as
a git dependency, so **whatever is committed is what a profile receives**.

`client.js` is therefore committed, and the manifest deliberately carries **no `prepare` script**.
pnpm 11 refuses to run a git-hosted package's build scripts unless the consumer profile
allowlists the exact `@local/dsh-work-hours-ring@git+<url>#<commit>` path in its
`pnpm-workspace.yaml`; it refuses by throwing, leaving no pending-build entry for DSH to approve,
and a bare name or wildcard rule does not match a non-semver source. A `prepare` script would
make the install command fail and demand a hand-written allowlist line per commit, so the
staleness guard runs at test time instead: `test/artifact.test.js` rebuilds and compares byte for
byte, so `npm test` fails on a source edit that was not rebuilt and committed. Do not add
`prepare`, `prepack`, or `prepublish` unless pnpm's git-hosted build policy changes.

## Continuous Integration

Two workflows, both `ubuntu-latest`, both starting from `npm ci` against the committed lockfile,
so the vendored `chinese-days` bytes are the ones the bundle was built from:

- `ci.yml` — `npm test` on every pull request and on pushes to `main`, across Node 22, 24 and 26.
  It is the gate: `test/artifact.test.js` regenerates the bundle and compares byte for byte, so a
  source edit committed without a rebuild is red here rather than stale inside a profile.
- `autobuild.yml` — on a push to any branch, run `npm run build` and commit `client.js` back when
  it changed, as `chore(build): regenerate client.js [skip ci]`. This is what makes the source
  tree, not the checkout command, the thing a contributor commits. It runs only in
  `CrKcel/dsh-work-hours-ring` (a fork's token is read-only and its history is not ours to
  rewrite), so a fork-sourced PR still has to ship a rebuilt `client.js` to pass CI.

The auto-commit cannot feed itself: the job's own commit changes only `client.js`, which is in
`paths-ignore`, and a push authenticated with the default `GITHUB_TOKEN` starts no new workflow
run; `[skip ci]` guards the case where a maintainer swaps in a personal token. Keep those three
guards in place when editing the trigger. The job declares `permissions: contents: write` on
purpose — the repository default is read-only, and the workflow file is allowed to escalate.

One consequence worth knowing: `build.mjs` bakes `currentYear + 6` into the year coverage. On the
first push of a new year the runner may therefore report the committed bundle as stale even
though no source changed; the auto-commit is the intended repair, and `ci.yml` is red only until
it lands.

## Testing

Tests use Node's built-in `node:assert/strict` — no framework, no coverage threshold.
`test/artifact.test.js` runs first and rebuilds `client.js` to prove the committed bytes are
current, restoring them untouched when they are not. `test/worktime.test.js` is table-driven: add
a `{ at, working, text, why }` case for each new time rule, plus ad-hoc assertions for holiday
naming, the per-day override, and the `source: null` fallback. `test/client.test.js` asserts the
bundle protocol (loader id, baseline-only requires, slot registration), that `chinese-days` is
vendored with build-time year coverage, and — end to end, through `WorkHoursRing({ now })` — that
the shipped model matches the official calendar. All three must pass via `npm test`; the artifact
check deliberately runs before the build so a stale commit fails instead of being papered over.

Holiday expectations are read from the installed package, not restated by hand: if a case
fails after a dependency bump, the package's data changed and the case needs review.
