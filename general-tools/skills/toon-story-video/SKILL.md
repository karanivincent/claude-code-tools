---
name: toon-story-video
description: Use when making a Bible in Clay Short in the drawn 2D "toon" look - flat round-cartoon characters drawn as cards inside the channel's 3D clay worlds, in the bible-shorts project - including a story told as a mystery, a 2D remake of a story already made in 3D, or a Ricks Clips style Short. Triggers - "2D version", "toon", "drawn version", "make it in 2D", "like Ricks Clips", "the 2D David one", "mystery telling". The channel layer on top of toon-video, which holds the craft. For the clay 3D figures (the channel's standard look) use clay-story-video; never mix the two in one story.
---

# Toon story video (Bible in Clay, 2D)

This skill is the Bible in Clay layer. The craft of a toon video (camera without cuts, acting, action
beats, hiding, hands, sets, light and the checks) is in `toon-video`: read it first and follow it. This
skill adds what is particular to the channel.

Bible in Clay has two looks, and each has its own skill so a story never drifts from one to the other
(Vincent, 6 November 2026):

| Look | Skill | Figures |
|---|---|---|
| Clay (3D), the standard | `clay-story-video` | Clay figures from `src/cast/` |
| Toon (2D), on test | this skill, with `toon-video` | Flat drawn cards from `src/spike2d/` inside the same 3D worlds |

Everything neither toon skill says is done exactly as `clay-story-video` says: the passage and exact BSB
quotes, voicing and the whisper check, music in sections, the mix, the ready folder, Publer drafts,
Vincent's yes, cost, keys and checks. Where they differ, the toon skills win for a toon story.

## First

1. In `/Users/vince/Projects/bible-shorts` read `CLAUDE.md`, then `docs/MAKING-A-STORY.md` (its top
   sections are the toon stories, newest first), `docs/REVIEW-LESSONS.md` and `docs/RICKS-STUDY.md`.
2. The toolkit lives on `story/baby-moses-2d` and its children (newest: `story/david-jonathan-2d`) until
   Vincent decides to merge it into `main`. Until then, cut the story's worktree from the newest toon
   story's branch, not from `main`: `git worktree add ../bible-shorts-<story> -b story/<story>
   story/david-jonathan-2d`, then `npm ci` and copy Chrome as `clay-story-video` says. Once
   `src/spike2d/` is on `main`, cut from `main`.
3. Name the story's key with a `-2d` ending (`moses-2d`, `david-jonathan-2d`) and give its
   `docs/catalog.json` entry `"look": "toon"`, so the review page and the records always show which
   look it is. A 2D remake never replaces the 3D story's files or its draft: both go on the review page
   and Vincent picks. Reuse the 3D version's voice lines where the words match (copy the mp3 and align
   files; the hash matches, so they cost nothing).

## Channel rules on top of toon-video

- 50 to 65 s. Open on the strangest true detail of the passage. A mystery telling holds every Bible
  name back until the reveal (MAKING-A-STORY's Baby Moses section).
- Only exact BSB words go in quotation marks, and every quote names its speaker. Never invent an event.
- God and the angel of the LORD are a voice and a light, never a drawn person.
- Crowds match the text's numbers (a king's feast, an army of 90).
- Ricks Clips (`docs/RICKS-STUDY.md`) is the reference for pace and fullness of the world.

## The hand-back

Give the coordinator the video, the Publer draft id, the cost and these counts: pace (`pace.py`), hard
cuts (scene > 0.3), face close-ups out of the contact sheet's frames, brightness, whisper lines heard,
quotes checked word for word, and that Baby Moses 2D's frames 200 and 1500 are still byte-identical.
A redo's draft: move the old entry to `replaced` in `stories/<story>/publer.json` before running
`<story>:drafts`, and say which old drafts are still in Publer for Vincent to delete.

## At the end

Add what the story taught to the top of `docs/MAKING-A-STORY.md` under a toon heading, with its pace,
face count, hard cuts, render time and cost. Lessons that would help any toon video go into
`toon-video` too (a PR in `claude-code-tools`). Never merge the toolkit branch into `main` without
Vincent's decision; say in the report which branch the story lives on.

## Common mistakes

| Mistake | Instead |
|---|---|
| A 2D remake that overwrites the 3D story or its draft | A `-2d` key of its own; both on the review page |
| Building a toon story with `clay-story-video`'s cast steps | Drawn cards from `src/spike2d/`, via `toon-video` |
| Cutting the worktree from `main` while the toolkit is unmerged | Cut from the newest toon story's branch |
| A redo whose draft never appears | Move the old `publer.json` entry to `replaced` first |
| A lesson that helps any toon video kept only in MAKING-A-STORY | Also add it to `toon-video` |
