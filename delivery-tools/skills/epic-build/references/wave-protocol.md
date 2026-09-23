# Wave protocol: every exit, and how to resume

Every command prints one line per failure and exits 0 pass, 1 red, 2 usage or configuration,
3 blocked on the founder, 4 wait and retry, 5 inconsistency. A 5 is never worked around: it leads
the report.

## Resume first

After a compaction, a crash or a new session: `delivery status`. It prints exactly one NEXT line
computed from the sources, not from memory, ending with the skill to load. If memory and NEXT
disagree, NEXT wins. For a unit recorded as in flight:

| On disk | Means | Do |
|---|---|---|
| its report file exists | the builder finished | gate it |
| commits on its branch, no report | the builder died | dispatch "continue on `<branch>`" (`dispatch.md`) |
| nothing on its branch | it never started | dispatch it fresh |

A unit with a report is never dispatched again. The integration branch is pushed after every
merge, so only in-flight builder work can be lost.

## Wave 0

| Step | Command | Red means |
|---|---|---|
| claim | `delivery claims open` | GitHub refused, or a unit has no issue yet (`delivery issues sync` first); run it again: it updates, never duplicates |
| verify the claim | `delivery claims verify` | the pool planner still queues a claimed child: dispatch nothing until it is green |
| handover | `delivery handover`, then commit it | it creates the one handover this branch will ever have |
| prerequisites and contracts | `delivery wave start`; dispatch; gate; `delivery wave merge <unit>` | the contract unit's gate: the app typechecks with the stubs, and every route in the plan renders its stub |
| seed | `delivery seed --plan`, `--check`, `--apply` | a safety layer refused a row: change the world in the plan, never the check |
| capture smoke | `delivery capture --mode branch --states <one per world>` | sign-in per role, the served-SHA probe or the marker validator is broken: fix that before any screen |
| advance | `delivery advance build` | the gate it names: go back to it |

## Wave start

`delivery wave start` merges `origin/<base>` without committing, runs the baseline refresh, and
only then settles conflicts; then it applies the Scope replies, runs `claims verify` and `dupes`,
writes the unit files and records each dispatch.

| It reports | Do |
|---|---|
| NEXT lines, one per builder | dispatch them (`dispatch.md`) |
| a modify/delete on a replaced file, or new capabilities | SKILL.md Rule 2, in order, and nothing else |
| another conflict | resolve it (the refresh has already run), `git add`, run `wave start` again |
| an unmapped Scope reply | the scope-reply extractor (`dispatch.md`), then `delivery scope read --apply "<Sn word>" --comment <id>` for each mapped decision, or `--ignore <id>` |
| `claims verify` red | a claimed child is in the planner's queue: `delivery claims open` refreshes the claim; dispatch nothing until verify is green |
| `dupes` red | another PR references a claimed child or touches a claimed path: the affected unit stops merging; write a Tier 1 decision (adopt that PR's branch into the integration branch, ask on it that it be closed, or — for an overlap that is only a shared file two features both append to — `delivery dupes --decide <pr> --note "<what you decided>"`, which pins that PR's head SHA and lets the run past it while still listing it); the refresh classes anything it added |
| exit 4 | GitHub or the base is unavailable: wait, run it again |

A Scope reply applies at the wave its line names. One that arrives after its wave started still
applies: the next wave builds or removes it, and the report says so.

## A unit, dispatch to merge

1. Dispatch (`dispatch.md`).
2. Report lands: `delivery gate <unit>` (`dispatch.md` has the background form).
3. Gate red: the same builder continues from `units/<unit>.gate.json`. Three red gates on one
   unit mean its rows are wrong or too big: re-plan them with `coverage-plan` (split the unit,
   add a world or an intercept), never relabel them.
4. Gate green: `delivery wave merge <unit>`. A merge conflict aborts the merge and names the
   files: the builder merges `origin/<integration branch>` into its unit branch and resolves
   them, then the gate runs again. Two units in one wave touching one file means the plan's file
   lists were wrong: fix them in the plan.

## Wave end

`delivery wave end` pushes, looks for duplicate PRs, waits for CI with the profile's waiter
(checking `mergeable` first: a conflicting PR gets no CI runs at all) and resolves the preview
for the pushed head SHA. Run it in the background: the waiter can take its full timeout.

| Exit | Do |
|---|---|
| 0 | the wave audit (`design-audit`, mode `wave`), as its NEXT line says |
| 1, CI red | a fix unit for the failing check. No failure is "pre-existing": every check must be green |
| 1, conflicting | the next `wave start` brings the base in |
| 1, a duplicate | as `dupes` red above |
| 4 | CI or the preview is pending: wait, run it again |

The wave audit's P1 and P2 findings become `fix` units (kind `fix`, the next wave, the files of
the unit that owns each finding's state), then `delivery plan check` and `delivery issues sync`.
P3s wait for the polish issue.

## The last push and the fix waves

- The run's last push is `delivery wave end --final`: it runs the repo's full local CI chain
  through the heavy wrapper first, as the repo requires before final commits.
- Fix waves in the land phase: at most `limits.maxFixWaves`. With P1s still open after the last
  one, stop building: `delivery ready --pr <n>` records red and `delivery report` says so.
- The PR body, the handover's generated sections and the report are generated
  (`delivery pr-body`, `delivery handover`, `delivery report`). Never type them.
