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
2. Know the form (research, November 2026: `references/research-2026-11.md`, with sources).
   - **A 16:9 video** gets the full run and YouTube's Test & Compare (up to three cards; it picks by watch-time
     share, not clicks).
   - **A Short** cannot be A/B tested, and the Shorts feed plays the video, so the card never shows there. The
     package is the **first frame and the first line**: score those first (step 6). A custom card exists since
     24 July 2026 for Partner Program channels only; it shows on home, the channel page and search, cropped to about
     3:2. Check in Studio whether this channel has it. The Short's number to learn from is "viewed vs swiped away".
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
   each, two titles each. Give each the menu in `references/research-2026-11.md` section 1: Higgsfield's 16 concept
   frameworks (posed portrait, action shot, size difference, repetition, map, before/after...) and its emotion ladder
   (shock, hype, rage, awe, laugh, fear, smug...), MIT.
5. **Ten cards.** Merge duplicates; keep ten that differ in idea. Frame plain first and look, then add 0 to 4 big
   words (never the title's words, never on the face): caps in a heavy display face (Anton, Bebas Neue), a thick
   stroke drawn under the fill (`paint-order: stroke fill`), cap height 12 to 18% of the card. Keep the bottom-right
   corner empty (the length stamp). A Short's card: face and words inside the centre 3:2 band, exported at 2160x3840.
   Every card must read in under a second at 120 px wide.
6. **Click critics** (one message, background, Sonnet), each scoring all ten cards (and, for a Short, the first frame
   and first line) 1 to 5 on the rubric below, in two numbers: **Click** (would they tap) and **Deliver** (does the
   video pay it off in its first seconds, so they stay), because the test picks by watch time, not clicks:
   - **The scroller**: a target viewer persona (the channel's audience: country, age, phone), scrolling fast. Would
     they stop? What do they think it is in one second?
   - **The packaging strategist**: contrast at phone size, one subject, a face with a feeling, a question opened,
     the title and card working together, how it stands out next to the other videos on that topic.
   - **The honesty editor**: reads each card with the video's transcript and its shot list together (that setup found
     misleading thumbnails with 93.8% accuracy, arXiv 2607.23739). A card that promises what the video does not show
     is vetoed, whatever it scores. Facts on a card must be true.
7. **The shortlist.** The editor's veto first, then Click plus Deliver. Take the best card of each of the three best
   ideas, not the top three totals. Apply the cheap fixes, re-render, and make a **phone-feed mock**: each card at feed
   size (and at 120 px) with the length stamp and its title underneath, a Short's card shown in its 3:2 crop, beside
   two or three real thumbnails of similar videos. Send it to the owner with one question.
   Optional, trial on one story first: a polish pass on Higgsfield on the film's own frame (upscale, cut out and
   recompose, push one expression), never a fully generated card, which would break the look and the honesty rule;
   and a local saliency heatmap (DeepGaze) on the shortlist to check the eye lands on the face and the words (a sanity
   check only: no link to clicks is shown).
8. **The test decides** (16:9 only). Run the three cards (and titles) in Test & Compare and let YouTube finish (up to
   two weeks). Never unlist the video or turn it into a Short while it runs, and record no winner under about 1,000
   impressions per card: every Bible in Clay test so far ended early that way (two at 23 and 26 impressions), and
   nothing was learned. For a Short, set the critics' first pick and, after 7 days, log its viewed-vs-swiped share
   against the channel's median.
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
- **Bright cards** (Vincent, 10 November 2026: the posted jungle-holdout card "too dark, it should be much brighter").
  Every card is lit bright: average brightness at least 115 of 255 over the whole card and 100 over the 3:2 band,
  faces and the subject the brightest part. Light it at render, never brighten it afterwards: a stronger key light,
  lighter shade and lift, brighter pictures and fog, a lighter sky of the same time of day (the toon film template's
  `relight` prop, rendered with `tools/stills.mjs`). A curve or brightness slider on the finished image greys the
  night and the ink lines and was turned down. `tools/thumbs.py` prints both numbers and flags a dark card.
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
| A test stopped, unlisted or called under 1,000 impressions a card | Let it run; no winner before then |
| A card that wins the click but the video does not pay off | Score Deliver as well as Click |
| Words that only read at desktop size | Check every card at 120 px wide |
| A night or dusk card as dark as the film (jungle holdout: 64 of 255) | Re-light the same moment for the card; check the brightness numbers |
| Brightening the finished card with a curve | Light it at render: key, shade, pictures, sky |
| A calm face and a phrase that names nothing | A moment only this story has, and a face that shows a feeling |
| Adding words before the framing works | Plain frames first, then words |
| Moment times picked by eye | The critic's table or the story's shot list, each at its action word |
| Stopping the A/B test after a day | Let YouTube finish; record the result |
| A run that does not read the Results | The idea brief starts from what won before on that channel |
