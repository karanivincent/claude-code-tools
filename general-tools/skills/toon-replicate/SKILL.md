---
name: toon-replicate
description: Use when learning the toon look by copying a reference video shot for shot - rebuilding one of another channel's Shorts (Ricks Clips first) in the drawn 2D toon toolkit, scoring the copy against the original frame by frame, and fixing it round after round until it matches, then moving the lessons into toon-video. Runs a team of six specialist agents (breakdown, sets, animator, camera, sound, critic). Triggers - "replicate his video", "copy the Ricks Clips Short", "rebuild this video shot for shot", "practice copy", "match the reference", "the next replication". Practice copies are never posted. For a real story in the toon look use toon-video (any subject) or toon-story-video (Bible in Clay).
---

# Toon replicate (learn by copying, shot for shot)

We copy a reference Short that works (millions of views), one at a time, until our copy holds up
beside it frame by frame. Each copy teaches the craft; the lessons go into `toon-video`, so the next
copy and every real story start from a higher place. Vincent, 7 November 2026: "replicate his videos
one by one, just so that we can learn the process."

## Rules

- **A practice copy is never posted**, never drafted in Publer and never put in the catalog. The
  script, art and timing belong to the reference's maker. It lives in `out/` and on a `practice/*`
  branch only. The skill it teaches is ours to use on our own stories.
- One reference video per session. Its own worktree: `git -C /Users/vince/Projects/bible-shorts
  worktree add ../bible-shorts-practice-<slug> -b practice/<slug> <newest toon branch>` (today
  `story/david-jonathan-2d`), then `npm ci` and copy Chrome as `clay-story-video` says.
- The reference video is downloaded once to `out/practice/<slug>/ref.mp4` with `yt-dlp` (video only;
  captions hit HTTP 429), never committed.
- The voice: we copy the timing, not the speaker. Write our own narration of the same events at the
  same length, voiced on ElevenLabs as `toon-video` says. Read the balance before and after.
- Agents run in the foreground, never in the background (their work dies with their turn). No agent
  drives a browser.
- Roughly 0.5M tokens per agent call. Say the round's cost before starting it.

## The team

Each agent is a plugin agent in `general-tools`. Dispatch it with the `Agent` tool, its
`subagent_type`, and a prompt naming the slug, the worktree and the round. It reads its inputs from
`out/practice/<slug>/` and writes one report back there. Each owns its own files, so two never edit
the same one.

| Agent | `subagent_type` | Owns | Writes |
|---|---|---|---|
| Breakdown | `general-tools:toon-breakdown` | nothing in `src/` | `shotlist.md` (once per video) |
| Set builder | `general-tools:toon-set-builder` | `sets*.ts(x)` | `round-N/sets.md` |
| Sound | `general-tools:toon-sound` | `voice.json`, `audio/`, the mix | `round-N/sound.md` |
| Animator | `general-tools:toon-animator` | figures, looks, poses, acting | `round-N/acting.md` |
| Camera | `general-tools:toon-camera` | camera keys and swings in `shots.ts` | `round-N/camera.md` |
| Critic | `general-tools:toon-critic` | nothing | `round-N/critique.md` with a score |

## The loop

1. **Breakdown (once).** Download the reference. Run the breakdown agent. It writes `shotlist.md`:
   for every second, the place, the camera move, the people and what they do, every prop, crowds,
   light, on-screen words and sounds, plus the narration's beats in our own words. Read it yourself
   against `scripts/side-by-side.sh`'s sheet of the reference alone, and fix gaps before round 1.
   Then write `meaning.md` (toon-video's meaning sheet): what changes in each beat, its cause, and the shot that
   shows it happening. Copying the pictures is not enough; the railroads copy showed a hot rail where the story
   needed the gap closing, and Vincent caught it.
2. **Round N, build.** Set builder, effects (a general-purpose agent owning `fx.ts`) and sound in parallel
   (different files), plus the animator. Then the camera, which goes last because it frames what the others
   built. Each works from `shotlist.md`, `meaning.md` and the previous round's `critique.md`; resume the same
   agents each round so they keep their knowledge of the code. Shared wiring files take only small, marked edits.
3. **Render and compare.** You render (the coordinator, not an agent): the contact sheet first, a full
   render once the sheet scores well. Then
   `bash <skill>/scripts/side-by-side.sh ref.mp4 ours.mp4 out/practice/<slug>/round-N/` makes a sheet
   of matching seconds, theirs on the left, ours on the right, plus the measures.
4. **Critic.** It scores each second's pair 1 to 5 (1 missing, 5 as good as theirs) on six counts: the
   world (props, background, extras), camera (move and angle), people and acting, light, story told by
   picture (jokes, signs, state kept), sound. It names the ten biggest gaps, each with the second and
   the owning agent.
5. **Repeat** from step 2 with the gaps. Stop when the average is 4.2 or more and no second scores 1,
   or after five rounds; say which.
6. **Learn.** Write what this copy taught to `docs/PRACTICE.md` in bible-shorts (newest first): the
   score each round, what moved it, and which helpers were added. Lessons that would help any toon
   video go into `toon-video` (a PR here). New drawing helpers stay additive: render Baby Moses 2D's
   frames 200 and 1500 and byte-compare.
7. **Show Vincent.** Publish the final side-by-side sheet and the two videos on one private Artifact
   page, with the score per round. He judges; the next reference waits for his word.

## Measures beside the score

`pace.py`, hard cuts (scene > 0.3), face close-ups in the sheet, brightness: each for theirs and ours,
in the same table. Matching them is part of matching the video.

## Common mistakes

| Mistake | Instead |
|---|---|
| Copying their narration word for word | Our own words for the same events, at their timing |
| Posting or drafting a practice copy | Never; it lives in `out/` and a `practice/*` branch |
| Building before the shot list is complete | Breakdown first, checked against the reference sheet |
| Camera agent working before the sets exist | Camera goes last in each round |
| Two agents editing one file | Each agent owns its files (table above) |
| Judging from the full render | Score the contact sheet first; full render only when it scores well |
| Keeping lessons in the practice branch | `docs/PRACTICE.md`, and `toon-video` for the general ones |
