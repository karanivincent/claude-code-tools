# The film-scenes template: the assembly

A film made the scene-loop way is a row of 5-10 s scenes, each its own composition, played in order over one mix.
Start one with `node <toon-world>/scripts/new-film.mjs <project> <slug> <FilmId> --scenes s01,s02,s03`; run it again with
more names to add scenes. Register it once in `src/Root.tsx`: `import { <FilmId>Compositions } from
'./stories/<slug>/compositions'` and `<<FilmId>Compositions />`. Needs TypeScript 5 and the exact pins
`npm i -E @react-three/postprocessing@3.0.4 postprocessing@6.39.5` (without them nothing renders).

## Layout

```
src/stories/<slug>/
  plan.ts               the frame plan: SCENES in order with their frames, the mix's path; sceneFrom / sceneFrames
  Film.tsx              the Film: the scenes in a Remotion Series over the full mix
  compositions.tsx      every composition in one folder: <FilmId>, <FilmId>-<scene>, <FilmId>-<scene>-poses
  stage.tsx             one scene through the look stack (place, cast, splashes, place light, ink, blur, bloom, grade)
  cast.ts               the cast, shared by every scene (cards, hands kept in the card, canvas edge check, talk)
  joins.ts              reads stories/<slug>/joins.json: joinIn, joinOut, onCards, blendPose, assertJoins
  motion.ts             easing and camera keys (keysAt), no three.js
  poses.tsx             the pose-sheet grid every scene's PoseSheet uses
  places/index.ts       the place list and its contract (light, pictures, build -> root, update(filmFrame), groundY)
  places/<place>.ts     one file per place, shared, owned by the place's world pass
  places/marks.ts       where things stand in each place (read by places and scenes)
  places/parts/         the blend's parts and the splash (templates/scene/parts)
  scenes/<scene>/       story.ts, Scene.tsx, PoseSheet.tsx (templates/scene)
  scenes/index.ts       the scene list in film order (written by new-film.mjs)
  tools/                stills-sheet, cam-speed, path-check, join-card, render (templates/scene/tools)
stories/<slug>/joins.json   the join cards
public/<slug>/mix.wav       the film's one mix; public/<slug>/far.jpg a far picture
```

`plan.ts` is not `film.ts`: on a Mac's case-blind disk `./film` and `./Film` are the same file.

## The join card

Each cut between two scenes has a card in `stories/<slug>/joins.json`: the state at that cut. The scene before ends on
it and the scene after starts on it.

```json
{ "joins": [ {
  "after": "s01", "before": "s02",
  "camera": { "pos": [1.9, 2.7, 3.4], "look": [-0.7, 3.05, -0.3], "fov": 40, "roll": 0 },
  "people": {
    "hero": { "at": [-0.5, 2.2, 0], "expr": "dare", "pose": { "mode": "stand", "drop": 158, "legsAt": [[[244, 840], [242, 966]], [[356, 840], [358, 966]]] } },
    "friend": { "at": [-1.0, 2.2, -2.6], "expr": "nervous" }
  } } ] }
```

- The frame of the cut is the scene after's first film frame (`plan.ts sceneFrom`).
- `"cut": true` marks a deliberate hard cut (a new place or angle): the camera is free on both sides and
  `cam-speed` does not count the jump; the people are still held.
- A scene reads its cards through `joinIn` / `joinOut` (its first and last camera keys) and `onCards` (each person's
  pose eases off the card in over 12 frames and onto the card out over the last 12).
- `assertJoins`, run by every `Scene.tsx`, refuses a scene whose first or last frame is off its cards by more than 2 cm,
  0.5 degrees of field of view, the card's expression, or 2-4 design units of a pose.
- `tools/join-card.mjs <scene>` writes the card from the scene before's own last frame.
