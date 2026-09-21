# delivery-tools architecture

The contract between the slices that build the `delivery` CLI. The spec (`SPEC-v2.md`, outside
this repo) is normative for behaviour; this file is normative for **where** things live, **who
owns** each file, and the **signatures** one slice calls in another. `tests/core/ownership.test.mjs`
fails when a file has no owner here, or when a cross-slice function listed here is missing from
its file.

## Slices

| Slice | Scope |
|---|---|
| F | Foundation: core library, schemas, CLI entry, manifest, test helpers, this file. Frozen once the slices start; changes go through a request in a slice report. |
| A1 | Run machinery: `status`, `advance`, `ready` (and `--check`), `waive`, `hook`; state and journal semantics; resume (spec 11.3); the phase gates 0 to 7; `hooks/`. |
| A2 | GitHub and lifecycle: `init`, `intake`, `preflight`, `issues sync`, `scope post/read`, `claims open/verify`, `dupes`, `ci`, `wave start/merge/end`, `pr-body`, `handover`, `land`. |
| B1 | Checks: `check` for M1, M3 to M12, M14 to M17; `inventory check`; `plan verify/check/render`; `gate <unit>`; the severity policy (spec 8.3). |
| B2 | Code analysis and seeding: `baseline` (M2), `sidefx`, `seed` (every mode), M13; `adapters/data/`. |
| C | Design, capture and reports: `design candidates/render`; `adapters/design/`; `capture` (every mode); `templates/`; `audit compile`; `report`. |
| — | Not built by any slice here: `skills/`, `agents/`, `briefs/`, `.claude-plugin/plugin.json`, `README.md`, the marketplace entry. |

## Ownership

First matching row wins; rows are globs (`*` within a path segment, `**` across segments).
A slice may add files only under paths it owns. Everything in `lib/core/`, `schemas/`,
`bin/`, `tests/core/` and `tests/helpers/` is F's; a slice that needs a change there writes a
request in its report and works around it locally.

| Path | Owner |
|---|---|
| `docs/ARCHITECTURE.md` | F |
| `docs/**` | F |
| `bin/delivery.mjs` | F |
| `scripts/build-manifest.mjs` | F |
| `MANIFEST.sha256` | F |
| `lib/core/**` | F |
| `schemas/**` | F |
| `tests/core/**` | F |
| `tests/helpers/**` | F |
| `tests/fixtures/schemas/**` | F |
| `lib/commands/status.mjs` | A1 |
| `lib/commands/advance.mjs` | A1 |
| `lib/commands/ready.mjs` | A1 |
| `lib/commands/waive.mjs` | A1 |
| `lib/commands/hook-*.mjs` | A1 |
| `lib/run/**` | A1 |
| `lib/gates/**` | A1 |
| `hooks/**` | A1 |
| `tests/run/**` | A1 |
| `tests/gates/**` | A1 |
| `tests/hooks/**` | A1 |
| `tests/fixtures/run/**` | A1 |
| `lib/commands/init.mjs` | A2 |
| `lib/commands/intake.mjs` | A2 |
| `lib/commands/preflight.mjs` | A2 |
| `lib/commands/issues-sync.mjs` | A2 |
| `lib/commands/scope-*.mjs` | A2 |
| `lib/commands/claims-*.mjs` | A2 |
| `lib/commands/dupes.mjs` | A2 |
| `lib/commands/ci.mjs` | A2 |
| `lib/commands/wave-*.mjs` | A2 |
| `lib/commands/pr-body.mjs` | A2 |
| `lib/commands/handover.mjs` | A2 |
| `lib/commands/land.mjs` | A2 |
| `lib/lifecycle/**` | A2 |
| `lib/github/**` | A2 |
| `tests/lifecycle/**` | A2 |
| `tests/github/**` | A2 |
| `tests/fixtures/lifecycle/**` | A2 |
| `lib/commands/check.mjs` | B1 |
| `lib/commands/inventory-check.mjs` | B1 |
| `lib/commands/plan-*.mjs` | B1 |
| `lib/commands/gate.mjs` | B1 |
| `lib/checks/**` | B1 |
| `lib/plan/**` | B1 |
| `lib/gate/**` | B1 |
| `tests/checks/**` | B1 |
| `tests/plan/**` | B1 |
| `tests/gate/**` | B1 |
| `tests/fixtures/checks/**` | B1 |
| `lib/commands/baseline.mjs` | B2 |
| `lib/commands/sidefx.mjs` | B2 |
| `lib/commands/seed.mjs` | B2 |
| `lib/baseline/**` | B2 |
| `lib/sidefx/**` | B2 |
| `lib/seed/**` | B2 |
| `adapters/data/**` | B2 |
| `tests/baseline/**` | B2 |
| `tests/sidefx/**` | B2 |
| `tests/seed/**` | B2 |
| `tests/fixtures/seed/**` | B2 |
| `lib/commands/design-*.mjs` | C |
| `lib/commands/capture.mjs` | C |
| `lib/commands/audit-compile.mjs` | C |
| `lib/commands/report.mjs` | C |
| `lib/design/**` | C |
| `lib/capture/**` | C |
| `lib/report/**` | C |
| `adapters/design/**` | C |
| `templates/**` | C |
| `tests/design/**` | C |
| `tests/capture/**` | C |
| `tests/report/**` | C |
| `tests/fixtures/design/**` | C |
| `tests/fixtures/capture/**` | C |
| `skills/**` | — |
| `agents/**` | — |
| `briefs/**` | — |
| `.claude-plugin/**` | — |
| `README.md` | — |

