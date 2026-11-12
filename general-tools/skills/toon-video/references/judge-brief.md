# Judge brief (blind A/B)

`scripts/loop/abjudge.sh` fills the `{…}` fields and hands this brief to each judge: a fresh Opus, run in the
foreground in a folder that holds only the two clips' frames. The judge does not know which clip is older or which
one a builder made; the key stays outside its folder. It replies with text and writes no file. `abjudge.sh` reads
the JSON block at the end of the reply, so that form is fixed.

Built from the spikes' judge brief (spike 7). Neutral by design: no area is named as the one being worked on, unless
the loop asks for a lean with `--focus`.

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

{FOCUS_LINE}

Score each version 1 to 5 in each area: world, people, light, story, motion.
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
       "credit": ["..."], "blame": ["..."]},
 "better": "A", "by": "a hair"}
```

`better` is `A`, `B` or `same`; `by` is `a hair`, `clearly` or `by far`. Credit and blame name the differences between
the two, not faults both share. Give your honest pick in `better` even when the scores are equal.
