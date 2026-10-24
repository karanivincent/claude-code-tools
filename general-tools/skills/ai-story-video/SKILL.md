---
name: ai-story-video
description: Make a short AI story video (an animated mini-film for social media) from a script to a finished, phone-checked 9:16 cut, cheapest stage first - character sheets, keyframes, an animatic with real voices and music, then full motion on Higgsfield through its Claude connector - and keep what each video teaches in the project's video memory file so the next one is quicker. Triggers - "make a story video", "an animated video like the last one", "the next video", "full motion", "animate the keyframes", "Higgsfield", "make it move", "AI short film", "how much will the video cost".
---

# AI story video

A story video is cheap to get wrong in stills and dear to get wrong in motion. So it goes in stages,
cheapest first, and the person sees each stage before money moves to the next. Every video also
leaves its lessons in one memory file, so the next one starts from what worked.

## First: read the video memory

The project keeps one file of everything learned so far: the person's taste, the look, the cast and
their saved character ids, the model and its cost, the budget, what went wrong last time. Find it
before anything else (in TeliTask's Marketing repo: `content/scripts/STORY-VIDEOS.md`; elsewhere,
search for `STORY-VIDEOS.md`). Its rules win over this skill where they differ. If there is none,
create it from `references/memory-template.md` and fill it in as you go.

## The stages

| Stage | What | Shown to the person |
|---|---|---|
| 1. Script | Beats with times, the words on screen, the sound, the twist, the last line | The script page |
| 2. Character sheets | One sheet per person: front, three-quarter, side, two close-ups, plain grey | The sheets |
| 3. Keyframes | One 9:16 still per beat, each made from the sheets of the people in it | The keyframes |
| 4. Animatic | Keyframes with slow camera moves, all text drawn in code, real voices, music, the ending | 45 s and 30 s cuts |
| 5. Motion test | One shot, image to video from its keyframe, on the chosen model | The clip and its cost |
| 6. All shots | The rest, without waiting, if the test held the look | - |
| 7. Motion cut | The animatic with each still swapped for its clip; same words, sound and ending | Both cuts |
| 8. Record | Credits per shot, what went wrong, the person's notes, into the memory file | - |

Stages 1-4 cost cents. Stages 5-7 are where the credits go, so never start 5 before 4 is approved.

## Keyframes decide the motion

Image to video keeps everything in the start frame, flaws included. Check every keyframe before any
motion, at full size:
- the same person looks the same in every shot (face, hair, clothes, helmet colour, props);
- no letters anywhere: signs, packets, screens, labels, the edges of the frame;
- the places say what the story needs at a glance (a search for a cake shows cake shops);
- props agree from shot to shot (candle count, box colour).
A flaw fixed in a still costs a few cents; the same flaw in motion costs a retake.

## Motion on Higgsfield

Connector details, the model choice and the costs are in `references/higgsfield.md`. In short:
1. `balance` first, then price the candidates with `get_cost: true`. Stay inside the video's budget
   from the memory file; never buy credits or upgrade.
2. Upload every keyframe once (presigned PUT, then `media_confirm`).
3. Test one emotional close-up on one or two models. Send the person the clip and its cost.
4. Submit the rest in one `generate_video_batch`. Make each clip at least as long as its longest use
   in any cut (5 s, 6 s for the long holds).
5. Review every take as an 8-frame contact sheet, then full-size frames at the doubtful moments.

### The prompt

One shot, one action, gentle and acting-led:

> A gentle, acting-led shot from a warm 3D animated feature film. <time and place>. <who does what,
> with one beat: eyes widen, a breath, a smile grows>. <small ambient motion: the bus sways, curtains
> move>. <slow camera move>. Keep their faces, skin, hair and clothes exactly as in the image, in the
> same soft stylised 3D animated look. No text, captions, subtitles, logos or watermark.

Put a timed action early ("blows out the candles in the first second", "pulls the shutter down
within two seconds") so it lands inside the part the cut uses.

### Retake or fix in the cut

Retake only when the face drifts, letters or a watermark appear and cannot be cropped, or the motion
breaks. Fix the rest in the cut, at no cost:
- letters at an edge: start the shot's framing closer in so the edge stays out of the picture;
- an action early or late: skip into the clip, or hold its first frame for a moment, so the action
  lands on its sound (find the moment by measuring brightness or movement frame by frame);
- a passing shadow or a lighting shift in a moving vehicle is life, not a fault.

## The cut

Keep the animatic's page and timeline; only the pictures change. Cut each kept take into frames at
the cut's frame rate, and have the page draw each shot from its clip's frame for that moment (wait
for the frame to decode before each screenshot). Give a shot its own framing or timing for the clip
where the clip's camera already moves. Then run the project's phone check on both cuts, the long one
with its 30 s cut beside it.

Send files over 30 MB to a phone as a smaller copy (H.264 at CRF 22 keeps it near-identical).

## Record, every time

In the video's brief: a table of shots with clip length, credits, takes and a note on each, the total
against the budget, and the cost in money (credits times the plan's price per credit). Then copy into
the memory file only what the next video should start from: the person's notes, the model's
behaviour, a quirk of the connector, a fix that worked. Keep it short; it is read at the start of
every video.

## Never

- Post anything. A finished cut goes through the project's own approval flow.
- Spend past the video's budget, buy credits or upgrade a plan without asking.
- Show a real shop, customer, price or amount, or a synthetic person presented as real.
