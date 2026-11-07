# Look targets: the numbers to hit

From the `cartoon-3d-short` skill's seven measured reports (20 reference Shorts in the 2D-people-in-a-3D-world style;
github.com/mromidev/claude-animated-shorts, MIT), with our interior values from the ancient jar test. Measure ours
with `scripts/measure_look.py` (every 6th frame at 540x960, caption band masked).

## Colour and grade

| | Day | Golden hour | Interior (ours) |
|---|---|---|---|
| Median luma | about 0.57 | about 0.52 | 0.40 to 0.45 |
| Dark floor (non-ink p5) | about 0.23, never crushed | lifted | 0.12 to 0.14 |
| Highlights (p95 to p99) | near white, 0.87 to 0.97 | | 0.74 to 0.87 |
| Lit chroma C* p50 / p90 | 34 / 55 | | 21-28 / 55-59 |
| Corners over centre (vignette) | 0.86 | | 0.65 |
| Shadow colour | Cool tint only in shade, same hue as lit | Violet-blue (facade about #444380), never brown | Neutral blue-grey, never violet (it turns stone lavender) |
| Sky | Top about #5e93d9, horizon 1.28 times brighter | Peach horizon #ffd08a | |
| Blacks | Warm-lifted, black point about (35,19,20) | | |

Albedos: muted brick, cream, ochre and terracotta; stone saturation 35% below "storybook"; iron dark and desaturated;
gold and metals at about 60% albedo. Never lemon, never lavender-lit faces.

## Ink (world lines)

- Near-black (#030303 to #0b0a0c), about 5.1 px near (6 m) to 3.3 px far (90 m) at 1080x1920, scaled by height / 1920.
- On silhouettes, depth jumps (from 1%) and creases (from 35 degrees); no line on wall and floor joins or the horizon.
- About 74% of geometry edges carry a line in the reference; ink share of the frame about 1.3 to 2.5%. Painted texture
  seams and the cards' own outlines count as ink in the measure, so ours reads high.

## Depth

- Lens blur on about a third of screen time. Radius at infinity in px at 1080 wide: hook and river close-ups 15 to 16,
  close-ups 12 to 14, medium shots 10 to 12, a park-sized space 7, golden sways 5, wides and aerials 0. Focus on the
  front row's eyes. A near foreground object in about 20% of frames, blurred.
- Fog equals the horizon colour: day 25 to 300 m, golden 20 to 360 m; far things lean 40% toward the horizon colour.
- Bloom only on emissive sources (threshold 1.0, intensity 0.5, 6 levels, radius 0.6). White faces never glow.

## Camera and motion

- Hard cuts only on big jumps; everything else smootherstep glides of 18 to 40 frames, peak at most 25 px/frame at 720p.
- 65% of frames move; every hold pushes in 0.15 to 0.35% a frame, 0.6% on punch words; no still hold of 4 frames or
  more (QA flags 12 frozen frames as a freeze).
- Rolls of 4 to 5 degrees on emphasis; impact kicks flip sign every frame and decay over 7 frames.
- Camera height median 0.8 times a character's height; 82% at eye level.

## People

- About 3.5 head-heights (head 1, torso 1.1, legs 1.4); a child 2.85.
- Bean head: height/width 0.94, narrower chin, pointier crown, 8% bulge to the facing side, tilt up to 4 degrees.
- Limbs one stroke about 0.055 of head width, ink-dot hands, short stroke feet.
- Plum outline #241726, about 5% of width, thicker on the shadow side and the ground side; inner lines thinner.
- Eyes 0.26 of head width apart, no blush, no catchlights; faces render at brightness about 0.93.
- Walk: bob 3 to 7% of height, lean 1 to 7 degrees, a step every 9 to 12 frames, planted feet. Blinks every 0.5 to
  2.3 s, 4 frames long. Acting beats land 0 to 3 frames before their word.
- Contact: a tight soft blob under the feet (about 0.5 of the body width), a sun-direction tail by day.
