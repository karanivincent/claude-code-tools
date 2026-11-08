---
name: toon-world
description: Use when building the place, the look or the people of a toon video (flat 2D people in a 3D world, Remotion and Three.js) - a new set, background blur, ink lines on the world, a colour grade, lit character cards, bean-head characters, or a place made from AI pictures and turned into 3D. Triggers - "build the set", "make the place", "background blur", "it looks flat", "it looks pasted on", "make the world from pictures", "picture to 3D", "image to 3D props", "the cartoon-3d-short look", "toon-world". toon-video holds the story, acting and camera and sends the place and look here.
---

# Toon world (places, look and people)

How a toon video's world is made and made to look drawn. `toon-video` holds the script, acting and camera; this skill
holds the three things it leaves out: where the place comes from, the look stack that makes a 3D render read as a
cartoon, and the people. Learned on 7 November 2026 from the ancient jar practice copy (records in bible-shorts
`docs/practice/`) and from the `cartoon-3d-short` skill (github.com/mromidev/claude-animated-shorts, MIT), whose look
code is in `templates/look/` with its licence.

## The house style (decided 8 November 2026)

The reference is the ancient jar's 3D hall (bible-shorts `docs/practice/ancient-jar-hall3d.md`, record step 10):
a room built from one Higgsfield picture, its props turned into 3D models, and flat cartoon people standing in it.
Vincent liked it. The ox and donkey practice made its animals 3D models and its people realistic paintings, and lost
the cartoon altogether. So:

| Part | Made as | Never |
|---|---|---|
| Places | A Higgsfield picture turned into 3D (section 1), as real and rich as the hall's, with big simple shapes | A picture shown as a whole shot; a place with no picture beside places with one |
| Objects | 3D models (image to 3D) or code | |
| People and animals | Flat cartoon cards in one cast style (section 3), lit by the room, with a contact shadow | A 3D model of anything alive; a realistic or painted person or animal |
| The board | Higgsfield stills made from the place picture and the cast sheet as references (`toon-video`, stage 4) | A board still with a realistic person or a 3D animal: what is approved must be what moves |

Fallbacks, in order, only when the house style cannot carry a story: the world drawn 2D in code, then a 3D world
drawn in code with cards (the jar made with `cartoon-3d-short`). One style in a frame, always.

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
Check every set on the shot board before it is detailed.

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

- Their cast style (`toon.ts`, `cast.ts`): bean heads (height/width 0.94, tapered chin, slight tilt), 3.5 head-heights,
  stick limbs about 0.055 of head width, ink-dot hands, plum outline thicker on the shadow side, 14 expressions, no
  blush, blinks every 0.5 to 2.3 s, bouncy planted walks. Give each story its own hats, clothes and props.
- Lit cards (`cardshade.ts`): the card takes the scene's light, faces stay near white (brightness about 0.93), and a
  soft blob shadow sits under the feet. Never emissive: that is what makes people look pasted on.
- Our own `spike2d` figures stay available when a story needs them; light them the same way.

## 4. Checks

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
