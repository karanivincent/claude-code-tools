---
name: toon-world
description: Builds the places, the look and the people of a toon video (flat 2D cartoon cards in a 3D world, Remotion and Three.js) - the blend on each place (a far picture, code 3D middle and ground with painted textures, a detail layer of small moving things), the parts plan, light and grade, background blur, lit bean-head cards with mittens, and code fire, smoke and dust. Use when building a set or a place, writing a parts plan, lighting or grading a scene, drawing or lighting the characters, making effects, or fixing a frame that looks flat, blurry, washed out or pasted on. Triggers - "build the set", "make the place", "parts plan", "background blur", "it looks flat", "it looks pasted on", "it looks blurry", "make the world from pictures", "picture to 3D", "image to 3D props", "the cartoon-3d-short look", "game world", "low-poly world", "which look for this scene", "fire and smoke", "toon-world". toon-video holds the story, acting, camera and the order, and sends the place and the look here.
---

# Toon world (places, look and people)

This skill holds the world of a toon video: where each part of a place comes from, the look stack that makes a 3D
render read as a drawing, and the people. `toon-video` holds the script, acting, camera and the order of work.

Each rule lives once, with its id and its proof, in `toon-video/references/rules.md` (the register, X-7); this
skill cites ids and does not restate them. The terms (the blend, parts plan, detail layer, still board, beat board,
critic round, render, cycle) are defined in the register's Terms table and used here in that sense.

## Contents

