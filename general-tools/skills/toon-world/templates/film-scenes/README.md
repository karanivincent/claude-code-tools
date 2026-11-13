# The film-scenes template: the assembly

A film made the scene-loop way is a row of 5-10 s scenes, each its own composition, played in order over one mix.
Start one with `node <toon-world>/scripts/new-film.mjs <project> <slug> <FilmId> --scenes s01,s02,s03`; run it again with
more names to add scenes. It registers the film in `src/Root.tsx` (`import { <FilmId>Compositions } from
'./stories/<slug>/compositions'` and `<<FilmId>Compositions />`) when Root.tsx has the usual `<>...</>` shape, and
prints the two lines when it cannot. Needs TypeScript 5 and the exact pins
`npm i -E @react-three/postprocessing@3.0.4 postprocessing@6.39.5` (without them nothing renders).

## Layout

```
src/stories/<slug>/
  plan.ts               the frame plan: SCENES in order with their frames, the mix's path; sceneFrom / sceneFrames
  Film.tsx              the Film: the scenes in a Remotion Series over the full mix, dips at time jumps, captions on
  captions.tsx          one word at a time from full.json (the voice script's timeline; an empty stand-in until then)
  compositions.tsx      every composition in one folder: <FilmId>, <FilmId>-<scene>, <FilmId>-<scene>-poses, <FilmId>-cast
  CastSheet.tsx         the cast sheet: every person standing, labelled (stage 2's out/<slug>/cast.png)
  stage.tsx             one scene through the look stack (place, cast, splashes, place light, ink, blur, bloom, grade)
  cast.ts               the cast, shared by every scene (cards, hands kept in the card, canvas edge check, talk, soft faces)
  sizes.ts              each person's size, set once by the shots stage and locked (S5-74)
  joins.ts              reads stories/<slug>/joins.json: joinIn, joinOut, onCards, holdCards, blendPose, assertJoins
  motion.ts             easing and camera keys (keysAt), no three.js
  poses.tsx             the pose-sheet grid every scene's PoseSheet uses
  places/index.ts       the place list and its contract (light, pictures, build -> root, update(filmFrame), groundY)
  places/<place>.ts     one file per place, shared, built by the world stage and then locked
  places/marks.ts       where things stand in each place, its far picture's direction (FAR), what can hide a person
                        (BLOCKERS) and its screen direction (SCREEN)
  places/parts/         the blend's parts and the splash (templates/scene/parts)
  scenes/<scene>/       shots.ts (camera, beats, shot list: the shots stage, locked), story.ts (the people: the scene
                        builder), Scene.tsx, PoseSheet.tsx (templates/scene)
  scenes/index.ts       the scene list in film order (written by new-film.mjs)
  tools/                stills-sheet, board, render, cam-speed, shots-check, path-check, pose-check, join-card,
                        join-times (templates/scene/tools)
stories/<slug>/joins.json   the join cards
public/<slug>/full/mix.wav  the film's one mix; public/<slug>/far.jpg a far picture

One place in two lights (a shore at dusk and at night) is two entries in `places/index.ts` made by one build function
with two `light` values: a scene has one place and one light. The stand-in's heights (`marks.ts`) are not the story's:
set the story's own heights before any camera, since every camera is set from them.
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
- `"dip": <frames>` marks a jump in time: the Film fades through black over that many frames each side, the card holds
  nobody, and `join-times.mjs` writes it as kind "dip" for `joins.sh` (S5-86). `tools/join-card.mjs <scene> --jump
  --dip 8` writes one.
- Each person on a card may carry `sx`, `sy` and `lean`; `holdCards` eases a scene's own values onto them, so a size
  never pops at a join, and `assertJoins` refuses a size off its card (S5-74).
- A scene reads its cards through `joinIn` / `joinOut` (its first and last camera keys) and `onCards` (each person's
  pose eases off the card in over 12 frames and onto the card out over the last 12; a face changes through an
  in-between). Keep every person's pose inside `onCards` in a new scene file, or `assertJoins` refuses it.
- `assertJoins`, run by every `Scene.tsx`, refuses a scene whose first or last frame is off its cards by more than 2 cm,
  0.5 degrees of field of view, the card's expression, or 2-4 design units of a pose.
- `tools/join-card.mjs <scene>` writes the card from the scene before's own last frame.
