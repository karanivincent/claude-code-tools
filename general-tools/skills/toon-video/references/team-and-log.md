# The team, the log and tool gotchas

How to build with agents at stage 3, how to log each step, and the tool gotchas met so far. Rule ids point into
`rules.md`.

## Contents

- [Building as a team](#building-as-a-team)
- [The place agent brief](#the-place-agent-brief)
- [Logging each step](#logging-each-step)
- [A series](#a-series)
- [Tool gotchas](#tool-gotchas)

## Building as a team

For a film longer than a few seconds, build with specialist agents that own separate files (X-4):

| Agent | Owns |
|---|---|
| Place agents, one per two or three places | `places/<place>.ts`, the place's track and detail layer |
| Effects | fire, smoke, dust and water volumes and cards |
| People and props that act | the cast's poses, props with states, things that move (a train) |
| Sound | the sound script, music, mix and stems |
| Camera, last | `shots.ts` cameras and joins, because it frames what the others built |

- Say the cost before a round of agents starts: about 0.5M tokens an agent call (X-3).
- Agents run in the foreground, and none drives a browser (X-2).
- Resume the same agents for the next round so they keep their knowledge of the code (X-4).
- Each agent writes a short report with notes for the camera agent.
- Critics are separate: brief them from `critic-brief.md`.

## The place agent brief

Copy this into the scratchpad, fill every bracket (X-5), and give it to each place agent with its own file list and
shot table. About 0.25M tokens a place agent per round.

```
# Brief: animate your places for <story>

Repo: <repo path> (branch <branch>). Run in the foreground; start no background work. Do not commit. Edit only the
files in your list.

## What this is
<One paragraph: the film, the look, the owner's last notes in his words.> Your job: make your shots alive. People act
and move; things fly, fall, burn, splash and sparkle each second.

## How the film drives a shot
- shots.ts lists the shots with their stretch of the film (table below). The film calls your place's shot function
  as shots[name](built, t): t starts at the shot's own t and runs up with the seconds in the shot. The board calls it
  without t (use t ?? <the shot's t>). Compute people by time inside it; keep the returned view as the board framing.
- update(shot, t, cam) runs each frame with the same t: animate the world there.
- Land each action inside its shot's stretch, on the word that names it (word times are in full.json).
- If you export action times (shots fired, falls), say so in the report: the sound reads them.

## Rules your shots meet
S3-9 (detail layer), S3-72 (props held), S3-73 (effects from the card), S3-76 (fire), S3-134..S3-137 (acting),
S3-142 (nobody vanishes), S3-144 (picture events have sound). Read them in rules.md.

## People can do
<The card options: modes (walk, fall), phase, hand targets in design space, expressions, look, tilt, lean, roll, lift,
vis; a salute's hand point; how a held 3D prop gets drawn fists.>

## Detail helpers (read only)
<The detail layer helpers in detail.ts and their tick(t, cam).>

## The owner's likes (keep)
<From the lessons file.> Keep the shot names.

## Checking your work
- The typecheck passes.
- Take a render slot if the project uses them; render a short moving stretch of your shots at half size; look at 2
  to 3 full-size stills at your action beats. Free the slot.

## Report
Per shot: what now moves, and what is still off. Under 400 words.
```

## Logging each step

Log each step the moment it ends, to the project's `docs/production-log.jsonl`, with the skill's own script from the
plugin cache (S6-10); create the log file if the project has none:

```
python3 <toon-video>/scripts/production_log.py add docs/production-log.jsonl --story <slug> --stage <stage> --step <what> --round <n> --by <agent> --minutes <m> --tokens <t>
```

- Stages: study, script, voice, plan, world, people, camera, build, render, critique, fix, spike, review.
- An agent's minutes and tokens are in its finish notice (`duration_ms`, `subagent_tokens`); a resumed agent reports
  its running total, so log what this run added. A render prints its minutes.
- A critique row carries `--cycle`, `--round` (`render` for the render critic), `--mode stills|render`, `--file`
  (the report's name, `critic-<cycle>-<round>.md`), `--score`, `--areas world=..,camera=..,people=..,light=..,story=..,sound=..`
  (`motion=..` too in render mode) and `--judge` (S5-12). `rounds` sets each score against the last of the same mode.
- A fix row carries the `--cycle` and `--round` of the critique it fixes, and the round's tool timings in `--note`:
  the `note:` line of `production_log.py tooltime out/<slug>/tool-times.jsonl --since <round start>`. The story's
  tools (gate, stills, render, audit, look) each append one line a step to that file, the bundle timed on its own.
- From round 2 on, and on each render, a critique gets its `## <cycle>-<round>` section in `stories/<slug>/findings.md`
  (S5-11, S5-27, S5-38).
- The gate refuses a report with no critique row, a fixed round with no fix row, or a missing findings section, and
  prints the command to run (S5-38).
- `--at` without a time zone is read in the machine's zone.
- At the start, `production_log.py profile` records how the video is made (S0-11).

Reports:

| Command | Shows |
|---|---|
| `production_log.py report <log>` | each story by stage, and each stage's average across stories |
| `production_log.py rounds <log>` | each story's scores by cycle, round and mode, with the hours to reach each one; counts rounds against the aim of three (S5-32, S5-36) |
| `production_log.py tooltime <file>` | seconds and runs per tool and step from `out/<slug>/tool-times.jsonl`, `--since` a round's start |
| `production_log.py areas <log>` | each story's weakest area, and each area's average with and without each method |
| `production_log.py audience <log>` | a week after posting: viewed against swiped away, average viewed, retention dips (S6-12) |

`report` and `rounds` go on the review page with each render (S5-35).

Set the audience's dips against the critic's scores: a dip on a scene the critic scored 4 means the critic is wrong
there. Change the critic's anchors when they disagree (S6-13).

## A series

A series builds its worlds, cast, props and effects in episode one, in one shared folder later episodes import
(S6-14). Later episodes are then staging, camera and sound.

## Tool gotchas

- Crowd phase offsets stay positive: `(v % 1)` of a negative number picks a missing picture and three.js crashes in
  `projectObject`. Use `frac = v => ((v % 1) + 1) % 1` (S3-29).
- In zsh, `$((...)+20)` inside a long one-line command fails to parse and nothing in that line runs, earlier steps
  included. Put such edits in a script file.
- A draft script that skips files it already drafted needs the old entry moved aside (`replaced`) before a redo
  (S6-7).
- Facts from a source that will not fetch (403, paywall, a scan): save the PDF, OCR it (pymupdf, then tesseract), read
  the key pages as images, and record each claim with its page in `facts.md` (S1-6).
- Higgsfield uploads: a large PNG can fail with HTTP 520; convert it to JPG and upload again.
- Before trusting a long render, check `df` and the output file's time: a full disk fails each frame write while the
  old file stays (S5-15).
