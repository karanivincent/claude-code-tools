# Pictures that blend: prompt rules

How to ask an image model (Higgsfield `gpt_image_2_6`, `resolution: "2k"`, `quality: "high"`, 9:16; S2-25) for the
pictures of a place: the sky, the far band, and an indoor master that paints the middle band. These prompts follow
S3-21. Learned from two rounds of hall pictures on the ancient jar practice copy.

## A picture worth looking at (S3-166, S3-167, S3-168)

The far picture fills a large part of most frames, so a dull picture makes a dull film. Two far pictures from the
same tool (Higgsfield), with very different results. The prompt and the approval made the difference.

| | Before: the B-17 airfield (`library/places/airfield-1935/pictures/airfield-far.jpg`) | After: the cliff and lake (`library/places/cliff-lake/pictures/far.jpg`) |
|---|---|---|
| Light | Flat midday, no shadows, plain colours | Golden hour, warm sun low on the right, orange and violet sky |
| Layers | One thin row of objects on a flat field | Lake, near shore, wooded hills, cliffs, far ridges, sky |
| Sky | Two thirds of the picture, empty blue with four clouds | Big lit clouds that carry most of the colour |
| Detail | A barn, a tower, two hangars, a house, all at one distance | Trees at three distances, cliff strata, a lit pavilion, birds, reflections |
| Owner | Found it flat and dull | Loved it |

### The prompt template

Fill each slot (S3-166, S3-167). A slot left empty comes back as midday, empty sky and one row of things.

```
WORLD: <the place>, painted storybook film still, vivid modern cartoon colours.
LIGHT: <golden hour | low sun | storm light | dramatic sky>, sun <low, from the left or right>, long shadows,
  warm light on <what it catches>, cool <blue or violet> shade.
LAYERS: near: <water, a field edge, rocks with detail>; middle: <buildings, trees, the working part of the place>;
  far: <hills, ridges, a skyline, in two or three steps>; sky: <big lit clouds, colour toward the sun>.
DETAIL: dense small things at each distance: <trees, rocks, fences, lamps, flags, birds, reflections>.
FRAME: horizon at <the height the cameras need>; the sky takes about <a third> of the picture, no more.
RULES: everything sharp, no haze, no fog, no vignette, no people, no text; nothing important cut by an edge.
```

Flat midday is allowed only when the story needs it, as at a scorching noon (S3-166). Then the prompt asks for raked
light and strong, dark shadows, and the sky still has colour and clouds.

The picture takes no more of the frame than its band (S3-168). Above the far band, the sky is the picture's sky or the
dome; below it, the code middle, ground and detail layer fill the frame. A frame that is mostly picture reads flat
however good the picture is.

Each place's background picture is shown to the owner on the review page as its own `picture-<place>` item at stage 2
(S2-33). He approves the picture, not only the parts plan. Make 2 or 3 versions when the first is not clearly rich, and
show him the best one.

## A prompt that worked (the master wide)

Four labelled blocks, the same words in each picture of the place:

- WORLD: the place, each fixed thing named where it stands, in vivid modern cartoon colours (S3-30, S3-49);
  "painted storybook film still" for the painted style.
- CAMERA: where it stands on the plan, what it looks at, its height against something in the frame, the lens as a
  field of view in words, horizon at the middle, vertical lines perfectly straight.
- LIGHT: named sources ("warm candlelight and firelight, cool daylight through the windows from the back"), even
  exposure edge to edge.
- RULES: everything sharp front to back, no fog, no haze, no vignette, no lens flare, no people, no animals, no text;
  the edges show plain wall, column and floor, nothing important cut by an edge (S3-15, S3-16).

For each other picture of the place, give the master as an image reference (upload with `media_upload`, then
`medias: [{ role: "image_references" }]`) and say "exactly the same place as the reference, the camera moved to ...".
Cost: about 2.75 credits a picture.

## What to state

1. A floor plan with numbers: the room's width, depth and height, and where the fixed things stand (the throne at the
   back wall, steps 3 m deep, the arcades 3.5 m either side of the middle, the runner 2.2 m wide down the middle). Give
   each picture the same paragraph, word for word (S3-21). Pictures agree on what the prompt pins down, and no more.
2. Each picture's camera as a position on that plan plus a direction ("standing at the middle of the entrance, 20 m
   from the throne, looking straight at it"), not as an angle on its own. "Turned 30 degrees" came out as 5 degrees
   twice; a target ("looking at the left fire bowl") is followed better.
3. The lens as a field of view in words ("the throne and both candelabra fill the middle third of the width"), with the
   millimetres as a second hint. Both rounds came out narrower than asked.
4. The eye height, with something in the frame to measure it by ("the camera at the height of the fire bowls' rims").
   Bare "1.6 m" came out at 2.3 to 3.8 m.
5. Horizontal, level, straight verticals, everything sharp, no haze, no vignette, no depth of field.
6. The same light in each picture, named by its sources ("daylight from the clerestory windows high on the left, warm
   torches on the columns").

## What to forbid

- Fine repeated detail: criss-cross braces, many rails, slats, fences, rows of poles. Ask for "a few big, simple
  shapes" instead (S3-13).
- Anything that moves between pictures: people, open doors, objects that are not on the plan.
- Props near the frame's edges or close to the camera. Drawn where one picture alone sees them, they smear when
  projected and cannot match in a blend.
- Redrawing the room for a close-up. Model the close object or crop the master (S3-20).
- A wider or narrower room than the plan, a symmetric room when it is not, and decorative repetition that differs
  between pictures (banners, ivy).

## How to chain references

- Make the wide first and treat it as the master. Each other picture gets the master as an image reference, and the
  plan paragraph.
- Ask for each new view as "the same room as the reference, the camera moved to ..."; do not describe the room again in
  other words.
- Check each picture before the next: run `scripts/fit-camera-example.mjs` on it (horizon, runner width, fixed
  landmarks). Redo it when the fit error is over about 15 px at 2688 px tall, or the height or lens is off by more than
  20% (S3-19).

## Which views a camera journey needs

- One wide down the main axis from behind the furthest camera position. This carries most moves, including a
  50-degree orbit.
- Side views when the journey turns more than about 40 degrees or slides sideways more than a quarter of the room's
  width. Turn them for real (30 degrees or more); a 5-degree side view adds ghosts, not coverage.
- A reverse view when the camera looks back toward the entrance.

## Edge and overlap rules

- Draw 15 to 20% more than the camera will see on each side: more vault above, more floor below, more wall at the
  sides. A projection runs out exactly where the camera swings, at the frame's edge. A far backdrop reaches below the
  ground's lowest far edge (S3-6).
- Neighbouring views share at least half their picture, with the shared part plain (wall, floor, columns) so it
  matches. Keep busy, hard-to-match detail (banners, tapestries, clutter) away from the overlaps.
- Change pictures inside fast motion (a whip, a swing, a fast push) or a dissolve, and spread the blend over the whole
  move. In slow motion use one picture, even the less good one.
- Colour-match before blending, measured on content both pictures show (the same object), not on the whole frame.
