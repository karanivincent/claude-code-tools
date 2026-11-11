# An indoor middle band from a master picture

Indoors, a fitted master picture may paint the middle band, projected onto code shapes built to a numbered floor plan
(S3-18). The ground still gets painted textures and the place still gets its detail layer (S2-7, S3-9). Hero props
stay code; Higgsfield image-to-3D when Vincent asks for it (S2-11).

The worked example is the ancient jar's throne hall (bible-shorts, branch `practice/ancient-jar`, composition
`PracticeAncientJar3D`; `templates/place/hall3d.ts` and `fx3d.ts` are its code, `templates/examples/PracticeAncientJar3D.tsx`
its composition).

Scripts:
- Run `scripts/depth.mjs` for a depth map from Depth Anything V2 through `@huggingface/transformers` in Node (about 3 s
  a picture; install it in a scratch folder outside the repo).
- Run `scripts/fit-camera-example.mjs` to fit a picture's camera to landmarks (S3-19).
- Run `scripts/measure.mjs` to put a picture pixel onto a known plane.

## Where each part came from in the worked example

| Part | Source |
|---|---|
| Floor, runner, steps, back wall, windows, arcade faces, banners, tapestries, bookshelves | Projected from the master's fitted camera, with a depth check so it lands on what that camera saw |
| Column backs, arch undersides, near floor, dais top, vault | Tiles cut from the master and mirror-tiled |
| Canopy sides and underside, finials, brackets, pedestals | Code |
| Flames, glows, window shafts, dust, bloom | Code |

The practice copy also made its throne, candelabra, fire bowls and chests with image-to-3D (30 credits each). Under
S2-11 a story builds them in code unless Vincent asks.

## The pipeline

1. One master wide picture by `picture-rules.md`, fitted to a camera (an 11 px fit error was enough to build on).
2. Measure the plan from the master: rays from the fitted camera onto the floor, back wall and arcade planes (about 30
   landmark clicks).
3. A room kit driven by plan numbers (`hall3d.ts` is one: a second hall is a new plan, not new code).
4. A projection material with a depth test; below a facing threshold it falls back to tiles from the same picture.
5. To take an object off the master, `hallMaterial` `holes` lays the wall's own tile over it in phase, v = 1 - t
   (S3-22).
6. Close-ups from models or crops of the master (S3-20).
7. Light and effects in code, tuned once against the master; render from the projector's camera and compare the
   frame's mean brightness with the picture's (S3-54).

Not built yet: a real side view (30 degrees or more off axis) to project onto side surfaces, and painting the
picture's own flames out of the projected texture.

## Gotchas

- A picture's camera does not match the prompt's numbers (heights came out 2.3 to 3.8 m for 1.6 asked): fit it (S3-19).
- A projection smears on surfaces the picture sees edge-on (arch undersides); use tiles there, or a second picture
  taken 30 degrees or more off axis.
- The picture's own flames and lamps stay in the projected texture: paint them out before adding code flames.
- The light was 30% too bright on the first try: compare the render from the master's camera with the picture (S3-54).
