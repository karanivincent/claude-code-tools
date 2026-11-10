---
name: story-thumbnails
description: The one skill for thumbnails, titles and first frames, for every channel (Bible in Clay, Epiclings, any other) and every kind of video (clay, toon, AI video; Shorts and 16:9) - the package that makes people click. Frames of the story's strongest moments are rendered from the film's own code (or taken from the video), three idea agents propose ten cards with titles from different angles, three click critics score them on how likely a viewer is to tap, an honesty editor vetoes anything the video does not show, the owner sees a phone-feed shortlist, and YouTube's A/B test (where offered) picks the winner, then the result is recorded per channel. Each channel's own rules are in references/channels/. Triggers - "make the thumbnail", "thumbnail and title", "thumbnail for <story>", "will people click this", "the thumbnail is boring", "first frame", "A/B test the thumbnail", "what thumbnail won".
---

# Story thumbnails

The thumbnail, the title and (for a Short) the first frame are one package, judged in a second on a phone before
anyone watches. Vincent, 10 November 2026: "that is what is going to pull people to watch it. So it's not just about
what the video means, but how likely are people to click this." One skill for every channel and video (Vincent, the
same day: "one skill you can depend on"); it began as Bible in Clay's `clay-thumbnails` (27 October 2026).

**Channels.** Read the channel's file before anything: `references/channels/bible-in-clay.md`,
`references/channels/epiclings.md`. A new channel gets its own file on its first run (its project, where frames come
from, its honesty rules, its Studio access), and its own Results table in its project.

## First

1. Read the project's thumbnail notes and Results table if it has them (`docs/thumbnails/README.md`); start one if not.
   The angles that won before go into this run's idea brief.
2. Know the form. A 16:9 video gets the full run and an A/B test. A Short shows its **first frame** in the feed: score
   the opening second as the click-maker first (step 6), and make a card too, because it shows on the channel page and
   in search. YouTube's options for Shorts change: check in Studio at upload whether this Short takes a custom
   thumbnail, a chosen frame, or an A/B test, and say which.
3. The video is final, or close: cards come from the film's own code, so later changes would make them lie.

## The steps

1. **Frames from the film.** Render stills from the story's composition, at 1080x1920 for a Short and 1920x1080 for a
   16:9 card: toon stories with the toon-world film template's `tools/render.mjs --stills <dir> <times>`, clay stories
   with a `<Story>Frame` composition (the channel file), AI-video stories as frames pulled from the video with ffmpeg
   (no staging possible; pick the frame). A thumbnail-only
   staging may move the camera, change a pose or an expression, or push the light; it never adds a person or an event
   the video lacks.
2. **The moments menu.** The 15 to 25 strongest seconds, chosen from the critic's per-second table (its 4s and 5s)
   and the beat board, each at its action word. Render them plain, no words.
3. **The idea brief.** Every line with its time, what is shown and what is only said, the menu, the Results rows,
   the channel's audience, and the output format. Copy the shape from the project's last brief or Jericho's.
4. **Three idea agents** (one message, background, Sonnet), one angle each: spectacle (the one huge moment and its
   stakes), curiosity (a question only the video answers), face and emotion (one big face, one feeling). Four ideas
   each, two titles each.
5. **Ten cards.** Merge duplicates; keep ten that differ in idea. Frame plain first and look, then add 0 to 3 big
   words (never the title's words). Keep the bottom-right corner empty (the length stamp).
6. **Click critics** (one message, background, Sonnet), each scoring all ten cards (and, for a Short, the first frame)
   1 to 5 on the rubric below and predicting the click-through each card would get against the others:
   - **The scroller**: a target viewer persona (the channel's audience: country, age, phone), scrolling fast. Would
     they stop? What do they think it is in one second?
   - **The packaging strategist**: contrast at phone size, one subject, a face with a feeling, a question opened,
     the title and card working together, how it stands out next to the other videos on that topic.
   - **The honesty editor**: every card and title against the video. A card that promises what the video does not
     show is vetoed, whatever it scores. Facts on a card must be true.
7. **The shortlist.** The editor's veto first, then the totals. Take the best card of each of the three best ideas,
   not the top three totals. Apply the cheap fixes, re-render, and make a **phone-feed mock**: each card at feed size
   with the length stamp and its title underneath, beside two or three real thumbnails of similar videos. Send it to
   the owner with one question.
8. **The test decides.** Where Studio offers A/B testing, run the three cards (and titles) and let YouTube finish
   (it picks by watch time; up to two weeks). Never stop it early. Otherwise set the critics' first pick.
9. **Learn.** Record the winner, its share, the critics' prediction and the angle in the Results table, and log the
   run in `docs/production-log.jsonl` (stage `review`, step "thumbnails"). After three results, change the idea brief
   or the rubric's weights to match what wins.

## The rubric (1 to 5 each)

| Part | 5 means |
|---|---|
| Stop | You stop scrolling: one bold subject, high contrast, readable at 160 px wide |
| Feeling | A face (or a body) showing one strong feeling |
| Question | It opens a question only the video answers |
| Words | 0 to 3 words that add what the picture cannot, big and clear |
| Title fit | Card and title together say more than either; title under 50 characters, the subject in the first words |
| Honest | Everything on it is in the video and true (a 1 here is a veto) |
| Distinct | It does not look like every other video on the topic |
| First frame (Shorts) | The opening second already hooks: motion, a face, a strange true thing, a word card |

## Rules for every channel

- The thumbnail's moment is in the video. A thumbnail-only staging may move the camera or change a pose or an
  expression of something the video shows; it never adds a person or an event the video lacks.
- A card need not be a frame of the video ("it can be modified a little", 27 October 2026): stage it so the picture
  says the idea at a glance (people rearranged so all show, one stepped forward, the fire hotter, less glare).
- The picture proves the words: a card that counts something shows every one counted.
- Zero to three words on the card, never the title's words. Titles under 50 characters, the subject in the first
  words.
- When the owner turns cards down, his note is usually about the picture: restage, render, send a fresh mock. He may
  keep one new card and two earlier ones.
- Cost: six Sonnet agents a run, at most three at once; frames are stills, minutes not credits.

## Common mistakes

| Mistake | Instead |
|---|---|
| A thumbnail that explains the story | One moment and one question |
| Many small figures | One big subject, cropped in |
| The title's words on the card | Different words, or none |
| A card promising a scene the video lacks | Pick from the menu; stage only what the video shows |
| Choosing by the critics' total alone | The owner's shortlist, then the A/B test |
| A Short judged only by its card | The first frame first: that is what the feed shows |
| A calm face and a phrase that names nothing | A moment only this story has, and a face that shows a feeling |
| Adding words before the framing works | Plain frames first, then words |
| Moment times picked by eye | The critic's table or the story's shot list, each at its action word |
| Stopping the A/B test after a day | Let YouTube finish; record the result |
| A run that does not read the Results | The idea brief starts from what won before on that channel |
