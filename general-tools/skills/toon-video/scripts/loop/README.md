# The scene loop scripts

A film is built as scenes of 5 to 10 s, by areas in order across the whole film (S5-71, S5-73, S5-75): the world
stage (one loop folder, `out/<slug>/world/`, pass `world`), the shots stage (`out/<slug>/shots/`, pass `shots`, when it
runs judged rounds), then each scene (`out/<slug>/scenes/<scene>/`, passes `people` then `motion`). Each stage's files
are locked before the next (`lock.mjs`). The sound check runs once on the film's mix at the join (S5-83). These
scripts run a round's checks and keep its files in order. They work for any story: every input is an argument. They
run on macOS (bash 3, BSD tools, Python 3, Node 18+, ffmpeg).

Reviewers and judges are `claude -p` sessions started by these scripts in the foreground, all at once, and the script
waits for them. In the spikes, reviewers started as background agents died when the turn ended. Run these scripts
from the main session, not from a subagent, with a 10-minute command timeout (three judges on a film take longer
than three minutes).

## The scripts

| Script | What it does | Writes |
|---|---|---|
| `step.mjs <loop-dir> [cmd]` | The file check between steps: prints the next step; refuses (exit 1, naming the file) a step whose input is missing or whose locked files changed; `init --code <dir> [--code <dir2>] [--passes people,motion] [--ref <clip>]`, `round <pass>`, `keep`, `revert`, `check <step>`, `log <phase> [note]`. Writes `faults.md` after a round with no reviewers (S5-90) | `scene.json`, round folders, `best/`, `log.md` |
| `lock.mjs <out/slug> set <stage> <files>\|check\|list\|reopen <stage> --why t` | Freezes a stage's files by hash; `reopen` is the lead's and is logged | `locks.json`, `locks-log.md` |
| `words.mjs <full.json> --scene <id> --plan <plan.ts> [--out f]` | The scene's words on its own clock, for `look.sh --words` | `words.json` |
| `frames.sh <clip> <outdir> [fps=6]` | Contact sheets, 30 tiles a sheet, time and frame number on each tile; a frame every 0.5 s | `sheet-NN.jpg`, `f6/`, `full/` |
| `jumps.sh <clip> <outdir> [--planned shots.json]` | One-frame jumps from toon-world's `short_qa.py`, frame numbers only | `jumps.md`, `jumps.json`, `qa/` |
| `audible.py <mix.wav> <cues.json> [--voice voice.wav] [--out f]` | Each effect's loudness at its cue against the mix: heard, just or masked | `audible.md` |
| `look.sh <clip> <round> --focus <area> [--meaning f] [--prior f] [--words f] [--actions a,b] [--facts f]` | Three reviewers (two Sonnet, one Opus on full-size stills at the action words), with `references/reviewer-brief.md` | `looks/<n>.md`, `looks/scores.json`, `faults.md`, `faults.json` |
| `abjudge.sh <best> <new> <round> [--judges 1\|3] [--brief f] [--meaning f] [--focus area] [--ref clip] [--any-length]` | Blind A/B with `references/judge-brief.md`: A/B order drawn per judge, the key outside the judge's folder; `--ref` shows the reference as R (S5-77); refuses clips more than two times apart in length (S5-82) | `verdict.json`, `judge-<j>/`, `keys/` |
| `joins.sh <film> <joins.json> <outdir> [--no-review]` | Jumps within 0.5 s of each join, a 2 s clip around it for one reviewer | `joins.md`, `join-<i>/` |

`_brief.py`, `_merge_looks.py` and `_verdict.py` are helpers of the scripts above.

Areas: world, people, light, story, motion (and sound in the sound pass). A pass's area: world pass, world and light;
shots pass, story (framing); people pass, people; motion pass, motion; sound pass, every effect heard.

`verdict.json`: `judges[]` (each judge's A/B order, its scores per area for `best` and `new`, their means, what it
credited and blamed in each, its pick), `mean` (per area and overall, best and new), `diff`, `winner` (`win` when new
is 0.1 or more above best, `loss` when 0.1 or more below, else `tie`), `prefer` (the judges' pick) and `keep` (`new`
on a win or on a tie the judges prefer, else `best`). With `--ref`, `ref`: the reference's mean scores, and best and
new against it (`diff`, `status`: beats, ties or below, with the same 0.1 margin). With a reference, a pass's target
stop also needs best to beat or tie it (S5-77).

