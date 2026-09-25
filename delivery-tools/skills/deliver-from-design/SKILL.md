---
name: deliver-from-design
description: Use when a design exported from Claude Design as a project archive, Figma frames or a folder of screenshots should become one reviewed pull request built by agents, including redesigns of pages that already exist, or when such a delivery run was interrupted or compacted and needs its next step. Triggers - "build this from the design", "deliver this design", "redesign this page to match the design", "resume the delivery", "land it", "/deliver-from-design".
---

# Deliver from design

A run turns a design into a page. One agent builds the page from the design pictures, and agents
check it by comparing pictures. Scripts only do fixed jobs: rendering the design, seeding test
data, taking the live pictures, listing buttons, and CI. This is **picture mode**, the default.

This file says which skill owns each step and what may never happen. Load the skill a step names.
`delivery <command>` means `node scripts/delivery.mjs <command>` (the repo's shim).

## The steps

| Step | Driven by | Done when |
|---|---|---|
| 1 Intake | this skill, `delivery intake` | the design snapshot is hashed, `intent.json` validates, the epic and the run's worktree exist |
| 2 Preflight | this skill, `delivery preflight` | every probe is green or waived |
| 3 Pictures | `design-inventory`, steps 1 to 4 only | every in-scope design state has a render |
| 4 Map, worlds, build, rounds, ship | `picture-build` | the last round is compiled, CI is green, and the founder has the preview and the comparison page |

`delivery status` prints where the run is and one NEXT line. If memory and NEXT disagree, NEXT wins.

**Full mode** is the older path: coverage plan, units in waves, mechanical gates and a graded
audit (`coverage-plan`, `epic-build`, `design-audit`). Use it only when the founder asks for it by
name. A full-mode run switches to picture mode with `delivery map --from-plan`.

## The rules

1. **Run `delivery status` first and do what NEXT says.**

   `delivery intake` ends by naming a worktree, and a session can't move into one it didn't start
   in unless it switches with `EnterWorktree`. Switch as soon as intake names it, and run
   everything after that from there. Every agent is dispatched from inside it.
2. **Leaf agents never dispatch agents.** Anything that runs longer than about eight minutes (a
   builder, a shoot of every state, the CI chain) runs from this session with `run_in_background`.
3. **After preflight, never ask the founder anything.** Decide by the repo's tier test, and write
   a decision file. The exceptions are cutting something he asked for, and removing a feature the
   old page has that the design has no home for. Each is one line in the final report, never a
   question mid-run.

   **Which screens a run builds is decided by the sentence.** A design export holds the whole
   project. `intent.json` lists the screens the sentence covers, and only those get states,
   pictures and a map. The sidebar and top bar are never in scope for a page run.
4. **The founder hears from the run once, at the end.** He gets the preview, a sign-in link, the
   comparison page, the counts, and what is still open, in his report format. No progress
   messages.
5. **No design, no run.** Without a design export this is not a delivery run. Name `/ship` and
   stop.

An agent that drives a design round saves each brief to `docs/delivery/<feature>/intent/` as it
sends it.

## What this skill runs itself

```
delivery intake <archive.zip|design-dir> --intent "<sentence>" [--epic N] [--brief <file>]...
delivery preflight
```

Everything after them belongs to `design-inventory` (pictures) and `picture-build` (the rest).

## Rationalizations

| Thought | Reality |
|---|---|
| "Make it pixel perfect with a plan of every word" | That was full mode. It took two days and never matched the look, because nobody copied the picture. The builder copies the picture now. |
| "A script can check this" | A script checks that a button exists and a state is reached. Whether it looks right is an agent's call, from the pictures. |
| "The export has another page too, and it looks newer" | Out of scope unless the sentence names it. Its update is its own run. |
| "He's asleep; I'll ask in the morning" | Decide, log it, and put it in the report. |
| "CI never ran, Actions must be down" | `delivery ci` checks `mergeable` first. |

## Red flags

Stop and run `delivery status`:

- You are about to open a browser tool, for any reason.
- You are about to click something by hand to reach a state.
- You are about to write "done" before the last round is compiled and CI is green for the head
  you pushed.
- A permission prompt appeared after preflight.