### Module map

```
bin/delivery.mjs              F   entry: global flags, manifest check, dispatch, exit code
scripts/build-manifest.mjs    F   regenerate or --check MANIFEST.sha256
lib/core/
  args.mjs                    F   extractGlobalFlags, parseCommandArgs, intFlag
  exit.mjs                    F   EXIT codes, DeliveryError and subclasses, notImplementedError, worstExit
  output.mjs                  F   createOutput: one FAIL line per failure, or one JSON object (--json)
  command.mjs                 F   defineCommand, notImplementedRun, resolveCommand, COMMAND_ORDER, helpText
  ctx.mjs                     F   createCtx: the ctx every run(ctx, argv) receives
  paths.mjs                   F   featurePaths (docs/delivery/<f>/, .delivery/<f>/, docs/design/<f>/)
  profile.mjs                 F   loadProfile, validateProfile, fillCommand, wrapHeavy, loadSafety (read-only)
  schema.mjs                  F   JSON Schema validator; validateAgainst, assertValid, schemaRegistry
  artefacts.mjs               F   readArtefact, writeArtefact, artefactHash by name, validated
  state.mjs                   F   state and journal primitives: chain, append-only save, lock, events
  findings.mjs                F   makeFinding, findingId, upsertFindings, recordFindings, readFindings
  gate.mjs                    F   GateResult, gateResult, combineGates, guardGate
  run.mjs                     F   createRunner (spawn or stub), defaultRunner (DELIVERY_RUNNER_STUB)
  git.mjs                     F   createGit over the runner; parseWorktreePorcelain
  gh.mjs                      F   createGh over the gh CLI; the Gh interface the gh stub implements
  discovery.mjs               F   discoverRuns (git worktree list), runsIn, resolveFeature
  markers.mjs                 F   makeMarker, parseMarkers, hasMarker, readBlock, upsertBlock
  hash.mjs                    F   sha256, sha256File, sha256Tree, canonicalJson, hashJson
  fs.mjs                      F   readJson, writeJsonAtomic, writeFileAtomic, withLock, exists
  playwright.mjs              F   resolvePlaywright from the target repo (never a top-level import)
  manifest.mjs                F   buildManifest, verifyManifest
  zip.mjs                     F   readZip, writeZip (the design archive and runtime.zip)
  clock.mjs                   F   systemClock, isoDate
lib/commands/<command>[-<sub>].mjs    one per command of spec 16 (owners in the table above)
lib/gates/phase-0.mjs ... phase-7.mjs A1  gate(ctx) -> Promise<GateResult>
lib/run/                      A1  ready.mjs (checkReady), inflight.mjs (recordDispatch, clearDispatch), and A1's own modules
lib/lifecycle/                A2  intake, preflight (PROBES), preview, wave, land
lib/github/                   A2  issues, scope, claims, dupes, ci
lib/plan/                     B1  inventory-check, check (M1), render (spec.md), verify
lib/checks/                   B1  index (registry, runChecks), severity, one module per check
lib/gate/                     B1  unit (unitGateStatus, the unit gate)
lib/baseline/                 B2  extract, diff (M2), refresh
lib/sidefx/                   B2  derive
lib/seed/                     B2  safety (M13), scan, plan, apply
adapters/data/supabase.mjs    B2  createDataAdapter
adapters/design/              C   index (getDesignAdapter), claude-design, image-folder
lib/design/                   C   candidates, render, static server
lib/capture/                  C   run, validate, spot, served-sha, job file
lib/report/                   C   report (tldr), punch list
templates/                    C   delivery-capture.spec.ts, delivery-capture-support.ts, component-state.test.tsx, punch-list.html, version-route.ts
hooks/                        A1  hooks.json, session-start.sh, pre-bash.sh, pre-browser.sh
```

