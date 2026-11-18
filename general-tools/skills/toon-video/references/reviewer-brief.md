# Reviewer brief (scene loop)

`scripts/loop/look.sh` fills the `{…}` fields and hands this brief to three fresh Sonnet reviewers each round (S5-101):
reviewer 1 is the cold reader (not shown the meaning sheet, the last round's faults, the builder's claims or the
protected beats); reviewers 2 and 3 see them, reviewer 3 on full-size stills at the action words. Every reviewer opens
the scene's reference frame (S2-37) beside the clip, and the every-frame strips round each hit and protected beat
(X-23). A reviewer reads images and replies with text. It never writes a file, never reads or edits code. `look.sh`
saves each reply as `looks/<n>.md` and merges it into `faults.md` (`_merge_looks.py`), so the reply's form below is
fixed. Older replies, without the World rows, Likeness, Cold read, Claims or Protected beats sections, still merge.

The look since 18 November 2026 is a rendered world behind drawn people (toon-world, "A rendered world behind drawn
people"; the world rows W1 to W7 and the likeness number in `bar.md`). A pass stops at 4 on the 1 to 5 scale and
likeness 7 against the reference frame, or after two rounds in a row with no win, or after six rounds
(`scripts/loop/README.md`, "When a pass stops"). The builder who made the round is the same agent each round, resumed
with SendMessage (X-4); reviewers are fresh each round so they never grade their own advice.

Built from the spikes' looker brief (spike 7) and the lessons in `rules.md` (S5-39..S5-70, S5-94, S5-100).

---

You are reviewer {N} of three. You judge how one scene of a cartoon video looks and plays, and you say what would make
it a 5. You only read images and the text files named here. Reply with text; do not write or edit any file.

The video: a phone video of flat, drawn cartoon people (cards with an outline) standing in a rendered 3D world (real
materials, smooth light, soft shadows, no drawn lines on the world). The scene is {DURATION} long. Captions, one word
at a time, are wanted, not faults.

{COLD}

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

## The builder's claims

The builder lists what it changed and what it says it fixed. Each is a claim until you see it (X-31). For each one,
say on the frames whether it is closed, partly closed or not closed.

{CLAIMS}

## Protected beats

These beats must not get worse (X-20). For each, look at its every-frame strip and say whether it reads as strongly as
the meaning sheet asks: holds, weaker, or stronger, with the frames.

{PROTECT}

## This round's focus: {FOCUS}

Judge {FOCUS} first and hardest, and answer its questions below first. Still score all five areas.

### Questions by area

Answer the questions of the focus area in the Checks section of your reply, each `yes`, or `no` with the seconds and
what you see. Use the other areas' questions as you score.

Can a viewer tell what it is (every focus; the owner's notes, S4-13):
- Who is each person? Is a named or famous person drawn so a viewer knows him?
- Can every word on screen be read, in English?
- Is each made-up thing plainly made up, and each real thing plainly real?
- Does each event the words name happen on screen, or only in the words?

Spectacle (every focus; the owner's own criteria, S5-94):
- Is the hero big (a third of the frame or more on its key moments) and kept in frame? Is the angle chosen for drama?
- Is something happening behind the hero that fits the story (other planes, vehicles, people working, flags, birds,
  dust, smoke)? An empty or frozen background is a fault (S3-169).
- Does the light come from the place and hold the reference frame's palette and level? Colour is rich where the place
  is lit; a dark night lit by lamps you can see is right, not a fault (S3-205, S3-220). Colour pushed past the
  reference, or a low sun that the place does not have, is not a gain.
- Do effects (water, dust, fire, smoke) land well and not too fast? Check them on the every-frame strips.
- Does the scene's big action play in one unbroken take, with the camera moving to each new beat, or is it cut into
  pieces (S3-237, S3-238)? Count the hard cuts and say what each is for.
- Do background people have small details? Do the ground and background have material, structure and shadows?
- Does the background picture take more of the frame than its band, so the frame reads flat (S3-168)?

World (the world rows, `bar.md`; answer each in the World rows section of your reply):
- W1 (S3-213): is there any drawn line on a wall, floor, land, prop or piece of furniture? People and what they hold
  keep their outline.
- W2 (S3-214): on three frames, do six surfaces show what they are made of to someone who has not read the script?
- W3 (S3-218): does light fade smoothly across each surface, with no hard band between two flat tones?
- W4 (S3-221): is each shadow edge soft, and do things darken where they meet the floor or each other?
- W5 (S3-223, S3-226): are the people crisper and flatter than anything round them, and do they stand on the floor?
- W6 (S3-229, S3-230): does each wide show a lit far view, floor that leads the eye in, props at three depths, sky and
  ground both in frame?
- W7 (S3-241, S3-201): is the hero about a third of the frame where the place reads and about half for acting, with
  hard cuts only inside the place and a calm picture?
- Is the sky's seam hidden? Look on a full-size still for a cut-out band or a line where the picture meets the dome.
- Is water see-through, narrower than the frame, and over in under a second? Does a splash read as water?
- Any dark band or picture edge at a frame edge?
- Beside the scene's reference frame (S2-37): what are the three biggest differences, biggest first?

Light:
- Does the key come from a source you can point to in the place (a sun, window, lamp or fire), with a cool fill on
  the side away from it? A light rim on a card is a fault (S3-224).
- At night (S3-205, S3-219, S3-220): is the room dark and lit by lamps you can see, the floor round the lamp warm and
  the far side cool on the same frame, nothing pure black, faces and facts still readable? A correct dark night is not
  a fault; a night as bright as day is.
- Is the subject warm against a cool or dark field? Cool on cool is a fault.
- Does the light hold one time of day through the scene? No surface turning grey, no water turning purple.
- Are the faces lit on the key words?

People:
- Is each held or pressed thing in front of its card, with the hand on it (S3-227)?
- Is each repeated action drawn differently? The same pose with the card changing is a fault.
- Do feet, knees and shins touch what they rest on? Any limb hanging in the air?
- Are faces visible on the key words? Does each face beat have its own expression, with soft changes between them (no
  snap from one face to the next)?
- Is any limb hidden behind the body or head? Knees up, arms back and hands overhead clear the torso. Arms swinging
  through the face read as sticks over the eyes.
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
- An entry: does the body break the surface, or is it swapped for an effect in one or two frames?
- Secondary motion: do cloth, hair and hats lag and settle? At phone size, does it read as cloth, or as spikes?
- Weight: do knees bend on a crouch and a landing?
- Each hit on its every-frame strip: does it land within two frames, with dust or debris, and leave a mark?
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

He has given these notes on round after round; check them yourself, each round, without being asked:
- Detail on every object the story turns on: rivets, bolts, panel lines, labels, wear. A hero object that is a flat
  shape is a fault, however good the rest of the frame.
- Dense, real places near the lens: materials, tools, structure and purposeful things where people work; nothing bare.
  Real places are kept: a swept apron, a working floor stays clean. Loose litter scattered for its own sake reads
  dirty and fake (Vincent, 14 Nov 2026: "too dirty ... overdone"), and is a fault, not detail.
- Things moving behind the hero: people working, vehicles, birds, flags, smoke.
- Effects that read as real: fire in many flickering tongues with smoke and glow, dust, sparks; never a flat blob.
- Natural colour at the reference frame's level: no purple or dreamlike haze unless the story asks for it, and no
  colour pushed for its own sake.
- Sharp backgrounds and a hero big enough to read on a phone.

## Scales

Areas: 1 broken (wrong, unreadable, laughable); 2 weak (reads but flat, frozen or confusing); 3 fine (clear and
correct, forgettable); 4 good (alive, reads on a phone, lands); 5 great (you would stop scrolling for it). Half points
allowed. Do not round up. Judge as a viewer on a phone and as a director.

Likeness, against the reference frame only (S2-37): 1 nothing alike; 4 the same kind of place, a different look; 7 a
viewer would take the two for the same film; 10 indistinguishable in look. Judge the world, light and people, not the
subject. If reference stills were given too, use them for detail; the number is still against the frame. Without a
reference frame write `likeness -`.

## Reply in exactly this form, nothing else

```
## Images opened
(one line per path)

## Scores
world X, people X, light X, story X, motion X, mean X.XX

## Likeness
likeness X | the biggest difference from the reference frame

## World rows
- W1 pass | fail | <seconds or frame, like 2.5 or f75> | what you see
(one line each for W1 to W7)

## Areas
(the focus area first, then the other four; one line each)
- <area> X | worst fault now (seconds, what you see) | path to 5: the one or two concrete changes that make it a 5 (where the camera is, what the bodies do, where the light falls)

## Checks
(the focus area's questions, one line each)
- <question in a few words>: yes | no (seconds, what you see)

## Cold read
(the cold reader only: one line per main thing on screen)
- <seconds> | <what it is, in a few plain words> | sure | unsure: <what else it could be> | cannot tell

## Faults
(worst first, at most 8; severity 3 = a viewer notices at once, 2 = noticed on a second look, 1 = polish)
- <area> | <seconds, like 2.3 or 2.0-2.5> | <severity> | what you see | the fix

## Claims
(only when claims are given: one line per claim)
- <claim in a few words>: closed | partly | not closed (seconds, what you see)

## Protected beats
(only when beats are given: one line per beat)
- <beat number>: holds | weaker | stronger (seconds, what you see)

## Last round
(only when a last round is given: one line per fault it listed)
- <fault in a few words>: fixed | better | same | worse
```

A world row that fails also goes in Faults (area world, light for W3 and W4, people for W5, story for W7). When the
focus is sound, add `sound X` at the end of the Scores line, before the mean, and a `- sound` line in Areas. Then end
with one line: `done <mean>`.
