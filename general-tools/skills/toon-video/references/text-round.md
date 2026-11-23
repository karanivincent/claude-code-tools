# The text round (a trial, S5-128)

A way to choose a round's changes: the built clip is written out as text, text reviewers read the text, not the
pictures, and a reviser turns their notes into the change list. The builder builds exactly that list, and the blind
judge decides as in any round. It is a trial on the next film: use it for a scene's first people round and compare
its rounds with the loop's in `log.md`.

## What was measured (Epiclings, the dancing plague, scene s08, 23 November 2026)

| Test | Result |
|---|---|
| A scene designed from nothing in text and built once | Lost: 3.0 against 3.55 for the finished scene and for the rough one. The text was written without the set, its checks rewarded close-ups, and its writer overruled the reviewers |
| A built person and a built beat described in text and rebuilt from the text alone | Close: taps within one frame, all garments right. Lost: the camera's lens and distance, the kit's face names, head shapes |
| A built beat corrected in text, then patched | Won: 3.50 against 3.27, three judges, all three for it, the protected beat 3 of 3. World fell 0.33 (a nearer camera); likeness did not move |
| The same reviewers and reviser run lean, on three models | The same six faults and the same five changes at about a tenth of the tokens |

So: text carries a built shot, and correcting it in text made one good round. Text is not a way to design a shot from
nothing, and it does not raise likeness.

## The three things that made it work

1. The text describes something built. Positions, sizes and frames come from the clip and from the scene's code, not
   from a plan.
2. Agreement binds. A fault two reviewers name on their own is fixed, or the reviser says why it cannot be.
3. The frame's hard limits are written down before anyone reviews: where the captions and the app's buttons sit, what
   stays in frame, what cannot change. Reviewers ask for "bigger" numbers that put feet under the captions; the
   reviser turns those down against the limits.

## Running it

At the start of a round, on the scene's best clip (`$D` the loop folder, `$R` the new round):

```bash
python3 $L/textround.py $D/best/clip.mp4 $R --limits $D/limits.md --meaning $D/meaning.md --protect $D/protect.md \
  --facts $D/facts.md --words $D/words.json --window 3.0-5.8 --before "<what the viewer saw just before>" \
  [--reference <the reference's shot list.md>]
```

It takes about 12 minutes and about 0.6M tokens (the describer, who reads the frames, is about 0.35M of that; the six
text calls are about 0.2M). Run it from the main session as a background command and wait for it; a foreground command
times out at 10 minutes. `--dry-run` makes the frames and prompts and prints each command.

Then:

1. Copy `$R/text/changes.md` to `$R/changes.md`. The builder builds exactly that list, at most five changes, and
   nothing else (S5-41).
2. The builder proves the list's check table (its last section) by projecting to the screen with the story's
   tools, in `$R/match.md`, before any still is looked at.
3. Stills sheet, render, `jumps.sh`, `step.mjs bar` as in any round.
4. Judge first: `abjudge.sh`, then `look.sh` only when the judge would keep the round (as after a lost round, S5-46).
   A lost text round then costs the text round and one judge, and no reviewers.
5. `node step.mjs $D log build "text round: 7 calls, 570K tokens"` so the cost is in `log.md`.

Keep the window to one shot or one beat. A whole 10 s scene is too much text for a reviewer to hold; take the beat
`protect.md` names, or the seconds `best/faults.md` blames most.

## The files the lead writes

`limits.md`, once per film (the caption band and the app's buttons do not move between scenes), for example:

```
- The captions fill the band from y 0.667 to y 0.792 across the whole width (y is the share of the frame from the top),
  and the app's own text and buttons sit below that. The main figure's feet, any lifted foot and any marks at the feet
  stay above y 0.65.
- No head or raised hand above y 0.04. So a standing figure cannot be taller than about 0.58 of the frame.
- Cannot change: the narrator's words and their times; the cast and how people are drawn; the place; the shots before
  this one; the cut that ends the scene. No new cut.
```

`facts.md`, per clip, read from the scene's own code (a few lines; the builder can write it with the story's tools):
the camera's distance to the main figure, its lens and its height at each key; the frame of each hit or landing; the
kit's names for the faces and actions in use; anything a dial or a cycle sets. The description is written from the
frames and guesses at these: in the round trip it got the lens and the distance wrong and could not name a face.

## What it does, step by step

| Step | Who | Reads | Writes |
|---|---|---|---|
| Describe | one `claude -p` on Opus with the Read tool | labelled strips of the clip with a phone grid, and some full frames | `text/beat.md` (the facts on top) |
| Review | three lean calls on Sonnet, at once: a cold reader who is not told the intent, an acting critic, and with `--reference` a reference reader | `beat.md` (the cold reader gets it without its summary) | `text/notes-*.md` |
| Revise | one lean call on Opus | `beat.md`, the notes, the limits | `text/changes-1.md` |
| Check | one lean call on Sonnet | the first list against the limits and the notes | `text/check.md` |
| Revise again | one lean call on Opus | the first list and the check | `text/changes.md` |

"Lean" is `claude -p --tools "" --strict-mcp-config --system-prompt "<two lines>"` with the text pasted into the
prompt. A reviewer started as an agent from a desktop session carries that session's tools and instructions, about
110K tokens, on each call: three such reviewers cost 1.16M, the same as three with frames. Lean, each starts under
6K. Opus, Sonnet and Haiku all found the faults; Sonnet ranks them less well than Opus, and Haiku made mistakes a
reviser has to catch (a rule that does not exist, the main fault ranked low), so the reviewers are Sonnet and the
reviser Opus.

The check earns its place: on its first real run it caught a hop that put the head above the frame's limit, arm
frames that no longer matched the new foot frames, and a lift height the dance's dial could not give, all before a
line of code changed.

## What it does not do

- It does not design a shot. Start from a built clip.
- It does not see the look: a flat board, a ghosted dissolve, a wrong shadow. The judge and `look.sh` still do.
- It does not raise likeness. That is the places and the cast.
- It does not make the builder cheaper. A builder's round was 5.9M tokens in the test, more than everything else in
  the round together. Resume the same builder (X-4) and keep its reading small.
- One shot, one round, run once: the trial is there to find out whether it holds.

The briefs are in `scripts/loop/text/`; the write-ups of the four tests are in the Epiclings repo,
`docs/spikes/paper-film/`.
