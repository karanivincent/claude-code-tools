---
name: epic-build
description: Full mode only (the founder asked for full mode by name; picture mode uses picture-build). Use when a coverage plan's units are ready to be built by several agents at once and must arrive as one pull request, or when a wave of such a build has to be started, merged or recovered. Symptoms from earlier runs - one screen blocking the others, a branch gone stale behind its base, every agent rediscovering the environment, another agent lane opening duplicate pull requests for the same issues. Triggers - "run the next wave", "build the plan with agents".
---

# Epic build

## Overview

Builds the plan's units with parallel `delivery-builder` agents, wave by wave, into one
integration branch and one draft PR. This session's worktree **is** the integration worktree: it
dispatches, gates, merges and pushes. Builders only build.

**Core principles.** Builders build; this session runs everything else. The base comes in only
through `delivery wave start`, which puts every new capability into the plan before any conflict
is resolved. Violating the letter of these rules is violating their spirit.

`delivery <command>` means `node scripts/delivery.mjs <command>` (the repo's shim). Use each
command exactly as written here or as its `--help` prints it; never add arguments it does not
list. With one unit this is still the same skill.

Parallel builders override `superpowers:subagent-driven-development`'s rule against parallel
implementation agents: each builder has its own worktree and a file list no other unit in its
wave shares. Never chain into `superpowers:finishing-a-development-branch`.

## Wave 0 (phase `wave0`)

1. `delivery claims open`, then `delivery claims verify`: the draft PR claims every child
   **before the first dispatch**. Labels do not keep other lanes off; an open PR does.
2. `delivery handover`: it creates the branch's one handover at the profile's path, so the
   repo's decision drain has one target. Commit it. Never add a second handover on this branch.
3. `delivery wave start`, then dispatch the contract unit and every wave-0 tooling unit in
   parallel. Gate and merge each as below.
4. `delivery seed --plan`, `delivery seed --check`, `delivery seed --apply`. Only `delivery seed`
   writes fixture rows.
5. The capture smoke: `delivery capture --mode branch --states <one state per world>` on the stub
   routes. Then `delivery advance build`.

## Each build wave (phase `build`, and fix waves after it)

1. `delivery wave start`. It merges `origin/<base>`, refreshes the baseline before any conflict
   is settled (new capabilities become plan rows: Rule 2), applies the Scope replies, runs
   `claims verify` and `dupes`, writes each unit file with the `flight` and `tried` output,
   records each dispatch and prints one NEXT line per builder. A Scope reply it could not map
   goes to one `delivery-extractor` with `briefs/extractor-scope-reply.md`.
2. Dispatch one builder per NEXT line, at most `limits.builderParallel` at once, from this
   session, with the prompt in `references/dispatch.md` and nothing added to it.
3. As each report lands: `delivery gate <unit>` here. Red: the same builder continues from the
   failure file the gate wrote. Green: `delivery wave merge <unit>` (it merges with `--no-ff`
   and pushes).
4. When the wave's units are merged: `delivery wave end`, in the background (the CI waiter can
   take its full timeout). Exit 4 means wait and re-run. On the run's last push:
   `delivery wave end --final`, which first runs the full local CI chain through the heavy wrapper.
5. The wave audit: load `design-audit` in `wave` mode. Its P1 and P2 findings become `fix` units
   in the plan for the next wave (`delivery plan check`, `delivery issues sync`), then step 1.
6. No wave left: `delivery advance pr`. After three fix waves with P1s open, stop: the report
   says red.

`references/wave-protocol.md` has every step's failure paths and the resume rules.

## Rule 1: builders build; everything long runs in this session

| Work | Where it runs |
|---|---|
| A unit's code, its component render tests, `commands.unitCheck` in the foreground, its commit and report | the builder |
| Dev servers, browsers, captures, `delivery gate`, `wave merge`, pushes, seeding, the full CI chain | this session only |
| Dispatching agents | this session only. Builders never dispatch, and there is no controller agent |
| Anything longer than about 8 minutes | this session, `run_in_background: true`, output to a log and the exit code to a marker file; wait for the marker, never `TaskOutput` on an agent |