## How commands register

A command is a file. `lib/commands/<command>.mjs` or `lib/commands/<command>-<sub>.mjs`, whose
default export is `defineCommand({ name, summary, usage, run })` from `lib/core/command.mjs`:

```js
export default defineCommand({
  name: 'plan check',              // the words a user types; file = name with spaces as hyphens
  summary: 'one line for --help',
  usage: `usage: delivery plan check ...`,   // printed by `delivery plan check --help`
  async run(ctx, argv) { ... return 0; },    // resolves to the exit code
});
```

- `bin/delivery.mjs` strips `--feature`, `--json` and `--help` wherever they appear, verifies
  `MANIFEST.sha256` (exit 5 on mismatch), then resolves `<command> <sub>` to
  `<command>-<sub>.mjs` if that file exists, else `<command>.mjs`. A group with no bare module
  (`plan`, `hook`, ...) and no or an unknown sub is a usage error (exit 2) listing the subs.
- `argv` holds only the command's own arguments. Parse them with
  `parseCommandArgs(argv, { options, positionals })`; unknown flags are exit 2.
- Report each failure with `ctx.out.fail(code, message)` (one line: `FAIL <code> <message>`),
  informational lines with `ctx.out.line`, and machine fields with `ctx.out.set(key, value)`.
  In `--json` mode bin prints one object: `{ ok, exit, failures: [{code, message}], lines, data }`.
- Throw a `DeliveryError` (or `UsageError`, `ConfigError`, `BlockedError`, `WaitError`,
  `InconsistencyError`) to stop with its exit code; its `failures` are printed one per line.
  Any other exception is a bug: `FAIL internal <message>`, exit 1, stack with `DELIVERY_DEBUG=1`.
- A command that has not landed keeps `run: notImplementedRun('<slice>')`: exit 2,
  `not implemented (slice <X>)`. Replace the whole `run`, keep `name`, and keep `usage`
  accurate (you may extend it).
- `COMMAND_ORDER` in `lib/core/command.mjs` lists every spec-16 command; `--help` prints them in
  that order. Do not add commands outside spec 16 without a request to F.

Exit codes (spec 16), for every command: 0 pass; 1 red; 2 usage or configuration; 3 blocked on
the founder; 4 wait and retry; 5 inconsistency.

## The ctx

Built once by `createCtx` (`lib/core/ctx.mjs`); tests build the same object with
`makeTestCtx` (`tests/helpers/ctx.mjs`).

| Field | Type | Notes |
|---|---|---|
| `cwd` | string | process cwd |
| `repoRoot` | string | git toplevel of cwd: the worktree the command runs in |
| `pluginRoot` | string | the delivery-tools directory (for `templates/`, `schemas/`) |
| `flags` | `{ feature, json, help }` | the global flags |
| `feature` | string or null | `--feature`, else the single run in this worktree, else null |
| `paths` | `FeaturePaths` or null | every artefact path of the feature (`lib/core/paths.mjs`) |
| `requirePaths()` | `FeaturePaths` | throws exit 2 when there is no feature |
| `profile()` | `Promise<Profile>` | validated, cached; exit 2 when missing or invalid |
| `safety()` | `Promise<{ safety, bytes, sha256, path }>` | read-only and frozen; exit 3 when absent (P2) |
| `out` | `Output` | `line`, `fail`, `warn`, `set`, `failures`, `finish` |
| `runner` | `Runner` | the only way to start a process: `run(cmd, args, opts)`, `sh(command, opts)` |
| `git` | `Git` | bound to `repoRoot` |
| `gh` | `Gh` | bound to `profile.issues.repo`; the in-memory stub in tests |
| `clock` | `{ now(), iso() }` | never call `Date.now()` for anything recorded |
| `env` | object | environment |
| `cli` | `{ version, manifestSha256 }` | for `ready.json` and the report |
| `journal(e)` | `Promise<boolean>` | append one event to `state.json` when the run has one |

Pure logic takes plain data (a plan, a findings doc, file text) and lives in
`lib/<area>/*.mjs`; I/O lives in the command module or in a function that takes `ctx`.

## Artefacts

