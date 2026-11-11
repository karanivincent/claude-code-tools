# The measured checks

Each check, the script that runs it, what it fails on, and the rule it proves. `gate.mjs` runs the gate rows itself
(S4-1); the render rows run on each render (S5-16..S5-19); the hand-back gives their numbers with the video (S6-1).
Each threshold's source is a comment beside it in its script (S4-12).

## Contents

- [How to run them](#how-to-run-them)
- [Gate: before critic round 1 and before each render](#gate-before-critic-round-1-and-before-each-render)
- [Render: on each render](#render-on-each-render)
- [Judgement: the critic and the cold read](#judgement-the-critic-and-the-cold-read)
- [The score scale](#the-score-scale)
- [Shared drawing code](#shared-drawing-code)

## How to run them

```
node src/stories/<slug>/tools/gate.mjs critic   # before critic round 1, and after each round's fixes
node src/stories/<slug>/tools/gate.mjs render   # before a render longer than 8 s
```

The gate prints each failure with its check, its rule id and the frame or file. Fix, run it again, and go on when it
passes (S4-1). Scripts under `<toon-world>/scripts/` and `<toon-video>/scripts/` run from the plugin cache.

## Gate: before critic round 1 and before each render

| Check | Script | Fails on | Rule |
|---|---|---|---|
| Branch base | `gate.mjs` | a story branch not cut from `main` | S0-1 |
| Kit copies | `<toon-world>/scripts/sync-kit.mjs` | an edited `src/toon-kit/`, or a story copy of `path`, `K`, `curve` | S0-5, S3-90 |
| Files | `gate.mjs` | no `meaning.md`, a place with no `parts.md` section, no `coldread.json` | S4-10 |
| Approvals | `gate.mjs` | `approvals.json` lacks `story`, `direction` or a `parts-<place>` approval | S2-23, S4-11 |
| Acting audit | `tools/audit.mjs` (`acting.ts`) | still acting, small acting, loose props, cards off their words, events without sound, a weak frame 0, missing captions | S3-82, S3-134, S3-106, S3-72, S3-151, S3-144, S1-7, S3-146 |
| Camera | `tools/audit.mjs` (`safe`, `audit`, `checkMustSee`, `checkLens`, `checkHeads`) over each layer | cameras in solids, fast turns, jumps, must-see faults, crowded lens, cut heads | S3-85..S3-101, S4-2, S4-3 |
| Empty sky | `tools/audit.mjs` (`checkSky`) | over 45% empty sky in the centre column, or looking up with nothing whole | S3-98, S3-124, S3-125 |
| Edges | `tools/audit.mjs` (`edgeTouches`) | a drawing touching its canvas border outside `allow` | S3-62..S3-64 |
| Hard cuts and joins | `tools/audit.mjs` | over 3 hard cuts plus the loop, a cut or join with no reason, a whip between places | S3-120..S3-123 |
| Pace | toon-kit `checkPace` | planned pace outside the story's profile | S2-15, S4-9 |
| Look: plain meshes | `tools/look.mjs` `plainMeshes` | a mesh near the camera with no `map` that is not emissive | S2-7, S3-7 |
| Look: textures | `tools/look.mjs` `smallTextures` | a texture near the camera under 2048 px | S3-8 |
| Look: detail layer | `tools/look.mjs` `detailCount` | a shot below the floor of present, moving real things | S3-9 |
| Look: flat share | `tools/look.mjs` `flatShare` | a beat-board still with too much flat colour | S3-10 |
| Blur by shot | `tools/look.mjs` `blurByShot` | blur on a wide, or outside the medium and close ranges | S3-35..S3-37 |
| Sound levels | `<toon-video>/scripts/levels.mjs` on the stems | a line with the bed under 10 dB below it; music over 20 dB under; a silent tail | S3-157..S3-159, S4-4 |
| Brightness | project `brightness.mjs` | an opening under 120, or a face too dark on a phone | S3-53, S4-8 |
| Sharpness | `<toon-world>/scripts/measure_sharp.py ours.mp4 reference.mp4` on a short real encode | sharpness, fine edges or saturation out of reach of the reference | S3-15, S4-6, S4-7 |
| Colour | `<toon-world>/scripts/measure_look.py` | muted colour, lifted blacks, grey or brown shade, a milky face | S3-30, S3-31, S3-41, S3-46 |
| Walking | `tools/audit.mjs` (solids list) | a figure walking through a solid | S3-25 |

## Render: on each render

| Check | Script | Aim | Rule |
|---|---|---|---|
| Disk and file time | `df`; the output's time | the render really wrote the file | S5-15 |
| Picture motion | `<toon-world>/scripts/frame_motion.py <video> [--hold ...]` | no run of still seconds longer than the profile's longest hold where it wants pace; exit 3 names them | S5-16 |
| Frames and loudness | `<toon-world>/scripts/short_qa.py <video>` | no black, white, frozen or popping frames; about -14 LUFS | S5-18, S3-164 |
| Pace and hard cuts | project `pace.py <video>` | within about 10 of the profile's pace; hard cuts within the count | S5-19, S3-121 |
| Face close-ups | a sheet at 0.4 fps (`ffmpeg -vf fps=0.4,tile=7x4`) | at most 1 frame in 4 | S3-105 |
| Fix checks | `tools/render.mjs out.mp4 4 1 <from>-<to>` (frames) | 8 s or less around each fix, the checks above on it | S5-25 |

## Judgement: the critic and the cold read

| Check | Who | Aim | Rule |
|---|---|---|---|
| Retell | a fresh agent, the script alone | retells the story right | S1-19 |
| Cold read | a fresh cheap agent per still, `cold-read-brief.md` | each new place, prop, effect, material and face read right | S4-13..S4-15 |
| Meaning shown | the critic, each meaning-sheet row on the beat board | each change seen happening, big and sharp | S1-20, S3-135 |
| Could this place exist | the critic, one 1080-wide frame per shot | doors reach the floor, openings open, nothing floats or passes through a body | S5-8, S3-23 |
| Score and path to 5 | the critic, `critic-brief.md` | rising each round; 4.2 to stop | S5-2, S5-32 |

## The score scale

One scale for each critic (S5-5): 1 broken (wrong, unreadable or laughable); 2 weak (reads but flat, frozen or
confusing); 3 fine (clear and correct, forgettable); 4 good (alive, reads on a phone, lands); 5 great (you would stop
scrolling for it). Score against the project's anchor stills (S5-6).

## Shared drawing code

After a change to shared drawing code, render two frames of an earlier video and byte-compare them with frames from
before the change. A new look is a new option, not a changed default (X-8).
