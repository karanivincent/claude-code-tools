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
| `checkMustSee` | Each must-see entry (word, subjects, size) checked on its word for a few frames. |

A subject is `{ name, at, r }`: a point or a function of the frame, and a radius that wraps it (a person about 0.9 m,
a hand prop about 0.2 m).

## Not yet

- Something standing between the lens and the subject is not seen by `checkMustSee` (Gibeon's night march: a
  foreground rock). Next: a list of blockers (spheres or boxes) the check tests the line of sight against.
- Effects with settings, finishing tools, props with named states and action blocks move in when a video needs one.
