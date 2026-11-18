# The scene loop scripts

A film is built as scenes of 5 to 10 s, by areas in order across the whole film (S5-71, S5-73, S5-75): the world
stage (one loop folder, `out/<slug>/world/`, pass `world`), the shots stage (`out/<slug>/shots/`, pass `shots`, when it
runs judged rounds), then each scene (`out/<slug>/scenes/<scene>/`, passes `people` then `motion`). Each stage's files
are locked before the next (`lock.mjs`). The sound check runs once on the film's mix at the join (S5-83). These
scripts run a round's checks and keep its files in order. They work for any story: every input is an argument. They
run on macOS (bash 3, BSD tools, Python 3, Node 18+, ffmpeg).

The look since 18 November 2026 is a rendered world behind drawn people (toon-world, "A rendered world behind drawn
people"; the world rows W1 to W7 and the likeness number in `references/bar.md`). Reviewers and judges score those rows
and a likeness from 1 to 10 against the scene's reference frame (S2-36).

Reviewers and judges are `claude -p` sessions on Sonnet (S5-101), started by these scripts in the foreground, all at
once, and the script waits for them. In the spikes, reviewers started as background agents died when the turn ended.
Run these scripts from the main session, not from a subagent, with a 10-minute command timeout (three judges on a film
take longer than three minutes). `look.sh` and `abjudge.sh` take `--dry-run`: they make the frames and the briefs,
print each `claude -p` command, and stop.

## When a pass stops

One rule, in `step.mjs` and both briefs. It replaces the differing numbers of S5-43, S5-89, S5-98 and the stills scale
of S5-100 for the loop (the register change is listed for the lead to make). A pass stops at the first of:

1. its clip reaches 4 on the 1 to 5 scale in the pass's area (the judges' mean on best; the reviewers' before any
   judging) and likeness 7 against its reference frame (S5-104);
2. two rounds in a row with no win (a loss, a tie, or a round that failed the bar gate);
3. six rounds.

With a reference clip (S5-77) the first stop also needs best to beat or tie that clip. A scene with no reference frame
stops on the area score alone, and `step.mjs`, `look.sh` and `abjudge.sh` print a loud warning every time (S2-36).
A round makes at most five changes (S5-41). Reference stills (`abjudge.sh --stills`, S5-97) are shown for detail; the
one number they feed is the likeness to the frame.

## The builder

The same builder agent is resumed each round with SendMessage; never start a fresh agent for a fix round (X-4).
Measured on the Epiclings films (production log, 8 and 9 November 2026): a fresh fix agent cost 0.4 to 0.6M tokens a
round (0.38M, 0.48M, 0.42M, 0.59M); a resumed one cost 5K to 125K. Reviewers and judges are the opposite: fresh each
round, so they never grade their own advice.

A builder's "done" is a claim (X-31). Its `changes.md` goes to reviewers 2 and 3 as claims to check, and `step.mjs`
refuses to keep a round that has a build and no look by someone who did not build it. After a lost or tied round the
reviewers wait for the judge: they run only when the judge would keep the round, so a lost round costs one judge.

## What the lead puts in the loop folder

| File | What | Read by |
|---|---|---|
| `ref-frame.jpg` (or `.png`) | The scene's reference frame (S2-36), named in `stories/<slug>/parts.md`: a frame of the same kind and light level from the catalog. `init --ref-frame <image>` names one elsewhere | `look.sh`, `abjudge.sh` (default `<round>/../ref-frame.*`), `step.mjs` (the likeness stop) |
| `meaning.md` | What the scene must say: beats, words and their times | reviewers 2 and 3, the judges |
| `protect.md` | One or two beats that must not get worse (X-20), from the meaning sheet: `- 2.4-3.1 \| the NO stamp lands square` (scene clip seconds) | reviewers 2 and 3, the judges; a round that weakens one loses, whatever its average |
| `hits.json` (or `cues.json`) | Hits, landings and strikes in scene clip seconds: `[1.2, 3.4]` or audible.py's cue shape `[{"name": "thud", "t": 0.9}]` | every-frame strips round each (X-23), for reviewers and judges |
| `words.json` | The scene's words on its own clock (`words.mjs`) | reviewer 3's stills on the action words |
| `poses.jpg` | The pose sheet (rig check) | `step.mjs`: no pose sheet, no build |

`scene.json` also records `"night": true` (`init --night`), which adds `--night` to the bar gate.

