# The scene loop scripts

A film is built as scenes of 5 to 10 s. Each scene is built in four passes (world and light, people and acting,
motion and staging, sound), each pass in rounds. These scripts run a round's checks and keep its files in order. They
work for any story: every input is an argument. They run on macOS (bash 3, BSD tools, Python 3, Node 18+, ffmpeg).

Reviewers and judges are `claude -p` sessions started by these scripts in the foreground, all at once, and the script
waits for them. In the spikes, reviewers started as background agents died when the turn ended. Run these scripts
from the main session, not from a subagent.

## The scripts

| Script | What it does | Writes |
|---|---|---|
| `step.mjs <scene-dir> [cmd]` | The file check between steps: prints the next step; refuses (exit 1, naming the file) a step whose input is missing; `init`, `round <pass>`, `keep`, `revert`, `check <step>`, `log <phase> [note]` | `scene.json`, round folders, `best/`, `log.md` |
| `frames.sh <clip> <outdir> [fps=6]` | Contact sheets, 30 tiles a sheet, time and frame number on each tile; a frame every 0.5 s | `sheet-NN.jpg`, `f6/`, `full/` |
| `jumps.sh <clip> <outdir> [--planned shots.json]` | One-frame jumps from toon-world's `short_qa.py`, frame numbers only | `jumps.md`, `jumps.json`, `qa/` |
| `audible.py <mix.wav> <cues.json> [--voice voice.wav] [--out f]` | Each effect's loudness at its cue against the mix: heard, just or masked | `audible.md` |
| `look.sh <clip> <round> --focus <area> [--meaning f] [--prior f] [--words f] [--actions a,b] [--facts f]` | Three reviewers (two Sonnet, one Opus on full-size stills at the action words), with `references/reviewer-brief.md` | `looks/<n>.md`, `looks/scores.json`, `faults.md`, `faults.json` |
| `abjudge.sh <best> <new> <round> [--judges 1\|3] [--brief f] [--meaning f] [--focus area]` | Blind A/B with `references/judge-brief.md`: A/B order drawn per judge, the key outside the judge's folder | `verdict.json`, `judge-<j>/`, `keys/` |
| `joins.sh <film> <joins.json> <outdir> [--no-review]` | Jumps within 0.5 s of each join, a 2 s clip around it for one reviewer | `joins.md`, `join-<i>/` |

`_brief.py`, `_merge_looks.py` and `_verdict.py` are helpers of the scripts above.

Areas: world, people, light, story, motion (and sound in the sound pass). A pass's area: world pass, world and light;
people pass, people; motion pass, motion; sound pass, every effect heard.

`verdict.json`: `judges[]` (each judge's A/B order, its scores per area for `best` and `new`, their means, what it
credited and blamed in each, its pick), `mean` (per area and overall, best and new), `diff`, `winner` (`win` when new
is 0.1 or more above best, `loss` when 0.1 or more below, else `tie`), `prefer` (the judges' pick) and `keep` (`new`
on a win or on a tie the judges prefer, else `best`).

`joins.json`: `[{"at": 7.2, "from": "edge", "to": "fall", "kind": "cut", "why": "a new place"}]`; kind is cut,
dissolve, swing or journey. At a cut the cut frame's jump is expected; any other jump near a join is a fault.

`cues.json` for `audible.py`: `[{"name": "splash", "t": 3.2}]` measures the mix's rise at the cue;
`{"name": "splash", "t": 3.2, "file": "splash.mp3", "gain_db": -4}` or `{"stem": "fx.wav"}` measures the effect against
the rest of the mix.

## The folder

```
out/<slug>/scenes/<scene>/
  scene.json        {"code": "<the scene's source folder>"}   (step.mjs init)
  meaning.md        what the scene must say: beats, words and their times
  poses.jpg         the pose sheet (rig check)                 no pose sheet, no build
  log.md            one line per phase: start, minutes, what   (step.mjs log)
  <pass>-r<n>/      pass: world, people, motion, sound; world-r0 is the scene's first build, other passes start at r1
    changes.md      the builder's changes, at most five
    stills.jpg      stills sheet of the changed seconds          no stills sheet, no render
    clip.mp4        the render
    jumps.md        jumps.sh                    audible.md   audible.py (sound pass)
    looks/          look.sh                     faults.md    the reviewers' faults, ranked
    verdict.json    abjudge.sh                  judge-<j>/, keys/
                                                no verdict.json, no next round
    kept | reverted written by step.mjs keep / revert
  best/             code/ (snapshot), clip.mp4, faults.md, verdict.json, scores.json, from.txt
                                                no best snapshot, no revert
```

The final film: `abjudge.sh <last film> <new film> out/<slug>/film-<n> --judges 3`, and `joins.sh` beside it.

## A round, as commands

The motion pass of scene `fall`, round 2, after round 1 won:

```bash
L=~/.claude/plugins/.../toon-video/scripts/loop      # this folder
D=out/my-story/scenes/fall
node $L/step.mjs $D                                   # "next: node step.mjs ... round motion"
R=$(node $L/step.mjs $D round motion)                 # out/my-story/scenes/fall/motion-r2 (refused without r1's verdict.json)
node $L/step.mjs $D log build "motion-r2: ease the swing, tumble the fall"
# builder: at most five changes from $D/best/faults.md and motion-r1's verdict blame; list them in $R/changes.md
# stills sheet of the changed seconds -> $R/stills.jpg, looked at before the render
node $L/step.mjs $D check render && node $L/step.mjs $D log render
# render the scene (about 15 s) -> $R/clip.mp4
node $L/step.mjs $D log look
$L/jumps.sh $R/clip.mp4 $R
$L/look.sh $R/clip.mp4 $R --focus motion --meaning $D/meaning.md --prior $D/best/faults.md \
  --words public/my-story/words.json --actions jumped,never,up
node $L/step.mjs $D log judge
$L/abjudge.sh $D/best/clip.mp4 $R/clip.mp4 $R --meaning $D/meaning.md
node $L/step.mjs $D                                   # "verdict: win ... next: keep" (or revert)
node $L/step.mjs $D keep                              # best/ = motion-r2: code snapshot, clip, faults
node $L/step.mjs $D log end
node $L/step.mjs $D                                   # the next round, the next pass, or "restage that beat"
```

After a lost or tied round, `step.mjs` says to skip `look.sh` next round: the best clip has not changed, so its
`faults.md` still stands, and the builder adds the judge's credit and blame. A tie keeps what the judge credited.
