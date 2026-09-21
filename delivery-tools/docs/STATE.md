# delivery-tools: build state (paused 2026-09-18, resumed and unblocked 2026-09-21)

The build was paused on 2026-09-18 after about 17 parallel Opus agents used up a week's usage.
Nothing here is released. Read this file before you continue.

This directory is a public repository. No consuming project's name, numbers or UI text goes into
it — a test in `tests/core/ownership.test.mjs` fails on any that do. A project's own values belong
in its profile, which lives in that project's repo (spec section 18).

## Where things are

| What | Where |
|---|---|
| The code | branch `feature/delivery-tools`, pushed. Worktree at `/Users/vince/Documents/Projects/claude-code-tools-delivery`. |
| The build record | its own git repository at `/Users/vince/Documents/Projects/delivery-tools-handover`, private, no remote. |
| How it is installed | a dev marketplace named `delivery-dev` at `/Users/vince/Documents/Projects/delivery-dev-marketplace`, whose one plugin is a symlink to this worktree. `claude plugin install delivery-tools@delivery-dev`. |
| The spec (normative), the decisions page and the reviews | `/Users/vince/Documents/Projects/delivery-tools-handover/skills-suite/` (`SPEC-v2.md`, `DECISIONS.md`, `review-*.md`) |
| Build briefs, slice prompts, reports and pressure-test records | `.../delivery-tools-handover/build/` (`BUILD-BRIEF.md`, `SLICES.md`, `reports/`, `pressure/`) |
| The private replay set (real artefacts of one build that went wrong; never commit it here) | committed in the consuming project's repo at `docs/delivery/replay/scripts-build/`, driven by its `scripts/delivery/replay.mjs` |
| The orchestrator's running log | `.../delivery-tools-handover/ORCHESTRATOR-LOG.md` |

## Test state, 2026-09-21

```
node --test 'tests/**/*.test.mjs' 'skills/**/*.test.mjs'
```

514 tests, 514 pass, 0 fail, 0 skip (Node 24), with the replay corpus materialised and
`DELIVERY_PLAYWRIGHT_ROOT` pointed at a repo that has Playwright and Chromium.

Without `DELIVERY_PLAYWRIGHT_ROOT` two tests skip: `tests/design/render.browser.test.mjs` wants a
directory Playwright and Chromium resolve from. Point it at a host repo and both run and pass in
about 43 s. There is no skip left that names a thing this machine does not have.

**The replay tests need the corpus materialised, not merely pointed at.** It is committed with
`"repo": "."` so that no machine path enters git; a checker needs a real one. The consuming
project's `scripts/delivery/replay.mjs` builds a temp directory of symlinks with a rewritten
`refs.json` and passes it as `DELIVERY_REPLAY_DIR`. Pointing that variable straight at the
committed corpus makes five replay tests fail with `git ref "…" does not resolve to a commit`,
which is an artefact of the corpus's portable form and not a real failure.

Two corrections to what this file said at the pause, both since fixed:

- The one recorded failure was the ownership guard, but the cause was **not**
  `skills/design-inventory/scripts/assemble-inventory.mjs`. It was four files with no owner in
  `docs/ARCHITECTURE.md`'s glob table: `docs/STATE.md` and three under `tests/fixtures/capture/`.
  Two rows (`docs/**` and `tests/fixtures/capture/**`) were the whole fix.
- There were **two** failures at the pause, not one. The second was the project-name scan, which
  this very file was tripping.

The suite also grew from 490 to 501 because the documented command now reaches
`skills/design-inventory/scripts/assemble-inventory.test.mjs`, which sits outside `tests/` and had
never been run. `tests/core/suite-globs.test.mjs` fails on any test file the documented globs miss.

## Status by piece (see `docs/ARCHITECTURE.md` for file ownership)

| Piece | State | What is left |
|---|---|---|
| Foundation (schemas, core, dispatcher) | Done, report `foundation.md`, 113 core tests | Nothing |
| A1 run machinery (status, advance, ready, waive, hooks) | Done, report `a1.md`, 93 tests | Nothing |
| B1 checks (M1, M3 to M12, M14 to M17, plan, inventory, gate) | Done, report `b1.md` | M14's robot-organisation row counts (the profile field `testData.robotOrganizationId` exists). M17 has no first-load JavaScript measure. M5 and M6 stay advisory until replayed on DOM captures. |
| B2 analysis and seeding (baseline/M2, sidefx, seed/M13, data adapter) | Done, report `b2.md`, 54 tests, replay green | Only one data adapter exists. `seed --apply` has never written to a real database. |
| A2 GitHub and lifecycle (init, intake, preflight, issues, scope, claims, dupes, ci, wave, pr-body, handover, land) | Done, report `a2.md`, 83 tests | Nothing in the slice. Both of A1's requests are honoured (`wave merge` journals; `wave start` calls `recordDispatch`). No command has run against a real repository. |
| C design, capture and reports | Done, report `c.md`, 67 tests | Nothing in the slice. All four items this file once listed were already done. No capture has run against a real preview. |
| Skill `design-audit` | SKILL.md, references, pressure record | Confirm the GREEN runs are complete |
| Skill `design-inventory` | Done. Two controls and ten with-skill runs, 5/5 on both scenarios | Nothing |
| Skill `coverage-plan` | SKILL.md, references, pressure record | Confirm RED and GREEN are complete |
| Skill `epic-build` | SKILL.md, references, pressure record, `briefs/builder.md` written | Confirm against spec 14.1 |
| Skill `deliver-from-design` (the umbrella) | Written, per spec 14.1. Ten with-skill runs, 5/5 on both scenarios | Nothing. It must be re-pressure-tested and 20.5 re-run after any edit to it. |
| Agents and briefs | All three agent files and five briefs exist | Check them against spec 15.1 once the skills are final |
| Release | Loadable, not published | `plugin.json`, the marketplace entry and the README section exist, so it installs and runs. Left: `scripts/build-manifest.mjs`, then one PR to `main` here. |

## Before running it for real

The Trust rule: 20.2 and 20.5 must both pass before any real epic runs. Nothing overrides it.

- **20.2 passed on 2026-09-21.** All ten rows are answered by tests against the real recorded
  artefacts, all green. `tests/core/spec-20-2.test.mjs` now ties the spec's table to those tests, so
  a rename cannot make the claim quietly false. The evidence is `build/reports/spec-20-2.md`.
- **20.5 is designed and blocked.** `build/rehearsal-20-5.md` has the throwaway screen, the seven
  defects and the gate that must stop each. It cannot run until the consuming project merges its
  profile pull request: preflight's P2 demands the safety file be byte-identical to the copy on the
  base branch, it is `waivable: false, blocking: true`, and there is no dry-run flag. Checked, not
  assumed.

M5 and M6 need a DOM capture of an old preview before they can be promoted from advisory. Their
colour comparison was repaired on 2026-09-21: `parseColor` read `rgb()` alone while the products it
measures ship `oklch()`, so one colour written two ways came back `Infinity` apart and every colour
difference M5 reported was noise.

## How to continue cheaply

Run at most 3 to 4 agents at once. Use sonnet for narrow tasks. Everything cheap is done: the five
skills are written and pressure-tested, 20.2 is green, the capture faults a real run found are
backported, and the plugin installs. The only work left that costs real model tokens is the 20.5
rehearsal and the first real epic, and both wait on one merge.
