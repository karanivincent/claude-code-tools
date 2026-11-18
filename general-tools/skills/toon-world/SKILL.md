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
| People | Bean-head cards, flat and flatter than the world, sharp, against a sharp background | S3-223, S3-35 |
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
- [ ] Fill placed for the locked camera: 3 m of floor behind a mid shot's mark, extras by what the camera shows (S3-185..S3-189)
- [ ] Light source and key lamp named in the parts plan; hero's spot lit at frame 0 and in the widest frame (S3-191, S3-192, S3-197)
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
lead, who reopens the world stage. What won in the spikes: the blend before round 1 (S5-57), a key from the
place's named source with a cool fill on the side away from it (S5-106), one light step a round (S5-59), a hidden sky seam (S5-60), see-through water
(S5-61). Nobody edits `step.mjs`, the briefs or `approvals.json` to get past them (X-6).

### Keep the place simple

A phone frame reads a few big shapes. Rows of thin repeated parts (braces, rails, slats, fences, poles) fill the frame
with lines: build them with fewer, thicker members, and ask the picture for "a few big, simple shapes, no fine
repeated detail" (S3-13). A repeated part that is the hero of a close shot gets full detail (S3-14). The world carries no
ink (S3-213).

### Fill for the camera

From two spike series on 18 November 2026; proven on short stretches only (X-30, `toon-video/references/spikes.md`).
Fill added behind a hero who fills two-thirds of the frame changed 1 to 4% of the pixels: the camera has to show the
place first.

- Shot size comes before fill: fill a place once its locked camera shows it (S3-185), with the hero at about a third
  of the frame height where the place has to read (S3-211, S3-208).
- A mid shot shows at least 3 m of floor behind the hero's mark, so an extra there stands under two-thirds his size
  (S3-186).
- A close shot is filled with small moving things beside the hero, never a second face (S3-187): an animal, steam,
  a flag.
- Place extras by what the camera shows at their depth, not by the floor plan, each with a way in and out of frame
  (S3-188).
- Keep fill off the hero's outline (a black cat against black hair) and off the line from the lens to a fact (S3-189).
- A moved camera sees the backs and undersides of props placed for the old one: find out what a stray thing is (a
  tram's trolley pole, a parasol's underside, a radio aerial) before removing it (S3-190).

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

By day colour is bright and saturated: saturated sky and grass, warm golden sun, shade tinted blue or violet (S3-207).
No muted albedos and no lifted blacks; by day the black point stays near black (S3-206). Night has its own rule
(S3-205): the room goes dark and is lit by lamps you can see. Push colour in passes, with before and
after sheets of the same frames, watching large flat surfaces (S3-32). Numbers: `references/look-targets.md` (see).

| What | Setting | Rule |
|---|---|---|
| Composer order | Ink, lens blur, bloom on light sources, neutral tone map, grade; MSAA 4 | S3-33 |
| Pixel sizes | Scale with output height / 1920 | S3-34 |
| Background blur | None by default: backgrounds sharp in every shot, close-ups too, as in the reference stills; at most 4 px where a shot's reference still is soft | S3-35, S3-36 |
| Blur floor | None in `Stage.tsx` | S3-37 |
| Motion blur | None anywhere | S3-38 |
| Ink on the world | None: the ink pass is off; people and what they hold keep their own outline | S3-213 |
| Cards and ink | Cards on the `NOINK` layer with their own outline | S3-40 |
| Shade | Smooth across a surface, no hard band between two flat tones; the shaded side keeps the surface's own colour and texture | S3-218 |
| Indoor key | The place's named source (a lamp, window or fire), placed with the set, not tied to the camera; furniture, props and people cast soft shadows | S3-209, S3-191, S3-221 |
| Bloom | Real light sources, threshold 1.0; faces do not glow; nothing glowing within 4 m of the lens | S3-44, S3-45 |
| In front of the face | Nothing translucent or additive | S3-46 |
| Time of day | `timeOfDay` multiplies each lit material, before people and effects | S3-47 |
| Night | The room goes dark, lit by lamps you can see that fade with distance; mean near 85, darkest 5% 25 or more, faces and facts readable; saturation at or above the day's | S3-205, S4-19 |
| Era | Shown by objects; colours bright and modern; faded grade for a marked flashback alone | S3-49 |
| Light volumes | Fade by viewing angle and below the top, no outline, still readable as light | S3-50, S3-51 |
| Metals and gold | About 60% albedo | S3-52 |
| Faces | Bright enough for a phone | S3-53 |