Every artefact has a schema in `schemas/`: JSON Schema 2020-12, `schemaVersion` const 1, every
object closed with `additionalProperties: false` except pure records. The one exception is the
click-results file, a bare array with no `schemaVersion`; the capture manifest that names it
carries one. Artefacts with a fixed path are read and written through
`readArtefact(paths, name, { key, optional })` / `writeArtefact(paths, name, value, { key })`,
which validate both ways; files beside a capture are checked with `validateAgainst(schema, value)`. A file only the CLI writes (state, ready, captures, unit files,
sidefx, seedplan, preflight, candidates) that fails its schema is exit 5: tampered.

| Artefact | Path | Schema | Writer | Main readers |
|---|---|---|---|---|
| profile | `.claude/delivery-profile.json` | profile | a person (drafted by `init`, A2) | everyone via `ctx.profile()` |
| safety | `.claude/delivery-safety.json` | safety | the founder only; never the CLI | B2, A2 (P2) via `ctx.safety()` |
| intent | `docs/delivery/<f>/intent.json` | intent | intake (A2) | everyone |
| candidates | `.delivery/<f>/candidates.json` | candidates | design candidates (C) | inventory check (B1) |
| inventory | `docs/delivery/<f>/inventory.json` | inventory | extractor agents | B1, C |
| design renders | `.delivery/<f>/design/<ID>.{png,txt,dom.json}` | dom | design render (C) | B1 (M4 to M6), auditors |
| baseline | `docs/delivery/<f>/baseline.json` | baseline | baseline (B2) | B1 (M1), A1 |
| baseline at HEAD | `.delivery/<f>/baseline-head.json` | baseline | baseline --against (B2) | M2 |
| plan | `docs/delivery/<f>/plan.json` | plan | coverage-plan agents; scope read (A2); baseline --refresh (B2) | everyone |
| spec | `docs/delivery/<f>/spec.md` | (markdown) | plan render (B1) | issues sync (A2) |
| preflight | `.delivery/<f>/preflight.json` | preflight | preflight (A2) | phase-1 gate, waive (A1) |
| sidefx | `.delivery/<f>/sidefx.json` | sidefx | sidefx (B2) | seed (B2) |
| seedplan | `.delivery/<f>/seedplan.json` | seedplan | seed --plan (B2) | seed, capture (C) |
| unit file | `.delivery/<f>/units/<id>.json` | unit-file | wave start (A2) | builders |
| unit report | `.delivery/<f>/units/<id>.report.json` | unit-report | builders | gate (B1), status (A1) |
| capture | `.delivery/<f>/captures/<runId>/capture.json` | capture | capture (C) | B1, A1, report |
| capture log | beside it, named by `files.errors` | capture-errors | capture (C) | M10, M16, M17 (B1) |
| capture dom | beside it, named by `files.dom` | dom | capture (C) | M5, M6, M9 (B1) |
| click results | beside it, named by `files.controls` (`<key>.controls.json`), only when the capture clicked | capture-controls: `[{ testid, target, reached, why? }]` | capture (C) | M9 (B1) |
| findings | `.delivery/<f>/findings.json` | findings | checks (B1, B2), auditors via the main session | ready, report, audit compile |
| ready | `.delivery/<f>/ready.json` | ready | ready (A1) | hook, land, report |
| state | `.delivery/<f>/state.json` | state | only through `lib/core/state.mjs` | status, gates |
| punch list | `.delivery/<f>/punch-list.html` | (html) | audit compile (C) | the main session |

File paths inside `capture.json` are relative to that capture run's directory. The `.txt`
beside a render or capture holds one visible text element per line, in reading order. In a
click-results entry, `target` is the plan control's target (a state id, `external` or `none`),
`reached` is true when every marker of that target appeared after the click, and `why` says in
one line what was missing when it did not.

The profile has one optional section that spec 17 lacks, `testData` (spec 18, Portability):
`mode` (`tenant`, the default when the section is absent; `database`; `none`) and
`robotOrganizationId`, the organisation the repo's e2e robot writes to. Check M14 counts that
organisation's rows before and after the PR's new e2e specs run; without the field, M14 says it
did not count them.

## State and the journal

`lib/core/state.mjs` guarantees shape, chain and append-only writes; what the fields mean is A1's.

- Every write is `updateState(paths, mutate, event)`: lock `.delivery/<f>/state.lock`, load,
  apply a pure mutation (it cannot touch the journal), append exactly one entry, save
  atomically. `createState` writes the genesis entry. Never write `state.json` any other way.
