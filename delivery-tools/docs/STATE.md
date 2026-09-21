# delivery-tools: build state (paused 2026-09-18, resumed 2026-09-21)

The build was paused on 2026-09-18 after about 17 parallel Opus agents used up a week's usage.
Nothing here is released. Read this file before you continue.

This directory is a public repository. No consuming project's name, numbers or UI text goes into
it — a test in `tests/core/ownership.test.mjs` fails on any that do. A project's own values belong
in its profile, which lives in that project's repo (spec section 18).

## Where things are

| What | Where |
|---|---|
| The code | branch `feature/delivery-tools`, pushed. Worktree at `/Users/vince/Documents/Projects/claude-code-tools-delivery`. |
| The spec (normative), the decisions page and the reviews | `/Users/vince/Documents/Projects/delivery-tools-handover/skills-suite/` (`SPEC-v2.md`, `DECISIONS.md`, `review-*.md`) |
| Build briefs, slice prompts, reports and pressure-test records | `.../delivery-tools-handover/build/` (`BUILD-BRIEF.md`, `SLICES.md`, `reports/`, `pressure/`) |
| The private replay set (real artefacts of one build that went wrong; never commit it here) | committed in the consuming project's repo at `docs/delivery/replay/scripts-build/`, driven by its `scripts/delivery/replay.mjs` |
| The orchestrator's running log | `.../delivery-tools-handover/ORCHESTRATOR-LOG.md` |

## Test state, 2026-09-21

```
node --test 'tests/**/*.test.mjs' 'skills/**/*.test.mjs'
```

501 tests, 498 pass, 0 fail, 2 skip (Node 24).

Both skips are `tests/design/render.browser.test.mjs`, which wants `DELIVERY_PLAYWRIGHT_ROOT` set
to a directory Playwright and Chromium resolve from. Point it at a repo that has them installed
and both run and pass in about 43 s. Nothing else in the suite is skipped.

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
| Skill `design-inventory` | SKILL.md, references, assembler script; RED runs recorded | GREEN pressure runs. Its record still holds the placeholder `(filled in below as they complete)`. |
| Skill `coverage-plan` | SKILL.md, references, pressure record | Confirm RED and GREEN are complete |
| Skill `epic-build` | SKILL.md, references, pressure record, `briefs/builder.md` written | Confirm against spec 14.1 |
| Skill `deliver-from-design` (the umbrella) | **Not written.** A pressure record holds two scenarios | Write it per spec 14.1. `delivery ready` runs the loop test itself, so the skill never dials one. |
| Agents and briefs | All three agent files and five briefs exist | Check them against spec 15.1 once the skills are final |
| Release | Not started | `.claude-plugin/plugin.json`, a marketplace entry, `scripts/build-manifest.mjs`, README, then one PR here. Then the consuming project's profile PR (spec 19). |

## Before running it for real

Spec 20.2 (cheap tests on real artefacts) and 20.5 (one seeded-defect rehearsal) must both pass
before any real epic runs. That is the Trust rule and nothing overrides it.

M5 and M6 need a DOM capture of an old preview before they can be promoted from advisory.

## How to continue cheaply

Run at most 3 to 4 agents at once. Use sonnet for narrow tasks. The remaining model-token work is
`design-inventory`'s GREEN runs and the `deliver-from-design` umbrella; everything before that is
free. Each agent's report path and brief are in `SLICES.md`.
