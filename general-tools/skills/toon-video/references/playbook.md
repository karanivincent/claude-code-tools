# The playbook: techniques learned from the best

What the studies of top Shorts taught, as blueprints for our own videos. We study to learn how it is done, not to
copy a video (Vincent, 8 November 2026: "we are going to be original"). Each technique says what it is, why it
works, how we would build it, and whether our kit already has it. Build a piece only when one of our own stories
needs it; until then the blueprint is enough. `video-study` adds and updates entries after each study.

Status: **built** (in the kit, with a file), **blueprint** (we know how, not built yet).

## Story

| Technique | Why it works | Blueprint | Status | Seen in |
|---|---|---|---|---|
| Open on the strangest true act in the first line ("he sawed gaps into a railroad"; "he slammed the brakes on purpose") | The viewer needs to know why within a second | The script rule in `toon-video` step 1 | built | railroads, dashcam |
| End on the reveal that names the thing ("and that's how the dashcam was invented") | Turns a story into a fact the viewer repeats | Write the last line first; every beat leads to it | blueprint | dashcam |
| End mid-move and cut straight to the opening line | The loop lands the hook again right after the payoff | Hard cut from the last word to frame 0; no outro | blueprint | railroads, dashcam |
| Every named change shown within about 2 frames of its word | The picture and the word arrive together, so the eye never waits | The meaning sheet, keyed to word timings | built (meaning sheet) | railroads, dashcam |
| Skip the expected picture on purpose (no crash at the end; the empty road is the point) | The absence carries the twist | Note it in the meaning sheet as a planned skip | blueprint | dashcam |
| Jokes written on objects (a "days since last neck injury" counter flipping 2 to 0, a PAID stamp, plates, dash warnings) | A second layer for re-watches, readable on a phone | Canvas-painted text on props, changed on a word | built (text on props) | dashcam |
| A state change by swap on one frame (the wrecked car becomes clean under the PAID stamp) | Faster and funnier than showing the repair | Two versions of the prop, swapped under a cover action | blueprint | dashcam |
| Pace follows the kind of story: action near 50 big changes a minute, face-led jokes near 25 with holds up to 2.3 s | A joke needs time on a face; a machine story needs motion | Pick the target from the nearest studied reference | blueprint (rule still says 35–60) | railroads, dashcam |

## Camera and joins

| Technique | Why it works | Blueprint | Status | Seen in |
|---|---|---|---|---|
| A camera that is almost never still, every move eased in and out | Keeps a phone viewer from scrolling | Eased splines in `shots.ts` | built | both |
| Long journeys through one place instead of cuts (dives, skims, orbits, pull-backs) | One unbroken idea per stretch | `shots.ts`, game-world places | built | railroads |
| Dissolves of 7–14 frames while both cameras move; matched so the subject keeps its place on screen | Soft joins that feel like one move | Moving dissolves in `shots.ts`; plan both shots in screen space | built (matching is blueprint) | both |
| A wipe made by the world (a windscreen wiper sweeps one place into the next) | A join that belongs to the story | A pivoting mask with a blade drawn over it | blueprint | dashcam |
| Swoop through glass from inside to outside | Moves from a person to their situation without a cut | One spline through a glass plane, motion blur on the fastest part | blueprint | dashcam |

## Look and light

| Technique | Why it works | Blueprint | Status | Seen in |
|---|---|---|---|---|
| Sharp, detailed, saturated: stone-level asphalt, blade-level grass, painted textures | Reads as rich on a phone | 2048 painted textures, `measure_sharp.py` against the reference | built | both |
| The grade follows the mood and the plot (darker as the scheme grows; rain to sun in one second at the payoff) | Colour tells the story before the words do | Grade values keyed by frame, not only per place | blueprint (per place is built) | dashcam |
| Colour stands for temperature (the heat ramp: purple to white along steel) | A change you can see with no words | `fx.ts` heat material | built | railroads |
| Weather: rain on ones, drops and wipers on glass, wet road with smeared lights | Mood and texture at low cost once built | Particles, a glass drop map, reflective road patches | blueprint | dashcam |

## People

| Technique | Why it works | Blueprint | Status | Seen in |
|---|---|---|---|---|
| Flat white unlit faces, thick outline, ball hands, a shadow on the ground | Reads at any size; the face carries every joke | `people.ts` | built | both |
| Expressions swapped on one frame, held 8–30 frames | Snappy acting without in-betweens | `people.ts` faces | built | both |
| Angle drawings: front, three-quarter, side, back, a lean against glass, seated at the pedals | The card turns with the camera instead of looking flat | More drawings in `people.ts` | partly built (no back, lean or seated) | both |
| Lip sync on spoken lines, about 8 mouth shapes on ones; none under narration | A speaking character feels alive; the narrator stays invisible | Mouth shapes picked per frame from the ElevenLabs word and letter timing | blueprint | dashcam |
| Cards inside 3D things: behind car glass, hidden by a bonnet, half under pool water | People belong to the world, not on top of it | Depth-tested cards, a glass layer drawn after them, a water cut with tint and ripples | blueprint | dashcam |
| A 3D prop leaving a 2D head (a hat flying off on a startle) | A big readable gag | A 3D hat parented to the card, released on a frame | built | railroads |
| A drawn rim light on cards at night | Sits people in coloured light without lighting the face | A coloured edge line on the lit side | blueprint | dashcam |

## Things that act

| Technique | Why it works | Blueprint | Status | Seen in |
|---|---|---|---|---|
| A track that snaps into an S; a train that follows it and falls as a chain | A physical payoff the eye understands | `track.ts`, `train.ts` | built | railroads |
| Fire, smoke and a mushroom cloud as a volume | Real-looking without credits | `fx.ts` raymarched volume | built | railroads |
| Car models with interiors, staged in traffic so the right car pulls level on its word | Cars carry a whole genre of stories | Free or bought models (choice pending with Vincent), cars on lanes keyed to words | blueprint | dashcam |
| Crashes that dent: panels crumple, lamps crack, a bumper tears off | The hit reads as real | A vertex push near the hit point, cracked-lamp decals, parts on hinges | blueprint | dashcam |
| Many bodies settling (an eruption of money into a heap someone stands on) | Excess shown, not told | Simulate once with a physics library, play back as instances | blueprint | dashcam |
| An overlay that tells the truth (a dashcam's clock and speed running backward in a rewind) | The proof is in the numbers on screen | A fisheye pass and an overlay driven by the scene's own values | blueprint | dashcam |
