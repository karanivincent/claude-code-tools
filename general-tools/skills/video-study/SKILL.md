---
name: video-study
description: Use when Vincent shares a reference video (a YouTube Short, often Ricks Clips) and wants it analysed frame by frame - every shot, colour, light, effect, camera move, face, hand and walk, what is 3D and what is flat - and an answer to "could we make this with our skills, and how?". Prepares the frames, sheets, transcript and measures with one script, splits every frame across four analysis agents with a fixed brief, then writes a verdict page with a scene-by-scene build plan against the toon kit. Triggers - "analyse this video", "study this Short", "frame by frame", "can we make this", "what are we missing", "how would we make this", a YouTube Shorts link with a question about making it.
---

# Video study (frame by frame, against our kit)

Built on 8 November 2026 from the railroads and dashcam studies of Ricks Clips Shorts. The study answers one
question: could our toon skills make this video, and if not, what is missing? It does not copy the video; copying is
`toon-replicate`, and making our own is `toon-video`.

## Steps

1. **Prepare** (no tokens, a few minutes):
   `python3 <skill>/scripts/prepare.py <url-or-mp4> <project>/out/study/<video-id>`
   It downloads the video, writes every frame small, full-size frames twice a second, labelled sheets of 15 frames,
   a whisper transcript (timing only), `measures.json` (pace, hard cuts, stillness, sharpness, fine edges, saturation,
   brightness, loudness), `parts.json` (four ranges of sheets) and `glance.jpg`. Use a Python with numpy, scipy and
   Pillow. Look at `glance.jpg` yourself and say in one line what kind of video it is.
2. **Analyse every frame.** Say the cost first: four Opus agents, about 1.1M tokens. Send each part from
   `parts.json` to one general-purpose Opus agent with `references/agent-brief.md`, its fields filled (the installed
   skills path is `~/.claude/plugins/cache/vince-tools-marketplace/general-tools/<version>/skills`). All four in one
   message. Each writes `analysis/partN.md`: shot list, meaning per beat, colour, light, effects, camera, people,
   vehicles and props, quality, what is 3D, our kit against it, and the five hardest things.
3. **Verdict.** Read the four reports (not just their summaries) and the measures. Check two or three of their
   claims yourself on the frames. Then publish one private Artifact page:
   - the answer first: could we make it today (yes, mostly, or not yet), in two or three sentences;
   - `glance.jpg` and a key-moments strip;
   - its measures beside our latest copy's (the railroads round 4 numbers are in `toon-world` section 4);
   - a scene-by-scene build plan: for each scene the look (picture room, game world, flat 2D place, drawn in code,
     from `toon-world` "Looks, scene by scene"), the source of each part, and whether the kit does it today
     (yes / partly / no);
   - the new work, ranked, each with a rough size;
   - the skill changes it suggests, as choices for Vincent with a recommendation. He decides; never change a skill
     from a study without his yes.
   In chat: the link and a five-line verdict.
4. **Record.** Add the study's one-paragraph result and the page link to `docs/STUDIES.md` in the project (newest
   first) on a `docs/studies` branch, push it and merge it through a PR. The first entry, the dashcam Short, is in
   bible-shorts.

## Rules

- The video stays in `out/` (gitignored) and is never committed or posted. Their script, characters and art are
  theirs: the study is about how it is made.
- Agents run in the foreground, never drive a browser, and edit only the study's `analysis/` folder.
- Every claim in the verdict points at frames. Say "I'm not sure" where the frames do not settle it.

## Common mistakes

| Mistake | Instead |
|---|---|
| Sampling frames | Every sheet, every frame; the sheets exist so nothing is skipped |
| Describing the look without measuring it | `measures.json` beside our own numbers |
| Listing what they do without saying whether we can | Section 11 of the brief, and the build plan per scene |
| Copying their pictures as the plan | The meaning of each beat first; their pictures only for look and timing |
| Changing a skill straight from a study | Choices on the page; Vincent picks |
