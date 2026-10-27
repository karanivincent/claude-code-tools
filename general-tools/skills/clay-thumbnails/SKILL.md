---
name: clay-thumbnails
description: Use when a Bible in Clay story needs its thumbnail and title, when Vincent finds a thumbnail dull, or when an A/B test result comes in. Renders the story's moments in clay, has three idea agents propose ten thumbnails with titles, three critic agents score them on a researched rubric, shows Vincent a shortlist, and lets YouTube's A/B Testing pick the winner, then records what won so the next run starts smarter. Triggers - "thumbnail for <story>", "make thumbnails", "the thumbnail is boring", "title and thumbnail", "A/B test the thumbnail", "what thumbnail won". For making the story video itself, use clay-story-video.
---

# Clay thumbnails

The thumbnail and the title are one package, decided before anyone clicks. This skill makes many,
judges them with agents, and lets YouTube's own A/B test choose. Vincent asked for it on 27 October
2026 after rejecting a thumbnail that named no moment ("NOT ONE WORD"), and wants to see the
shortlist for now. The decision is the A/B test's, not the agents'.

The project, `/Users/vince/Projects/bible-shorts`, holds the how: `docs/thumbnails/README.md` (the
process, the tools, the results so far) and `docs/thumbnails/RESEARCH.md` (the rules and the 8-part
rubric, with sources). Jericho's run, `stories/jericho/thumbs/`, is the worked example: copy its
briefs.

## First

1. Read `docs/thumbnails/README.md` in full, its Results table above all: the angles that won before
   go into this run's idea brief. Then `RESEARCH.md`.
2. Know the form. A 16:9 video gets the full run and an A/B test. A Short shows its first frame in
   the feed, not a thumbnail, and YouTube has no A/B test for Shorts. So for a Short, score frame 0
   against the rubric, and make a card only for search and the channel page if Vincent asks.
3. Work on the story's branch, in its worktree. Thumbnail-only scenes go in the story's `shots.ts`.

## The steps

1. **A frame composition.** Give the story a `<Story>Frame` composition, copying `JerichoFrame`:
   `Scene` takes `at` (a time in the video), `cam` (`pos`, `look`, `fov`) and `shot` (a
   thumbnail-only shot). Register it at 1920x1080 and leave the captions off.
2. **The moments menu.** List the story's 15 to 25 strongest moments with their times from the
   contact sheet, write `stories/<story>/moments.json` (frames, and one card each with no words),
   and run `node scripts/thumbs.mjs --story <story> --spec moments.json --out moments`.
3. **The idea brief.** Write `stories/<story>/thumbs/IDEA-BRIEF.md` from Jericho's. It holds every
   line with its time, what is shown and what is only said, the menu, what a card can do, the Results
   rows, and the output format. A thumbnail may never promise a scene the video does not show.
4. **Three idea agents**, in one message, in the background, on Sonnet. Each takes one angle:
   spectacle (the one huge moment and its stakes), curiosity (a question only the video answers),
   and face and emotion (one big face, one feeling). Each writes four ideas with two titles each to
   `stories/<story>/thumbs/<angle>.json`. Give each a persona, the brief's path, and nothing more.
5. **Ten cards.** Merge ideas that are the same, and keep ten that differ in idea. Write
   `stories/<story>/thumbs.json`. Frame the camera moves and stagings first, as plain frames (a spec
   with no words, `--out test`), and look before adding words: the first try is usually wrong. Then
   run `node scripts/thumbs.mjs --story <story>`. Keep the bottom-right corner empty, because
   YouTube prints the length there.
6. **Three critics**, in one message, in the background, on Sonnet: a packaging strategist, the target
   viewer (a persona built from Studio's audience: country, age, phone), and the story editor, who
   checks every card and title against the video and the BSB text. Write
   `stories/<story>/thumbs/CRITIC-BRIEF.md` and `pairs.json` (each card's words, idea and titles) from
   Jericho's. Each critic scores all ten on the rubric and returns a top three with a title and a fix.
7. **The shortlist.** Add the three totals. The editor's honesty veto wins over any total. Take the
   top three, apply the cheap fixes, re-render, and make a phone-feed mock (each card with the length
   stamp and its title underneath). Send it with `SendUserFile` and end with one question.
8. **The A/B test decides.** Once the video is live, open it in YouTube Studio (Claude in Chrome, the
   profile signed in to the Bible in Clay channel). Under Details, beside the thumbnail, click
   **A/B Testing**, add the three cards (and titles, if Studio offers them), and start it. It needs
   the channel's one-time verification ("advanced features"). Until Vincent has done that, set the
   critics' first pick as the thumbnail. YouTube picks by watch time and can take two weeks. Never
   stop a test early or swap a thumbnail by hand while it runs.
9. **Learn.** When the test ends, write a row in the Results table: the winner, its share of watch
   time, the critics' prediction, and the angle. After three or more results, say which angle keeps
   winning, and change the idea brief or the rubric's weight to match. Add the run's lessons under
   "What the runs taught".

## Rules

- The thumbnail's moment is in the video. A thumbnail-only scene may move the camera or change a pose
  or an expression of something the video shows. It never adds a person or an event the video lacks.
- Words and titles say only what the Berean text says. A detail the video stages but the text does
  not state (Rahab's stretch of wall standing) is never written as fact.
- Zero to three words on the card, never the title's words. Titles under 50 characters, with the
  person or God in the first three words.
- Clay faces: a moustache hides an open mouth, so a shout or a scream needs a face without one. Brows
  carry worry and anger well.
- Small figures and pale dust disappear at phone size: lift the colour, crop in, or drop the card.
- Cost: six Sonnet agents a run, at most three at once. Frames are stills of a few seconds each, so
  rendering ten cards costs minutes, not credits.

## Common mistakes

| Mistake | Instead |
|---|---|
| A calm face and a phrase that names nothing | A moment only this story has, and a face that shows a feeling |
| Promising a scene the video does not show | Pick from the menu, or stage only what the video shows |
| Adding words before the framing works | Plain frames first, then words |
| The critics' total as the final answer | The A/B test decides; the critics only shortlist |
| A staged scene that scored highest | Use it only if the video shows that moment |
| Stopping the A/B test after a day | Let YouTube finish; record the result |
| A run that does not read the Results | The idea brief starts from what won before |
