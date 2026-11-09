# toon-kit

Generic building blocks for any toon video: techniques with settings, never a look. Rules in `toon-world` SKILL.md,
"The toon-kit".

Bring it into a project: `node <toon-world>/scripts/sync-kit.mjs <project-root>` (writes `src/toon-kit/`). Never edit
the project copy; fix it here and sync again. Tests: `node --test kit/camera.test.ts` (Node 22.6 or later).

## camera.ts

| Block | What it does |
|---|---|
| `K`, `path` | A smooth key path. `stop` keys hold still. |
| `frameOn`, `shot` | The camera that shows named subjects at a size (share of the frame height), from a compass bearing and an elevation, with the group placed anywhere in the frame. |
| `follow` | Keys every few frames that keep framing moving subjects (a walk, a column). |
| `safe` | Above the ground, outside solids (boxes), with a usable up. Says what it corrected. |
| `upFor` | Up that never runs along the view line, so a straight-down view cannot spin or flip. |
| `project`, `onScreen` | Where a point lands in the frame; whether a subject is in frame and how big. |
| `audit` | Over a range of frames: corrections `safe` had to make, and turns over a limit outside planned whips. |
| `checkMustSee` | Each must-see entry (word, subjects, size) checked on its word for a few frames: in frame, big enough, not behind a blocker, and no blocker crowding the lens in front of it. Blockers are spheres taken from the same list the scene draws its rocks, bushes and pillars from. |

A subject is `{ name, at, r }`: a point or a function of the frame, and a radius that wraps it (a person about 0.9 m,
a hand prop about 0.2 m).

## props.ts

| Block | What it does |
|---|---|
| `states(marks, start)` | A prop with named states, each a number (a dial reading, a door's opening, a fill level). `track(steps)` moves it between states on given frames; `nameOf(v)` says which state a number is. |
| `dial(start, end)` | A dial's sweep. Draw the marks with `pointAt` and turn the needle with `needleZ`: both come from one angle, so the needle on FULL points at the painted FULL mark. |
| `checkStates` | The prop's state on given words, in the same no-render check as the camera's. |

It never draws a prop: each video draws its own scale, door or jar.

## Not yet

- Effects with settings, finishing tools and action blocks (open a door, hand something over) move in when a video
  needs one.
