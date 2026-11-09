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
5. **Observe, as data** (9 November 2026). Plain facts with no judgement, so later anyone can search many videos for
   a pattern without watching them again ("how long do face holds last", "which joins link far places"):
   - `python3 -I <skill>/scripts/observe_seconds.py <study>` writes `observe/seconds.jsonl`: brightness,
     saturation, the five main colours, sharpness, motion, cuts, loudness and the narration line, each second. Free,
     about half a minute a video.
   - One Sonnet agent fills the shot-by-shot form in `references/observe-brief.md` into `observe/shots.json`, and
     `scripts/check_shots.py` checks it (fields, allowed values, full coverage, no opinion words). About 0.2M tokens
     a video. Doubt goes in each shot's `unsure`, never a guess.
   - `scripts/query_shots.py <library-dir> [joins | field <path>]` answers across every video in the library.
   Do this while the frames are on the machine: once the frames are gone, only the data is left.
6. **Record, in the study library.** The written study is kept for good, so a video is never studied twice and any
   moment can be looked up later (Vincent, 9 November 2026: "annotate them so that whenever we have something, we can
   easily reference other videos and see how that was done"). In the project, on a `docs/studies` branch:
   - copy the reports (`analysis/*.md`), `measures.json`, `observe/shots.json` and `observe/seconds.jsonl` to
     `docs/studies/<channel>/<short-name>/`, with a
     README giving the title, views, link and the `prepare.py` line that rebuilds the frames (the video and frames
     stay out of git);
   - add the video's timed moments to `docs/studies/<channel>/index.md` under each technique it shows (joins by
     their names in `toon-video` references/joins.md), and a new join to that stack with where it was seen;
   - add the one-paragraph result and the page link to `docs/STUDIES.md` (newest first);
   then push and merge through a PR. The Ricks Clips library (20 Shorts, 7–9 November 2026) is in bible-shorts
   `docs/studies/ricks-clips/`.
   Before studying a video, look in the library: if it is there, read it instead of studying it again, and only
   re-download it when a question needs frames the report does not describe.

## Many videos: a channel survey

Built on 9 November 2026 from a survey of 17 Ricks Clips Shorts over 5M views (lessons in bible-shorts
`out/study/ricks-channel/lessons.md`, summarised in `docs/STUDIES.md`). When the question is "how does this channel
make its hits", study many videos lightly instead of one deeply:

1. List the channel's Shorts with views: `python3 -m yt_dlp --flat-playlist --playlist-end 40 --print
   "%(id)s|%(view_count)s|%(duration)s|%(title)s" <channel-url>/shorts` into `<study>/<survey>/list.txt`. Pick the recent
   ones over a view floor into `picked.txt`; skip videos already studied.
2. Prepare each with `prepare.py`, two at a time (`xargs -P 2`), then `scripts/survey_sheets.py <study>/<id>`: every
   frame, 60 to a sheet (2 s). YouTube's bot check can refuse a download after about ten in a row; retry those at
   the end, never with browser cookies.
3. One Opus agent per video with `references/survey-brief.md`, at most four at once. About 0.3M tokens a video
   (against 1.1M for a four-agent study). Tell it to join sheets in pairs at half size first: an agent that opens
   every sheet and frame one by one hits the image limit and loops for hours (two did on the first survey).
4. One synthesis agent with `references/lessons-brief.md` reads every report and writes `lessons.md`: the backbone,
   story shapes, the measured dials, which look for which scene, joins, teaching the mechanism, people, the ranked
   gaps, verdicts, rules challenged (as choices for Vincent) and new playbook rows.
5. Then steps 3 to 6 above: playbook rows, one page, the observation data, and the library (every report, the index by technique, a
   `docs/STUDIES.md` entry).

## Rules

- The video and its frames stay in `out/` (gitignored) and are never committed or posted; the written study goes
  into the library. Keep the library in a private repository: it describes someone else's videos. Their script, characters and art are
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
