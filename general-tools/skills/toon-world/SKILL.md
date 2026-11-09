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
  (shots by subject, shape-matched shots aimed where the shape is drawn or read off a camera already on screen, the
  turn about a doorway, tracking shots from a fixed spot or backing along a line at an even speed, the safe camera,
  turn and jump limits, must-see (whole, under an overlay, caption band included), blocked-view and lens checks in
  groups over every layer of a dissolve, heads cut by the frame, empty sky, screen motion per second, a card's reach on
  the screen),
  `cards.ts` (a drawing cut by its own canvas), `props.ts`
  (props with named states and dials whose needle and marks share one angle), `set.ts` (a wall's bands, rails and
  skirting cut at its openings) and `light.ts` (the time of day on every lit material; the only kit file that touches
  Three.js); see `kit/README.md`.
- **How a project gets it.** `node <skill>/scripts/sync-kit.mjs <project>` writes `src/toon-kit/`. A project never
  edits those files; the sync stops if one was edited. A fix goes into `kit/` through the skills repo, then every
  project syncs. The sync warns when a file under `src/` keeps its own `path`, `K` or `curve`: a kit fix never reaches
  it (Gibeon's own copy meant the 1.55.0 path fix changed nothing).
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

**Invented things around a small subject stay near its size, and the subject gets its own light.** Size the neighbours
from the subject, not from the picture: a master picture invents its own furniture at its own scale. Give the subject a
soft pool of light of its own so the eye lands on it. Why: the Mona Lisa's master picture brought two invented canvases
of 4.7 by 6.3 m beside a painting of 0.77 by 0.53 m, the plan kept them, and the owner saw a small thing among big
things; with six paintings near her size and a warm pool on her spot, the next critique found the note landed (r7,
1.5 and 46.5 s).

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
   saw squarely with tiles cut from it (`hall3d.ts`). To take an object off the master (an invented canvas, a sign in
   the wrong language), `hallMaterial`'s `holes` lays the wall's own tile over it in phase, cut one pattern repeat
   from the same wall; a rectified tile's v runs 1 − t (the canvas flips on upload), or it lies upside down and bands.
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

**Every doorway reaches the floor, and every opening is open.** Cut a wall's bands, rails, skirting and sills at the
same openings the wall is cut with: toon-kit `trimSpans` gives the pieces between them, from the same list of holes.
Nothing is built across a doorway or a window, and nothing stands in it unless the story puts it there. Look at one
full-size still of every doorway the film shows. Why: a hall's lower band and its rail were one piece each, sized to
the room, so they crossed the street door just in front of it and the door stood on them at waist height like a
cupboard (Mona Lisa 21.6 to 22.6 s); five critic rounds on small sheets missed it and the owner found it. The hotel's
skirting crossed its door the same way. Cut at the jambs, the door reaches the floor (full-size still at 22.3 s).

**Far backdrop bands reach below the lowest point the ground's far edge can reach**, wherever the ground falls away (a
valley floor, a slope down to the sea, the end of the terrain), or the sky shows through between the ground and the
backdrop as a pale strip that reads as a lake. Why: Gibeon's far ridges stopped 60 m down while the valley floor dropped
55 m and the ground ended 1.5 km out, so a blue strip lay under the hills (r5, 51 to 52 s); reaching 260 m down, it is
gone (frame 1560, full size).

**Set pieces in one plane are offset by 3 to 6 cm** (or the trim gets `polygonOffset`). Two surfaces that share a
plane fight in depth and their edges show through as dashed lines. Why: a corridor box behind a door started exactly in
the room's wall plane, and its edges flickered through as dashed grey lines above the hotel door (Mona Lisa r5, 43.7 to
44.9 s); starting 6 cm behind the wall, they are gone (44.27 s).

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

