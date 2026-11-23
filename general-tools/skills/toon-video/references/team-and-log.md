# The team, the log and tool gotchas

How to build with agents at stages 3 to 5, the briefs a lead fills in for them, how to log each step, and the tool
gotchas met so far. Rule ids point into `rules.md`.

## Contents

- [Building as a team](#building-as-a-team)
- [The briefs](#the-briefs): world agent (first scene; a place), shots agent, scene builder
- [Logging each step](#logging-each-step)
- [A series](#a-series)
- [Tool gotchas](#tool-gotchas)

## Building as a team

For a film longer than a few seconds, build with specialist agents that own separate files (X-4), in the order of
SKILL.md's stages 3 to 6. A locked file is not theirs to change: they ask the lead, who reopens it (S5-120, S5-121).

| Agent | Stage | Owns | Locked after |
|---|---|---|---|
| The lead (Opus) | all | the cast (`cast.ts`), the one mix, captions, `scenes.md`, the review page, the locks, joining, the owner (S5-101) | |
| One world agent | 3, then 4a, 4c, 4d | the first scene whole (its place, rough shots, stand-in people, the look files); then each place: `places/<place>.ts`, its pictures in `public/<slug>/`, its light, its rows in `marks.ts` (S5-120) | `look` at stage 3; `world` place by place, then whole |
| One shots agent | 4b, and the end of 4 | each place's scenes' `shots.ts` (S5-121); at the end `sizes.ts`, `joins.json` and the rough film | `shots` place by place, then whole |
| Scene builders, up to four | 5 | their own scenes' `story.ts`: people, acting, motion (S5-75) | each scene to its stop |
| The first scene's reviewer | 3 | nothing in `src/`: `out/<slug>/first-scene/review.md` | |

- Brief each agent from the templates below (X-36): copy one into the scratchpad, fill each `{field}` and change
  nothing else. A field that does not apply says "none". Save the filled brief in `stories/<slug>/briefs/`.
- Say the cost before a round of agents starts: about 0.5M tokens an agent call (X-3).
- The film's budget (X-37) is written before stage 3 from this price list, counted as the logs count (input, output,
  cache read and cache write of each call; measured on the dancing plague, November 2026):

  | What | Tokens |
  |---|---|
  | A scene round's reviewers and judge (`look.sh`, `abjudge.sh`) | 1.7M |
  | A second judge on a 0.1 to 0.3 margin (S5-133) | 0.6M |
  | A place or cast round, with its builder | 3.7M |
  | A film judged by three | 0.9M to 2.1M |
  | A text round (`textround.py`) | 0.6M |
  | A fresh builder's round of five changes | about 6M; a resumed builder far less (X-4) |

  An estimate is calls times the context each call carries: an agent started from a desktop session carries about
  110K of tools on each call. Double the worked figure before saying it.
- The lead is Opus; builders, reviewers and judges run on Sonnet (S5-101).
- Agents run in the foreground, and none drives a browser (X-2).
- Resume the same agents for the next round or the next place so they keep their knowledge of the code (X-4).
- A builder's count of what it fixed is a claim; a reviewer or judge who did not build it decides (X-31).
- Reviewers and judges are separate: `scripts/loop/look.sh` and `abjudge.sh` brief them from `reviewer-brief.md` and
  `judge-brief.md` (S5-41); the first scene's reviewer works from the reviewer brief in `spikes.md` (X-21).

## The briefs

Four templates, in the order they are used. The spike briefs in `spikes.md` are their pattern. Each says what is
locked, the rules for its role by id, the beats that must not get worse (X-20), how the work is checked and what
comes back.

### World agent brief: the first scene

```markdown
# World agent brief: the first scene of "{film}"

You build the first scene of our toon video "{film}": its hardest place, {place}, and one scene in it, {scene}
({seconds} s, film seconds {from} to {to}). You build it whole, as a spike (X-13): the place, rough shots and
stand-in people. It sets the look for the whole film: the owner says yes to the look on this scene before any other
place is built (S5-108, S5-105). A clear "this did not work, and here is why" is a useful result too.

Repo: {repo} (branch {branch}). Work only inside it. Foreground only: no background jobs, no dev server, no browser
(X-2). Do not push. Your output folder: `out/{slug}/first-scene/`.

## Read first, in this order
1. `<toon-world>/SKILL.md`, section "A rendered world behind drawn people", and the rules it cites (S3-213 to S3-234).
2. `<toon-video>/references/bar.md`, "The world rows and the likeness number" (W1 to W7), and
   `<toon-world>/references/look-targets.md`.
3. The scene frame: {scene frame path}. It is the level to reach: learn how it is made, copy none of its content
   (S2-37, X-34).
4. The reference stills for this place: {stills dir} (S2-34, S2-35).
5. The approved parts plan: `stories/{slug}/parts.md`, section "{place}": its light source and side (S3-191).
6. The scene's words and times: {words file}; its meaning-sheet rows: {meaning rows}.
7. The look code to start from: {the files to copy into src/look/ and the stage file's switches, ink off}.

## What is locked
Nothing is locked yet. The story's words, voice, captions, the mix and `cast.ts` are the lead's: ask before changing
them. Your files: {file list: places/<place>.ts, public/<slug>/<pictures>, src/look/<files>, stage.tsx,
scenes/<scene>/shots.ts, scenes/<scene>/story.ts}.

## The beats that must not get worse
{beat 1}; {beat 2} (X-20). Check them at phone size on every try.

## The loop
1. Write your plan in `notes.md` before any code: what you build first and what you expect to see.
2. The structure first: walls or land, floor that leads the eye in, a far view or a lit far wall, sky, the big
   pieces at three depths (S3-229, S3-230, S3-232). Then the probe still: the widest camera beside the scene frame,
   `out/{slug}/places/{place}/probe.jpg`, before you build the place out (S3-231). Write what it shows against the
   frame.
3. Rough shots in `scenes/{scene}/shots.ts`: the hero about a third of the frame high where the place reads, about
   half for acting (S3-241, S5-102); hard cuts by S3-201 and S3-235 to S3-238. Then fill for what those cameras show
   (S3-185 to S3-190) and light from the named source: key lamp in front of the hero and to one side, fill on the far
   side, smooth shade, soft shadows and contact (S3-197, S3-209, S3-218 to S3-222). Stand-in people as flat cards
   with held things in front (S3-223 to S3-228).
4. Place with stills, render to confirm (X-24). Stills: {stills command}. Render: {render command}, taking a render
   slot as the project says. Look with `sh <toon-video>/scripts/spike-frames.sh <clip> <out>/rN` and
   `spike-ab.sh`, beside the scene frame. One line in notes.md per try: what changed, what you saw, keep or undo.
5. Measure your best try: `python3 -I <toon-video>/scripts/bar-check.py <clip>`.
6. Stop when you judge it at likeness 7 with every world row passing, or after {budget: minutes and renders}.

## How it is checked
One reviewer who did not build it fills the reviewer brief of `<toon-video>/references/spikes.md` on your clip:
likeness 1 to 10 against the scene frame, each world row W1 to W7, the beats (S2-37, X-21). Your own count is a claim
(X-31). It is done at likeness 7 or more with every row passing (S5-108); under that the lead resumes you with the
review. Then the owner sees it full size beside the scene frame and says yes to the look or sends notes (S5-105, X-33).

## Hand back
Your best try as `out/{slug}/first-scene/clip.mp4` at full size, `spike-frames.sh` on it into `best/`, the probe
still, and notes.md finished with: 1. What you built, each with its file. 2. Tries (the table). 3. The world rows as
you see them, with a frame each (a claim). 4. The beats: the frame where each reads and its size on screen. 5. What
the kit or the look code lacked, with a size (small, medium, large). 6. What the other places should copy from this
one. 7. Cost: tries, renders, minutes. Commit on the branch with a plain message that lists the changes. Final
message: the paths and five lines.
```

### World agent brief: a place

```markdown
# World agent brief: the place "{place}" of "{film}", turn {a | c and d}

You build one place of our toon video "{film}" in the look the owner approved on the first scene (S5-105). A place
takes two turns with the shots agent between them: turn a builds its set; the shots agent then locks its cameras;
turn c and d fill and light it for what those cameras show, then run world rounds (S3-185, S3-197). This brief is
for turn {a | c and d}.

Repo: {repo} (branch {branch}). Work only inside it. Foreground only: no background jobs, no dev server, no browser
(X-2). Do not push. Run `look.sh` and `abjudge.sh` with a 10-minute command timeout.

## Read first, in this order
1. `<toon-world>/SKILL.md`, "A rendered world behind drawn people" (S3-213 to S3-234) and "Fill for the camera"
   (S3-185 to S3-190).
2. `<toon-video>/references/bar.md`, the world rows W1 to W7.
3. The first scene: `out/{slug}/first-scene/clip.mp4` and `review.md`: the bar this place matches.
4. The approved parts plan, section "{place}", with what the first scene taught; the scene frames of its scenes:
   {scene: frame, one each}.
5. The reference stills for this place: {stills dir} (S2-35).
6. Turn c and d: the locked cameras: {scenes and their shots.ts} and the shots agent's report {path}.

## What is locked
`look`: `src/look/`, `stage.tsx`. `shots`: {scenes locked so far}. `world`: {places locked so far}. Do not change a
locked file: ask the lead, who reopens it (`lock.mjs reopen`); `step.mjs` refuses a round while a locked file
differs. Your files: {places/<place>.ts, public/<slug>/<its pictures>, its rows in places/marks.ts}.

## The beats that must not get worse
{for each scene in this place: beat; beat} (X-20).

## Turn a: the set
The structure and no fill (S3-185): walls or land, floor that leads the eye in, a lit far wall or far view, sky, the
big pieces at three depths, things to sit on and to hold (S3-229, S3-230, S3-232, S3-233). For each of its scenes a
probe still from the widest planned camera beside that scene's frame, `out/{slug}/places/{place}/{scene}-probe.jpg`
(S3-231, X-34). Stop there; the shots agent sets the cameras next.

## Turn c: fill and light
For what the locked cameras show: fill by S3-185 to S3-190. Light from the parts plan's source and side (S3-191): the
key lamp in front of the hero and to one side for these cameras (S3-197, S3-209), the fill on the side away from it,
smooth shade, soft shadows and contact (S3-218 to S3-222, S5-107); at night S3-204, S3-205, S3-219, S3-220. The far
picture faces where the cameras look (S5-72, `marks.ts FAR`); the place's screen direction and blockers go in
`marks.ts` (S5-79, S5-80).

## Turn d: world rounds
`node <toon-video>/scripts/loop/step.mjs out/{slug}/world/{place} init --code src/stories/{slug}/places --passes world`
once, then each round as `step.mjs` prints it, on clips of a few seconds from {scenes}: a stills sheet before any
render, the render, `look.sh` with the world focus, `abjudge.sh` against best with `--stills {stills dir}` (S5-41,
S5-113). The judge keeps or reverts (S5-42). A pass stops by S5-110 alone: at 4, after two rounds in a row with no win,
or after six rounds; nobody caps it lower (S5-111).

## How it is checked
Turn a: the lead puts each probe still beside its scene frame. Turn d: `verdict.json` per round and the world rows in
the reviewers' faults; the lead reads both, then locks: `lock.mjs out/{slug} set world --add <your files>`.

## Hand back
`out/{slug}/world/{place}/report.md`, under 400 words: per turn, what you built with its files; the probe stills;
each round's verdict; the world rows and the beats, each with a frame; what the next place should copy; cost
(rounds, renders, minutes). Final message: the path and five lines.
```

### Shots agent brief

```markdown
# Shots agent brief: the cameras of "{place}" in "{film}"

You set the cameras and shot sizes of the scenes in one place, {place}: {scenes}. Its set is built and not yet filled
or lit, because fill and the key lamp serve the cameras you lock (S3-185, S3-197, S3-249). A camera changed after you
lock it sends the place's fill and light back too, so choose now.

Repo: {repo} (branch {branch}). Work only inside it. Foreground only: no background jobs, no dev server, no browser
(X-2). Do not push.

## Read first, in this order
1. `<toon-video>/references/camera.md`: the spectacle brief, shots by subject, the camera checks.
2. The rules for your role: shot sizes S3-241, S3-249, S5-102; the cut budget S3-235 to S3-238, with S3-201, S3-202,
   S3-203; each shot's reason and what moves behind S5-91, S3-169; the hero moment big S5-92; candidate stills S5-93;
   the far picture S5-72; beat references S5-76; camera speed S5-67; paths S5-80, S5-87.
3. The animatic and still board: {paths}; the rows of `stories/{slug}/scenes.md` for {scenes}; their words: {words
   files}.
4. The first scene's cameras, which the owner approved the look on: `scenes/{first scene}/shots.ts`.
5. Beat references: {scene: clip, or none}. Scene frames: {scene: frame}.
6. The world agent's turn-a report and probe stills: {paths}.

## What is locked
`look`; `world`: {places locked so far}; `shots`: {scenes locked so far}. Your files: `scenes/<scene>/shots.ts` for
{scenes}; `sizes.ts` and `joins.json` at the end of stage 4 only, when the lead asks.

## The beats that must not get worse
{for each scene: beat; beat} (X-20).

## What to do
1. Each scene's `shots.ts`: beats from the word times, the camera keys, the shot list (S5-121). A face or action beat
   holds the hero at a third of the frame height or more; a wide with the hero smaller lasts 1.5 s at most (S5-102);
   about a third where the place reads, about half for acting (S3-241). A scene with a beat reference copies its shot
   sizes and camera side (S5-76).
2. Cuts: at most one hard cut per 7.5 s over the film, this place's share {n}; no stretch under 3 s; two takes of
   10 s or more in the film; a reason written on each cut (S3-235 to S3-238). A change of place is a join or a
   moving dissolve (S3-201). Allowed: {what is allowed, said plainly (X-28)}. Not allowed: {for example wipes, inset
   boxes}.
3. Each shot names why its angle and what moves behind the hero (S5-91, S3-169); the hero moment reads big (S5-92).
4. For each hero beat, 2 to 3 candidate stills forced apart in angle and size, in
   `out/{slug}/shots/{scene}/candidates/`; the lead puts them on the review page (S5-93).
5. Checks, each to exit 0: `node src/stories/{slug}/tools/shots-check.mjs`, `cam-speed.mjs <scene>`,
   `path-check.mjs <scene>` (S5-72, S5-102, S5-67, S5-80, S5-87, S3-235 to S3-238).

## How it is checked
The scripts above exit 0; the lead looks at a stills sheet of each shot's first and last frames beside the scene
frame; the owner picks one candidate per hero beat (S5-93). Then the lead locks `shots --add`. At the end of stage 4
three judges compare the rough film with the animatic (S5-84).

## Hand back
`out/{slug}/shots/{place}-report.md`, under 400 words: per scene the shot list (size, reason, what moves behind, the
reason for each cut), the last line of each check, the candidate stills, the hard cuts against this place's share;
and, for the world agent, what each camera shows that needs fill or light (where the floor shows, what stands behind
the hero). Final message: the path and five lines.
```

### Scene builder brief

```markdown
# Scene builder brief: {scenes} of "{film}"

You make the people act and move in {scenes} of our toon video "{film}", inside places, cameras and sizes that are
locked (S5-75). Each scene runs the scene loop round after round, judged blind against its best so far, until it
stops by the rules below. Your scenes start from the rough film the judges passed: `out/{slug}/film-0/` (S5-84).

Repo: {repo} (branch {branch}). Work only inside it. Foreground only: no background jobs, no dev server, no browser
(X-2). Do not push. Run `look.sh` and `abjudge.sh` with a 10-minute command timeout.

## Read first, in this order
1. `<toon-video>/SKILL.md`, "Stage 5. Scene stage", and `<toon-video>/scripts/loop/README.md`.
2. `<toon-video>/references/acting.md`. Not `rules.md`: an acting round's builder reads its role's file only (S5-126).
3. For each scene: meaning-sheet rows {rows}; beat reference {clip, or none}; scene frame {path}; reference stills
   {dir}.
4. The owner's notes so far, in his words: {notes, or none}.

## What is locked
`look`, `world`, `shots` (each `shots.ts`, `sizes.ts`, `joins.json`). Your files: `scenes/<scene>/story.ts` and the
pose drawings it needs, for {scenes}. A change to a place, a camera, a size or a join card goes to the lead (S5-75);
`step.mjs` refuses a round while a locked file differs.

## The beats that must not get worse
{for each scene: beat; beat} (X-20). Name them in each round's notes; a round that weakens one is reported as a loss.

## The loop you run
For each scene, `D=out/{slug}/scenes/<scene>`:
1. Once: `node <toon-video>/scripts/loop/step.mjs $D init --code src/stories/{slug}/scenes/<scene> {--ref <clip>, or
   nothing}`, and the scene's words with `words.mjs` as SKILL.md shows. The rig check comes first: a pose sheet of
   each pose and prop the words need (S5-54 to S5-56, S5-85).
2. Each round as `step.mjs $D` prints it (S5-41): at most five changes from `best/faults.md`; a stills sheet,
   `pose-check.mjs` (and `path-check.mjs` when someone moves past others) before any render (S5-78, S5-80); the
   render; `jumps.sh`; `look.sh` (three reviewers); `abjudge.sh`, the blind judge, with `--stills {dir}` and `--ref`
   when the scene has a beat reference (S5-112, S5-113); then `step.mjs $D keep` or `revert` as the verdict says (S5-42).
3. Every round ends with the blind judge. You do not skip it, judge a round yourself, or keep a round it lost
   (S5-41, S5-42).
4. Passes: people, then motion. A pass stops by S5-110 alone: at 4 on the three-judge average, after two rounds in a
   row with no win, or after six rounds; with a beat reference, best also beats or ties it (S5-112). You do not cap
   rounds below that, whatever else you read (S5-111).

## How it is checked
`step.mjs` and the judge decide each round (S5-42); the lead reads each scene's `verdict.json` and `log.md`. At the
join three judges watch the whole film against the last film the owner saw (S5-82), and the owner's notes come back
to the scene they name.

## Hand back
`out/{slug}/scenes/<scene>/report.md` per scene, under 400 words: a table of rounds (pass, changes, verdict, the
judge's scores); the stop and its rule; the beats, each with a frame; the faults left in three piles: fixable here,
behind a lock, hard in the tool (X-32); a line per finding for `stories/{slug}/lessons.md` (S6-15). Final message:
the paths and five lines.
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
  (`motion=..` too in render mode) and `--judge` (S5-48). `rounds` sets each score against the last of the same mode.
- A fix row carries the `--cycle` and `--round` of the critique it fixes, and the round's tool timings in `--note`:
  the `note:` line of `production_log.py tooltime out/<slug>/tool-times.jsonl --since <round start>`. The story's
  tools (gate, stills, render, audit, look) each append one line a step to that file, the bundle timed on its own.
- The scene loop logs each phase in its loop folder with `step.mjs <loop> log <phase>` (S5-48). The whole-film method
  alone keeps `stories/<slug>/findings.md`, one `## <cycle>-<round>` section per critique from round 2 on (S5-27).
- `--at` without a time zone is read in the machine's zone.
- At the start, `production_log.py profile` records how the video is made (S0-11).

Reports:

| Command | Shows |
|---|---|
| `production_log.py report <log>` | each story by stage, and each stage's average across stories |
| `production_log.py rounds <log>` | each story's scores by cycle, round and mode, with the hours to reach each one; counts rounds per pass (S5-110) |
| `production_log.py tooltime <file>` | seconds and runs per tool and step from `out/<slug>/tool-times.jsonl`, `--since` a round's start |
| `production_log.py areas <log>` | each story's weakest area, and each area's average with and without each method |
| `production_log.py audience <log>` | a week after posting: viewed against swiped away, average viewed, retention dips (S6-12) |

`report` and `rounds` go on the review page with each render (S5-53).

Set the audience's dips against the critic's scores: a dip on a scene the critic scored 4 means the critic is wrong
there. Change the critic's anchors when they disagree (S6-13).

## A series

A series builds its worlds, cast, props and effects in episode one, in one shared folder later episodes import
(S6-14). Later episodes are then staging, camera and sound.

## Tool gotchas

- `look.sh` and `abjudge.sh` start `claude -p` runs and wait; three judges on a film take past three minutes. Run them
  with a 10-minute command timeout, or the harness moves them to the background.
- Each scene renders and makes stills from its own bundle (`out/<slug>/bundles/<scene>/`); builders sharing one
  checkout still see each other's saved files in a fresh bundle, so keep edits inside your own scene.

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
