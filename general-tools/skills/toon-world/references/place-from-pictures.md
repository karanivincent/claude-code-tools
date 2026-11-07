# A place from pictures: picture, then 3D

The worked example is the ancient jar's throne hall (bible-shorts, branch `practice/ancient-jar`, composition
`PracticeAncientJar3D`; `templates/place/hall3d.ts` and `fx3d.ts` are its code, `templates/examples/PracticeAncientJar3D.tsx`
its composition). Tools: `scripts/depth.mjs` (a depth map from Depth Anything V2 through `@huggingface/transformers`
in Node, about 3 s a picture; install it in a scratch folder outside the repo), `scripts/fit-camera-example.mjs` (fit a
picture's camera to landmarks), `scripts/measure.mjs` (a picture pixel onto a known plane).

## Where each part came from

| Part | Source |
|---|---|
| Floor, runner, steps, back wall, windows, arcade faces, banners, ivy, tapestries, bookshelves, canopy front | Projected from the master picture's fitted camera, with a depth check so it lands only on what that camera saw |
| Column backs, arch undersides, near floor, dais top, vault | Tiles cut from the master and mirror-tiled (floor flags, runner, stone) |
| Curtains | The throne close-up picture as a texture only: it redrew the alcove and fits no camera |
| Canopy sides and underside, finials, brackets, pedestals | Code |
| Throne, candelabra, fire bowls, chests | Higgsfield image-to-3D from cut-out prop pictures (30 credits each, textured) |
| Flames, glows, window shafts, dust, bloom | Code |
| Jar, people | Round 2 |

## The generated models up close

- Throne: excellent; it carries the 5.5 to 7 s close-up. Solid lions, tracery and gold; the texture is slightly soft.
  Needed a 1.25 sideways stretch to match the picture.
- Candelabra: good at a distance; one baked texture makes the gold look painted up close; flames placed by hand.
- Fire bowl and chest: good.

## A repeatable pipeline: pictures, then 3D

1. One master wide picture, fitted to a camera (an 11 px fit error was enough to build on).
2. Measure the plan from the master: rays from the fitted camera onto the floor, back wall and arcade planes. About
   30 landmark clicks today; a tool that shows the picture on a grid and writes the plan file would make it 10 minutes.
3. A room kit driven by plan numbers (`hall3d.ts` already is one: a second hall is a new plan, not new code).
4. A projection material with a depth test; below a facing threshold it falls back to tiles from the same picture.
5. Hero props as image-to-3D models from cut-out pictures: the most quality for the least work.
6. Close-ups from models or crops of the master, never a separately generated close-up.
7. Light and effects in code, tuned once against the master; check by rendering from the projector's camera and
   comparing the frame's mean brightness with the picture's.

Still missing: a real side view (30 degrees or more off axis) to project onto side surfaces, and painting the
picture's own flames out of the projected texture.

## Gotchas

- A picture's camera never matches the prompt's numbers (heights came out 2.3 to 3.8 m for 1.6 asked): always fit it.
- A projection smears on surfaces the picture sees edge-on (arch undersides); use tiles there, or a second picture
  taken 30 degrees or more off axis.
- The picture's own flames and lamps stay in the projected texture: paint them out before adding code flames.
- Generated prop models carry one baked texture: gold looks painted up close, so keep metal close-ups for code objects.
- The light was 30% too bright on the first try: compare the render from the master's camera with the picture's mean.