**Colour: bright and inviting.** Vincent wants the colour feel of a bright mobile game (Brawl Stars, 9 November
2026): saturated sky and grass, warm golden sun, shade tinted blue or violet instead of grey, especially in the
first seconds. Push it in passes, each with a before and after sheet of the same frames from the real composition,
and look hardest at the large flat surfaces, where a grade push goes wrong first: concrete shade turned lilac, wide
grass turned acid lime, a desk top turned red-orange (Wald bombers, round 4). A bare-metal hero reads flat grey
unless it carries warm sun on its upper faces, sky colour on its sides and a crisp highlight.

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
- **The era through objects, never through fading** (Vincent, 9 November 2026, on the Mona Lisa heist's 1911: "the
  buildings are still pale ... we can make things a little bit more modern"). Clothes, signs, cars, lettering and
  props say when it is, never words in the period's or the place's language (words on things are in the narration's
  language; `toon-video` "The world"); the colours stay bright and modern, saturation about 0.50 to 0.58, no sepia, no faded or
  greyed grade, no deep blacks. A faded grade is allowed only for a marked flashback inside a story. Picture prompts
  for a period place ask for vivid modern cartoon colours too, or the picture brings the fading in.
- **Time of day changes the whole lit world, not only the sky.** Multiply every lit material by one colour for the
  hour with toon-kit `timeOfDay` (the video picks the colour), before people and effects go in. Show night by hue and
  brightness and one warm light source (a torch, a lamp, a window): keep the grade's saturation at or above the day's,
  move the shadow and middle tints toward the night hue the video picks for itself, lower the brightness through the
  tone curve. Never show night by
  draining saturation: that is the faded look forbidden above, arriving by the clock. Why: Gibeon r3's night camp kept
  its day paint under a blue sky and read as late afternoon (44.5 s; moonlit ground with torch pools at frames 1335
  and 1360); Mona Lisa r4's night preset cut saturation and a red room went plum and grey (25 s: 0.28, then 0.63
  graded by hue).
- **No glow at the lens, nothing see-through in front of the face.** No bloom or glow source within about 4 m of the
  lens: lamps that follow flames take the flames at least 4 m in front of it. Nothing translucent or additive (glass
  glare, a light pool, a halo) in front of the face a line is about: a light pool goes on the surface behind, glass
  glare goes off in a close-up of what is behind the glass. Why: halos stacking near a moving camera, and a lamp
  beside the lens, whited out Gibeon's lower third (torches at 45 s); a glare streak and a light pool turned the
  Mona Lisa's face to milky cream (51 s: saturation 0.21, then 0.49 with them moved).
- **A light volume (a shaft, a beam, a pool seen from the side) fades by the angle it is seen at and to nothing below
  its top, with no outline**: its opacity times |N·V| to the power 2 to 3, faded to zero well before its base, so it has
  no silhouette edge. Keep enough strength that it still reads as light, and look at it on a full-size frame. Why: an open cylinder of one even opacity read as a glass box over Gibeon's stones
  (r5, 3.8 to 4.3 s, 28 to 32 s); faded by angle and height the box was gone (frames 120, 870), but so weak that the
  critic saw only grey balls under a haze and "a clear patch of light" no longer read (r6, 28.5 to 29.3 s).