- An entry is `{ seq, at, event, inputs, outputs, prev, hash }`. `inputs` and `outputs` are the
  sha256 of the canonical JSON of what the command read and produced; `prev` is the previous
  entry's `hash` (64 zeros for genesis); `hash` covers every other field.
- `event` is one line built by `formatEvent({ command, exit, counts })`:
  `check M7 | exit=1 | findings=3`. The handover's "Verification performed" (A2) is generated
  by `parseEvent` over these, so journal every command that proves something, with its exit
  code and counts: `await ctx.journal({ command, exit, counts, inputs, outputs })`.
- Loading verifies schema and chain; any break is exit 5 and leads the report. A save whose
  journal does not extend the one on disk, or that changes `runId` or `feature`, is exit 5.
- Gates never read a recorded verdict from state; state is a cache and a log (spec 11.1).

## Findings

A finding is one item of `findings.json` (`schemas/findings.schema.json`):

```js
{ id, source, rule?, severity: 'P1'|'P2'|'P3', dayOne, state, group, where, design, live, cause?,
  evidence: 'seen'|'code-read'|'test', status: 'open'|'fixed'|'accepted'|'filed'|'cut'|'duplicate',
  accept?: { reasonClass, issue, text }, fixedIn?, reAudits }
```

- Build with `makeFinding({ source, severity, state, where, ... })`; defaults: open, not
  day-one, seen, no re-audits. `source` is `check:M<n>`, `auditor:<group>` or `review`.
- `id` is `findingId({ source, rule, state, where })`: stable across runs, so a decided status
  survives a re-run. Put what identifies the problem in `rule` and `where`
  (`WL-01.design.admin.1440.en.light.txt:4`), not in `live`.
- Record a check's results with `recordFindings(paths, runId, { source, fresh, fixedIn, inScope })`:
  it locks, keeps accepted/filed/cut/duplicate statuses, reopens a `fixed` finding that is back,
  and marks `fixed` an open finding of that source that did not recur, only where
  `inScope(finding)` (so a branch-mode check over three states cannot fix findings elsewhere).
- Severity rules (day-one raise, P1 floors, accepted-P2 caps) are B1's (`lib/checks/severity.mjs`).

## Markers

`makeMarker({ feature, kind, id? })` gives `<!-- delivery:<feature>:<kind>:<id> -->`; the prefix
comes from `profile.issues.markerPrefix` (default `delivery`). Kinds in use:

| Marker | On |
|---|---|
| `<!-- delivery:<f>:epic -->` | the epic's body |
| `<!-- delivery:<f>:unit:<unitId> -->` | a build-unit child |
| `<!-- delivery:<f>:backend:<unitId> -->` | a backend child |
| `<!-- delivery:<f>:cut:<rowId> -->` | a cut follow-up |
| `<!-- delivery:<f>:polish -->` | the P3 polish issue |
| `<!-- delivery:<f>:scope -->` | the Scope issue |
| `<!-- delivery:<f>:spec -->` | the spec comment on the epic |
| `<!-- delivery:<f>:release -->` | the release block comment on the epic |
| `<!-- delivery:<f>:pr -->` | the run's draft PR body |
| `<!-- delivery:<f>:block:<name> -->` ... `<!-- /delivery:<f>:block:<name> -->` | generated PR body and handover blocks (`upsertBlock`, `readBlock`) |
| `<!-- delivery:claims -->` ... `<!-- /delivery:claims -->` | the claimed-paths block the repo's scope check reads (spec 12.2) |

Search with `ctx.gh.findByMarker(marker, { kind })` (open and closed, exact marker in the body)
and `ctx.gh.findCommentByMarker(issue, marker)`. GitHub's search index lags new issues by
seconds to minutes, so A2 keeps its own record of numbers it created (the journal and the plan)
and checks both before creating anything.

## Phase gates

`lib/gates/phase-<n>.mjs` exports `gate(ctx) -> Promise<GateResult>` (A1). A gate recomputes
from sources and composes the gate-facing functions other slices export, each wrapped in
`guardGate(code, fn)` so a slice that has not landed shows as a failure line (exit 2,
`not-implemented`), not a crash; results merge with `combineGates`.

