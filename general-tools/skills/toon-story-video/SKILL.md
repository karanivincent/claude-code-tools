---
name: toon-story-video
description: Use when making a Bible in Clay Short in the drawn 2D "toon" look - flat round-cartoon characters drawn as cards inside the channel's 3D clay worlds, in the bible-shorts project - including a story told as a mystery, a 2D remake of a story already made in 3D, or a Ricks Clips style Short. Triggers - "2D version", "toon", "drawn version", "make it in 2D", "like Ricks Clips", "the 2D David one", "mystery telling". For the clay 3D figures (the channel's standard look) use clay-story-video; never mix the two in one story.
---

# Toon story video (2D)

Bible in Clay has two looks, and each has its own skill so a story never drifts from one to the other
(Vincent, 6 November 2026):

| Look | Skill | Figures |
|---|---|---|
| Clay (3D), the standard | `clay-story-video` | Clay figures from `src/cast/` |
| Toon (2D), on test | this skill | Flat drawn cards from `src/spike2d/` inside the same 3D worlds |

Everything this skill does not say is done exactly as `clay-story-video` says: the passage and exact BSB
quotes, voicing and the whisper check, music in sections, the mix, the ready folder, Publer drafts,
Vincent's yes, cost, keys and checks. Read that skill first, then this one. Where they differ, this one
wins for a toon story.

## First

1. In `/Users/vince/Projects/bible-shorts` read `CLAUDE.md`, then `docs/MAKING-A-STORY.md` (its top
   section is the 2D Baby Moses), `docs/REVIEW-LESSONS.md` and `docs/RICKS-STUDY.md`, all of them.
2. The toolkit lives on `story/baby-moses-2d` (from `spike/2d-characters`) until Vincent decides to
   merge it into `main`. Until then, cut the story's worktree from that branch, not from `main`:
   `git worktree add ../bible-shorts-<story> -b story/<story> story/baby-moses-2d`, then `npm ci` and
   copy Chrome as `clay-story-video` says. Once `src/spike2d/` is on `main`, cut from `main`.
3. Name the story's key with a `-2d` ending (`moses-2d`, `david-jonathan-2d`) and give its
   `docs/catalog.json` entry `"look": "toon"`, so the review page and the records always show which
   look it is. A 2D remake never replaces the 3D story's files or its draft: both go on the review page
   and Vincent picks.

## What makes a toon Short good (Ricks Clips study, 6 November 2026)

Our pace already matches theirs (about 45 big changes a minute). What is in each picture does not.
Ricks Clips puts the story in a full, busy world; our first 2D Moses put a face on plain sand.

1. The world is the star. At most 1 frame in 4 is a face close-up. Every place gets a set list before
   the shots: 8 or more props, a full background, extras. Characters are small inside a big place.
2. Move between places with the camera: a fly-over, a push through a doorway, a crane up. Ricks
   Clips uses 0 or 1 hard cuts a video. Between far places, switch at the blurred middle of the swing,
   since flying the whole way can take the camera through a wall.
3. Crowds where the text has them, painted once and reused: a king's feast is a long table with ten or
   more guests; an army is a column of 90.
4. One or two picture jokes that carry the story without words (a bird nests on a crown to show years
   passing; a spear left stuck in the wall).
5. Facts as things in the world: a counter, a scroll, a mark, the arrows themselves.
6. Light follows the story: firelight indoors, blue night for danger, gold dawn for hope. Keep every
   face above the brightness floor (`node scripts/brightness.mjs`).
7. At least three kinds of view: from above, a map or cut-away, ground level.
8. Keep the figures simple and spend the effort on the sets.
9. 50 to 65 s. Open on the strangest true detail, build in steps, land the turn at the end. A mystery
   telling holds every Bible name back until the reveal (MAKING-A-STORY's Baby Moses section).

Plus the review lessons that already apply to every Short: show the action the narrator names as it
happens, every quote names its speaker, crowds match the text, no walking through solid scenery.

## The drawn cast

- People are `Figure2D` cards from `src/spike2d/figure.ts`, drawn by `src/spike2d/draw.ts`: dot eyes
  with lids, brows doing the acting, small mouths shut unless speaking, thin limbs, flat fills.
- A new look for a person goes into `draw.ts` additively (a new option, never a changed default), so
  every earlier toon story renders the same. Byte-compare an earlier story's frames after any change.
- Cards only face the camera: side and back views need their own drawings. Stagger two people in
  depth rather than side by side; a tall frame fits two abreast only from far away.
- `Figure2D.update({ depth: true })` only where a 3D thing must hide a card (a basket in the reeds).
- Held poses, not a constant sway; the camera shakes only on hits.
- Captions: one white word at a time.

## Checks before the hand-back

Run all of these and give the numbers with the video:
- `python3 scripts/pace.py <video>`: about 40 to 60 big changes a minute, under 5% still.
- The contact sheet: count the face close-ups (at most 1 in 4) and check every place has its props
  and extras.
- Hard cuts: `ffmpeg -i <video> -vf "select='gt(scene,0.3)',showinfo" -f null - 2>&1 | grep -c pts_time`.
  Aim for under 10.
- `scripts/brightness.mjs`, `scripts/line-loudness.mjs` and `scripts/walk-check.mjs` as for a clay story.

## At the end

Add what the story taught to the top of `docs/MAKING-A-STORY.md` under a toon heading, with its pace,
face count, hard cuts, render time and cost. Never merge the toolkit branch into `main` without
Vincent's decision; say in the report which branch the story lives on.

## Common mistakes

| Mistake | Instead |
|---|---|
| A string of talking heads on plain ground | A set list per place; at most 1 frame in 4 a face |
| A hard cut between every shot | A camera move from place to place |
| Two or three people where the text has a crowd | Paint the crowd once and reuse it |
| A 2D remake that overwrites the 3D story or its draft | A `-2d` key of its own; both on the review page |
| Building a toon story with `clay-story-video`'s cast steps | Drawn cards from `src/spike2d/`, this skill |
| Changing a default in `draw.ts` | A new option, additive; byte-compare earlier stories |
| Cutting the worktree from `main` while the toolkit is unmerged | Cut from `story/baby-moses-2d` |
