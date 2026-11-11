# The playbook: techniques learned from the best

What the studies of top Shorts taught, as blueprints for our own videos. We study to learn how it is done, not to
copy a video (Vincent, 8 November 2026: "we are going to be original"). Each technique says what it is, why it
works, how we would build it, and whether our kit already has it. Build a piece when one of our own stories
needs it; until then the blueprint is enough. `video-study` adds and updates entries after each study. A row
describes the studied video; where it clashes with a rule, the rule wins and the row cites it (X-7).

Status: **built** (in the kit, with a file), **blueprint** (we know how, not built yet).

## Contents

- [Story](#story)
- [Camera and joins](#camera-and-joins)
- [Look and light](#look-and-light)
- [People](#people)
- [Things that act](#things-that-act)

## Story

| Technique | Why it works | Blueprint | Status | Seen in |
|---|---|---|---|---|
| Open on the strangest true act in the first line ("he sawed gaps into a railroad"; "he slammed the brakes on purpose") | The viewer needs to know why within a second | The script rule in `toon-video` step 1 | built | railroads, dashcam |
| End on the reveal that names the thing ("and that's how the dashcam was invented") | Turns a story into a fact the viewer repeats | Write the last line first; each beat leads to it | blueprint | dashcam |
| End mid-move and cut straight to the opening line | The loop lands the hook again right after the payoff | Hard cut from the last word to frame 0; no outro | blueprint | railroads, dashcam |
| Each named change shown within about 2 frames of its word (S3-85) | The picture and the word arrive together, so the eye does not wait | The meaning sheet, keyed to word timings | built (meaning sheet) | railroads, dashcam |
| Skip the expected picture on purpose (no crash at the end; the empty road is the point) | The absence carries the twist | Note it in the meaning sheet as a planned skip | blueprint | dashcam |
| Jokes written on objects (a "days since last neck injury" counter flipping 2 to 0, a PAID stamp, plates, dash warnings) | A second layer for re-watches, readable on a phone | Canvas-painted text on props, changed on a word | built (text on props) | dashcam |
| A state change by swap on one frame (the wrecked car becomes clean under the PAID stamp) | Faster and funnier than showing the repair | Two versions of the prop, swapped under a cover action | blueprint | dashcam |
| Pace follows the kind of story: action near 50 big changes a minute, face-led jokes near 25 with holds up to 2.3 s | A joke needs time on a face; a machine story needs motion | The dynamics profile in `toon-video` ("The backbone and the dynamics") | built (the profile) | railroads, dashcam |
| The mocked one is right: the laugh repeats, bigger, in new places, before the proof | Each laugh raises the payoff; the viewer sides with the underdog | Script three mockeries by named people in three places; the proof seen from where the mocked one stands | blueprint | ancient jar, railroads, roller coaster, storm oil, mirror race, pink prison |
| Hold the fact until the climax, then explain inside the cliffhanger | The viewer cannot leave: the wave is up and the answer is coming | Story first; name the fact at about two-thirds; the payoff after the explanation | blueprint | storm oil, ancient jar, cashiers, mirror race, second draw |
| Plant the answer in the background of an early shot | The twist feels fair, and the re-watch pays | A "first seen" column on the meaning sheet; the object small, sharp and off-centre, not looked at | blueprint | mirror race, pachinko, grave bell, teleporter, burglar, cashiers, scratch cards |
| The pictures tell on the narrator | The words play it straight while faces and props show the truth | A "what the picture knows" column on the meaning sheet | blueprint | grave bell, teleporter |
| An everyday analogy before the mechanism | The rule arrives from life, so it can be retold at dinner | A five-second insert in a familiar place, then a dissolve back to the real thing | blueprint | roller coaster, storm oil, second draw, random numbers |
| Rule out the wrong answers one beat at a time | Each beat removes a guess (speed, luck), so the real answer lands | One beat per wrong answer, each shown, not told | blueprint | second draw, time test |
| The viewer as the hero ("imagine you") | The lesson happens to the viewer, so the twist hurts | One unnamed stand-in in one costume, used in each scene | blueprint | expulsion room, pachinko, second draw |
| The villain's own line or act becomes his punishment | The payoff lands twice: the event and the words | Give the antagonist one line or act the ending turns round | blueprint | storm oil, roller coaster |
| One motif prop and one colour run through each beat | The story reads with the sound off | Choose them at the meaning sheet; mark each return | blueprint | pink prison (stopwatch, pink), storm oil (yellow oil), random numbers (magnifier), idea zone (magnet car), teleporter (pod), scratch cards (staff badge) |
| A bookend object, changed at the end | The ending is one picture at the opening place | The same counter, button or frame-0 framing, with one change | blueprint | spear and shield, expulsion room, cashiers, time test, random numbers |
| A ladder of levels, each rung answering the last | Each beat is a reply, so the viewer wants the next | Write the rungs as a two-column exchange; each nastier, each a mechanism | blueprint | cannonballs |
| Each figure of speech becomes a prop on its word | The joke lands twice, by ear then by eye | Mark similes on the meaning sheet; give each a prop and an action | blueprint | roller coaster, scratch cards |
| A claim staged as an everyday social scene | Each proof is also a joke, so it gets shared | Name the familiar setting beside each beat (support group, line-up) | blueprint | time test |
| A number shown as a body | "1000 lbs" means nothing; a man lifted off the ground does | A counterweight gag, a pile someone stands on | blueprint | cannonballs, scratch cards |

## Camera and joins

| Technique | Why it works | Blueprint | Status | Seen in |
|---|---|---|---|---|
| A camera that is almost always moving, each move eased in and out (S3-102) | Keeps a phone viewer from scrolling | Eased splines in `shots.ts` | built | both |
| Long journeys through one place instead of cuts (dives, skims, orbits, pull-backs) | One unbroken idea per stretch | `shots.ts`, game-world places | built | railroads |
| Dissolves of 7–14 frames while both cameras move; matched so the subject keeps its place on screen | Soft joins that feel like one move | Moving dissolves in `shots.ts`; plan both shots in screen space | built (matching is blueprint) | both |
| A wipe made by the world (a windscreen wiper sweeps one place into the next) | A join that belongs to the story | A pivoting mask with a blade drawn over it | blueprint | dashcam |
| Swoop through glass from inside to outside | Moves from a person to their situation without a cut | One spline through a glass plane, speed lines on the fastest part, no motion blur (S3-38) | blueprint | dashcam |
| Push into a screen, lens, mirror, eye, icon or page; come out in what it shows | One move joins two places and says how we got there | Render the next place to a texture on the object; push until it fills the frame; swap on the matching frame | blueprint | pink prison, mirror race, second draw, time test, idea zone, expulsion room, teleporter, dashcam, random numbers |
| Through a door, window, porthole or gap in the world | The house itself is the join | One spline through the opening; switch sets inside it | blueprint | grave bell, burglar, storm oil, pachinko, expulsion room, railroads |
| Shape-matched dissolve across different objects | Far jumps feel like one move | Plan both shots so the shared shape sits in the same screen place and size; 8 to 12 frames while both move | blueprint | scratch cards, storm oil, spear and shield, random numbers, ancient jar, grave bell |
| Follow what travels | The eye follows the object, so the place change costs nothing | Key the camera to the object's path for its last third; match on it at arrival | blueprint | railroads, storm oil, cannonballs, second draw, mirror race |
| Smoke, flash or light wash as the wipe; an iris in smoke | Uses the scene's own effects to hide the switch | A frame-filling outlined smoke card or bloom-out; switch under it; open with a circle mask | blueprint | cannonballs, railroads, cashiers, spear and shield, burglar |
| A scene shrinks into an object or freezes into a photo | The join is also a punchline | Render the scene to a texture inside the object; pull out in one move | blueprint | cashiers, burglar, time test |
| Pull out from one lit window to a whole building; crane to a map and dive to another example | One becomes many in two seconds | A facade with cutaway floors, one warm window; or terrain with tiny copies | blueprint | expulsion room, pink prison |
| A whip pan reveals someone already there, inside one place (S3-123) | A comic arrival with no walk-in | 0.3 s pan with speed lines onto the waiting person | blueprint | scratch cards, random numbers |
| A near object across the lens hides the dissolve | The join sits inside an action | Time a prop to fill about 60% of frame; dissolve under it | blueprint | pachinko, railroads |
| Save hard cuts for a change of place or time (S3-121) | In a film of soft joins, a rare cut jolts at the right moment | Dissolves elsewhere; at most 3 cuts plus the loop, each with its reason | blueprint | roller coaster |
| Pace as a curve: fast spectacle, still reveal | Calm frames give the reveal weight | A pace curve in the dynamics profile, not one number | blueprint | pachinko, idea zone, dashcam |
| Split screen for one person in two places | A contradiction read at a glance | Two cameras into halves with a divider; stacked, then side by side | blueprint | teleporter |
| A point of view with closing lids or a spyglass iris | The viewer sees as the character | Camera at the eyes; lid shapes closing with blur; or a gold-rimmed circle mask | blueprint | idea zone, mirror race |

## Look and light

| Technique | Why it works | Blueprint | Status | Seen in |
|---|---|---|---|---|
| Sharp, detailed, saturated: stone-level asphalt, blade-level grass, painted textures | Reads as rich on a phone | 2048 painted textures, `measure_sharp.py` against the reference | built | both |
| The grade follows the mood and the plot (darker as the scheme grows; rain to sun in one second at the payoff) | Colour tells the story before the words do | Grade values keyed by frame as well as per place | blueprint (per place is built) | dashcam |
| Colour stands for temperature (the heat ramp: purple to white along steel) | A change you can see with no words | `fx.ts` heat material | built | railroads |
| Weather: rain on ones, drops and wipers on glass, wet road with smeared lights | Mood and texture at low cost once built | Particles, a glass drop map, reflective road patches | blueprint | dashcam |
| One set, many times of day | Few sets, a clock for free, a lived-in world | Build once; grade and sky presets per time; reuse at dissolves | blueprint | ancient jar, grave bell, mirror race, second draw, burglar, expulsion room, teleporter |
| One warm hero colour through a cold film | The eye finds the answer in each frame | A colour nothing else uses, kept lit or emissive in each scene | blueprint | storm oil, pink prison |
| The ordinary world graded flat; the system graded vivid | Colour says which places matter | Grade per place by story role | blueprint | scratch cards, pachinko |
| The brightest frame for the darkest line | Irony makes the closing question land | Plan the colour arc so the end is the brightest scene | blueprint | teleporter |
| Shadow patterns on people (blinds, bars, mesh) | Ties flat cards into the room and sets the mood | A projected gobo multiplied onto the card material | blueprint | random numbers, burglar, cashiers |
| Time-lapse on a locked frame | "A week of nothing" becomes something to watch | Sun and grade by frame; a nest, a web, a plant growing by a 0–1 dial | blueprint | spear and shield, grave bell |
| An off-screen event told by light | The police arrive without a car shot | Red and blue light swept over the room for about 20 frames | blueprint | burglar, random numbers |
| Season as a time code | Spring blossom against autumn leaves says "a year earlier" | Two versions of the place picture and its particles | blueprint | burglar |
| Interiors as big flat shapes with crisp ink (about 12% fine edges) | Clean and readable, not noisy | Superseded: places use the blend (S2-7, S2-8); keep the 12% ink measure | superseded | expulsion room, burglar, cashiers |
| Multiplane flat places | Cheap, sharp, fast to build, real depth on a phone | 3 to 6 drawn planes at depth; blur by depth; bokeh and dust planes | blueprint | teleporter |

## People

| Technique | Why it works | Blueprint | Status | Seen in |
|---|---|---|---|---|
| Flat near-white faces, thick outline, ball hands, a shadow on the ground | Reads at any size; the face carries each joke | `people.ts`; our cards are lit by the scene (S3-57) | built | both |
| Expressions swapped on one frame, held 8–30 frames | Snappy acting without in-betweens | `people.ts` faces | built | both |
| Angle drawings: front, three-quarter, side, back, a lean against glass, seated at the pedals | The card turns with the camera instead of looking flat | More drawings in `people.ts` | partly built (no back, lean or seated) | both |
| Lip sync on spoken lines, about 8 mouth shapes on ones; none under narration | A speaking character feels alive; the narrator stays invisible | Mouth shapes picked per frame from the ElevenLabs word and letter timing | blueprint | dashcam |
| Cards inside 3D things: behind car glass, hidden by a bonnet, half under pool water | People belong to the world, not on top of it | Depth-tested cards, a glass layer drawn after them, a water cut with tint and ripples | blueprint | dashcam |
| A 3D prop leaving a 2D head (a hat flying off on a startle) | A big readable gag | A 3D hat parented to the card, released on a frame | built | railroads |
| A drawn rim light on cards at night | Sits people in coloured light without lighting the face | A coloured edge line on the lit side | blueprint | dashcam |
| A pose library: seated, back, lying from above, carrying | Nearly each story needs a person who is not standing | Drawings per pose in the cast style, swapped on one frame | blueprint | 19 of 20 |
| Marks that stay on a person (dirt, bruise, soot, bandage, stubble) | Continuity jokes and time passing | Face and body overlays keyed by story time | blueprint | second draw, dashcam, ancient jar |
| Costume change on the beat | The role change is seen, not said | Swap the outfit on the word that changes the role | blueprint | cashiers, random numbers, burglar, idea zone |
| The off-screen sleeve before the person | She is in the story from second one, so her reveal pays off | An arm card in her colour entering from the frame edge on her early actions | blueprint | random numbers |
| An animal witness | Deadpan reactions add jokes and can take a side | A cat card with four faces, cut in on beats | blueprint | burglar, pachinko |
| Give the mechanism a face | A sweating object sells danger no narration can | The people face kit on a prop | blueprint | cannonballs, time test, random numbers, idea zone |
| Ghost, silhouette, x-ray and grey variants of a card | An inner state or a hidden truth in one drawing | A shader or texture variant per card | blueprint | teleporter, cashiers, idea zone, pink prison |
| Emotion as a liquid fill rising in the head | Anger reads at any size, and drains as it cools | A clipped fill level with a wobbly edge and bubbles | blueprint | railroads |
| Effort parody (a power-up aura that achieves nothing) | A big contrast between effort and result | Flame cards round the card, radial lines, pebbles rising, glowing eyes | blueprint | second draw |
| The world acts out rage (cracks under the feet, veins on the walls, a swelling shadow) | Bigger than a face can show | Line decals that grow with bloom; a projected blob shadow that scales | blueprint | pink prison |
| Danger behind an oblivious face | The audience knows first; the wait becomes tension | The threat in the background of a slow push on the face, both sharp | blueprint | cashiers |
| Crowds as instanced cards in formations | Scale and meaning in one aerial | Cards placed by a mask shape, eased into position | blueprint | spear and shield, ancient jar, mirror race |

## Things that act

| Technique | Why it works | Blueprint | Status | Seen in |
|---|---|---|---|---|
| A track that snaps into an S; a train that follows it and falls as a chain | A physical payoff the eye understands | `track.ts`, `train.ts` | built | railroads |
| Fire, smoke and a mushroom cloud as a volume | Real-looking without credits | `fx.ts` raymarched volume | built | railroads |
| Car models with interiors, staged in traffic so the right car pulls level on its word | Cars carry a whole genre of stories | Free or bought models (choice pending with Vincent), cars on lanes keyed to words | blueprint | dashcam |
| Crashes that dent: panels crumple, lamps crack, a bumper tears off | The hit reads as real | A vertex push near the hit point, cracked-lamp decals, parts on hinges | blueprint | dashcam |
| Many bodies settling (an eruption of money into a heap someone stands on) | Excess shown, not told | Simulate once with a physics library, play back as instances | blueprint | dashcam |
| An overlay that tells the truth (a dashcam's clock and speed running backward in a rewind) | The proof is in the numbers on screen | A fisheye pass and an overlay driven by the scene's own values | blueprint | dashcam |
| The diagram on the object: cells light by group on the word | The mechanism is seen on the real thing | Canvas texture with a highlight state per cell keyed by frame; bloom on lit cells; a pen stroke | blueprint | scratch cards, ancient jar, random numbers |
| Point at the cause with light on the real thing | No chart breaks the world | A travelling emissive band (the `fx.ts` heat material with a moving mask) | blueprint | roller coaster |
| A chart made of story objects | Data at a glance that stays in the world | Instanced photos on a ruler, digit buildings, sheets in stacks | blueprint | cashiers, random numbers, time test |
| A cut-away section | One picture shows the hidden parts | A set clipped by a plane, the cut face painted, a slow drift | blueprint | grave bell, ancient jar, cannonballs |
| A status label as a second narrator | Two words on the object tell the plot | A timeline of label values keyed to words | blueprint | teleporter, cannonballs, expulsion room |
| An evidence trail that grows and stays | Time and threat build with no words | Decals and notes spawned on story frames; a high shot at the end shows the whole trail | blueprint | burglar, expulsion room, railroads |
| Gauges in a gap: what fits shows the size | A tiny change becomes measurable | A constant reference prop, then new props that fit or do not | blueprint | railroads |
| A shape that morphs on its word | "Tall and skinny" is seen happening | A parametric curve whose radius per point is keyed to words | blueprint | roller coaster |
| A blueprint that draws itself, is stamped and tears | The logic is an object, and the tear is the join | A canvas redrawn per frame with a pen point; a stamp with a jolt; the plane split in two | blueprint | spear and shield, teleporter, time test |
| A cartoon cel explosion and outlined smoke | Cartoon harm, not real harm, and it matches the cards | Outlined puff and fire cards swapped on twos, debris sprites | blueprint | storm oil, cannonballs |
| A prop that betrays its user | The catch is a gag, not a fight | A hidden second object released on a spring on the word | blueprint | random numbers |
| Heat to rust | "Cheap plain iron" shown as a change | The heat ramp extended with a cooling ramp and rust blotches by noise | blueprint | spear and shield |
