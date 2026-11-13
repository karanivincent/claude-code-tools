# The scene template

One scene of a film made the scene-loop way: 5-10 s, its own Remotion composition, rendered in about 15 s.
`scripts/new-film.mjs` copies this folder into `src/stories/<slug>/scenes/<scene>/` once per scene, the `parts/` folder
into `src/stories/<slug>/places/parts/` once per story, and `tools/` into `src/stories/<slug>/tools/` once per story.
The story-level files (stage, cast, joins, the place list) come from `../film-scenes/`.

## Files

| File | What it is for |
|---|---|
| `shots.ts` | Set by the shots stage and locked (S5-73): the scene's timing (`FRAMES`), `PLACE`, `BEATS`, the shot list `SHOTS` (size per shot, who it is about, `noFar` and `why` when a check does not apply, `ref` for the reference shot it copies), planned cuts `CUTS`, camera keys (`CAM_KEYS`, eased; first and last from the join cards) and `dofAt`. |
| `story.ts` | The scene builder's file: re-exports `shots.ts`, and holds `focusAt`, `coldAt`, `SPLASHES`, the people frame by frame (`people(f)`, free poses held to the join cards by `onCards`, faces eased through in-betweens), `POSES` for the pose sheet and `ACTION` for the path check. No three.js or Remotion imports in either file, so the tools can load them in node. |
| `Scene.tsx` | The composition `<Film>-<scene>`: refuses a scene off its join cards, then draws it through the story's `stage.tsx` and plays its slice of the film's one mix (`trimBefore` = the scene's first film frame). Inside the Film it plays without its own audio. |
| `PoseSheet.tsx` | The composition `<Film>-<scene>-poses`: every pose in `POSES` at full size on one still, drawn exactly as the film draws it. A cell cut by its card's canvas gets a red border and "CUT". |
| `parts/blend.ts` | The blend's parts, named and general: `farPicture` (a picture on a curved screen, its top faded into a sky dome of the same colour; painted hills stand in without a picture), `midBand` (trees, bushes), `rockSurface` (a face displaced in code), `groundSurface`, `water` (moving, with a sparkle band and a shade band), and the detail layer: `fire` (with embers), `stringLights` (bulbs and halos), `fireflies`, `birds`. |
| `parts/splash.ts` | A see-through water splash: a narrow column with a white core, a low crown, drops, a foam disc and rings; the column is gone 19 frames after contact. |
| `tools/board.mjs` | The still board (stage 2): stills of the Film at named film times, and `board.json` for `animatic.py`. |
| `tools/shots-check.mjs` | Per shot: the hero's height in the frame (a third or more on a close or mid shot), wides of 1.5 s at most, the camera looking into the place's far picture, frames in no shot (S5-72, S5-88). |
| `tools/pose-check.mjs` | A face swapped in one frame with no in-between, a hand that jumps against the frames around it, a mode switch (S5-78). |
| `tools/join-times.mjs` | Each join's film second and kind (cut, dip, swing) for toon-video's `joins.sh`. |
| `tools/stills-sheet.mjs` | 5-10 frames at half scale of a time range, labelled, five a row, in a few seconds (one bundle kept until a source changes). Also the film (`film`) and the pose sheet (`poses <scene>`). Prints any card cut by its canvas. |
| `tools/cam-speed.mjs` | The camera's move per frame in metres and degrees; flags over 0.3 m or 1.5 degrees a frame (read as whips in cliff spike 7) and dead stops. With no scene, the whole film across its joins. |
| `tools/path-check.mjs` | Projects the mover's box along the action through the scene's camera; flags every frame it covers another figure, sits behind a blocker from `marks.ts`, or leaves the frame, and an action that ends after the scene (S5-80, S5-87). `--svg` draws the path. |
| `tools/join-card.mjs` | Writes the join card after a scene from that scene's own last frame (places, expressions, poses, sizes, the camera when the card has none); `--jump --dip 8` for a jump in time that holds nobody. |
| `tools/render.mjs` | Renders a scene or the film with the story's own public folder, concurrency 3 (never more), and a render slot when the project keeps them; `--out` writes straight to a round's `clip.mp4`. |
| `tools/lib.mjs`, `tools/bundle.mjs` | What the tools share: loading a story file in node, the story's own public folder (`out/<slug>/pub/`), a bundle per scene (`out/<slug>/bundles/<scene>/`, so one builder's rebuild never deletes another's), render slots. |

## The commands (from the project root; the composition id prefix is the film's, e.g. `TestFilm`)

```sh
node src/stories/<slug>/tools/stills-sheet.mjs poses s01               # the pose sheet: out/<slug>/sheets/s01-poses.jpg
node src/stories/<slug>/tools/stills-sheet.mjs s01 --from 30 --to 60 --n 8   # a stills sheet: out/<slug>/sheets/s01-30-60.jpg
node src/stories/<slug>/tools/stills-sheet.mjs film --from 140 --to 160      # across a cut
node src/stories/<slug>/tools/cam-speed.mjs s01                        # camera speed (exit 1 on a whip)
node src/stories/<slug>/tools/shots-check.mjs                          # shot sizes and the far picture, every scene
node src/stories/<slug>/tools/path-check.mjs s01                       # the action's path (exit 1 on an overlap)
node src/stories/<slug>/tools/pose-check.mjs s01                       # face swaps and hand jumps
node src/stories/<slug>/tools/board.mjs stories/<slug>/board-stills.json out/<slug>/board   # the still board
node src/stories/<slug>/tools/join-card.mjs s01                        # the card s01|s02 from s01's last frame
node src/stories/<slug>/tools/render.mjs s01 --scale 0.5               # out/<slug>/s01.mp4, about 15 s (--out <file>)
node src/stories/<slug>/tools/render.mjs film --scale 0.5              # out/<slug>/film.mp4
```

The plain Remotion line, if you need it: `npx remotion render <bundle or src/index.ts> <Film>-s01 out/<slug>/s01.mp4
--gl=angle --concurrency=3 --scale=0.5 --public-dir out/<slug>/pub`.

## The stages for one scene

1. World stage (one agent, all places): the place is built, checked from this scene's planned camera, and locked.
2. Shots stage (one agent, all scenes): `shots.ts`, the person sizes and the join cards; `shots-check`, `cam-speed`
   and `path-check` clean; then locked.
3. Scene stage (this scene's builder): the rig check (list every pose and prop the words need, add them to `POSES`,
   check the pose sheet), then people and acting, then motion and staging, each round judged blind against the best
   so far and against the scene's reference when it has one. Before every render: a stills sheet of what changed,
   `pose-check`, and `path-check` when something moves past people.
4. After changing a scene's end: `join-card` (the lead's, since the cards are locked), then a stills sheet across the cut.

`tools/join-times.mjs` prints each join's film second for toon-video's `scripts/loop/joins.sh`:
`node src/stories/<slug>/tools/join-times.mjs > out/<slug>/join-times.json`.
