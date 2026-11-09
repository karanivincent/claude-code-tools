# toon-kit

Generic building blocks for any toon video: techniques with settings, never a look. Rules in `toon-world` SKILL.md,
"The toon-kit".

Bring it into a project: `node <toon-world>/scripts/sync-kit.mjs <project-root>` (writes `src/toon-kit/`). Never edit
the project copy; fix it here and sync again. The sync also warns when a file under the project's `src/` defines its own
`path`, `K` or `curve`, because a kit fix never reaches code that uses its own copy (Gibeon's `kit.ts`). Tests:
`node --test kit/*.test.ts` (Node 22.6 or later).

## camera.ts

| Block | What it does |
|---|---|
| `K`, `path` | A smooth key path. `stop` keys hold still. Neighbouring keys whose look points are close (closer than half the nearer look distance, `looksClose`) blend the look point, so a still, near subject the camera moves round stays on its spot; keys whose look points are far apart blend the view direction (along the great circle) and the look distance apart, so a key looking 15 m out next to one looking 600 m out cannot flip the picture. Neither runs past a key and back. |
| `slerp` | Turn one direction toward another along the great circle. |
| `frameOn`, `shot` | The camera that shows named subjects at a size (share of the frame height), from a compass bearing and an elevation, with the group placed anywhere in the frame. |
| `follow` | Keys every few frames that keep framing moving subjects (a walk, a column). |
| `matchCam` | A shape (a flame, a wheel, a moon) at one screen spot and size from any bearing: give both sides of a shape-matched dissolve the same `Match` and hold them through the overlap. Follows a moving shape. |
| `matchOf` | The `Match` and bearing that reproduce a camera already on screen on a shape: the other side of a shape-matched dissolve copies a framing that works. Refuses a shape wider than the frame. |
| `screenFix` | The world offset from a shape's typed point to where it is drawn, from one rendered frame (where the shape was measured, as shares of the width and height). Aim `matchCam` at the corrected point; measure one frame per side, correct once. |
| `mirrorAbout` | A camera or key turned 180° about the upright line through an opening's centre: the opening keeps its place and size, so a 6 to 8 frame dissolve to the turned camera is the join through a door. |
| `track` | A pan that keeps a moving subject: from a fixed spot (stairwells, halls, corridors), or with `to` backing along a line at an even speed, for a walk toward or away from the lens (back more slowly than the walker). Refuses a subject whose path jumps inside the track, a walk along the lens axis whose distance hardly changes (it reads as frozen), and one whose distance turns back on any frame (the camera outran him). |
| `approach` | A journey to a far place that keeps the destination in sight: turn onto it, then travel to its framing, `lift` to rise over what lies between. `seenFrom` says when it comes into view. The horizon approach in `toon-video` references/joins.md. |
| `safe` | Above the ground, outside solids (boxes), with a usable up. Says what it corrected. |
| `upFor` | Up that never runs along the view line, so a straight-down view cannot spin or flip. |
| `project`, `onScreen` | Where a point lands in the frame; whether a subject is in frame and how big. |
| `layerRuns` | The runs of every canvas on screen, from the function the film draws its layers with: each layer of a dissolve, and a canvas that comes back later as a second run. `audit`, `checkLens`, `checkHeads`, `checkSky` and `screenMotion` take the runs. |
| `audit` | Over a range of frames (or every layer run): corrections `safe` had to make, turns over a limit outside planned whips, and position jumps (a move over `maxMove`, default 4° at the look distance, `moveDeg`, more than `jumpRatio` times its neighbours'): a one-frame jump inside a join is a hard cut. |
| `checkMustSee` | Each must-see entry (word, subjects, size) checked from its word's first frame for a few frames: in frame, big enough (0.08 of the height, 0.10 with `words: true`), not behind a blocker, and no blocker crowding the lens in front of it. With `captions` (the band's top and bottom as shares of the height), a `words: true` subject reaching into the caption band fails. `whole: true` asks that the subject's whole sphere stays inside the frame; `under` (an overlay's bottom edge as a share of the height from the top) that its top stays below the overlay. Blockers are spheres taken from the same list the scene draws its rocks, bushes and pillars from; a person's `c` can be a function of the frame. |
| `checkLens` | Every frame of a range (or every layer run, each with its own blockers): anything within `near` metres of the lens (default 6) filling over `size` of the height (default 0.15). Catches clutter between words. Indoors, split the blockers into `groups`, each with its own `near` and `size` (wall pictures 6 m and 30%, floor props 3 m and 15%), and declare spans framed on purpose in `framed` with a reason; the result's `framed` lines print what each span let through. |
| `headCut`, `checkHeads` | Which edge cuts a person's head (from the feet and the height): the bottom edge at any distance, a side edge nearer than 6 m. The story drops an extra on those frames; `checkHeads` reports each named person cut by any edge at any distance, to reframe. |
| `checkSky` | Every frame (or every layer run): more than 45% of the frame's centre column empty sky (meeting neither the ground nor a subject), or the view over 12° up with no subject whole in the frame. Planned looks at the sky are declared. The rise into empty sky the joins stack forbids. |
| `screenMotion`, `checkMotion` | How much the camera makes the picture move each second, no render: the subjects and landmarks on screen (a run's blockers count) followed to the next frame, their screen travel and size change weighted by their area, in percent of the height. A pointer only: it cannot see texture or acting. `checkMotion` flags runs of seconds under a floor longer than the profile's longest hold (default 8 and 1 s, set for the render's frame difference from `toon-world/scripts/frame_motion.py`, which decides). Replaces 1.56's `motion`, which measured the camera's path and called a camera running with its subject fast. |
| `cardReach` | Where a card's hand should reach for a world target, measured on the screen at the card's depth (sideways and up, in metres). The story turns it into drawing units and clamps it to the arm. |

A subject is `{ name, at, r }`: a point or a function of the frame, and a radius that wraps it (a person about 0.9 m,
a hand prop about 0.2 m), a number or a function of the frame. For a `words: true` entry, wrap the words themselves (the
sign, sized to its lettering), not the thing they hang on, or the caption check judges the bigger sphere.

## props.ts

| Block | What it does |
|---|---|
| `states(marks, start)` | A prop with named states, each a number (a dial reading, a door's opening, a fill level). `track(steps)` moves it between states on given frames; `nameOf(v)` says which state a number is. |
| `dial(start, end)` | A dial's sweep. Draw the marks with `pointAt` and turn the needle with `needleZ`: both come from one angle, so the needle on FULL points at the painted FULL mark. |
| `checkStates` | The prop's state on given words, in the same no-render check as the camera's. |

It never draws a prop: each video draws its own scale, door or jar.

## set.ts

| Block | What it does |
|---|---|
| `trimSpans(from, to, openings, y0, y1)` | The pieces of a horizontal strip on a wall (a lower band, a rail, a skirting) between the wall's openings: pass the same openings the wall is cut with and draw one piece per span, so nothing runs across a doorway or a window. |

It never draws a wall: each video draws its own from the spans.

## cards.ts

| Block | What it does |
|---|---|
| `edgeTouches(pixels)`, `checkCanvases` | The sides of a card or word canvas its drawing touches (opaque pixels at the border): a drawing cut by its own canvas, which shows as a straight edge in the film. Run on every card and word canvas right after it is drawn (`ctx.getImageData`); a side meant to run off the frame is allowed by name. Worked example: Gibeon's `src/stories/gibeon-2d/edges.ts` (called from `Card.set`) and `scripts/gibeon-2d-edges.mjs` (renders every frame at 0.1 scale and collects the reports): 16 cut sides in 9 cards. |

## light.ts

| Block | What it does |
|---|---|
| `timeOfDay(root, tint, { skip })` | Multiplies every lit material by one colour for the hour, so night reaches the ground (vertex colours and textures too), not only the sky. Clones shared materials, keeps the day colour so it can run every frame without compounding; unlit glows keep theirs. Sets no colour: each video picks its own. |

The only kit file that touches Three.js, and only for types, so the tests run without Three installed.

## Not yet

- Effects with settings, finishing tools and action blocks (open a door, hand something over) move in when a video
  needs one.