`joins.json`: `[{"at": 7.2, "from": "edge", "to": "fall", "kind": "cut", "why": "a new place"}]`; kind is cut, dip
(with `"dip": <frames>`), dissolve, swing or journey. At a cut the cut frame's jump is expected, at a dip any jump
inside the fade; any other jump near a join is a fault.

`cues.json` for `audible.py`: `[{"name": "splash", "t": 3.2}]` measures the mix's rise at the cue;
`{"name": "splash", "t": 3.2, "file": "splash.mp3", "gain_db": -4}` or `{"stem": "fx.wav"}` measures the effect against
the rest of the mix.

## The folder

```
out/<slug>/scenes/<scene>/
  scene.json        {"code": "<source folder>" or [...], "passes": ["people", "motion"], "ref": "<clip>"}   (step.mjs init)
  words.json        the scene's words on its own clock          (words.mjs)
  meaning.md        what the scene must say: beats, words and their times
  poses.jpg         the pose sheet (rig check)                 no pose sheet, no build
  log.md            one line per phase: start, minutes, what   (step.mjs log)
  <pass>-r<n>/      pass: world, shots, people, motion, sound; <first pass>-r0 is the first build, then r1, r2...
    changes.md      the builder's changes, at most five
    stills.jpg      stills sheet of the changed seconds          no stills sheet, no render
    clip.mp4        the render
    jumps.md        jumps.sh                    audible.md   audible.py (sound pass)
    looks/          look.sh                     faults.md    the reviewers' faults, ranked
    verdict.json    abjudge.sh                  judge-<j>/, keys/
                                                no verdict.json, no next round
    kept | reverted written by step.mjs keep / revert
  best/             code/<n>/ (a snapshot of each source folder), clip.mp4, faults.md, verdict.json, scores.json, from.txt
                                                no best snapshot, no revert
```

Locks: `out/<slug>/locks.json`, found by `step.mjs` in the loop folder or up to three folders above it.

The rough film after the shots stage: `abjudge.sh <animatic> <rough film> out/<slug>/film-0 --judges 3` (S5-84). The
final film: `abjudge.sh <last film> <new film> out/<slug>/film-<n> --judges 3`, and `joins.sh` beside it; the reference
is a film of about its length, never a short clip (S5-82).

## A round, as commands

Once per scene, at the start of the scene stage (places and shots locked; the spike of this beat is its reference):

```bash
L=~/.claude/plugins/.../toon-video/scripts/loop      # this folder
D=out/my-story/scenes/fall
node $L/step.mjs $D init --code src/stories/my-story/scenes/fall --ref out/spike/fall.mp4   # passes people, motion
node $L/words.mjs src/stories/my-story/full.json --scene fall --plan src/stories/my-story/plan.ts --out $D/words.json
```

The motion pass of scene `fall`, round 2, after round 1 won:

```bash
node $L/step.mjs $D                                   # "next: node step.mjs ... round motion"
R=$(node $L/step.mjs $D round motion)                 # out/my-story/scenes/fall/motion-r2 (refused without r1's verdict.json)
node $L/step.mjs $D log build "motion-r2: ease the swing, tumble the fall"
# builder: at most five changes from $D/best/faults.md and motion-r1's verdict blame; list them in $R/changes.md
# stills sheet of the changed seconds -> $R/stills.jpg, looked at before the render
node $L/step.mjs $D check render && node $L/step.mjs $D log render
node src/stories/my-story/tools/render.mjs fall --scale 0.5 --out $R/clip.mp4   # about 15 s
node $L/step.mjs $D log look
$L/jumps.sh $R/clip.mp4 $R
$L/look.sh $R/clip.mp4 $R --focus motion --meaning $D/meaning.md --prior $D/best/faults.md \
  --words $D/words.json --actions jumped,never,up
node $L/step.mjs $D log judge
$L/abjudge.sh $D/best/clip.mp4 $R/clip.mp4 $R --meaning $D/meaning.md --ref out/spike/fall.mp4
node $L/step.mjs $D                                   # "verdict: win ... next: keep" (or revert)
node $L/step.mjs $D keep                              # best/ = motion-r2: code snapshot, clip, faults
node $L/step.mjs $D log end
node $L/step.mjs $D                                   # the next round, the next pass, or "restage that beat"
```

After a lost or tied round, `step.mjs` says to skip `look.sh` next round: the best clip has not changed, so its
`faults.md` still stands. `revert` adds the judge's credit and blame to `best/faults.md`, and `keep` of a round that
ran no reviewers writes its `faults.md` from best's and the judge's (S5-90). A tie keeps what the judge credited.
