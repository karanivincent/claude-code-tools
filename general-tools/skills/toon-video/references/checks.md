# The measured checks

The scene loop judges with three reviewers and a blind judge (S5-41, S5-47). Code supplies the facts an AI cannot see
or hear, and `step.mjs` checks that each step's files exist (S5-48). The old gate is retired; `gate.mjs` stays in older
stories' tools. <!-- lint-ok -->

## Before the scenes (world and shots stages)

| Check | Script | Gives | Rule |
|---|---|---|---|
| Locks | `scripts/loop/lock.mjs out/<slug> set\|check\|reopen` (and `step.mjs` before each round, render and keep) | The places, then the cameras, sizes and join cards, frozen; a changed locked file is refused | S5-71, S5-73 |
| Shot sizes and the far picture | `templates/scene/tools/shots-check.mjs` | Per shot: the hero's height in the frame, wides over 1.5 s, cameras looking away from the far picture, frames in no shot | S5-72, S5-88 |
| The rough film | `scripts/loop/abjudge.sh <animatic> <rough film> out/<slug>/film-0 --judges 3` | Film-level faults before any acting | S5-84 |

## In each round

| Check | Script | Gives | Rule |
|---|---|---|---|
| The next step and its inputs | `scripts/loop/step.mjs <scene loop folder>` | Refuses a step whose input file or approval is missing; logs each phase | S5-48 |
| One-frame jumps | `scripts/loop/jumps.sh` (wraps `<toon-world>/scripts/short_qa.py`) | Frame numbers of pops, for the reviewers | S5-47 |
| Camera speed | `templates/scene/` camera-speed probe | Frames moving over about 0.3 m or 1.5 degrees | S5-67 |
| Faces and hands that snap | `templates/scene/tools/pose-check.mjs` | A face swapped with no in-between, a hand that jumps against the frames around it, a mode switch | S5-78 |
| Scene words | `scripts/loop/words.mjs <full.json> --scene <id> --plan <plan.ts>` | The scene's words on its own clock, for `look.sh --words` | S5-41 |
| Paths that clear | `templates/scene/` path projection | An action's path against the other figures and the blockers on screen; an action that ends after its scene | S5-80, S5-87 |
| Reviewers | `scripts/loop/look.sh` with `reviewer-brief.md` | Five area scores, a path to 5, `faults.md` | S5-41 |
| Blind judge | `scripts/loop/abjudge.sh` with `judge-brief.md` (`--ref` adds the reference) | `verdict.json`: win, loss or tie, credited and blamed; with a reference, best and new beat, tie or fall below it | S5-42, S5-44, S5-77 |

## On the joined film

| Check | Script | Gives | Rule |
|---|---|---|---|
| Joins | `scripts/loop/joins.sh` with `tools/join-times.mjs` | Jumps around each join (a dip's fade is planned), a 2 s clip of each for a reviewer | S5-51, S5-52, S5-86 |
| Three judges | `scripts/loop/abjudge.sh --judges 3` | The film against a film of about its length (refuses a clip under half its length) | S5-52, S5-82 |
| Effects heard, once on the mix | `scripts/loop/audible.py` | Each effect at its cue in the film's one mix | S5-83 |
| Black, white, frozen and popping frames, loudness | `<toon-world>/scripts/short_qa.py` | Exit code | S5-18 |
| Brightness | the project's brightness script | Bible in Clay: the opening and any dull stretch; any project: faces readable on a phone, night included | S4-18, S4-19 |
| Sound levels | `scripts/levels.mjs` on the stems | Floor, music ceiling, held bed, silent tail | S4-4 |

## The score scale

1 broken, 2 weak, 3 fine, 4 good, 5 great, not rounded up; scores compare within one judging alone (S5-44).

## Shared drawing code

A change to shared drawing code adds an option and keeps old defaults; byte-compare two frames of an earlier video
(X-8).