| Gate | spec 3.4: advance refuses unless | Composes |
|---|---|---|
| phase-0 | snapshot hashed, intent validates, epic exists by marker, state initialised | `verifyIntake`, `findEpic` |
| phase-1 | every probe green, a wave-0 task, or waived where waivable | `preflightGate`, `PROBES` |
| phase-2 | candidates mapped or excluded, states rendered or impossible, baseline for a redesign | `inventoryGate`, `baselineGate` |
| phase-3 | plan check, issues synced, Scope posted and snapshotted | `planGate`, `issuesSyncedGate`, `scopeGate` |
| phase-4 | contracts compile with stubs, worlds seeded and scanned, capture smoke, claims | `unitGateStatus` (contract unit), `seedScanGate`, `captureSmokeGate`, `claimsGate` |
| phase-5 | every unit gate green, last wave sync clean, full CI green | `unitGateStatus` (each unit), `waveSyncGate`, `ciStatus` |
| phase-6 | `ready.json` green for the PR head | `checkReady` |
| phase-7 | staging proof green, epic closed | `landGate` |

`advance <phase>` (A1) runs every earlier gate, then the gate of the phase being left.

## Cross-slice functions

Each exists now with its final signature and JSDoc, as a stub that throws
`notImplementedError('<slice>', '<name>')` (exit 2) until its slice fills it. Keep the
signature; if it must change, say so under "Requests for other slices" in your report.
`GateResult` is `{ ok: boolean, failures: { code, message }[], exit?: number }`.

| Function | File | Owner | Signature | Called by |
|---|---|---|---|---|
| `checkReady` | `lib/run/ready.mjs` | A1 | `(ctx, { pr }) => Promise<GateResult & { headSha }>` | hook pre-bash, phase-6 (A1); land (A2); report (C) |
| `recordDispatch` | `lib/run/inflight.mjs` | A1 | `(ctx, { unit, agent, branch, brief, report }) => Promise<void>` | wave start (A2) |
| `clearDispatch` | `lib/run/inflight.mjs` | A1 | `(ctx, unit) => Promise<void>` | wave merge (A2) |
| `verifyIntake` | `lib/lifecycle/intake.mjs` | A2 | `(ctx) => Promise<GateResult>` | phase-0 (A1) |
| `PROBES` | `lib/lifecycle/preflight.mjs` | A2 | `ReadonlyArray<{ id, title, waivable, blocking, note }>` | waive, phase-1 (A1) |
| `preflightGate` | `lib/lifecycle/preflight.mjs` | A2 | `(ctx) => Promise<GateResult>` | phase-1 (A1) |
| `resolvePreview` | `lib/lifecycle/preview.mjs` | A2 | `(ctx, { sha }) => Promise<{ url, pending, detail }>` | capture (C), ready (A1) |
| `waveSyncGate` | `lib/lifecycle/wave.mjs` | A2 | `(ctx) => Promise<GateResult>` | phase-5 (A1) |
| `landGate` | `lib/lifecycle/land.mjs` | A2 | `(ctx, { epic }) => Promise<GateResult>` | phase-7 (A1) |
| `findEpic` | `lib/github/issues.mjs` | A2 | `(ctx) => Promise<Issue\|null>` | status, phase-0 (A1) |
| `issuesSyncedGate` | `lib/github/issues.mjs` | A2 | `(ctx) => Promise<GateResult>` | phase-3 (A1) |
| `scopeGate` | `lib/github/scope.mjs` | A2 | `(ctx) => Promise<GateResult>` | phase-3 (A1) |
| `lateChanges` | `lib/github/scope.mjs` | A2 | `(ctx) => Promise<{ row, from, to, scopeLine }[]>` | ready (A1), report (C) |
| `claimsGate` | `lib/github/claims.mjs` | A2 | `(ctx) => Promise<GateResult>` | phase-4 (A1) |
| `findDupes` | `lib/github/dupes.mjs` | A2 | `(ctx) => Promise<{ pr, reason }[]>` | ready (A1) |
| `ciStatus` | `lib/github/ci.mjs` | A2 | `(ctx, { pr, wait? }) => Promise<{ state, headSha, detail }>` | ready, phase-5 (A1) |
| `inventoryGate` | `lib/plan/inventory-check.mjs` | B1 | `(ctx) => Promise<GateResult>` | phase-2 (A1) |
| `planGate` | `lib/plan/check.mjs` | B1 | `(ctx) => Promise<GateResult>` | phase-3 (A1) |
| `renderSpec` | `lib/plan/render.mjs` | B1 | `(plan) => string` | issues sync (A2) |
| `unitGateStatus` | `lib/gate/unit.mjs` | B1 | `(ctx, unitId) => Promise<GateResult>` | phase-4, phase-5 (A1); wave merge (A2) |
| `CHECK_IDS` | `lib/checks/index.mjs` | B1 | `ReadonlyArray<'M1'...'M17'>` | ready (A1) |
| `runChecks` | `lib/checks/index.mjs` | B1 | `(ctx, ids, { captureRunId?, record? }) => Promise<{ findings, failures }>` | ready (A1), land (A2) |
| `readyBlockers` | `lib/checks/severity.mjs` | B1 | `(findingsDoc, plan, profile) => GateFailure[]` | ready (A1), report (C) |
| `baselineGate` | `lib/baseline/extract.mjs` | B2 | `(ctx) => Promise<GateResult>` | phase-2 (A1) |
| `checkM2` | `lib/baseline/diff.mjs` | B2 | `(ctx, { against? }) => Promise<Finding[]>` | check M2 (B1) |
| `refreshBaseline` | `lib/baseline/refresh.mjs` | B2 | `(ctx) => Promise<{ added, unclassed }>` | wave start (A2), ready (A1) |
| `seedScanGate` | `lib/seed/scan.mjs` | B2 | `(ctx) => Promise<GateResult>` | phase-4 (A1), capture (C) |
| `refreshWorld` | `lib/seed/scan.mjs` | B2 | `(ctx, worldId) => Promise<GateResult>` | capture (C) |
| `teardownRows` | `lib/seed/scan.mjs` | B2 | `(ctx, rows: { table, id }[]) => Promise<GateResult>` | capture (C) |
| `seedCheckGate` | `lib/seed/safety.mjs` | B2 | `(ctx, { seedPlan? }) => Promise<GateResult>` | check M13 (B1), preflight P6 (A2) |
| `deriveSideEffects` | `lib/sidefx/derive.mjs` | B2 | `(ctx) => Promise<SideEffects>` | preflight P6 (A2) |
| `createDataAdapter` | `adapters/data/supabase.mjs` | B2 | `(ctx, { projectRef? }) => Promise<DataAdapter>` | preflight P3, P4, P13 (A2) |
| `runCapture` | `lib/capture/run.mjs` | C | `(ctx, { mode, states?, unit?, baseUrl?, sha? }) => Promise<{ runId, capture, notReached }>` | gate (B1) |
| `validateCaptureItems` | `lib/capture/validate.mjs` | C | `(ctx, runId) => Promise<ItemVerdict[]>` | M3, M15 (B1); ready (A1); land (A2) |
| `latestCaptureRun` | `lib/capture/validate.mjs` | C | `(ctx, { mode? }) => Promise<string\|null>` | check (B1), ready (A1) |
| `captureSmokeGate` | `lib/capture/validate.mjs` | C | `(ctx) => Promise<GateResult>` | phase-4 (A1) |
| `spotRecapture` | `lib/capture/spot.mjs` | C | `(ctx, { runId, pct, seed? }) => Promise<GateResult>` | ready (A1) |
| `probeServedSha` | `lib/capture/served-sha.mjs` | C | `(ctx, baseUrl) => Promise<string\|null>` | ready (A1) |
| `getDesignAdapter` | `adapters/design/index.mjs` | C | `(dir, { adapter? }) => Promise<DesignAdapter>` | intake (A2) |

