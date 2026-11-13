---
name: toon-story-video
description: Makes a Bible in Clay Short in the drawn 2D "toon" look - flat round-cartoon characters drawn as cards inside 3D worlds, in the bible-shorts project - including a story told as a mystery, a 2D remake of a story already made in 3D, or a Ricks Clips style Short. Adds the channel's layer (package panel, scripture quotes, cover, catalog, sight and brightness checks, Publer draft) on top of toon-video, which holds the order and the craft. Use when starting or remaking a Bible in Clay story in 2D. Triggers - "2D version", "toon", "drawn version", "make it in 2D", "like Ricks Clips", "the 2D David one", "mystery telling", "toon Bible Short". For the clay 3D figures (the channel's standard look) use clay-story-video; a story uses one look.
---

# Toon story video (Bible in Clay, 2D)

The Bible in Clay layer on top of `toon-video`. Follow `toon-video`'s order and its register,
`toon-video/references/rules.md`; this skill adds the channel's items and cites their ids. The world, the look and the
people come from `toon-world`. Anything the toon skills leave unsaid is done as `clay-story-video` says (X-11).

| Look | Skill | Figures |
|---|---|---|
| Clay (3D), the standard | `clay-story-video` | Clay figures from `src/cast/` |
| Toon (2D) | this skill, with `toon-video` and `toon-world` | Bean-head cards with mittens (S3-55), the story's own cast (S2-1) |

A story is one look, clay or toon (S0-18). Fingers are a clay rule; toon figures wear mittens (S3-55).

## Start

1. In `/Users/vince/Projects/bible-shorts` read `CLAUDE.md`, `docs/MAKING-A-STORY.md` (S0-9), `docs/REVIEW-LESSONS.md`
   and `docs/RICKS-STUDY.md` (S2-28).
2. Take the story's package from the panel (`docs/story-choice/PANEL.md`) before writing its script.
3. Branch from `main`, where the toon kit and film template live (S0-1):
   `git -C /Users/vince/Projects/bible-shorts worktree add ../bible-shorts-<story>-2d -b story/<story>-2d main`, then
   `npm ci` and copy Chrome as `clay-story-video` says.
4. Run `node <toon-world>/scripts/new-film.mjs . <story>-2d <CompositionId>` to start the film (S0-2).
5. Key the story with a `-2d` ending and give its `docs/catalog.json` entry `"look": "toon"` (S0-16). A 2D remake
   keeps the 3D story's files and draft; both go on the review page and Vincent picks (S0-17).

## Channel items, by stage

Copy this into the story's `checklist.md` beside the register's own lines (S0-8):

```markdown
Stage 1, script and voice
- [ ] Package from the panel (docs/story-choice/PANEL.md)
- [ ] 50 to 65 s, opening on the passage's strangest true detail (S1-25)
- [ ] Quotes are exact BSB words, each naming its speaker (S1-26); no invented event (S1-27)
- [ ] Mystery telling: Bible names held back until the reveal (S1-28)
- [ ] Ends on a question to the viewer, then the follow line (MAKING-A-STORY)
- [ ] A crowd speaks with one voice, or the verse split in order across two or three voices (CLAUDE.md)
- [ ] The 3D version's voice lines reused where the words match (S1-29)
- [ ] Vincent's Story yes, by button (S1-24)
Stage 2, cast, look and animatic
- [ ] God and the angel of the LORD as a voice and a light (S2-26)
- [ ] Crowds match the text's numbers (S2-27)
- [ ] Parts plan per place approved by button (S2-30); Direction yes by button (S2-22)
Stage 6, checks on the joined film
- [ ] node scripts/sight-check.mjs --story <slug>: nobody blind whose verses have them seeing
- [ ] node scripts/brightness.mjs <video>: the brightness floor and dull stretches (S4-18)
- [ ] Each check docs/REVIEW-LESSONS.md lists, after merging main
Stage 7, hand-back
- [ ] Captions and package (S6-3, S6-4); cover in stories/covers.json, rendered with scripts/covers.mjs (S6-5)
- [ ] docs/catalog.json updated in the same commit (S6-6)
- [ ] Redo: the old publer.json entry moved to replaced before the drafts (S6-7)
- [ ] Publer draft made; the coordinator schedules (S6-2)
- [ ] ElevenLabs balance before and after (S6-9)
```

## Approvals

Vincent's yes is his button on the review page, read by `step.mjs` from `approvals.json`; no agent writes it (S0-14).
Stages 1 and 2 wait for his button (S1-24, S2-22). Silence counts as a yes for a finished Short at its posting
deadline, and at no earlier stage (S0-15). Agents make drafts; posting waits for his yes (S6-2).

## Cover

Add an entry to `stories/covers.json` (the story's name, a hook of two to five words, the moment), run
`node scripts/covers.mjs --candidates --only <id>` to choose the moment, then `node scripts/covers.mjs --only <id>` <!-- lint-ok -->
to render `stories/covers/<id>.jpg` (S6-5).

## The hand-back

Give the coordinator the video, the Publer draft id, the cost and the measured counts (S6-8): pace (`pace.py`), hard
cuts with their reasons (S3-121), face close-up share (S3-105), brightness (S4-18), the sight check, whisper lines heard,
quotes checked word for word (S1-26), and the film judges' last verdict (S5-52). Name the branch the story lives on.

## At the end

Add what the story taught to the top of `docs/MAKING-A-STORY.md` under a toon heading, with its pace, close-up share,
hard cuts, render time and cost. A lesson that helps any toon video goes into `toon-video/references/rules.md` as a new
rule with an id, by PR in `claude-code-tools` (S6-11).

## Common mistakes

| Mistake | Instead |
|---|---|
| A 2D remake that overwrites the 3D story or its draft | A `-2d` key of its own; both on the review page (S0-17) |
| Building a toon story with `clay-story-video`'s cast steps | Bean-head cards with mittens via `toon-world` (S3-55) |
| Branching from another story's branch | Branch from `main` (S0-1) |
| Taking silence as a yes on the story or the animatic | Wait for his button (S0-15) |
| A redo whose draft does not appear | Move the old `publer.json` entry to `replaced` first (S6-7) |
| A Short with no cover or catalog entry | `covers.mjs` and `docs/catalog.json` (S6-5, S6-6) |
| A lesson kept in MAKING-A-STORY alone | Also a rule in `rules.md` (S6-11) |
