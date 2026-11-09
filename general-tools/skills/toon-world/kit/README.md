# toon-kit

Generic building blocks for any toon video: techniques with settings, never a look. Rules in `toon-world` SKILL.md,
"The toon-kit".

Bring it into a project: `node <toon-world>/scripts/sync-kit.mjs <project-root>` (writes `src/toon-kit/`). Never edit
the project copy; fix it here and sync again. Tests: `node --test kit/*.test.ts` (Node 22.6 or later).

## camera.ts

| Block | What it does |
|---|---|
| `K`, `path` | A smooth key path. `stop` keys hold still. The view blends its direction (along the great circle) and its look distance apart, so a key looking 15 m out next to one looking 600 m out cannot flip the picture. |
| `slerp` | Turn one direction toward another along the great circle. |
| `frameOn`, `shot` | The camera that shows named subjects at a size (share of the frame height), from a compass bearing and an elevation, with the group placed anywhere in the frame. |
| `follow` | Keys every few frames that keep framing moving subjects (a walk, a column). |
| `matchCam` | A shape (a flame, a wheel, a moon) at one screen spot and size from any bearing: give both sides of a shape-matched dissolve the same `Match` and hold them through the overlap. Follows a moving shape. |
| `track` | A pan from a fixed spot that keeps a moving subject, for stairwells, halls and corridors. Refuses a subject whose path jumps inside the track (a hand-over between two paths). |
| `approach` | A journey to a far place that keeps the destination in sight: turn onto it, then travel to its framing, `lift` to rise over what lies between. `seenFrom` says when it comes into view. The horizon approach in `toon-video` references/joins.md. |
| `safe` | Above the ground, outside solids (boxes), with a usable up. Says what it corrected. |
| `upFor` | Up that never runs along the view line, so a straight-down view cannot spin or flip. |
| `project`, `onScreen` | Where a point lands in the frame; whether a subject is in frame and how big. |
| `audit` | Over a range of frames: corrections `safe` had to make, and turns over a limit outside planned whips. |
| `checkMustSee` | Each must-see entry (word, subjects, size) checked from its word's first frame for a few frames: in frame, big enough (0.08 of the height, 0.10 with `words: true`), not behind a blocker, and no blocker crowding the lens in front of it. Blockers are spheres taken from the same list the scene draws its rocks, bushes and pillars from; a person's `c` can be a function of the frame. |
| `checkLens` | Every frame of a range: anything within `near` metres of the lens (default 6) filling over `size` of the height (default 0.15). Catches clutter between words. |
| `cardReach` | Where a card's hand should reach for a world target, measured on the screen at the card's depth (sideways and up, in metres). The story turns it into drawing units and clamps it to the arm. |

A subject is `{ name, at, r }`: a point or a function of the frame, and a radius that wraps it (a person about 0.9 m,
a hand prop about 0.2 m).

## props.ts

| Block | What it does |
|---|---|
| `states(marks, start)` | A prop with named states, each a number (a dial reading, a door's opening, a fill level). `track(steps)` moves it between states on given frames; `nameOf(v)` says which state a number is. |
| `dial(start, end)` | A dial's sweep. Draw the marks with `pointAt` and turn the needle with `needleZ`: both come from one angle, so the needle on FULL points at the painted FULL mark. |
| `checkStates` | The prop's state on given words, in the same no-render check as the camera's. |

It never draws a prop: each video draws its own scale, door or jar.

## light.ts

| Block | What it does |
|---|---|
| `timeOfDay(root, tint, { skip })` | Multiplies every lit material by one colour for the hour, so night reaches the ground (vertex colours and textures too), not only the sky. Clones shared materials, keeps the day colour so it can run every frame without compounding; unlit glows keep theirs. Sets no colour: each video picks its own. |

The only kit file that touches Three.js, and only for types, so the tests run without Three installed.

## Not yet

- Effects with settings, finishing tools and action blocks (open a door, hand something over) move in when a video
  needs one.