A builder gets the builder brief and its unit file, nothing else. A correction reaches every
builder through the plan and the unit files `wave start` writes, never through a pasted prompt.
A builder never runs a server: the gate's `webServer` owns the server, and a server a builder
leaves on the port can be the one the gate reuses, grading the wrong code.

## Rule 2: a modify/delete conflict on a replaced file is a plan decision

The base comes in only through `delivery wave start`, never `git merge origin/<base>` by hand,
even when `delivery ci` says the PR is conflicting at the end of the run (then it is a fix wave).
If a manual merge is already in progress, `git merge --abort` first.

When `wave start` stops on a modify/delete conflict, or lists capabilities the base added:

1. Do not resolve anything yourself. No `git rm`, no `git checkout --ours` or `--theirs`, no
   commit: `wave start` settles a modify/delete on a replaced file (keeping the deletion) only
   once every new capability has a complete row.
2. Read what the refresh added (`delivery baseline --refresh` prints it again): controls, API
   calls, e2e assertions, copy keys, data fields. The refresh decides whether a capability
   landed, not the commit title or the diff's size. It gives each a `migrate` row with no owner
   and no target yet, and writes a Tier 1 decision file.
3. Complete each row: owned by a unit in this wave (a new `fix` unit if none owns the replacing
   file), `migrateTo`, reach and markers. `remove` instead needs a Scope line and the founder's
   reply. The plan's fields only (the full guide is `coverage-plan`'s `references/rows.md`):

   ```json
   { "id": "<the CAP id the refresh printed>", "class": "migrate", "owner": "<unit id>",
     "requested": null, "invented": false,
     "migrateTo": { "file": "<replacing file>", "control": "<its control>" },
     "reach": { "class": "seeded", "world": "<world>", "role": "admin", "steps": [] },
     "markers": { "text": [], "testids": [], "forbidden": [] },
     "controls": [], "copy": [], "data": [], "backend": [], "dayOne": false, "invariants": [] }
   ```

   A new unit: `{ "id", "title", "issue": null, "kind": "fix", "wave": <number>, "files",
   "states", "capabilities": ["<CAP ids>"], "risk": "normal", "model": "sonnet" }`.
4. `delivery plan check`, then `delivery wave start` again, and dispatch the unit that ports it.
   Any other kind of conflict `wave start` leaves for you to resolve, after the refresh: resolve
   it, `git add`, and run `wave start` again.

| Thought | Reality |
|---|---|
| "The labels will keep the pool off" | Last time they did not. The open draft PR claims; the planner proves it. |
| "I'll sync with the base at the end" | Last run 19 commits landed overnight and the end-of-run merge had 12 conflicts. |
| "The builder can start its server in the background" | It dies with the builder's turn. The capture owns its server through `webServer`. |
| "This conflict is just a deleted file" | A modify/delete on a replaced file is a capability decision; last time a shipped capability was lost exactly that way. |
| "It's only imports and labels" | The refresh decides, not the commit title. A small toggle inside a tidy-up is a capability. |
| "I'll resolve now and add the row after" | The row comes first. A row promised for later is the one forgotten at hour 7. |
| "`ci` says conflicting, so I'll just merge the base" | Only `wave start` brings the base in, after the refresh. |
| "The shell has to land first" | Screens build against the contract and stubs. |
| "A controller agent saves my context" | Its builders and its background work die with its turn. Dispatch from here; read reports, not transcripts. |
| "Let the builders self-verify on a dev server" | The gate is the verification. A builder's server can be what the gate grades. |
| "I'll add a few rules to the builder's prompt" | Last run the briefs were corrected four times mid-run and each fix reached only later agents. Brief file plus unit file. |

## Red flags: stop and run `delivery status`

- `git merge`, `git rm` or `git checkout --theirs/--ours` typed by you during a run.
- `run_in_background`, `&`, a dev server or a screenshot in anything you tell a builder.
- An agent that dispatches agents, or a dispatch prompt longer than the template.
- The PR body's blocks, the handover's generated sections, the report or a status note for the
  founder written by hand (`delivery pr-body`, `delivery handover`, `delivery report` generate
  them; the founder hears from the run only through those).
- `gh pr checks` instead of `delivery ci --pr <n>`.
