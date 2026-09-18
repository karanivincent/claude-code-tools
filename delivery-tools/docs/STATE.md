# delivery-tools: build state (paused 2026-09-18)

The founder paused this build on 2026-09-18 after about 17 parallel Opus agents used up his weekly
usage. Nothing here is released. Read this file before you continue.

## Where things are

| What | Where |
|---|---|
| The code | branch `feature/delivery-tools` in `karanivincent/claude-code-tools` (local only, not pushed). The last commit is a WIP commit. The worktree was at a temporary path that may be gone: run `git worktree prune`, then `git worktree add <path> feature/delivery-tools` from `/Users/vince/Documents/Projects/claude-code-tools`. |
| The spec (normative), the decisions page and the reviews | `/Users/vince/Documents/Projects/delivery-tools-handover/skills-suite/` (`SPEC-v2.md`, `DECISIONS.md`, `review-*.md`) |
| Build briefs, slice prompts, reports and pressure-test records | `.../delivery-tools-handover/build/` (`BUILD-BRIEF.md`, `SLICES.md`, `reports/`, `pressure/`) |
| The private replay set (real Scripts-build artefacts; never commit it to this public repo) | `.../delivery-tools-handover/build/replay/scripts-build/` |
| The orchestrator's running log | `.../delivery-tools-handover/ORCHESTRATOR-LOG.md` |
| A working headless capture spec for the Scripts screens | `.../delivery-tools-handover/zz-audit-capture.spec.ts` |

The plugin repo is public. No TeliTask names, numbers or UI text go into it. TeliTask's values
belong in the project profile, which goes in the Telitask repo (spec section 18).

## Test state at the pause

`node --test 'tests/**/*.test.mjs'`: 490 tests, 475 pass, 14 skip (replay tests without
`DELIVERY_REPLAY_DIR`, and design-render tests without their environment), 1 fail. The failure is
the ownership guard "every file in the plugin has an owner". The likely cause is
`skills/design-inventory/scripts/assemble-inventory.mjs`, which is not yet listed in
`docs/ARCHITECTURE.md`. No NUL bytes remain in any file.

## Status by piece (see `docs/ARCHITECTURE.md` for file ownership)

| Piece | State | What is left |
|---|---|---|
| Foundation (schemas, core, dispatcher) | Done, report `foundation.md`, 113 core tests | Nothing |
| A1 run machinery (status, advance, ready, waive, hooks) | Done, report `a1.md`, 93 tests | Nothing |
| B1 checks (M1, M3 to M12, M14 to M17, plan, inventory, gate) | Done, report `b1.md` | M14's robot-organisation row counts were in progress when the limit hit (the profile field `testData.robotOrganizationId` now exists). M17 has no first-load JavaScript measure. M5 and M6 stay advisory until replayed on DOM captures. |
| B2 analysis and seeding (baseline/M2, sidefx, seed/M13, Supabase adapter) | Code done; the whole suite passed at its last run | Its report `b2.md` was never written. Re-run its replay tests and write the report. |
| A2 GitHub and lifecycle (init, intake, preflight, issues, scope, claims, dupes, ci, wave, pr-body, handover, land) | In progress: it was writing `claims open` committing the run's own files | Finish it. Two requests from A1: `wave merge` journals `wave merge <unit> \| exit=0`, and `wave start` calls `recordDispatch`. Write `a2.md`. |
| C design, capture and reports | In progress | Rename `reachedTarget` to `reached` in `templates/delivery-capture-support.ts` (M9 reads `reached`; validate against `schemas/capture-controls.schema.json`). Name `files.controls` in `capture.json`. Messy-world rows for M12. `component-state.test.tsx` must render null when `DELIVERY_RENDER_EMPTY=1`. Write `c.md`. |
| Skill `design-audit` | SKILL.md and references written; pressure record `pressure/design-audit.md` | Confirm the GREEN runs are complete |
| Skill `design-inventory` | SKILL.md, references and an assembler script written; RED runs recorded | GREEN runs, then register the script in ARCHITECTURE.md |
| Skill `coverage-plan` | SKILL.md and references written; pressure record exists | Confirm RED and GREEN are complete |
| Skill `epic-build` | SKILL.md and references written; pressure record exists | It was writing `briefs/builder.md` (gate failure file, the `wave merge` conflict path). Finish and test. |
| Skill `deliver-from-design` (the umbrella) | Not written; a pressure record exists | Write it per spec 14.1. `delivery ready` runs the loop test itself, so the skill never dials one. |
| Agents and briefs | All three agent files and five briefs exist | Check them against spec 15.1 once the skills are final |
| Release | Not started | Integration test, `scripts/build-manifest.mjs`, `plugin.json`, marketplace entry, README, then one PR to this repo and merge. Then the Telitask profile PR (spec 19), which also carries the private replay set. |

## Before running it for real

Spec 20.2 (cheap tests on real artefacts) and 20.5 (one seeded-defect rehearsal) must pass before
any real epic runs. M5 and M6 need a DOM capture of the old preview (`baf0e8753`) before they can
be proven.

## How to continue cheaply

Run at most 3 to 4 agents at once. Use sonnet for narrow tasks. Finish A2 and C first, then the
skills one at a time, then release. Each agent's report path and brief are in `SLICES.md`.
