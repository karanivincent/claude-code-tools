---
name: video-study
description: Use when Vincent shares a reference video (a YouTube Short, often Ricks Clips) and wants it analysed frame by frame - every shot, colour, light, effect, camera move, face, hand and walk, what is 3D and what is flat - to learn how it is made so we can make original videos of our own. Prepares the frames, sheets, transcript and measures with one script, splits every frame across four analysis agents with a fixed brief, then writes the techniques it teaches as blueprints into the toon playbook and publishes a page of what it teaches. Triggers - "analyse this video", "study this Short", "frame by frame", "can we make this", "what are we missing", "how would we make this", a YouTube Shorts link with a question about making it.
---

# Video study (frame by frame, against our kit)

Built on 8 November 2026 from the railroads and dashcam studies of Ricks Clips Shorts. We learn from the best so we
can make original videos of our own (Vincent: "we don't have to replicate everything ... just a blueprint of what is
being built ... we are going to be original"). The study answers: what does this video do well, how is each piece
made, and which of those techniques we already have or only have as a blueprint. It never aims to rebuild the
video; a practice copy is `toon-replicate`, and only when Vincent asks for one.

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
3. **The playbook.** Read the four reports (not just their summaries) and the measures. Check two or three of their
   claims yourself on the frames. Then add or update rows in `toon-video/references/playbook.md` (story, camera and
   joins, look and light, people, things that act): each technique with why it works, a blueprint of how we would
   build it, and its status (built or blueprint). Ship that through the skills repo's usual branch and PR.
4. **The page.** Publish one private Artifact page:
   - what this video teaches, first, in two or three sentences;
   - `glance.jpg` and a key-moments strip;
   - its measures beside the other studied videos';
   - the new techniques it added to the playbook, each with its blueprint and a rough size if we ever build it;
   - for each scene, the look we would use for something like it (picture room, game world, flat 2D place, drawn in
     code, from `toon-world` "Looks, scene by scene");
   - any rule in our skills it challenges, as a choice for Vincent with a recommendation. He decides; never change
     a skill rule from a study without his yes (new playbook rows are not rule changes).
   In chat: the link and a five-line summary.
5. **Record.** Add the study's one-paragraph result and the page link to `docs/STUDIES.md` in the project (newest
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
| Listing what they do without saying how we would build it | A blueprint per technique in the playbook |
| Treating the study as a plan to rebuild their video | Techniques for our own stories; a practice copy only when Vincent asks |
| Building every missing piece straight away | Blueprint now; build when one of our stories needs it |
| Changing a skill rule straight from a study | Choices on the page; Vincent picks |
