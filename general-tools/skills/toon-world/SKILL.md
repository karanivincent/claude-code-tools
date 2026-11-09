---
name: toon-world
description: Use when building the place, the look or the people of a toon video (flat 2D people in a 3D world, Remotion and Three.js) - a new set, background blur, ink lines on the world, a colour grade, lit character cards, bean-head characters, or a place made from AI pictures and turned into 3D. Triggers - "build the set", "make the place", "background blur", "it looks flat", "it looks pasted on", "make the world from pictures", "picture to 3D", "image to 3D props", "the cartoon-3d-short look", "game world", "low-poly world", "which look for this scene", "parts plan", "fire and smoke", "it looks blurry", "toon-world". toon-video holds the story, acting and camera and sends the place and look here.
---

# Toon world (places, look and people)

How a toon video's world is made and made to look drawn. `toon-video` holds the script, acting and camera; this skill
holds the three things it leaves out: where the place comes from, the look stack that makes a 3D render read as a
cartoon, and the people. Learned on 7 November 2026 from the ancient jar practice copy (records in bible-shorts
`docs/practice/`) and from the `cartoon-3d-short` skill (github.com/mromidev/claude-animated-shorts, MIT), whose look
code is in `templates/look/` with its licence.

## The toon-kit: techniques, never looks (9 November 2026)

Vincent, 9 November 2026: "we need reusable code that is generic for any kind of video ... not reusing code that was
used in this other video." Stories had been copying each other's code, so the videos looked alike and a fix made in
one never reached the next.

- **What it is.** `kit/` holds generic building blocks with settings and no look of their own. Today: `camera.ts`
  (shots by subject, the safe camera, the turn and must-see checks; see `kit/README.md`).
- **How a project gets it.** `node <skill>/scripts/sync-kit.mjs <project>` writes `src/toon-kit/`. A project never
  edits those files; the sync stops if one was edited. A fix goes into `kit/` through the skills repo, then every
  project syncs.
- **What may go in.** Only what any video could use, tuned by its settings: camera rules, effects (fire, smoke,
  sparks, fireworks, glowing bulbs, rain), finishing tools (sharpen, grade, depth blur, ink), props with named states,
  action blocks, checks. The test: if two videos use it, could a viewer tell they share it? If yes, it is a look, and
  it belongs to one story.
- **What never goes in.** People, faces, costumes, places, buildings, props, palettes, grade values. Each video
  designs its own. `templates/` are worked examples to learn from, never a starting kit to copy whole, and a story
  never copies another story's people or places (the Mona Lisa took the train heist's people code, and the two
  looked alike).

## Looks, scene by scene (decided 8 November 2026)

Vincent picks how each video is made; there is no single way in. Propose a look for each scene, say why, and let him
choose. One video can mix looks across its scenes (a game-world canyon, a picture-room interior, a flat 2D map), but
**one look in any single frame**, and every look keeps the same flat cartoon people.

| Look | Fits a scene that | Built from |
|---|---|---|
| Picture room (the house style) | Stays in one rich room or a few, close to people | A Higgsfield picture turned into 3D (section 1), props as image-to-3D models; the ancient jar's 3D hall is the reference |
| Game world (section 1b) | Travels far through one big place, or turns on machines and physical events | Low-poly 3D built in code with painted textures and the effects kit; the railroads practice is the reference |
| Flat 2D place | Only needs the camera to pan, push, pull or slide in the picture's plane, never turn round something | A picture or a drawing on one or a few flat layers; cheap, fast and sharp. Breaks the moment the camera orbits, cranes over or flies through |
| Drawn in code (3D) | A plain place the camera turns right round in, with no credits | `toon-kit.ts`, cards in a code set |

Rules in every look: places as rich as the reference's; no 3D model of anything alive, never a realistic or painted
person or animal; board stills made from the real parts (`toon-video` stage d), so what is approved is what moves.

### The parts plan