### Light from a source (spikes, 18 November 2026)

Proven on short stretches only (X-30, `toon-video/references/spikes.md`). Each is checked on full frames.

| What | Setting | Rule |
|---|---|---|
| Source | The parts plan names each place's light source (a sun, window, lamp or fire in the place) and its side | S3-191 |
| The hero's spot | In the light at frame 0 and in the widest frame; a parapet's shadow once covered the whole table | S3-192 |
| Shadows | Start at feet and bases in frame, all fall one way; a shadow from out of frame reads as a stain | S3-193 |
| Tint | Tint the light and the shadows, not the whole picture; painted whites and blacks keep their colour | S3-194 |
| Day | Show the sun's work in frame: a hard-edged patch of light, a bright window, a glint | S3-195 |
| Night | Glows from out of shot turned off; the light comes from lamps in frame with falloff (local lights that fade with distance: built on the garbo-night spike branch, not yet in `templates/look/`, whose key is one sun-like light); measure with `bar-check.py` | S3-204, S3-205 |
| Key lamp | Placed with the set and the camera, at the camera stage: in front of the hero and to one side throws his shadow on a wall; behind him it throws it at the lens | S3-197 |
| Rim | None on a card: a rim drew a second line outside the outline and the hero looked cut out | S3-224 |
| Light's edge | A fact sits fully in the pool or fully out of it; a hard edge across a clock face read as a fault | S3-199 |
| Light effects | A glow, pulse or glint goes where the frame is dark enough to show it | S3-200 |

A shadow map can draw a false hard edge on an upright prop that faces the camera with the light behind it; fade the
shadow mask on faces turned away from the key (garbo-night 4).

### A rendered world behind drawn people (18 November 2026)

The owner's choice after the garbo-world spikes and scene one of the film hannibal-oxen: the people are drawn, the
world is rendered. Proven on a 5.6-second night stretch and one 10-second night scene; day scenes and a whole film are
the proof run (X-30). A reviewer scores these as the world rows W1 to W7 (`toon-video/references/bar.md`).

| What | Setting | Rule |
|---|---|---|
| Ink | None on the world; nothing exists as a line alone: each object has a painted shape, and in shade a lighter top and darker sides | S3-213, S3-215 |
| Materials | Each near surface painted at its real scale: grain, weave, wear, pattern, readable at phone size | S3-214 |
| Colour | Strong colour kept, in the mid-tones; muted toward grey by a fifth at most, not toward brown. A colour cast: check the paint before the lamps | S3-216, S3-217 |
| Shade | Smooth, keeping the surface's colour and texture. At night a neutral fill, cool on the side away from the lamp, warm floor round the lamp; both checked on one frame | S3-218, S3-219 |
| Night highlights | The brightest 5% near 175 of 255 | S3-220 |
| Shadows | Soft, the edge widening with distance from the caster; darkening where things meet the floor or each other. After a light change, check each person and seat still has a shadow and a contact | S3-221, S3-222 |
| Depth | A lit far wall or far view, floor that leads the eye in, props at three depths or more; a wide holds floor and ceiling or sky, with sky in about the top 40% outdoors | S3-229, S3-230 |
| Probe | A still from the widest camera beside the scene's reference frame, before the place is built out | S3-231 |
| Sky | The reference's colour, clouds with soft lit edges; at night slate blue-grey with a large moon | S3-232 |
| Use | Things to sit on and to hold, and people using them | S3-233 |
| First place | The hardest place first, one scene to likeness 7 against its reference frame, shown to the owner before the other places | S2-36, S5-104, S5-105 |

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
| Flat (`cardshade`, flat mode): one even tone per colour area with a little of the place's colour, no gradient, not emissive; faces near white (about 0.93) | S3-223 |
| Outline on the card for head, body, arms and legs; a tight dark contact under the soles and under each seat's feet | S3-225, S3-226 |
| A held or pressed thing stands in front of the card, with the hand on it | S3-227 |
| A near-white face kept out of the grade's tint | S3-228 |
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
- Effects on hits (spikes, 18 November 2026): the cause in frame (S3-179); beside the fact, never on it, readable at
  phone size (S3-180); puffs smaller than a foot, see-through, gone in about 12 frames, a light pulse about 6 frames,
  and the mark stays (S3-181); a thing that scatters stays itself (S3-182). Details: `toon-video/references/acting.md`.

