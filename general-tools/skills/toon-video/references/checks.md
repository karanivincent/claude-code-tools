# The measured checks

The scene loop judges with three reviewers and a blind judge (S5-41, S5-47). Code supplies the facts an AI cannot see
or hear, and `step.mjs` checks that each step's files exist (S5-48). The old gate is retired; `gate.mjs` stays in older
stories' tools. <!-- lint-ok -->

## In each round

| Check | Script | Gives | Rule |
|---|---|---|---|
| The next step and its inputs | `scripts/loop/step.mjs <scene loop folder>` | Refuses a step whose input file or approval is missing; logs each phase | S5-48 |
| One-frame jumps | `scripts/loop/jumps.sh` (wraps `<toon-world>/scripts/short_qa.py`) | Frame numbers of pops, for the reviewers | S5-47 |
| Effect loudness | `scripts/loop/audible.py` | Each effect heard, just heard or masked at its cue | S5-47, S5-70 |
| Camera speed | `templates/scene/` camera-speed probe | Frames moving over about 0.3 m or 1.5 degrees | S5-67 |
| Paths that clear | `templates/scene/` path projection | An action's path against the other figures on screen | S5-65 |
| Reviewers | `scripts/loop/look.sh` with `reviewer-brief.md` | Five area scores, a path to 5, `faults.md` | S5-41 |
| Blind judge | `scripts/loop/abjudge.sh` with `judge-brief.md` | `verdict.json`: win, loss or tie, credited and blamed | S5-42, S5-44 |

## On the joined film

| Check | Script | Gives | Rule |
|---|---|---|---|
| Joins | `scripts/loop/joins.sh` | Jumps around each join, a 2 s clip of each for a reviewer | S5-51, S5-52 |
| Three judges | `scripts/loop/abjudge.sh --judges 3` | The film against the last film the owner saw | S5-52 |
| Black, white, frozen and popping frames, loudness | `<toon-world>/scripts/short_qa.py` | Exit code | S5-18 |
| Brightness | the project's brightness script | The opening and any dull stretch | S4-8 |
| Sound levels | `scripts/levels.mjs` on the stems | Floor, music ceiling, held bed, silent tail | S4-4 |

## The score scale

1 broken, 2 weak, 3 fine, 4 good, 5 great, not rounded up; scores compare within one judging alone (S5-44).

## Shared drawing code

A change to shared drawing code adds an option and keeps old defaults; byte-compare two frames of an earlier video
(X-8).