Before building a scene, give each part of the picture its source; this is where looks mix. Vincent, 8 November
2026: a real picture often makes the best sky, even in a code world.

| Part | Usual source | Why |
|---|---|---|
| Sky | A Higgsfield picture on a dome | Code clouds read as pills; the railroads first sky did |
| Far backdrop (mesas, a skyline) | A picture | It barely moves, so a picture holds |
| Ground, walls, track | Code in a game world; a picture turned into 3D in a picture room | Code where the camera flies close or things bend |
| Hero props | Code when it must move or break (the train); image-to-3D when it only needs to look rich (the jar) | |
| People and animals | Flat cartoon cards | |
| Fire, smoke, dust, water | A raymarched volume in code (`fx.ts` in the railroads practice); a Higgsfield element only if code fails | The railroads fireball cost no credits |
| Words on screen | Code | |

## First

- Read `references/look-targets.md` (the numbers to hit) and, for a place made from pictures,
  `references/place-from-pictures.md` and `references/picture-rules.md`.
- Pin the post stack: `@react-three/postprocessing@3.0.4` and `postprocessing@6.39.5` with three 0.186. With
  `@react-three/postprocessing` 3.2 Remotion renders a blank frame (the composer is created one frame late).
- Copy what you need from `templates/` into the story's folder; never import from the skill folder.

## 1. The place: pick a route

| Route | When | Cost | Holds |
|---|---|---|---|
| Pictures, then 3D (`templates/place/hall3d.ts`, `fx3d.ts`) | The default for a rich place the camera moves through | 1 master picture (about 3 credits), 30 credits per hero prop model, about 2 hours | Any move, real parallax; close-ups on modelled props |
| One picture warped by depth (`views-kit.ts`, G) | A quick rich place where the camera stays within about 60 degrees of the picture's view | 2 pictures (wide and close), about 1 hour | Push, swing, whip, a modest orbit |
| Drawn in code (`toon-kit.ts`) | A plain place, or one the camera turns right round in | No credits, about 1.5 hours | Everything |
| Several pictures, one per angle (`views-kit.ts`, F) | Avoid: 4 to 5 pictures that must line up, and the changes show in slow moves | | |
| A flat painted card | Never as the set; only a far sky or skyline | | Breaks in any sideways move |

Pictures, then 3D, in seven steps (detail in `references/place-from-pictures.md`):
1. Write the place's numbered floor plan (width, depth, height, where the fixed things stand).
2. Make one master wide picture with Higgsfield `gpt_image_2_6` (2k, high, 9:16) by `references/picture-rules.md`.
   As real and rich as the 3D hall's picture, warm and well lit, with big simple shapes. No people or animals in it.
3. Fit its camera (`scripts/fit-camera-example.mjs`) and measure the plan from it (`scripts/measure.mjs`).
4. Build the room in code to the plan and colour it by projecting the master, with a depth test; fill surfaces it never
   saw squarely with tiles cut from it (`hall3d.ts`).
5. Hero props: ask for each as a studio picture made from the master (plain grey ground, whole object, three-quarter
   view), then Higgsfield `image_to_3d` with `should_texture: true` (30 credits, about 3 minutes, 5 MB GLB). Scale to
   the plan. Never generate a separate close-up of the place: it redraws the room.
6. Light and effects in code (`fx3d.ts`): warm points at fires, a cool window light, flames, glows, dust. Check by
   rendering from the master's camera and comparing mean brightness with the picture.
7. Put the look stack (section 2) over it, so the room, the props and the people read as one drawing.