## Checks: which script proves which rule

Reviewers judge the look (S5-47); these scripts give the facts they cannot see. `toon-video/references/checks.md`
has the full list.

| Run | Proves |
|---|---|
| `templates/scene/` pose sheet and stills sheet | Every pose drawn and visible; each change seen before a render (S5-54, S5-41) |
| `templates/scene/` camera-speed probe | No move over about 0.3 m or 1.5 degrees a frame (S5-67) |
| `templates/scene/` path projection (`tools/path-check.mjs`) | An action's path clears the other figures and the place's blockers; the action ends inside its scene (S5-80, S5-87) |
| `templates/scene/tools/shots-check.mjs` | The hero's size on each shot, short wides, cameras into the far picture (S5-72, S5-102) |
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
| Lifted blacks, muted colour, haze toward the horizon (by day) | Near-black black point, saturated colour, crisp far band (S3-207, S3-206, S3-15) |
| Emissive cards, or cards shaded with a gradient | Flat cards with a tight contact under the soles (S3-223, S3-226) |
| Cards with the depth test off | The card depth fix (S3-58) |
| Ink-dot or finger hands on toon figures | Mittens (S3-55) |
| A busy cut-out behind a face | A calm area behind faces (S3-12) |
| A band or rail running across a doorway | `trimSpans` from the wall's openings (S3-23) |
| Night as a desaturated grade | The room going dark with lamps in frame, saturation kept (S3-47, S3-205) |
| A generated close-up of the place | Model the close object or crop the master (S3-20) |
| Code clouds | A picture sky on a dome (S3-80) |
| A flat midday far picture with an empty sky and one row of things | Golden hour or storm light, layers, dense detail, by the template (S3-166, S3-167) |
| Most of the frame is the generated picture | The picture keeps to its band; code middle and ground fill the rest (S3-168) |
| Nothing moves behind the hero | Other planes, vehicles, people working, flags, birds, dust (S3-169) |
| Building a place from nothing | Copy the nearest library entry (S2-32) |
| Editing `src/toon-kit/` in the story | Fix the kit in the skills repo and sync (S0-5) |
| Filling a place before the camera shows it | Lock the shot sizes first, then fill (S3-185) |
| A second face beside the hero in a close shot | Small moving things beside him (S3-187) |
| Night as a lit room under a violet grade | Turn off the out-of-shot glows; lamps in frame with falloff (S3-204, S3-205) |
| A key lamp behind the hero | In front and to one side, so his shadow falls on a wall (S3-197) |
| A light rim on a card | No rim; the outline is the edge (S3-224) |
| Ink lines on walls, floor, land or props | A rendered world: painted materials, smooth shade, soft shadows, contact (S3-213, S3-214, S3-218, S3-221) |
| A shallow set, or land that fills the frame | A lit far view, floor that leads in, three depths, sky in the top 40% outdoors (S3-229, S3-230) |
| A place where people stand in a ring | Things to sit on and hold, in use (S3-233) |
| A grade that tints painted whites | Tint the light and the shadows (S3-194) |
