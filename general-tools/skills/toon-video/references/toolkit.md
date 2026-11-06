# The toon toolkit: where things are, and the gotchas

The toolkit was built in `/Users/vince/Projects/bible-shorts` (Remotion + `@remotion/three`). Until it
moves to a package of its own, a new project copies the files it needs. Paths below are in that repo;
the newest worked example is `src/stories/david-jonathan-2d/` on branch `story/david-jonathan-2d`.

## Drawing (`src/spike2d/`)

| Piece | File | What it does |
|---|---|---|
| `Figure2D` | `figure.ts` | A person as a card that faces the camera. `update({ pose, depth })` each frame; `depth: true` only where a 3D thing must hide the card |
| Looks (`LOOKS`) | `draw.ts` | One entry per person: palette, head (`hair`, `cloth`, `scarf`), beard, crown, `mitts`. Always set `mitts: true` |
| `Face` | `draw.ts` | `eyes`, `brow` (−1..1), `mouth`, `talk`, and `rage` (0..1: flush, glaring eye, shouting mouth with teeth, anger mark) |
| Props in hand (`Fx`) | `draw.ts` | Drawn by `drawKit`: gift, bow, quiver, harp, tambourine, platter, cup, tears. Add new ones the same way |

Change `draw.ts` only additively: a new option, never a changed default. Then render two frames of an
earlier video (Baby Moses 2D: frames 200 and 1500) and byte-compare them with the same frames from
before the change.

## Camera and shots (`src/stories/david-jonathan-2d/shots.ts`)

| Helper | What it does |
|---|---|
| `C(pos, look, fov)` | A camera with absolute heights (flat floors) |
| `CF(pos, look, fov)` | A camera whose heights are above the ground under each point. Use outside, always |
| `swingAt(t)` / `swingCam` | Between shots, a shared swing: 0.35 s, 0.45 s or 0.8 s with a lift of up to 14 m and a blur at the middle, where the set switches |
| `keys`, `lerpP` | Keyframed positions and poses within a shot |
| `walkSide`, `walkFront` | Walk cycles for side-on and toward-camera walks |
| Poses | `RAGE`, `RAISE`, `HURL` (the four action beats), `HIDING`, `CROUCH`, `BOW`, `CALL`, `HUG`; `shake(t, a)` for a tremble |
| `spearsAt(t)` | World state by time: where every thrown thing is, its trail and its age. The pattern for anything that must stay changed |
| `hits` | Times of impacts, for the camera jolt |
| `SOLIDS` | Boxes nobody may walk through; `scripts/walk-check.mjs` reads them |

## Sets (`src/stories/david-jonathan-2d/sets.ts`)

`Flame` (a torch with a halo), braziers, banners, jars, fruit baskets, rugs, a dais, a spear rack,
doors, `Flock` (sheep cards), and `planDecal` (a map laid on the terrain point by point, shapes only).
The composition (`DavidJonathan2D.tsx`) holds the night tint (a multiply layer), the fire glow, the
spear trail and shudder, the hit jolt, the title cards and the captions.

## Checks (`scripts/`)

`contact-sheet.mjs` (add the composition to its `COMP` map), `pace.py`, `brightness.mjs`,
`walk-check.mjs`, `line-loudness.mjs`, `levels.mjs`.

## Gotchas

- Crowd phase offsets must stay positive: `(v % 1)` of a negative number picks a missing picture and
  three.js crashes in `projectObject` ("Cannot read properties of undefined (reading 'visible')"). Use
  `frac = v => ((v % 1) + 1) % 1`.
- Word lookups match the voice timeline's words, apostrophes included (`david's`, not `david`). A word
  that appears twice needs its occurrence number.
- A camera aimed at a set from its middle often has a person 2–3° outside a portrait frame. Sheet the
  first and last frame of any shot where people move (`--at 0.1`, `--at 0.9`).
- Cards draw over everything, including 3D props in front of them, unless `depth: true`.
- In zsh, `$((…)+20)` inside a long one-line command fails to parse and nothing in that line runs,
  earlier steps included. Put such edits in a script file.
- A Publer-style draft script that skips files it already drafted needs the old entry moved aside
  (`replaced`) before a redo, or the redo silently makes no new draft.
- A hand-over-mouth pose: `armR` about `[0.35, -2.75]`; smaller angles read as a wave.