`DesignAdapter`, `DataAdapter` and `ItemVerdict` are typed in the JSDoc of their files. A new
cross-slice call not in this table is a request to F, not a private agreement between slices.

## Core helpers every slice uses

- **Profile commands**: `fillCommand(profile.commands.x, { pr, sha, ... })` fills only the
  eleven placeholders and shell-quotes values; wrap heavy work with `wrapHeavy(profile, cmd)`;
  run it with `ctx.runner.sh(command, { timeoutMs })`. Never build a command from a template by
  string concatenation.
- **Hashing**: `sha256`, `sha256File`, `sha256Tree` (sorted relative paths, content only),
  `hashJson` (canonical JSON).
- **Git**: `ctx.git.revParse`, `show(ref, path)` (bytes, null when absent), `mergeBase`,
  `diffNames`, `lsTree`, `worktrees()`, `isClean`, `fetch`, `merge`, `push`, and `raw`/`ok`.
- **GitHub**: `ctx.gh` (`lib/core/gh.mjs` lists the whole interface). Every write in a test
  lands in the in-memory stub; `gh.api` is the escape hatch and is not emulated by the stub.
- **Runs**: `discoverRuns(ctx.git)` scans `git worktree list --porcelain` for
  `.delivery/*/state.json` (the SessionStart hook and `status` use it).
- **Zip**: `readZip(buffer)`, `writeZip(entries)` (deterministic bytes), for the design archive
  and `runtime.zip`.