**Keep the place simple.** A phone frame reads a few big shapes, not many thin ones. Rows of thin repeated
parts (bridge braces, rails, slats, fences, poles) are the worst: they fill the frame with lines pointing every way and
make the shot feel crowded. At most one busy band in a frame, kept away from faces; the area behind a person stays
plain. Build such a structure with fewer, thicker members than the real thing, and ask the picture for "a few big,
simple shapes, no fine repeated detail". Ink on top of painted detail doubles the clutter: thin it there. (The train
heist's trestle in `toon-world` style had dozens of criss-cross braces and read as noise; Vincent, 7 November 2026.)
The exception: when the repeated part is the hero and the shot is close (the railroads' rails and sleepers), it
is the subject, and it gets full detail. Check every set on the shot board before it is detailed.

## 1b. The game world

Learned from the railroads practice (bible-shorts branch `practice/railroads-gameworld`, code in
`src/stories/practice-railroads/`, copied as a working kit to `templates/gameworld/` with a README, record in `docs/practice/railroads-gameworld-brief.md` and `out/practice/railroads/`),
a copy of a Ricks Clips Short scored round by round against the original.

- **Geometry in code, faceted.** Flat-shaded low-poly terrain and rock, repeated parts (rails, sleepers, spikes,
  pebbles, fence posts) as instanced meshes laid along a curve, so a whole track can bend in one frame.
- **Textures painted in code at 2048** near the camera, with mipmaps and 16× anisotropic filtering: wood grain, worn
  edges, nails, rust and scratches, rock strata and cracks, pebbles in ten colours. Round 1 without them was 5.5 times
  softer than the original with a third of its fine detail.
- **People**: flat cards with flat white unlit faces and a card-shaped shadow on the ground (the original's way; in a
  game world it reads better than room-lit cards). Front, three-quarter and side drawings swapped on one frame when
  the camera orbits; blinks on ones; a 3D hat that can fly off a 2D head. Cards drawn at 3× resolution.
- **The effects kit** (`fx.ts`, `track.ts`, `mechanics.ts`, `train.ts` in the practice): a heat ramp on steel in hard
  bands that travel (purple, magenta, orange, yellow, white on the crown only); a track that snaps into an S-bend,
  sleepers staying square; a train that follows the bent curve and falls as a chain hinged at its couplings; a
  raymarched volume for smoke, fireball and mushroom cloud (soft spheres into a density and temperature grid, noise
  billows, a shadow ray to the sun; leave `glslVersion` unset or it silently draws nothing); sparks, flying spikes that
  grow from 1.5× to 3× so the swap does not jump, heat wisps, god rays, a radial flash, dust puffs.
- **Look**: no ink lines on the world; bloom tight to hot things only; a grade per place with almost no black lift
  and deep violet shadows; a light contrast-limited sharpen; depth of field only where the original has it; motion
  blur (`@remotion/motion-blur`) on the fastest swing only and on the camera only, or arms double.
- **Cost**: 0.25 to 1.2 s a frame at concurrency 2; no Higgsfield credits for the whole clip.

## 2. The look stack (what makes 3D read as a cartoon)

Composer order, every story: ink, lens blur (pre, main), bloom on light sources only, NEUTRAL tone map, grade; MSAA 4.
Every pixel size scales with output height / 1920. Files in `templates/look/`; numbers in `references/look-targets.md`.

- **Background blur** (`lensblur.ts`, `dofAt` per shot): on about a third of screen time. Close-ups strongest (12 to
  16 px at 1080 wide), medium shots 10 to 12, wides and aerials sharp. Focus on the eyes of the front person. Blur
  foreground props too. Put it in the shot plan as a column, beside the camera.
- **Ink on the world** (`ink.ts`): near-black lines on silhouettes, depth jumps and corners, about 5 px near to 3 px
  far, its own pass before the blur. People cards sit on the `NOINK` layer: they carry their own outline.
- **Two-tone light** (`shade.ts`, `lights.ts`): a lit colour and a shade colour per surface. Shade is blue-grey
  indoors and violet-blue outdoors at sunset, never brown or black. Day and golden presets in `lights.ts`; for an
  interior use one warm key per framing, set relative to the camera, and neutral blue-grey shade.
- **Grade** (`grade.ts`): a tone curve, three-zone tint, lifted warm blacks and a vignette, fitted to the targets.
  Metals and gold at about 60% albedo, or they go lemon under the lit multiplier.
- **Bloom** only on real light sources (threshold 1.0). White faces never glow.

## 3. The people

- Every video designs its own cast style at stage b (see "The toon-kit" above). One worked example, from
  `cartoon-3d-short` (`toon.ts`, `cast.ts`): bean heads (height/width 0.94, tapered chin, slight tilt), 3.5 head-heights,
  stick limbs about 0.055 of head width, ink-dot hands, plum outline thicker on the shadow side, 14 expressions, no
  blush, blinks every 0.5 to 2.3 s, bouncy planted walks. Give each story its own hats, clothes and props.
- Lit cards (`cardshade.ts`): the card takes the scene's light, faces stay near white (brightness about 0.93), and a
  soft blob shadow sits under the feet. Never emissive: that is what makes people look pasted on. In a game world
  (section 1b) the faces stay flat white instead and a card-shaped shadow on the ground ties them in.
- Our own `spike2d` figures stay available when a story needs them; light them the same way.

## 4. Checks

- `python3 scripts/measure_sharp.py ours.mp4 [reference.mp4]`: sharpness, share of fine edges, saturation and mean
  brightness, the four numbers behind Vincent's "theirs is sharp, detailed and popping, ours is blurry". The railroads
  original measures 1302, 16.9%, 0.43 and 133 (round 3 of the copy: 1301, 19.5%, 0.42, 131); get within reach of the reference before he sees a clip.
- `python3 scripts/measure_look.py ours.mp4 [reference.mp4]`: median brightness, dark floor, highlights, saturation,
  lit chroma, vignette and ink share, in the targets' terms. Hit the targets for the look you chose, not for whatever
  reference you copy: a darker reference moves the targets.
- `python3 scripts/short_qa.py final.mp4 <qa dir> shots.json`: black, white, frozen and popping frames, and loudness.
- `python3 scripts/sbs_sheet.py out.jpg --ours ... --ref ...` for a side-by-side, then a fresh Opus verifier scores
  eight areas out of 10 (colour, lighting, ink, textures, characters, depth, composition, motion) with a numbered fix
  list, each fix assigned to the file that owns it.

## Common mistakes

| Mistake | Instead |
|---|---|
| Sharp backgrounds in every shot | Blur on about a third of screen time, strongest on close-ups |
| People as emissive cards | Lit cards with a contact shadow |
| A flat painted backdrop as the set | Project the picture onto geometry built to its plan |
| Generating a close-up of the place separately | Model the close object, or crop the master |
| Cards that look stuck on in a rich room | Light the cards by the room (`cardshade.ts`) with a contact shadow; never emissive |
| Violet shadows indoors | Blue-grey indoors; violet only for sunset outdoors |
| Ink and blur in one merged effect | Ink in its own pass, before the blur |
| `@react-three/postprocessing` 3.2 | Pin 3.0.4 |
| Copying a reference's characters or story | Our own designs; references are for the look |
| Animals or people as image-to-3D models | Cartoon cards; 3D models are for objects only |
| A board still that drifts from the cast | Make every still with the cast sheet as a reference; redo any with a realistic or 3D character |
| A set full of thin repeated parts (braces, rails, slats) | Fewer, thicker members; one busy band at most, plain behind faces |
| Detailing a place before the owner has seen the shot board | The board first (`toon-video`, step 4), then detail only what it shows |
| One look forced on every scene | A look per scene, proposed with its reason; Vincent picks |
| 3D for a scene the camera only pans or pushes across | A flat 2D place: cheaper and sharper |
| Code clouds | A picture sky on a dome |
| A soft, washed render (blur everywhere, lifted blacks, low-resolution textures) | `measure_sharp.py` against the reference; 2048 textures, tight bloom, blur only where the reference has it |
| Motion blur on everything | The fastest move only, camera only |
