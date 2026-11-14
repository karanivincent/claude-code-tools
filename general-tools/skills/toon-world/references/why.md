# Why: old patterns and the stories behind the rules

History moved out of `SKILL.md` so the body holds only what to do now. Nothing here is an instruction: where an old
pattern clashes with `toon-video/references/rules.md`, the register wins. The lint skips this file.

## Contents

- [Where the look came from](#where-the-look-came-from)
- [Old patterns (superseded)](#old-patterns-superseded)
  - [The looks menu and the route table](#the-looks-menu-and-the-route-table)
  - [Learned from the railroads practice (the game world)](#learned-from-the-railroads-practice-the-game-world)
  - [Superseded look rules](#superseded-look-rules)
- [The stories behind current rules](#the-stories-behind-current-rules)
  - [The toon-kit](#the-toon-kit)
  - [Places](#places)
  - [Light](#light)
  - [People](#people)
- [Measures from the railroads copy](#measures-from-the-railroads-copy)

## Where the look came from

Learned on 7 November 2026 from the ancient jar practice copy (records in bible-shorts `docs/practice/`) and from the
`cartoon-3d-short` skill (github.com/mromidev/claude-animated-shorts, MIT), whose look code is in `templates/look/` with
its licence. The ancient jar's throne hall (branch `practice/ancient-jar`, composition `PracticeAncientJar3D`) is the
worked example of a place projected from a master picture (`references/place-from-pictures.md`).

The blend was decided on 10 November 2026: Vincent wanted every place mixed band by band, because pictures alone
cannot hold the small things that make a place feel real ("we need to have a lot of details everywhere"). On
11 November 2026 he made the blend the one look for every place, removed the flat "Drawn in code (3D)" look, and
moved the choice of each place's parts to his button on the parts plan.

## Old patterns (superseded)

### The looks menu and the route table

Until 11 November 2026 the skill offered a menu of looks per scene (decided 8 November 2026), and Vincent picked:

| Look | Fits a scene that | Built from |
|---|---|---|
| Picture room (the house style) | Stays in one rich room or a few, close to people | A Higgsfield picture turned into 3D, props as image-to-3D models; the ancient jar's hall |
| Game world | Travels far through one big place, or turns on machines | Low-poly 3D in code with painted textures and the effects kit; the railroads practice |
| Flat 2D place | Only pans, pushes, pulls or slides in the picture's plane | A picture or drawing on one or a few flat layers |
| Drawn in code (3D) | A plain place the camera turns right round in, with no credits | `toon-kit.ts`, cards in a code set (removed: flat code colour read cheap and fake) |

And a route table for "the place", whose default an agent picked:

| Route | When | Cost |
|---|---|---|
| Pictures, then 3D (`hall3d.ts`, `fx3d.ts`) | The default for a rich place | 1 master picture (about 3 credits), 30 credits per hero prop model, about 2 hours |
| One picture warped by depth (`views-kit.ts`, G) | Camera stays within about 60 degrees of the picture's view | 2 pictures, about 1 hour |
| Drawn in code (`toon-kit.ts`) | A plain place, or one the camera turns right round in | No credits, about 1.5 hours |
| Several pictures, one per angle (`views-kit.ts`, F) | Avoid: 4 to 5 pictures must line up | |
| A flat painted card | Only a far sky or skyline | Breaks in any sideways move |

Why it went: agents picked the cheap flat route, and Elijah 2D shipped plain-colour code places. Today the blend is
the look on every place, and the parts plan names each band's source for Vincent's button.

The old parts table also sent hero props to image-to-3D "when it only needs to look rich (the jar)". Today props are
code; Higgsfield image-to-3D only when Vincent asks.

### Learned from the railroads practice (the game world)

The railroads practice (bible-shorts branch `practice/railroads-gameworld`, code in `src/stories/practice-railroads/`,
copied to `templates/gameworld/`, record in `docs/practice/railroads-gameworld-brief.md` and `out/practice/railroads/`)
was a copy of a Ricks Clips Short scored round by round against the original. What it taught, as it was written:

- Geometry in code, faceted. Flat-shaded low-poly terrain and rock, repeated parts (rails, sleepers, spikes, pebbles,
  fence posts) as instanced meshes laid along a curve, so a whole track can bend in one frame.
- Textures painted in code at 2048 near the camera, with mipmaps and 16x anisotropic filtering: wood grain, worn edges,
  nails, rust and scratches, rock strata and cracks, pebbles in ten colours. Round 1 without them was 5.5 times softer
  than the original with a third of its fine detail. (This is now rule S3-8 for every place.)
- People: flat cards with flat white unlit faces and a card-shaped shadow on the ground (the original's way). Front,
  three-quarter and side drawings swapped on one frame when the camera orbits; blinks on ones; a 3D hat that can fly
  off a 2D head. Cards drawn at 3x resolution. (Today cards are lit by the scene everywhere: S3-57.)
- The effects kit (`fx.ts`, `track.ts`, `mechanics.ts`, `train.ts`): a heat ramp on steel in travelling hard bands
  (purple, magenta, orange, yellow, white on the crown); a track that snaps into an S-bend, sleepers staying square; a
  train that follows the bent curve and falls as a chain hinged at its couplings; a raymarched volume for smoke,
  fireball and mushroom cloud (soft spheres into a density and temperature grid, noise billows, a shadow ray to the
  sun; `glslVersion` unset or it draws nothing); sparks, flying spikes that grow from 1.5x to 3x so the swap does not
  jump, heat wisps, god rays, a radial flash, dust puffs.
- Look: no ink lines on the world; bloom tight to hot things; a grade per place with almost no black lift and deep
  violet shadows; a light contrast-limited sharpen; depth of field only where the original had it; motion blur
  (`@remotion/motion-blur`) on the fastest swing and the camera, or arms double. (Motion blur is now banned: S3-38.)
- Cost: 0.25 to 1.2 s a frame at concurrency 2; no Higgsfield credits for the whole clip.

### Superseded look rules

| Old rule | Replaced by | Why |
|---|---|---|
| Background blur on about a third of screen time | S3-35: medium and close shots only, wides sharp | Vincent, 11 Nov 2026 |
| Blur behind people by default, about 11 px; `Stage.tsx` forced an 11 px floor | S3-35, S3-37 | the floor blurred every wide |
| Blur only where the reference has it | S3-35 | one rule, set by shot size |
| Blur behind people in medium shots and close-ups (11 to 13 px) | S3-35: none; sharp like the reference stills | every studied reference is sharp in close-ups; ours measured a sixth of their detail (Vincent, 14 Nov 2026) |
| Grade with lifted warm blacks, black point about (35,19,20); dark floor "lifted" | S3-31: black point near black | lifted blacks read washed out |
| Muted albedos: brick, cream, ochre, terracotta; stone saturation 35% below "storybook" | S3-30: bright and saturated | Vincent wants bright game colour |
| Fog equal to the horizon colour (day 25 to 300 m, golden 20 to 360 m); far things lean 40% toward the horizon | S3-15: rich, crisp, no haze | a hazy cut-out of hills was rejected as fake |
| Ink-dot hands on bean figures | S3-55: mittens | thin hands read as claws on a phone |
| Motion blur on the fastest move, camera only | S3-38: none | it doubled arms and softened the picture |
| Ink on the world every story, but none in a game world | S3-39: ink on the world, thinned over painted detail | one look |
| Only the bean-head people carry over / every video designs its own cast | S2-1, S2-2: the rig may carry over, the cast style never | techniques shared, looks not |
| Game world faces flat white and unlit | S3-57: lit by the scene | emissive cards look pasted on |
| "Check every set on the shot board"; "before he sees a clip" | the still board and animatic at stage 2 (S2-16, S2-21) | the clip stage is gone |
| Critic scoring eight areas out of 10 | S5-5: 1 to 5 | one scale lets rounds compare |

## The stories behind current rules

### The toon-kit

Vincent, 9 November 2026: "we need reusable code that is generic for any kind of video ... not reusing code that was
used in this other video." Stories had been copying each other's code, so the videos looked alike and a fix made in
one never reached the next. The Mona Lisa took the train heist's people code, and the two looked alike. Gibeon's own
copy of `path` meant the kit's 1.55.0 path fix changed nothing. The film template holds the machinery the jungle
holdout needed five cuts to get right.

### Places

- Busy behind faces (S3-12, S3-13): a busy cut-out (tree roots, many trunks) behind a person was rejected as clutter.
  The train heist's trestle had dozens of criss-cross braces and read as noise (Vincent, 7 November 2026). The
  railroads' rails and sleepers, the hero of a close shot, got full detail (S3-14).
- Painted pictures on code shapes (S3-7): a painted leaf picture on a bent 3D blade read as real; plain green code
  leaves read as plastic.
- Invented neighbours (S3-27): the Mona Lisa's master picture brought two invented canvases of 4.7 by 6.3 m beside a
  painting of 0.77 by 0.53 m; the plan kept them, and the owner saw a small thing among big things. With six paintings
  near her size and a warm pool on her spot, the next critique found the note landed (r7, 1.5 and 46.5 s).
- Doorways (S3-23): a hall's lower band and its rail were one piece each, sized to the room, so they crossed the street
  door and the door stood on them at waist height like a cupboard (Mona Lisa 21.6 to 22.6 s); five critic rounds on
  small sheets missed it and the owner found it. The hotel's skirting crossed its door the same way. Cut at the jambs,
  the door reaches the floor (22.3 s).
- Far backdrop depth (S3-6): Gibeon's far ridges stopped 60 m down while the valley floor dropped 55 m and the ground
  ended 1.5 km out, so a blue strip lay under the hills (r5, 51 to 52 s); reaching 260 m down, it is gone (frame 1560).
- Coplanar pieces (S3-24): a corridor box behind a door started exactly in the room's wall plane, and its edges
  flickered as dashed grey lines above the hotel door (Mona Lisa r5, 43.7 to 44.9 s); 6 cm behind the wall, gone.
- Removing an object from a master (S3-22): a rectified tile's v runs 1 - t because the canvas flips on upload; v = t
  laid the tile upside down and it banded.

### Light

- Colour (S3-30, S3-32): Vincent wants the vibrant colour of today's bright games (Brawl Stars, the GTA 6 trailers;
  9 and 10 November 2026). Grade pushes went wrong first on large flat surfaces: concrete shade turned lilac, wide
  grass acid lime, a desk top red-orange (Wald bombers, round 4). A bare-metal hero reads flat grey unless it carries
  warm sun on its upper faces, sky colour on its sides and a crisp highlight.
- The era (S3-49): Vincent, 9 November 2026, on the Mona Lisa heist's 1911: "the buildings are still pale ... we can
  make things a little bit more modern". Saturation then sat about 0.50 to 0.58.
- Time of day (S3-47, S3-48): Gibeon r3's night camp kept its day paint under a blue sky and read as late afternoon
  (44.5 s); Mona Lisa r4's night preset cut saturation and a red room went plum and grey (25 s: 0.28, then 0.63 graded
  by hue).
- Glow near the lens, glare over a face (S3-45, S3-46): halos stacking near a moving camera, and a lamp beside the lens,
  whited out Gibeon's lower third (torches at 45 s); a glare streak and a light pool turned the Mona Lisa's face milky
  (51 s: saturation 0.21, then 0.49 with them moved).
- Light volumes (S3-50, S3-51): an open cylinder of one even opacity read as a glass box over Gibeon's stones (r5, 3.8
  to 4.3 s, 28 to 32 s); faded by angle and height the box was gone, but so weak that the critic saw only grey balls
  under a haze (r6, 28.5 to 29.3 s).
- Indoor shadows (S3-43): one directional key's hard shadows came out as lavender slabs and stripes on orange tile and
  brown parquet in five rooms, each read as a glass panel (Mona Lisa r6, 15.0 to 15.6, 38.6, 39.5, 40.4 s); with those
  casters off, none remain (r7).

### People

- Card crop (S3-65): an envoy's close-up crop was chosen from the distance to his face, and his card ended in a straight
  line across his robe with the ground below it (Gibeon r4, 23.1 to 23.3 s); cropped from the frame, his robe runs out
  of the frame's bottom (frame 695; Gibeon's `people.ts` `uncropped()`).
- Border check (S3-62): a drawing bigger than its canvas shows as a straight cut line a few pixels long; Gibeon's
  thought cloud had one for three rounds and no critic saw it. Wired into every card (Gibeon r5:
  `src/stories/gibeon-2d/edges.ts`, called from `Card.set`, and `scripts/gibeon-2d-edges.mjs`, which renders at 0.1
  scale and prints `EDGE` lines), it found 16 cut sides in 9 cards in two runs, and none after the fixes.
- Card mipmaps (S3-59): with mipmaps a far person's alpha averaged under alphaTest and the person vanished.
- Cold read (S4-13): "it reads as something else" came back three rounds running: hail as fire and rocks as snow
  (Gibeon r1 to r2), fear as cheering (Mona Lisa r2), stones as posts (Gibeon r3). Gibeon r4's first batch was rendered
  with the sheet's labels and had to be redone clean.

## Measures from the railroads copy

`measure_sharp.py` on the railroads original: sharpness 1302, fine-edge share 16.9%, saturation 0.43, mean brightness
133. Round 3 of the copy: 1301, 19.5%, 0.42, 131.