- [The house look: the blend](#the-house-look-the-blend)
- [The parts plan](#the-parts-plan)
- [Building a place](#building-a-place)
- [Light and grade](#light-and-grade)
- [People](#people)
- [Effects](#effects)
- [Checks: which script proves which rule](#checks-which-script-proves-which-rule)
- [The toon-kit and the templates](#the-toon-kit-and-the-templates)
- [Reference files](#reference-files)
- [Common mistakes](#common-mistakes)

## The house look: the blend

The blend is the one look, on each place in the film (S2-7). Flat code colour is not a look (S2-8).

| Band | Source | Rules |
|---|---|---|
| Sky | A picture on a dome, with lit clouds that add colour; code clouds are not used | S3-80, S3-5, S3-167 |
| Far (sea, forest, mountains, a skyline) | One picture on a curved screen that follows the camera; a 360-degree strip when seen all round. Rich light, near, middle and far layers, dense detail, and no more of the frame than its band | S3-3, S3-4, S3-6, S3-166..S3-168 |
| Middle (trunks, walls, huts, shelves) | Code 3D shapes with painted tileable textures (bark, thatch, plaster, book spines) | S3-7, S3-8 |
| Ground | Code 3D with a painted tile, plus scattered painted 2D litter decals | S3-7, S3-11 |
| Detail layer | Small real things that move: flies, smoke, dust in light shafts, cloth, birds, a goat. Not dots. Something that fits the story moves behind the hero in each shot: other planes, vehicles, people working | S3-9, S3-169 |
| Hero props | Real 3D built in code; Higgsfield image-to-3D when Vincent asks for it | S2-11, S3-26 |
| People | Bean-head cards, lit by the scene, sharp, against a sharp background | S3-57, S3-35 |
| Fire, smoke, dust, water | Code volumes or cards | S3-75 |
| Words | Screen cards | S3-148 |

The far picture is most of what the eye meets, so it is made rich: golden hour, low sun, storm light or a dramatic
sky, never flat midday unless the story needs it (S3-166). The prompt template and a before and after are in
`references/picture-rules.md`. Vincent approves each place's picture by its own `picture-<place>` button (S2-33).

Textures near the camera are painted at 2048 px with mipmaps and 16x anisotropy (S3-8). Pictures are rich, saturated
and crisp, with no haze (S3-15). One look in any single frame (S2-12).

The flat 2D place (a picture on one or a few flat layers) is a named exception, not a second look. Use it for a shot
the camera crosses in the picture's own plane (a pan, a push, a slide over a map or a chalkboard), when the parts plan
says why and Vincent approves that plan (S2-9, S2-30). It breaks the moment the camera orbits, cranes over or flies
through.

## The parts plan

First pick the place's reference stills from the project's reference catalog (S2-34; Bible in Clay: `docs/references/`, private, never copied into this repo). The parts plan then names, per band, which still it copies.

Before planning a place, look in `library/` (`library/index.md`) for a place, vehicle, prop or costume to copy, and
name each one the plan copies (S2-32). How to copy one in and give improvements back: `library/README.md` (see).

Before building a place, write its parts plan in `stories/<slug>/parts.md` (S2-9). It names the source of each band
above, the story's state for the place (S2-13), and what stands behind a gate, door or wall the story names (S2-14).
Vincent approves each place's plan by his button on the review page (S2-30); `step.mjs` reads it from `approvals.json`,
and no agent writes it (S0-14).

A concrete example, one place:

```markdown
## Zarephath gate (drought, late afternoon)
- State: drought. Dry thorn bushes, cracked ground, no clouds, dust in the air.
- Sky: picture on a dome, late sun low in the west, hard blue overhead to orange and gold at the horizon, lit clouds.
- Far band: one picture, bare brown hills and the town's roofs, 360-degree strip, sea to the west.
- Middle: code 3D town wall and gate towers, painted mud-brick texture at 2048; two code date palms, painted bark.
- Ground: code terrain, painted cracked-earth tile; litter decals of straw, sticks, pot shards.
- Library: none fits (checked `library/index.md`).
- Detail layer: dust drifting in two light shafts, three flies, a goat nosing the straw, cloth flapping on the gate.
- Behind the hero: women at the well, a donkey led through the gate, smoke from the cooking fire.
- Behind the gate: the street and two houses, code 3D, painted plaster.
- Hero props: a clay jar and a bundle of sticks, code 3D.
- People: the widow and her son, Elijah. Bean-head cards.
- Effects: a cooking fire's smoke from beyond the wall (code volume).
- Flat 2D exception: none.
```

Prove the blend on the first place, then brief the other place agents from it (S2-17, X-5).

## Building a place

Copy this checklist into the story's `checklist.md` and tick it as you go (S0-8):

```markdown
- [ ] Film started with new-film.mjs; kit synced with sync-kit.mjs (S0-2, S0-5)
- [ ] Post stack and TypeScript pinned (S0-4)
- [ ] Library checked; entries copied in and named in the parts plan (S2-32)
- [ ] Parts plan for this place approved by Vincent's button (S2-30)
- [ ] Set list: 8 or more props, a full background, extras (S3-2)
- [ ] Sky and far band pictures made by picture-rules.md; backdrop reaches below the ground's far edge (S3-21, S3-5, S3-6)
- [ ] Picture has rich light, layers, dense detail and a coloured sky; it fills no more than its band (S3-166..S3-168)
- [ ] Picture approved by Vincent's picture-<place> button (S2-33)
- [ ] Middle and ground in code 3D with painted textures, 2048 px, mipmaps, 16x anisotropy (S3-7, S3-8)
- [ ] Detail layer of moving real things in each shot; litter decals on the ground (S3-9, S3-11)
- [ ] Per shot, something that fits the story moves behind the hero: shot __ moves __ (S3-169)
- [ ] Hero props in code, sized against a person (S2-11, S3-26)
- [ ] Calm area behind each face; at most one busy band (S3-12, S3-13)
- [ ] Doorways reach the floor; coplanar pieces offset (S3-23, S3-24)
- [ ] Light and grade set (section below), checked on full-size frames
- [ ] Cold read of each new place, prop, effect, material and face (S4-13)
- [ ] Checked from each scene's planned camera; far picture faces the cameras; screen direction and blockers in marks.ts (S5-71, S5-72, S5-79)
- [ ] World rounds until world and light reach 4 (S5-43, S5-57..S5-62); places locked (S5-71)
```

One world agent builds all the places of a film, before any scene is acted (`toon-video` stage 3, S5-71). Its
feedback loop is the world pass in `out/<slug>/world/`: the agent changes a place, a stills sheet from several scenes'
cameras is checked, a few seconds render, three reviewers watch at 6 fps with world and light first, and a blind
judge keeps or undoes the round (S5-41, S5-42). The far picture faces where the cameras look (S5-72): `marks.ts FAR`
holds its direction and arc, and `tools/shots-check.mjs` checks each shot against it. Then the places are locked
(`toon-video/scripts/loop/lock.mjs`), so no scene builder changes a place under another. A needed change goes to the
lead, who reopens the world stage. What won in the spikes: the blend before round 1 (S5-57), a warm side
key with cool fill and rims (S5-58), one light step a round (S5-59), a hidden sky seam (S5-60), see-through water
(S5-61). Nobody edits `step.mjs`, the briefs or `approvals.json` to get past them (X-6).

### Keep the place simple

A phone frame reads a few big shapes. Rows of thin repeated parts (braces, rails, slats, fences, poles) fill the frame
with lines: build them with fewer, thicker members, and ask the picture for "a few big, simple shapes, no fine
repeated detail" (S3-13). A repeated part that is the hero of a close shot gets full detail (S3-14). Ink is thinned
over painted detail (S3-39).

### Size, place and solids

- Size the place to the story and keep its moving parts moving (S3-17); size invented neighbours from the subject and
  give a small subject its own light pool (S3-27).
- List the solids and check the walk paths against them (S3-25); camera glides stay outside walls and floors (S3-100).
- On uneven ground, give camera heights above the ground under each point (S3-28).

### An indoor middle band from a master picture

Indoors, a fitted master picture may paint the middle band, projected onto code shapes built to a numbered floor plan
(S3-18). Steps and gotchas: `references/place-from-pictures.md` (see). Prompts: `references/picture-rules.md` (see).

1. Write the numbered floor plan.
2. Make one master wide picture by `picture-rules.md`, at `resolution: "2k"` and `quality: "high"` (S2-25, S3-21).
3. Run `scripts/fit-camera-example.mjs` to fit its camera (S3-19), then `scripts/measure.mjs` to measure the plan.
4. Build the room in code to the plan and project the master with a depth test (`templates/place/hall3d.ts`); tile
   surfaces it never saw squarely. Remove an object with `hallMaterial` `holes` (S3-22).
5. Model a close object, or crop the master; a separate close-up picture redraws the room (S3-20).
6. Light in code, then render from the master's camera and compare mean brightness with the picture (S3-54).

## Light and grade

Colour is bright and saturated: saturated sky and grass, warm golden sun, shade tinted blue or violet (S3-30). No
muted albedos and no lifted blacks; the black point stays near black (S3-31). Push colour in passes, with before and
after sheets of the same frames, watching large flat surfaces (S3-32). Numbers: `references/look-targets.md` (see).

| What | Setting | Rule |
|---|---|---|
| Composer order | Ink, lens blur, bloom on light sources, neutral tone map, grade; MSAA 4 | S3-33 |
| Pixel sizes | Scale with output height / 1920 | S3-34 |
| Background blur | None by default: backgrounds sharp in every shot, close-ups too, as in the reference stills; at most 4 px where a shot's reference still is soft | S3-35, S3-36 |
| Blur floor | None in `Stage.tsx` | S3-37 |
| Motion blur | None anywhere | S3-38 |
| Ink on the world | Near-black, about 5 px near to 3 px far, its own pass, thinned over painted detail | S3-39 |
| Cards and ink | Cards on the `NOINK` layer with their own outline | S3-40 |
| Shade | Blue-grey indoors, violet-blue outdoors at sunset; not brown or black | S3-41 |
| Indoor key | One warm key per framing, set relative to the camera; casters limited to people's blobs and free-standing floor things | S3-42, S3-43 |
| Bloom | Real light sources, threshold 1.0; faces do not glow; nothing glowing within 4 m of the lens | S3-44, S3-45 |
| In front of the face | Nothing translucent or additive | S3-46 |
| Time of day | `timeOfDay` multiplies each lit material, before people and effects | S3-47 |
| Night | Hue, brightness and one warm light; saturation at or above the day's | S3-48 |
| Era | Shown by objects; colours bright and modern; faded grade for a marked flashback alone | S3-49 |
| Light volumes | Fade by viewing angle and below the top, no outline, still readable as light | S3-50, S3-51 |
| Metals and gold | About 60% albedo | S3-52 |
| Faces | Bright enough for a phone | S3-53 |

Look files: `templates/look/` (`ink.ts`, `lensblur.ts`, `shade.ts`, `lights.ts`, `grade.ts`, `cardshade.ts`).

## People

Each story designs its own cast style; the bean-head card rig may carry over, the people never do (S2-1, S2-2). The
cast sheet shows each person and animal as a flat cartoon card (S2-3); nothing alive is a 3D model or a realistic
drawing (S2-4). A grown man in a long robe has a beard or a plait (S2-5); a woman has hair or lashes (S2-6).

A worked example of the rig, from `cartoon-3d-short` (`templates/look/toon.ts`, `cast.ts`): bean heads (height/width
0.94, tapered chin, slight tilt), about 3.5 head-heights, stick limbs about 0.055 of head width, mitten hands, a plum
outline thicker on the shadow side, 14 expressions, no blush, bouncy planted walks. Give each story its own hats,
clothes and props.

| What | Rule |
|---|---|
| Mittens, hand size 1; a grip wider than a face uses a side view | S3-55, S3-56 |
| Lit by the scene (`cardshade`), faces near white (about 0.93), soft contact blob, not emissive | S3-57 |
| Card depth fix: alphaTest, depthWrite, depthFunc Always, polygonOffset -6/-6000 | S3-58 |
| Card textures without mipmaps | S3-59 |
| Cards face the camera; a side or back view is its own drawing | S3-60 |
| Two people staggered in depth | S3-61 |
| Edge check: `edgeTouches` on each card and word canvas right after it draws, sides drawn to the edge listed in `allow` | S3-62, S3-63, S3-64 |
| Close crops chosen from the frame's projected edges | S3-65 |
| Expression kept while talking | S3-66 |
| Sad and worried faces with open eyes and steep brows | S3-67 |
| Emotion drawn on a 0..1 dial on each beat the words name | S3-68 |
| Held poses, brows do the acting; blinks 0.5 to 2.3 s apart | S3-69, S3-70 |

To run the edge check over a film: call `edgeTouches` at the end of each card's draw, render the film at a tenth of the
size with the check on, and collect the reports. A drawing whose outline dips under its baseline gets canvas below it
(S3-63).

## Effects

- Fire, smoke, dust and water are code volumes or cards; a Higgsfield element when code fails (S3-75).
- Fire reads as fire: tall flickering tongues, smoke columns, embers, flickering glow on the ground (S3-76).
- A raymarched volume leaves `glslVersion` unset; GLSL3 draws nothing (S3-77). Worked volume: `templates/gameworld/fx.ts`.
- An effect a card carries (a flame, a glow) is drawn from the card through its own transform (S3-73).
- Dust in light shafts and smoke drifting count toward the detail layer (S3-9).

## Checks: which script proves which rule

Reviewers judge the look (S5-47); these scripts give the facts they cannot see. `toon-video/references/checks.md`
has the full list.

| Run | Proves |
|---|---|
| `templates/scene/` pose sheet and stills sheet | Every pose drawn and visible; each change seen before a render (S5-54, S5-41) |
| `templates/scene/` camera-speed probe | No move over about 0.3 m or 1.5 degrees a frame (S5-67) |
| `templates/scene/` path projection (`tools/path-check.mjs`) | An action's path clears the other figures and the place's blockers; the action ends inside its scene (S5-80, S5-87) |
| `templates/scene/tools/shots-check.mjs` | The hero's size on each shot, short wides, cameras into the far picture (S5-72, S5-88) |
| `templates/scene/tools/pose-check.mjs` | No face swap or hand jump in one frame (S5-78) |
| `python3 scripts/short_qa.py final.mp4 <qa dir> shots.json` | Black, white, frozen and popping frames, loudness (S5-18) |
| `node scripts/fit-camera-example.mjs` | A master picture's camera, fit error under about 15 px (S3-19) |
| Cold read with `references/cold-read-brief.md` | Each new place, prop, effect, material and face reads cold (S4-13, S4-14, S4-15) |

## The toon-kit and the templates

- `kit/` holds techniques with settings and no look of their own (S0-7): camera, props, set trim, cards, light, acting
  and timing blocks. What each block does: `kit/README.md` (see).
- Run `node scripts/sync-kit.mjs <project>` to write `src/toon-kit/`; the project copy stays unedited, and a kit fix
  goes into the skills repo (S0-5, S5-29). The kit's `path`, `K` and `curve` replace any story copy (S3-90).
- Run `node scripts/new-film.mjs <project> <slug> <CompositionId>` to start a film (S0-2, S0-3). Copy from
  `templates/` into the story; a story does not import from the skill folder (S0-6). What each film default prevents:
  `templates/film/README.md` (see).
- A look stays out of the kit (S5-30). A shared drawing change adds an option and keeps old defaults (X-8).

## Reference files

| File | Read it when |
|---|---|
| `references/look-targets.md` | Setting grade, ink, blur and people numbers |
| `references/picture-rules.md` | Writing a prompt for a far band, sky or master picture: the rich-picture template first |
| `library/README.md`, `library/index.md` | Before a parts plan: places, vehicles, props and costumes to copy; giving improvements back |
| `references/place-from-pictures.md` | Painting an indoor middle band from a fitted master picture |
| `references/cold-read-brief.md` | Briefing the cold-read agent |
| `references/why.md` | Asking why a rule exists, or what an old pattern was |

## Common mistakes

| Mistake | Instead |
|---|---|
| Plain-colour code meshes near the camera | Painted textures at 2048 on code shapes (S3-7, S3-8) |
| Dots or speckle as the detail layer | Real moving things: flies, dust in light, cloth, a goat (S3-9) |
| A flat place because it is cheaper | The blend; a flat 2D place as a named, approved exception (S2-7, S2-30) |
| Props as image-to-3D models by default | Code props; Higgsfield when Vincent asks (S2-11) |
| Blurred backgrounds behind people | Sharp backgrounds; a calm area behind the face (S3-35, S3-12) |
| Building a place with no reference stills | Pick 3 to 6 catalog stills per place first and copy their detail (S2-34, S2-35) |
| Motion blur on a fast move | None (S3-38) |
| Lifted blacks, muted colour, haze toward the horizon | Near-black black point, saturated colour, crisp far band (S3-30, S3-31, S3-15) |
| Emissive cards | Lit cards with a contact blob (S3-57) |
| Cards with the depth test off | The card depth fix (S3-58) |
| Ink-dot or finger hands on toon figures | Mittens (S3-55) |
| A busy cut-out behind a face | A calm area behind faces (S3-12) |
| A band or rail running across a doorway | `trimSpans` from the wall's openings (S3-23) |
| Night as a desaturated grade | `timeOfDay` by hue and brightness (S3-47, S3-48) |
| A generated close-up of the place | Model the close object or crop the master (S3-20) |
| Code clouds | A picture sky on a dome (S3-80) |
| A flat midday far picture with an empty sky and one row of things | Golden hour or storm light, layers, dense detail, by the template (S3-166, S3-167) |
| Most of the frame is the generated picture | The picture keeps to its band; code middle and ground fill the rest (S3-168) |
| Nothing moves behind the hero | Other planes, vehicles, people working, flags, birds, dust (S3-169) |
| Building a place from nothing | Copy the nearest library entry (S2-32) |
| Editing `src/toon-kit/` in the story | Fix the kit in the skills repo and sync (S0-5) |