## The owner's approvals

`step.mjs round` reads the film's `src/stories/<slug>/approvals.json` (the review page's store, copied unchanged; the
loop folder `out/<slug>/...` names the slug) and refuses a round while a stage it needs has no row with `approved:
true`, `source: "page"`, `at` and `by` (S2-23, S0-14; the same reading as toon-world's `gate.mjs`). A round needs
`story`, `direction` and `look` by default. The first scene (S5-104), built before the owner's Look yes, is set up with
`init --needs story,direction`; `init --approvals <file>` names another file. When the lead has to go on without a row
(the owner said yes in chat and has not clicked yet), `round <pass> --override-approval "<why>"` makes the round and
writes the missing stages and the reason into `log.md` and the round's `approval-override.md`; the round's log line
carries it too.

## The bar gate

`node step.mjs <loop> bar` runs `python3 -I <toon-video>/scripts/bar-check.py <clip> --gate` (with `--night` for a night
scene) on each round's clip, after `jumps.sh` and before the reviewers, and writes `bar.json` and `bar.txt`. Exit 0 is
a pass; exit 1 is a failed round, with one line per failed measure (S3-173 calm, S3-205 and S3-220 night levels). A
failed round is reverted with no reviewers or judge spent on it, and its lines go into `best/faults.md`. A failed first
build stays the first best, its lines in its faults. A bar-check without `--gate` (an older copy) is run without it
and the round is marked `unsupported`, with a warning: it is not gated. It looks for a Python with numpy (`PYTHON`
overrides; `TOON_BAR_CHECK` points at another bar-check). `bar --dry-run` prints the command.

## What the review calls cost

`look.sh` and `abjudge.sh` start `claude -p --output-format json`. `_usage.py` takes the reply text out of the JSON and
writes one line per call: `looks/usage.jsonl` (reviewers) and `judges-usage.jsonl` (judges) in the round folder, each
`{"by", "model", "tokens", "input", "output", "cache_read", "cache_write", "seconds", "turns", "cost_usd"}` (tokens
counts all four, cache reads included, as the production log does). `step.mjs keep` and `revert` add them up into the
round's line in `log.md`:

```
- 14:02 | round motion-r2 | kept (win, new 3.9 vs best 3.5) | likeness new 6.5 | reviewers 3 calls, 410K tokens, 190 s | judges 1 call, 180K tokens, 85 s | bar pass
```

## The scripts

| Script | What it does | Writes |
|---|---|---|
| `step.mjs <loop-dir> [cmd]` | The file check between steps: prints the next step; refuses (exit 1, naming the file) a step whose input is missing, whose locked files changed, or whose owner's approval is missing. `init --code <dir> [--code <dir2>] [--passes people,motion] [--ref <clip>] [--ref-frame <image>] [--night] [--needs a,b] [--approvals <file>]`, `round <pass> [--override-approval "<why>"]`, `bar [--dry-run]`, `keep`, `revert`, `check <step>`, `log <phase> [note]`. Writes `faults.md` after a round with no reviewers (S5-90) | `scene.json`, round folders, `bar.json`, `best/`, `log.md` |
| `lock.mjs <out/slug> set <stage> <files>\|check\|list\|reopen <stage> --why t` | Freezes a stage's files by hash; `reopen` is the lead's and is logged | `locks.json`, `locks-log.md` |
| `words.mjs <full.json> --scene <id> --plan <plan.ts> [--out f]` | The scene's words on its own clock, for `look.sh --words` | `words.json` |
| `frames.sh <clip> <outdir> [fps=6] [--strips a-b,t]` | Contact sheets, 30 tiles a sheet, time and frame number on each tile; a frame every 0.5 s; every-frame strips round each time or window (X-23) | `sheet-NN.jpg`, `f6/`, `full/`, `strips/` |
| `jumps.sh <clip> <outdir> [--planned shots.json]` | One-frame jumps from toon-world's `short_qa.py`, frame numbers only | `jumps.md`, `jumps.json`, `qa/` |
| `audible.py <mix.wav> <cues.json> [--voice voice.wav] [--out f]` | Each effect's loudness at its cue against the mix: heard, just or masked | `audible.md` |
| `look.sh <clip> <round> --focus <area> [--ref-frame img] [--meaning f] [--prior f] [--claims f] [--protect f] [--hits f] [--words f] [--actions a,b] [--facts f] [--dry-run]` | Three Sonnet reviewers with `references/reviewer-brief.md`: reviewer 1 the cold reader (no script; names each main thing on screen, a thing it cannot name is a fault), reviewer 2 on sheets and frames, reviewer 3 on full-size stills at the action words; all three see the reference frame and the strips, answer W1 to W7 and give a likeness | `looks/<n>.md`, `looks/usage.jsonl`, `looks/scores.json`, `faults.md`, `faults.json` |
| `abjudge.sh <best> <new> <round> [--judges 1\|3] [--brief f] [--meaning f] [--focus area] [--ref-frame img] [--ref clip] [--stills dir] [--protect f] [--hits f] [--model m] [--any-length] [--dry-run]` | Blind A/B with `references/judge-brief.md`: A/B order drawn per judge, the key outside the judge's folder; the reference frame as F; `--ref` shows the reference clip as R (S5-77); a weaker protected beat is a loss (X-20); refuses clips more than two times apart in length (S5-82) | `verdict.json`, `judges-usage.jsonl`, `judge-<j>/`, `keys/` |
| `joins.sh <film> <joins.json> <outdir> [--no-review]` | Jumps within 0.5 s of each join, a 2 s clip around it for one reviewer | `joins.md`, `join-<i>/` |

`_brief.py` (fills a brief), `_beats.py` (reads `protect.md` and hits), `_usage.py` (the JSON reply and its usage),
`_merge_looks.py` and `_verdict.py` are helpers of the scripts above.

Areas: world, people, light, story, motion (and sound in the sound pass). A pass's area: world pass, world and light;
shots pass, story (framing); people pass, people; motion pass, motion; sound pass, every effect heard.

`looks/scores.json`: `reviewers` (each one's area scores), `mean`, `focus`, `likeness` (`reviewers`, `mean`; null
without a frame), `rows` (W1 to W7: which reviewers passed and failed each), `cold` (the cold reader's names),
`claims` (closed, partly, not closed), `protect` (per beat: holds, weaker, stronger). Replies in the older form, with
none of these sections, still merge; those fields stay empty.

`verdict.json`: `judges[]` (each judge's A/B order, its scores per area for `best` and `new`, their means, likeness,
failed world rows, what it could not name, what it credited and blamed in each, its pick and its protected-beat
picks), `mean` (per area and overall, best and new, with `likeness` and `rows_failed`), `diff`, `winner` (`win` when
new is 0.1 or more above best, `loss` when 0.1 or more below, else `tie`; always `loss` when a protected beat got
weaker), `prefer` (the judges' pick), `keep` (`new` on a win or on a tie the judges prefer, else `best`), `protected`
(per beat: votes and `weaker`) and `lost_on`. With `--ref`, `ref`: the reference clip's mean scores, and best and new
against it (`diff`, `status`: beats, ties or below, with the same 0.1 margin).

`joins.json`: `[{"at": 7.2, "from": "edge", "to": "fall", "kind": "cut", "why": "a new place"}]`; kind is cut, dip
(with `"dip": <frames>`), dissolve, swing or journey. At a cut the cut frame's jump is expected, at a dip any jump
inside the fade; any other jump near a join is a fault.

`cues.json` for `audible.py`: `[{"name": "splash", "t": 3.2}]` measures the mix's rise at the cue;
`{"name": "splash", "t": 3.2, "file": "splash.mp3", "gain_db": -4}` or `{"stem": "fx.wav"}` measures the effect against
the rest of the mix.

## The folder

```
out/<slug>/scenes/<scene>/
  scene.json        {"code": ..., "passes": [...], "ref": "<clip>", "refFrame": "<image>", "night": false, "needs": [...]}
  ref-frame.jpg     the scene's reference frame (S2-36)            no frame: a loud warning, no likeness
  words.json        the scene's words on its own clock          (words.mjs)
  meaning.md        what the scene must say: beats, words and their times
  protect.md        one or two beats that must not get worse (X-20)
  hits.json         hits in clip seconds, for every-frame strips (X-23)
  poses.jpg         the pose sheet (rig check)                 no pose sheet, no build
  log.md            one line per phase, one per closed round (verdict, tokens, seconds, bar, overrides)
  <pass>-r<n>/      pass: world, shots, people, motion, sound; <first pass>-r0 is the first build, then r1, r2...
    approval-override.md   only when the round was made without an approval, and why
    changes.md      the builder's changes, at most five; its claims are checked by reviewers 2 and 3
    stills.jpg      stills sheet of the changed seconds          no stills sheet, no render
    clip.mp4        the render
    jumps.md        jumps.sh                    audible.md   audible.py (sound pass)
    bar.json        step.mjs bar                 bar.txt      bar-check's printout   a failed gate is a failed round
    looks/          look.sh (usage.jsonl)       faults.md    the reviewers' faults, ranked
    verdict.json    abjudge.sh                  judge-<j>/, keys/, judges-usage.jsonl
                                                no verdict.json, no next round; no look, no keep (X-31)
    kept | reverted written by step.mjs keep / revert
  best/             code/<n>/ (a snapshot of each source folder), clip.mp4, faults.md, verdict.json, scores.json, from.txt
                                                no best snapshot, no revert
```

Locks: `out/<slug>/locks.json`, found by `step.mjs` in the loop folder or up to three folders above it.

The rough film after the shots stage: `abjudge.sh <animatic> <rough film> out/<slug>/film-0 --judges 3` (S5-84). The
final film: `abjudge.sh <last film> <new film> out/<slug>/film-<n> --judges 3`, and `joins.sh` beside it; the reference
is a film of about its length, never a short clip (S5-82). Loop clips render at half size to save time; a clip the
owner judges the look on (the first scene's Look yes, S5-105) renders full size, or says its size beside it (X-33).

## A round, as commands

Once per scene, at the start of the scene stage (places and shots locked; the spike of this beat is its reference):

```bash
L=~/.claude/plugins/.../toon-video/scripts/loop      # this folder
D=out/my-story/scenes/fall
node $L/step.mjs $D init --code src/stories/my-story/scenes/fall --ref out/spike/fall.mp4 \
  --ref-frame refs/night-camp.jpg --night                                                   # passes people, motion
node $L/words.mjs src/stories/my-story/full.json --scene fall --plan src/stories/my-story/plan.ts --out $D/words.json
printf -- '- 2.4-3.1 | he goes over the edge, legs kicking\n' > $D/protect.md               # X-20, from meaning.md
echo '[2.9]' > $D/hits.json                                                               # the splash
```

The motion pass of scene `fall`, round 2, after round 1 won:

```bash
node $L/step.mjs $D                                   # "next: node step.mjs ... round motion"
R=$(node $L/step.mjs $D round motion)                 # refused without r1's verdict.json, or a missing approval
node $L/step.mjs $D log build "motion-r2: ease the swing, tumble the fall"
# SendMessage to the SAME builder (X-4): at most five changes from $D/best/faults.md; list them in $R/changes.md
# stills sheet of the changed seconds -> $R/stills.jpg, looked at before the render
node $L/step.mjs $D check render && node $L/step.mjs $D log render
node src/stories/my-story/tools/render.mjs fall --scale 0.5 --out $R/clip.mp4   # about 15 s
node $L/step.mjs $D log look
$L/jumps.sh $R/clip.mp4 $R
node $L/step.mjs $D bar                               # exit 1: a failed round, revert it
$L/look.sh $R/clip.mp4 $R --focus motion --ref-frame $D/ref-frame.jpg --meaning $D/meaning.md \
  --prior $D/best/faults.md --claims $R/changes.md --protect $D/protect.md --hits $D/hits.json \
  --words $D/words.json --actions jumped,never,up
node $L/step.mjs $D log judge
$L/abjudge.sh $D/best/clip.mp4 $R/clip.mp4 $R --meaning $D/meaning.md --ref-frame $D/ref-frame.jpg \
  --ref out/spike/fall.mp4 --protect $D/protect.md --hits $D/hits.json
node $L/step.mjs $D                                   # "verdict: win ... next: keep" (or revert)
node $L/step.mjs $D keep                              # best/ = motion-r2; one line in log.md with tokens and seconds
node $L/step.mjs $D log end
node $L/step.mjs $D                                   # the next round, the next pass, or "restage that beat"
```

`step.mjs` with no command prints each of these lines with the scene's own files filled in. After a lost or tied
round, the next round runs the judge first and the reviewers only if the judge would keep it (X-31): the best clip has
not changed, so its `faults.md` still stands. `revert` adds the judge's credit and blame (and a failed bar gate) to
`best/faults.md`, and `keep` of a round with no faults.md of its own writes it from best's and the judge's (S5-90). A
tie keeps what the judge credited.