- **Playwright**: `await resolvePlaywright({ repoRoot, e2eDir: profile.paths.e2eDir })` inside
  the function that needs it. A top-level Playwright import anywhere in `lib/` fails a test.

## Tests

- **The whole suite is two globs**, because a skill carries its own script tests beside the
  script rather than under `tests/`: `node --test 'tests/**/*.test.mjs' 'skills/**/*.test.mjs'`.
  A `*.test.mjs` file neither glob reaches is a test nobody runs, which is how
  `skills/design-inventory/scripts/assemble-inventory.test.mjs` went unrun for the whole build;
  `tests/core/suite-globs.test.mjs` fails on any such file.
- `node --test tests/<area>/` per slice; `node --test tests/core/` must stay green for everyone.
  No network; each file under about five seconds. Node 22 and later treat a directory argument
  to `--test` as a module path, so `tests/core/` carries a two-file shim (`package.json` whose
  `main` is `all.mjs`, which imports every `*.test.mjs` beside it). Copy both files into your own
  `tests/<area>/` if you want the directory form to work there too; the glob form
  `node --test 'tests/<area>/*.test.mjs'` works everywhere.
- **The runner-stub pattern.** Nothing in a test may start a real `gh`, database client, build
  or browser. Build the ctx with `makeTestCtx({ repoRoot, rules, profile, safety })`; `rules`
  answer external commands:

  ```js
  const { ctx, gh, stdout } = await makeTestCtx({
    repoRoot: repo.dir, profile: makeProfile(),
    passthrough: ['git'],                                // real git on a temp repo only
    rules: [
      { match: 'node scripts/wait-for-checks.mjs 12', result: ok('all green') },
      { match: /^PREVIEW_SHA=/, result: ok('https://preview.example.invalid') },
      { match: 'node scripts/planner.mjs', result: fail(1, 'queue: #7'), times: 1 },
    ],
  });
  ```

  An unmatched call throws `runner stub has no answer for: <command>`, so a missing stub is
  loud. `runner.texts()` lists every call made, for assertions. A subprocess test of
  `bin/delivery.mjs` sets `DELIVERY_RUNNER_STUB=/abs/path/stub.mjs` (default export is the stub
  function) to get the same effect across the process boundary.
- **GitHub**: `createGhStub()` (`tests/helpers/gh-stub.mjs`) implements `Gh` in memory: issues,
  PRs sharing one number sequence, comments, labels, sub-issues, `findByMarker`, and test
  drivers `setMergeable`, `setHead`, `setFiles`, `markReady`, `merge`, `addComment(n, body, author)`.
  `gh.db.writes` records every write.
- **Repos and time**: `makeTempRepo({ files })` (real git in the OS temp dir, with `write`,
  `commit`, `addWorktree`, `cleanup`), `makeTempDir()`, `fakeClock(iso)` with `advance(ms)`.
- **Fixtures**: synthetic and generic only (a fictional `example-org/example-repo`, feature
  `widgets`, fake numbers such as `15550100001`, `example.invalid` addresses). One valid and
  one invalid example per schema live in `tests/fixtures/schemas/` (`<schema>--<variant>.invalid.json`
  adds a defect for a field added after the first freeze); use `validExample(name)`,
  `makeProfile()`, `makeSafety()` as starting points. Slice fixtures go under
  `tests/fixtures/<area>/`.
- **Replay tests** check behaviour on the private set of real artefacts from an earlier build,
  which never enters this repo. They run only when `DELIVERY_REPLAY_DIR` points at that set and
  are skipped otherwise:

  ```js
  import { replayTest } from '../helpers/replay.mjs';
  replayTest('M7 flags the leaks in the live captures', { needs: ['live', 'expected/m7.json'] }, async (t, dir) => { ... });
  ```

  `replayTest` skips with "DELIVERY_REPLAY_DIR not set" when the variable is unset, and with
  the missing paths when the set lacks a file the test `needs`. Write a synthetic twin of each
  real bad artefact (same shape, generic words) as a normal test, so the check is proven
  without the private set. The set's own README describes its layout.

## Manifest

`node scripts/build-manifest.mjs` writes `MANIFEST.sha256` (`<sha256>  <path>` for every file
except the manifest itself, OS litter, `.git` and `node_modules`). When the file exists, every
CLI start verifies it: a changed or missing listed file, or an unlisted file under `bin/`,
`lib/`, `adapters/`, `hooks/`, `scripts/`, `schemas/` or `templates/`, is exit 5. Generate it
only when packaging a release; during development there is no manifest and the check passes.
`--check` verifies without writing.
