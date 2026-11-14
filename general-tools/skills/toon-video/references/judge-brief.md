# Judge brief (blind A/B)

`scripts/loop/abjudge.sh` fills the `{…}` fields and hands this brief to each judge: a fresh Opus, run in the
foreground in a folder that holds only the two clips' frames. The judge does not know which clip is older or which
one a builder made; the key stays outside its folder. It replies with text and writes no file. `abjudge.sh` reads
the JSON block at the end of the reply, so that form is fixed.

Built from the spikes' judge brief (spike 7), with Vincent's own criteria added after the B-17 proof test (S5-94).
Judges see 6 frames a second on the sheets, so effects and their timing count (S5-95). The judge is a stand-in for
Vincent: his own pick outranks any judge, and the lead logs each judge pick that differs from his in
`stories/<slug>/judge-vs-owner.md`, with the model (Opus or Sonnet), since Opus judges have picked against him where
Sonnet judges matched him (S5-96). Neutral by design: no area is named as the one being worked on, unless
the loop asks for a lean with `--focus`. With `--ref`, `{REF_BLOCK}` adds a third clip, R: an earlier good build of the
same beat (S5-77), and `{REF_JSON}` adds its scores to the JSON block. Without it both fields are empty.

---

Two versions, A and B, of the same scene of a cartoon video (a phone video in a drawn 2D toon look: flat round
cartoon people as cards in a 3D world). You do not know which is older; judge each on what you see. Captions, one word
at a time, are wanted, not faults.

What the scene must say:

{MEANING}

Read only the files in this folder. For each of A and B, open in order:
- every `<X>/sheet-*.jpg`: 6 frames a second, 30 tiles a sheet, clip time and frame number at each tile's top left.
  Judge motion and snaps here: a move is a snap only if it jumps between two neighbouring tiles.
- every file in `<X>/full/` (`ls` it first): one frame every 0.5 s and the last frame, time in the name. Judge look,
  faces, contact and framing here.
You may open single tiles in `<X>/f6/` to check a move.

{REF_BLOCK}

{FOCUS_LINE}

Judge as the owner does. He looks first at:
- the camera angle: chosen for drama, the hero big (a third of the frame or more on its key moments) and kept in frame;
- spectacle: is the hero big, is something happening behind it (other planes, vehicles, people, flags, dust), does the
  light make rich colour (low sun, long shadows), or is it flat midday;
- effects: water, dust, fire and smoke that land well and are not too fast; check them on the 6 fps sheets;
- small details in background people;
- strong colour;
- detail in the ground and the background (rocks, grass, litter), and shadows.
Count these in world (background, detail, life behind the hero), light (colour, shadows), motion (effects, camera)
and story (the hero big and readable).

Score each version 1 to 5 in each area: world, people, light, story, motion.

## Vincent's standing notes (S5-100)

He has given these notes on round after round; check every one yourself, each round, without being asked:
- Detail on every object the story turns on: rivets, bolts, panel lines, labels, wear. A hero object that is a flat
  shape is a fault, however good the rest of the frame.
- Dense ground and props near the lens: grass blades, stones, tools, cables; nothing bare.
- Things moving behind the hero: people working, vehicles, birds, flags, smoke.
- Effects that read as real: fire in many flickering tongues with smoke and glow, dust, sparks; never a flat blob.
- Natural, strong colour: no purple or dreamlike haze unless the story asks for it.
- Sharp backgrounds and a hero big enough to read on a phone.
If the folder S/ holds reference stills, also give each clip one number for how close it comes to them overall:
1 nowhere near, 3 halfway, 5 matches them. Put it in your notes as "stills: A x, B y". A clip that wins but scores 3
or under against S is still far: say what is furthest from S.

Scale: 1 broken (wrong, unreadable, laughable); 2 weak (reads but flat, frozen or confusing); 3 fine (clear and
correct, forgettable); 4 good (alive, reads on a phone, lands); 5 great (you would stop scrolling for it). Whole or
half points. Do not round up.

Reply with text, in this order:

1. `## Images opened`: every path.
2. `## A`: its scores, then its five worst faults (seconds, what you see).
3. `## B`: the same.
4. `## Which is better`: by how much and why, in three to five lines; which faults one has and the other does not.
5. Last, one fenced JSON block, exactly this shape:

```json
{"A": {"world": 3, "people": 3, "light": 4, "story": 3, "motion": 3,
       "credit": ["what works in A that B lacks, with seconds"],
       "blame": ["what is worse in A than in B, with seconds"]},
 "B": {"world": 3, "people": 3, "light": 4, "story": 3, "motion": 3,
       "credit": ["..."], "blame": ["..."]},{REF_JSON}
 "better": "A", "by": "a hair"}
```

`better` is `A`, `B` or `same`; `by` is `a hair`, `clearly` or `by far`. Credit and blame name the differences between
the two, not faults both share. Give your honest pick in `better` even when the scores are equal.
