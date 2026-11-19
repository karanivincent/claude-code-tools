# Judge brief (blind A/B)

`scripts/loop/abjudge.sh` fills the `{…}` fields and hands this brief to each judge: a fresh Sonnet by default
(S5-101; `--model opus` for a second opinion), run in the foreground in a folder that holds only the two clips'
frames, the scene's reference frame and, when given, the reference clip R and the stills S. The judge does not know
which clip is older or which one a builder made; the key stays outside its folder. It replies with text and writes no
file. `abjudge.sh` reads the JSON block at the end of the reply (`_verdict.py`), so that form is fixed; replies
without the newer fields (likeness, rows, unnamed, protected) still read.

The look since 18 November 2026 is a rendered world behind drawn people (toon-world, "A rendered world behind drawn
people"; the world rows W1 to W7 and the likeness number in `bar.md`). The judge scores the world rows and the
likeness to the scene's reference frame (S2-37). It no longer rewards low sun, strong colour or ground clutter for
their own sake: those drew the picture away from the rules while every blind A/B passed (audit, 18 Nov 2026). A
correct dark night lit by lamps in frame is not a fault (S3-205, S3-220).

One stop rule for every pass (`scripts/loop/README.md`, "When a pass stops"): 4 on the 1 to 5 scale and likeness 7
against the reference frame, or two rounds in a row with no win, or six rounds. A round that weakens a protected beat
(X-20) loses, whatever its average. The builder is the same agent each round, resumed with SendMessage (X-4); the
judge is fresh each round.

Built from the spikes' judge brief (spike 7), with Vincent's own criteria (S5-94) and standing notes (S5-122). Judges
see 6 frames a second on the sheets and every frame round each hit and protected beat (S5-95, X-23). The judge is a
stand-in for Vincent: his own pick outranks any judge, and the lead logs each judge pick that differs from his in
`stories/<slug>/judge-vs-owner.md`, with the model (S5-96). Neutral by design: no area is named as the one being worked
on, unless the loop asks for a lean with `--focus`. With `--ref`, `{REF_BLOCK}` adds a third clip, R: an earlier good
build of the same beat (S5-112), and `{REF_JSON}` adds its scores to the JSON block. Without it both fields are empty.
R is cut like A and B: captions on all three or on none (S5-125). On 19 November 2026 a captioned R beat two
uncaptioned trials on its captions alone, so both "against the last cut" results were worthless.

---

Two versions, A and B, of the same scene of a cartoon video: a phone video of flat, drawn cartoon people (cards with
an outline) standing in a rendered 3D world (real materials, smooth light, soft shadows, no drawn lines on the world).
You do not know which is older; judge each on what you see. Captions, one word at a time, are wanted, not faults.

What the scene must say:

{MEANING}

Read only the files in this folder.

{FRAME_BLOCK}

For each of A and B, open in order:
- every `<X>/sheet-*.jpg`: 6 frames a second, 30 tiles a sheet, clip time and frame number at each tile's top left.
  Judge camera moves and pacing here: a move is a snap only if it jumps between two neighbouring tiles.
- every file in `<X>/full/` (`ls` it first): one frame every 0.5 s and the last frame, time in the name. Judge look,
  faces, contact and framing here.
- every file in `<X>/strips/`, when there is one (`ls` it first): EVERY frame round each hit and protected beat.
  Judge hits, landings, taps and the protected beats here, frame by frame.
You may open single tiles in `<X>/f6/` to check a move.

{REF_BLOCK}

{FOCUS_LINE}

{PROTECT_BLOCK}

Judge as the owner does. He looks first at:
- the camera angle: chosen for drama, the hero big (a third of the frame or more on its key moments) and kept in frame;
- spectacle: something happening behind the hero (other planes, vehicles, people working, flags, dust);
- effects: water, dust, fire and smoke that land well and are not too fast; check them on the strips;
- small details in background people;
- light from the place, at the reference frame's palette and level. A dark night lit by lamps you can see, the floor
  warm round the lamp and cool away from it, nothing pure black, faces still readable, is right and is not a fault
  (S3-205, S3-219, S3-220). A night as bright as day is a fault. Colour pushed past the reference, or a low sun the
  place does not have, is not a gain;
- material and structure in the ground and the background, with soft shadows and contact. Loose litter scattered for
  its own sake is a fault, not detail.
Count these in world (background, materials, life behind the hero), light (the source, shadows, the level against the
reference frame), motion (effects, camera) and story (the hero big and readable).

Then the world rows (`bar.md`), for each of A and B, pass or fail on its frames:
- W1 no drawn line on a wall, floor, land, prop or piece of furniture (people keep their outline) (S3-213);
- W2 on three frames, six surfaces show what they are made of (S3-214);
- W3 light fades smoothly across each surface, no hard band between two flat tones (S3-218);
- W4 each shadow edge soft, things darker where they meet the floor or each other (S3-221);
- W5 the people crisper and flatter than anything round them, standing on the floor (S3-223, S3-226);
- W6 each wide shows a lit far view, floor that leads in, props at three depths, sky and ground both (S3-229, S3-230);
- W7 the hero about a third of the frame where the place reads, about half for acting; hard cuts inside the place;
  a calm picture (S3-241, S3-201).
A failed row costs that clip in its area (W1, W2, W6 world; W3, W4 light; W5 people; W7 story).

And whether a first-time viewer can tell what it is (the owner's notes, S4-13): for each of A and B, name each main
thing on screen (each person, each prop the action uses, each sign or written word, the place, the event). A thing you
cannot name from the frames is a fault in story; list it under `unnamed`. Every word on screen reads in English.

Score each version 1 to 5 in each area: world, people, light, story, motion. Give each version one likeness number
from 1 to 10 against the reference frame: 1 nothing alike; 4 the same kind of place, a different look; 7 a viewer would
take the two for the same film; 10 indistinguishable in look. Judge the world, light and people, not the subject. If
the folder S/ holds reference stills, open every one and use them for detail; the likeness number is still against
the frame. Without a reference frame write `"likeness": null`.

## Vincent's standing notes (S5-122)

He has given these notes on round after round; check them yourself, each round, without being asked:
- Detail on every object the story turns on: rivets, bolts, panel lines, labels, wear. A hero object that is a flat
  shape is a fault, however good the rest of the frame.
- Dense, real places near the lens: materials, tools, structure and purposeful things where people work; nothing bare.
  A swept apron, a working floor stays clean (Vincent, 14 Nov 2026, on litter: "too dirty ... overdone").
- Things moving behind the hero: people working, vehicles, birds, flags, smoke.
- Effects that read as real: fire in many flickering tongues with smoke and glow, dust, sparks; never a flat blob.
- Natural colour at the reference frame's level: no purple or dreamlike haze unless the story asks for it, and no
  colour pushed for its own sake.
- Sharp backgrounds and a hero big enough to read on a phone.

Scale: 1 broken (wrong, unreadable, laughable); 2 weak (reads but flat, frozen or confusing); 3 fine (clear and
correct, forgettable); 4 good (alive, reads on a phone, lands); 5 great (you would stop scrolling for it). Whole or
half points. Do not round up.

Reply with text, in this order:

1. `## Images opened`: every path.
2. `## A`: its scores and likeness, its failed world rows, anything you could not name, then its five worst faults
   (seconds, what you see).
3. `## B`: the same.
4. `## Protected beats`: for each beat named above, which clip plays it better, from its strips.
5. `## Which is better`: by how much and why, in three to five lines; which faults one has and the other does not.
6. Last, one fenced JSON block, exactly this shape:

```json
{"A": {"world": 3, "people": 3, "light": 4, "story": 3, "motion": 3, "likeness": 5,
       "rows": {"W1": "pass", "W2": "fail", "W3": "pass", "W4": "pass", "W5": "pass", "W6": "fail", "W7": "pass"},
       "unnamed": ["what you could not name, with seconds"],
       "credit": ["what works in A that B lacks, with seconds"],
       "blame": ["what is worse in A than in B, with seconds"]},
 "B": {"world": 3, "people": 3, "light": 4, "story": 3, "motion": 3, "likeness": 5,
       "rows": {"W1": "pass", "W2": "pass", "W3": "pass", "W4": "pass", "W5": "pass", "W6": "fail", "W7": "pass"},
       "unnamed": [], "credit": ["..."], "blame": ["..."]},{REF_JSON}{PROTECT_JSON}
 "better": "A", "by": "a hair"}
```

`better` is `A`, `B` or `same`; `by` is `a hair`, `clearly` or `by far`. Credit and blame name the differences between
the two, not faults both share. Give your honest pick in `better` even when the scores are equal. A clip that plays a
protected beat worse does not get `better`, whatever its other scores.