- **Indoors, only people's contact blobs and things standing free on the floor cast the key light's shadow.** Window
  frames, rails, bars, things leaned on a wall, furniture against a wall and anything with gaps (planks, slats, a
  lid) cast none. Why: one directional key stands in for the sun, a skylight or a window, and its hard shadows in the
  shade colour came out as lavender slabs and stripes on orange tile and brown parquet in five rooms, each read as a
  glass panel or a light patch (Mona Lisa r6, 15.0 to 15.6, 38.6, 39.5 and 40.4 s); with those casters off, none
  remain (r7: 14.4 to 15.8, 38.7, 40.5 s).
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
- **A card cropped for sharpness keeps its crop edges off the screen.** A close card is often drawn from the hips or
  the chest up to save canvas; choose the crop from the frame, not the distance: project the frame's bottom and side
  edges onto the card's plane and move the crop out (in 0.1 m steps) until its edges are past them. Why: an envoy's
  close-up crop was chosen from the distance to his face, and his card ended in a straight line across his robe with
  the ground below it (Gibeon r4, 23.1 to 23.3 s); cropped from the frame, his robe runs out of the frame's bottom
  (frame 695; Gibeon's `people.ts` `uncropped()` is the worked example).
- **Every card and word canvas runs the border check right after it draws.** Call toon-kit `edgeTouches` on the
  canvas's pixels at the end of the card's draw (once per card and side), name the card, and list in `allow` the sides
  drawn to the edge on purpose (a sleeve that enters from the frame's edge). Then render every frame of the film small
  (a tenth of the size is enough; only the canvases matter) with the check on and collect the reports. Give a drawing
  whose outline dips under its baseline (hooves, a board's bottom edge) a little canvas below it. Why: a drawing bigger
  than its canvas shows as a straight cut line a few pixels long on a small sheet; Gibeon's thought cloud had one for
  three rounds and no critic saw it. Wired into every card (Gibeon r5: `src/stories/gibeon-2d/edges.ts`, called from
  `Card.set` and from a person's full view, and `scripts/gibeon-2d-edges.mjs`, which renders at 0.1 scale and prints
  `EDGE` lines), it found 16 cut sides in 9 cards in two runs (the cloud, a board drawn through half a translate,
  donkeys' ears and hooves, a hand's fingers), and none after the fixes.

## 4. Checks

- **Cold read** (before the shots, `toon-video` step 6): one still of every new place, prop, effect, material and
  face to a fresh cheap agent with `references/cold-read-brief.md`; redraw whatever it misreads.
- `python3 scripts/measure_sharp.py ours.mp4 [reference.mp4]`: sharpness, share of fine edges, saturation and mean
  brightness, the four numbers behind Vincent's "theirs is sharp, detailed and popping, ours is blurry". The railroads
  original measures 1302, 16.9%, 0.43 and 133 (round 3 of the copy: 1301, 19.5%, 0.42, 131); get within reach of the reference before he sees a clip.
- `python3 scripts/measure_look.py ours.mp4 [reference.mp4]`: median brightness, dark floor, highlights, saturation,
  lit chroma, vignette and ink share, in the targets' terms. Hit the targets for the look you chose, not for whatever
  reference you copy: a darker reference moves the targets.
- `python3 scripts/frame_motion.py video.mp4 [--from S --to S] [--hold 54-55]`: the mean frame difference each
  second (10 a second, 270 wide, grey) and the runs of still seconds against the profile (floor 8, longest hold 1 s).
  The critic's own motion measure; a whole film takes a few seconds. Exit 3 when a run is flagged.
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
| Night as a blue sky over day-coloured ground, or as a desaturated grade | `timeOfDay` on every lit material; night by hue, brightness and one warm light |
| A glow beside the lens, glare over a face | Glow sources 4 m or more in front of the lens; light pools behind the subject |
| A soft, washed render (blur everywhere, lifted blacks, low-resolution textures) | `measure_sharp.py` against the reference; 2048 textures, tight bloom, blur only where the reference has it |
| Motion blur on everything | The fastest move only, camera only |
| A band, rail or skirting sized to the room, running across a doorway | `trimSpans` from the wall's own openings; the door reaches the floor |
| Two set pieces sharing one plane (dashed edges) | Offset 3 to 6 cm |
| Invented neighbours at the picture's own scale around a small subject | Neighbours near its size; the subject's own light |
| A light shaft as an even see-through mesh (a glass box) | Faded by viewing angle and height, no outline, still bright enough to read |
| Hard key-light shadows from rails, bars, leaned or wall furniture indoors | Only people's blobs and free-standing floor things cast |
| Far backdrop ending above where the ground falls away | Bands reaching below the ground's lowest far edge |
| A close card's crop chosen from the distance | Crop edges projected off the screen |
| A card canvas sized apart from its drawing | `edgeTouches` on every canvas after it draws |
