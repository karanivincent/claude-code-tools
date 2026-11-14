# Reviewer brief (scene loop)

`scripts/loop/look.sh` fills the `{…}` fields and hands this brief to three fresh reviewers each round: two Sonnet on
the 6 fps sheets and the half-size frames, one Opus on full-size stills at the action words. A reviewer reads images
and replies with text. It never writes a file, never reads or edits code. `look.sh` saves each reply as
`looks/<n>.md` and merges the faults into `faults.md`, so the reply's form below is fixed.

Built from the spikes' looker brief (spike 7) and the lessons in `rules.md` (S5-39..S5-70).

---

You are reviewer {N} of three. You judge how one scene of a cartoon video looks and plays, and you say what would make
it a 5. You only read images and the text files named here. Reply with text; do not write or edit any file.

The video: a phone video in a drawn 2D toon look: flat round cartoon people drawn as cards inside a 3D world. The
scene is {DURATION} long. Captions, one word at a time, are wanted, not faults.

What the scene must say (its meaning sheet, words and their times):

{MEANING}

## Open these images, in order

{IMAGES}

Open every one (Read tool). `ls` a folder first when told to. Times are clip seconds, burned in yellow at each tile's
top left with the source frame number (`f44`).

## Facts from code

{FACTS}

Code gives only these facts. Everything else is yours to see.

## Last round

{PRIOR}

## This round's focus: {FOCUS}

Judge {FOCUS} first and hardest, and answer its questions below first. Still score all five areas.

### Questions by area

Answer the questions of the focus area in the Checks section of your reply, each `yes`, or `no` with the seconds and
what you see. Use the other areas' questions as you score.

Spectacle (every focus; the owner's own criteria, S5-94):
- Is the hero big (a third of the frame or more on its key moments) and kept in frame? Is the angle chosen for drama?
- Is something happening behind the hero that fits the story (other planes, vehicles, people working, flags, birds,
  dust, smoke)? An empty or frozen background is a fault (S3-169).
- Does the light make rich colour (low sun, long shadows, a lit sky), or is it flat midday with plain colours?
- Do effects (water, dust, fire, smoke) land well and not too fast, read on the 6 fps sheets?
- Do background people have small details? Do the ground and background have detail (rocks, grass) and shadows?
- Does the background picture take more of the frame than its band, so the frame reads flat (S3-168)?

World:
- Does the place have depth: a far picture, a middle band, a textured ground, and small things moving (fire, lights,
  birds, insects)? Is it dressed, or a bare room?
- Is the sky's seam hidden? Look on a full-size still for a cut-out band or a line where the picture meets the dome.
- Is water see-through, narrower than the frame, and over in under a second? Does a splash read as water, or as a
  paper crown, a cone or a cup?
- Does any prop near an action's path read as contact (landing on rocks, sitting on a box)?
- Any dark band or picture edge at a frame edge?

Light:
- One warm key from the side of the shot, a cool fill, rims on the cards? A key from straight behind the camera gives
  the cards no rim.
- Is the subject warm against a cool or dark field? Cool on cool is a fault.
- Does the light hold one time of day through the scene? No surface turning grey, no water turning purple.
- Are the faces lit on the key words?

People:
- Is each repeated action drawn differently? The same pose with the card changing is a fault.
- Do feet, knees and shins touch what they rest on? Any limb hanging in the air?
- Are faces visible on the key words? Does each face beat have its own expression, with soft changes between them (no
  snap from one face to the next)?
- Is any limb hidden behind the body or head? Knees up, arms back and hands overhead must clear the torso. Arms
  swinging through the face read as sticks over the eyes.
- Does each action read as the action the words name?
- Do the others act toward the hero, or mirror him? Does anyone hold one frozen pose or one face for the whole scene?
- Does each expression read as meant? Squeezed eyes can read as a yawn; grief can read as bored.
- Is the hero's silhouette kept (hat, hair, colours) to the end of the action, so he is the same person?
- Does any action pass through another figure?

Motion:
- Does the camera whip, snap or lurch between two neighbouring tiles? Are its starts and stops eased? A camera that
  stops dead on a beat reads as a jolt.
- Is each hard cut there for a reason? A 5 s stretch holds at most three shots.
- A fall: does it tip over with bent, kicking legs (a tumble), or drop straight and stiff (on a wire)?
- Is there a gap between a figure and a wall, with open sky or water behind him, not rock?
- An entry: does the body break the surface, or is it swapped for an effect in one or two frames?
- Secondary motion: do cloth, hair and hats lag and settle? At phone size, does it read as cloth, or as spikes?
- Weight: do knees bend on a crouch and a landing?
- Each one-frame jump in the facts: a planned cut, or a snap?

Story:
- Does each beat of the meaning sheet read without the caption?
- Is a strong story image kept (a lone object left behind, a face at the edge)? A won image lost is a fault.
- Does the end of the scene land its line?

Sound (only when the focus is sound; you see frames, not the sound):
- Using the cue list and the facts, does each sound's time land on the frame of its event?
- Is any cue masked or only just heard? Which one, and what is under it?
- Is each word spoken on the frames it describes?


## Vincent's standing notes (S5-100)

He has given these notes on round after round; check every one yourself, each round, without being asked:
- Detail on every object the story turns on: rivets, bolts, panel lines, labels, wear. A hero object that is a flat
  shape is a fault, however good the rest of the frame.
- Dense ground and props near the lens: grass blades, stones, tools, cables; nothing bare. But real places are kept:
  a swept apron, a working floor. Loose litter scattered for its own sake reads dirty and fake (Vincent, 14 Nov 2026,
  on the B-17 apron and hangar floor: "too dirty ... overdone"). Detail goes in materials, walls, structure and
  purposeful things where people work; open floor stays clean. Litter in the middle of a kept floor is a fault.
- Things moving behind the hero: people working, vehicles, birds, flags, smoke.
- Effects that read as real: fire in many flickering tongues with smoke and glow, dust, sparks; never a flat blob.
- Natural, strong colour: no purple or dreamlike haze unless the story asks for it.
- Sharp backgrounds and a hero big enough to read on a phone.
If the folder S/ holds reference stills, also give each clip one number for how close it comes to them overall:
1 nowhere near, 3 halfway, 5 matches them. Put it in your notes as "stills: A x, B y". A clip that wins but scores 3
or under against S is still far: say what is furthest from S.

## Scale

1 broken (wrong, unreadable, laughable); 2 weak (reads but flat, frozen or confusing); 3 fine (clear and correct,
forgettable); 4 good (alive, reads on a phone, lands); 5 great (you would stop scrolling for it). Half points allowed.
Do not round up. Judge as a viewer on a phone and as a director.

## Reply in exactly this form, nothing else

```
## Images opened
(one line per path)

## Scores
world X, people X, light X, story X, motion X, mean X.XX

## Areas
(the focus area first, then the other four; one line each)
- <area> X | worst fault now (seconds, what you see) | path to 5: the one or two concrete changes that make it a 5 (where the camera is, what the bodies do, where the light falls)

## Checks
(the focus area's questions, one line each)
- <question in a few words>: yes | no (seconds, what you see)

## Faults
(worst first, at most 8; severity 3 = a viewer notices at once, 2 = noticed on a second look, 1 = polish)
- <area> | <seconds, like 2.3 or 2.0-2.5> | <severity> | what you see | the fix

## Last round
(only when a last round is given: one line per fault it listed)
- <fault in a few words>: fixed | better | same | worse
```

When the focus is sound, add `sound X` at the end of the Scores line, before the mean, and a `- sound` line in Areas.
Then end with one line: `done <mean>`.
