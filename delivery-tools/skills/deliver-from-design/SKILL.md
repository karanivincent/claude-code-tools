---
name: deliver-from-design
description: Use when a design exported from Claude Design as a project archive, Figma frames or a folder of screenshots should become one reviewed, verified pull request built by agents, including redesigns of pages that already exist, or when such a delivery run was interrupted or compacted and needs its next step. Triggers - "build this from the design", "deliver this design", "redesign this page to match the design", "resume the delivery", "land it", "/deliver-from-design".
---

# Deliver from design

This file is deliberately short. It says which skill owns each phase and what may never happen in
any of them. **It does not summarise the phases** — a summary is what gets followed instead of the
skill, and a phase skill knows things this file cannot repeat without going stale. Load the skill
the phase names.

`delivery <command>` means `node scripts/delivery.mjs <command>` (the repo's shim). Use each
command exactly as written here or as its `--help` prints it; never add an argument it does not
list.

## The phases

| Phase | Driven by | `advance` refuses unless |
|---|---|---|
| 0 intake | this skill, `delivery intake` | the design snapshot is hashed, `intent.json` validates, the epic exists (found by marker), state is initialised |
| 1 preflight | this skill, `delivery preflight` | every probe is green, or became a wave-0 task, or carries a named founder waiver where waivable |
| 2 inventory | `design-inventory` | every design candidate is mapped or excluded; every state has a design render or a reason; the baseline exists for a redesign |
| 3 plan | `coverage-plan` | `plan check` passes; issues are synced; the Scope issue is posted and snapshotted |
| 4 wave 0 | `epic-build` | contracts compile with stubs; every fixture world is seeded and passes the safety scan; the capture smoke passes; the draft PR claims every child; the planner confirms it |
| 5 build | `epic-build`, with `design-audit` per wave | every unit passed its gate; the last wave's staging sync is clean; full CI is green on the integrated tree |
| 6 land, before merge | this skill, `delivery land`, with `design-audit` full | `ready.json` is green for the PR's head SHA |
| 7 land, after merge | this skill, `delivery land` | staging proof is green; the epic is closed through the profile's epic-close command |

`advance` re-runs every earlier phase's gate from its sources, never from a recorded verdict. A
phase you believe you finished can go red again, and that is the check working.

## The five rules

1. **Run `delivery status` first and do what NEXT says.** If your memory and NEXT disagree, NEXT
   wins — it was computed from the files a moment ago and your memory was not. Load the skill NEXT
   names even when you are sure you remember it.
2. **Leaf agents never dispatch agents.** Anything that will take longer than about eight minutes
   runs in *this* session with `run_in_background`, and you wait on the marker file it writes. A
   subagent's background children die with its turn.
3. **After preflight, never ask the founder anything.** Decide by the repo's own tier test and
   write a decision file. A question after preflight is a bug in the profile: fix the profile.

   The Scope issue is the one exception, and it takes exactly three kinds of line: cutting
   something he asked for in a design round, removing a capability the product has already
   shipped, and an `adapt` that changes behaviour a customer sees (wording does not count).
   Everything else is a decision file. `delivery scope post` writes the issue; five lines is the
   ceiling, and needing a sixth means the plan is wrong.
4. **Report only through `delivery report`, verbatim, plus the punch-list link.** Not a summary of
   it, not a message you compose from it, not a table you assemble yourself.
5. **No design, no run.** If there is no design export, this is not a delivery run. Name `/ship`
   and stop.

One more, which costs nothing now and cannot be recovered later: **an agent that drives a design
round saves each brief to `docs/delivery/<feature>/intent/` as it sends it.** Last time the round
briefs and their pass checklists lived only in a session scratchpad, and the run that had to judge
"did we get what we asked for" had nothing to read.

## What this skill runs itself

Intake, preflight, land before merge and land after merge are CLI commands, not skills. Run them
here:

```
delivery intake <archive.zip|design-dir> --intent "<sentence>" [--epic N] [--brief <file>]...
delivery preflight
delivery land --epic N --check      # before merge
delivery land --epic N              # after merge
```

Everything between them belongs to a phase skill. Load it with the Skill tool.

## REQUIRED

`superpowers:verification-before-completion`. Not optional, and not satisfied by CI being green.

## Rationalization table

Each row is something a previous run actually told itself.

| Thought | Reality |
|---|---|
| "CI is green, so it's done" | Green CI is one line of `ready.json`. Last time "complete" was reported with 93 findings standing. |
| "Left honest and unbuilt, by the spec's ruling" | "Unbuilt" is not a class. A cut needs a reason code, an issue and budget; a requested item needs a Scope line. |
| "`match` is unreachable tonight" | Then the state is `not-reached` and `ready` is red. The report says so; the label does not change. |
| "It's structurally impossible" | Impossible needs a reason code and a component test, and the auditor samples such claims. Last time one was disproved an hour later. |
| "CI never ran, Actions must be down" | `delivery ci` checks `mergeable` first. Last time this cost 40 minutes. |
| "It's a pre-existing failure" | No waiver exists. The repo requires every check green, pre-existing or not: fix it. Last time a "pre-existing" failure turned out to be caused by the branch. |
| "He's asleep; I'll ask in the morning" | Decide, log it, move on. A question after preflight is a bug in the profile. |
| "The hook is blocking a legitimate ready" | The hook is right until `delivery ready` is green. Fix the red line. |

## Red flags

Stop and run `delivery status`:

- You are about to write "done", "complete" or "ready" in your own words.
- You are about to edit anything under `.delivery/`. That directory is the CLI's; you read it.
- You are about to dispatch an agent the plan does not name.
- A permission prompt appeared after preflight. Preflight exists so that none can.
- `ready.json` is green but for a different head SHA than the PR has now. That is not a green run;
  it is a green run of a commit that is no longer there.
