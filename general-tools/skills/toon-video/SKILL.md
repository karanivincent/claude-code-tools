---
name: toon-video
description: Makes short animated videos in a drawn 2D toon look - flat cartoon people drawn in code as cards inside 3D places, rendered with Remotion and Three.js, voiced and scored with ElevenLabs - for any subject, such as a story, an explainer, a product demo, a history piece, a kids' tale or a brand clip. Runs the whole order - script, voice and meaning sheet; cast, parts plan and animatic; then the film built as 5 to 10 second scenes, up to four at once, each in four passes (world and light, people, motion, sound) where three AI reviewers watch each round and a blind judge keeps or undoes it; then the scenes joined and shown to the owner - with the owner's approvals read from a review page. Use when asked for a "toon video", a "2D animated short", a "cartoon explainer", a "drawn video", to "make it in 2D", something "like Ricks Clips", or to "animate this story". For a Bible in Clay story in the toon look, use toon-story-video, which adds that channel's rules on top of this one; for places, the look and the people, load toon-world beside it.
---

# Toon video (2D cards in 3D places)

A toon video is flat drawn people (cards that face the camera) inside 3D places, filmed by a moving camera.
Pictures are drawn in code, so they cost nothing to redo; voices, music and effects cost credits. This skill holds the
order, the story, the camera, the acting and the sound. Two other files hold the rest:

- **`toon-world`** (load it before stage 2): places and the blend, the look stack, lit bean-head cards.
- **`references/rules.md`**, the rule register: every rule, one line, with an id (`S3-12`) and how it is proved. This
  skill cites ids and does not restate them. When a line here and the register differ, the register wins (X-7).

A project can add its own layer on top: Bible in Clay does, in `toon-story-video`.

## Terms

One word per idea, as in the register's Terms table: **still board** (stage 2 stills from the real parts),
**animatic** (the still board on the voice), **beat board** (2 to 3 full-size stills per shot from the built film),
**scene** (5 to 10 s, its own composition), **pass** (one area worked on a scene in rounds), **round** (up to five
changes, a render, reviewers, a blind judge), **join card** (the shared frame at a cut between scenes), **render** (the
joined film), **the blend**, **parts plan**, **detail layer**.

## Where the scripts are

`<toon-video>` and `<toon-world>` below mean the skills in the plugin cache:
`~/.claude/plugins/cache/vince-tools-marketplace/general-tools/<newest version>/skills/toon-video` (and `toon-world`).
Run their scripts from there; they are not copied into projects. Tools copied into a story by `new-film.mjs` sit in
`src/stories/<slug>/tools/` and run from the project root.

## Start

1. Branch from the project's `main`, which holds the toon kit and the film template (S0-1):
   `git switch main && git pull && git switch -c story/<slug>`. A Bible in Clay story uses a worktree, as the
   project's CLAUDE.md says.
2. Start the film (S0-2 to S0-6, S0-8):
   `node <toon-world>/scripts/new-film.mjs <project> <slug> <CompositionId>`. It copies the template, syncs the kit,
   writes `stories/<slug>/checklist.md` from the register and prints the `npm i -E` line to run.
3. Read `references/rules.md` stage S0 and the X rules, then the project's making-of doc in full (S0-9).
4. Record the profile (S0-11):
   `python3 <toon-video>/scripts/production_log.py profile docs/production-log.jsonl --story <slug> --channel <c> --look toon --methods code-3d,painted-texture,bean-cards`.
5. Read the ElevenLabs balance before the first credit (S6-9). Hand secrets files to node with `--env-file` (X-1).

## The order

Copy this checklist into the story's `HANDOVER.md` and tick it. It is the step list; `checklist.md` holds the
rule-by-rule lines for each step. Do not retell a step in other words (S0-8, X-7).

```
## <story>: the order
### Stage 0. Start
- [ ] Branch from main; new-film.mjs; npm i -E line run (S0-1..S0-8)
- [ ] Making-of doc read; profile logged; ElevenLabs balance noted (S0-9..S0-11, S6-9)
### Stage 1. Script, voice, meaning sheet           stop: owner "Story yes"
- [ ] Script written: stories/<slug>/script.md, facts in facts.md (S1-1..S1-8)
- [ ] Narrator picked and recorded: stories/<slug>/voices.md (S1-9..S1-12)
- [ ] Lines voiced, cut and whisper-checked: full.json, out/<slug>/whisper.json (S1-13..S1-18)
- [ ] Retell passes: out/<slug>/retell.md (S1-19)
- [ ] Meaning sheet: stories/<slug>/meaning.md; profile: stories/<slug>/profile.md (S1-20..S1-23)
- [ ] Review page published at stage "story"; approvals pulled; "story" approved (S1-24)
### Stage 2. Cast, look, parts plan, animatic      stop: owner "Direction yes" and "Parts plan yes" per place
- [ ] Cast sheet: out/<slug>/cast.png (S2-1..S2-6, S2-24)
- [ ] Parts plan per place, the blend proved on one place: stories/<slug>/parts.md (S2-7..S2-14, S2-17, S2-25)
- [ ] Still board with planner notes: out/<slug>/board/, stories/<slug>/board.md (S2-15, S2-16, S2-18..S2-20)
- [ ] Animatic: out/<slug>/animatic.mp4 (S2-21)
- [ ] Review page at stage "direction" and one "parts-<place>" per place; all approved (S2-30, S2-22, S2-23)
### Stage 3. Set up the scenes
- [ ] Scenes listed: stories/<slug>/scenes.md (S5-39)
- [ ] Join cards: stories/<slug>/joins.json (S5-51)
- [ ] Shared once: cast, the one mix, each place's world and light (S5-50, S3-152..S3-165)
### Stage 4. Each scene, up to four at once         stop: each pass at 4, two rounds with no win, or six rounds
- [ ] Rig check: out/<slug>/scenes/<scene>/poses.jpg (S5-54..S5-56)
- [ ] Pass 1 world and light (S5-57..S5-62)
- [ ] Pass 2 people and acting (S5-63..S5-66)
- [ ] Pass 3 motion and staging (S5-67..S5-69)
- [ ] Pass 4 sound (S5-70)
### Stage 5. Join                                    stop: owner's notes taken into the scenes
- [ ] Film joined; joins.sh clean; three judges against the last film (S5-52)
- [ ] Render on the review page; notes sent to their scenes (S5-53)
### Stage 6. Hand-back                               stop: owner "Looks good"
- [ ] Captions, package, hand-back checklist with numbers (S6-1..S6-4)
- [ ] Times logged; lessons written; balance difference reported (S6-9..S6-11)
```

### Stage 0. Start

As in Start above. Proof is the branch base and the files `new-film.mjs` writes.

### Stage 1. Script, voice and meaning sheet

- Write the script to S1-1..S1-8: the strangest true thing within three seconds, about 150 words for 60 s, frame 0
  designed first with the hook card drawn on frame 0. Sources go in `stories/<slug>/facts.md` (S1-6).
- Narrator: Laura by default (S1-9). Another voice is picked by pitch (S1-10):
  `node <toon-video>/scripts/pitch.mjs takes/*.mp3 --band <lo>-<hi>`; record the pick in `voices.md` (S1-12).
- Voice with the project's voice script; it caches each line (S1-13, S1-14). Cut leads and check the cut lines with
  whisper (S1-15, S1-16). Read the total length now and cut lines here (S1-18).
- Retell: give a fresh agent the script alone and ask it to retell the story; fix and repeat until it is right. Save
  its last answer to `out/<slug>/retell.md` (S1-19).
- Meaning sheet `stories/<slug>/meaning.md` (S1-20..S1-22): per beat, the thing that changes, its cause, and the shot
  that shows the change; the one thing to see each second; a keyed action per verb. The same entries go into code as
  must-see entries later (S3-83).
- Dynamics profile `stories/<slug>/profile.md` from the nearest studied video (S1-23); the dials are below.
- **Stop.** Publish the review page at stage `story` with the script, the voiced lines and the meaning sheet, and
  wait for the owner's Approve (S1-24). Notes he sends instead are fixed and the page republished.

### Stage 2. Cast, look, parts plan and animatic

- Cast sheet `out/<slug>/cast.png`: each person and animal as a flat card in this story's own style
  (S2-1..S2-6). Load `toon-world` for the cards.
- Parts plan `stories/<slug>/parts.md`, one section per place: the source of sky, far band, middle, ground, detail
  layer, hero props, people, effects and words, and the story's state for the place (S2-7..S2-14). The blend is
  the look on every place (S2-7); prove it on one place and brief the other place agents from it (S2-17).
- Still board from the real parts: `node src/stories/<slug>/tools/stills.mjs jobs.json out/<slug>/board` (S2-16),
  2 to 3 framings per line (S2-15), with the planner's notes and each person's gesture on its word in
  `stories/<slug>/board.md` (S2-18, S2-19).
- Animatic: `python3 <toon-video>/scripts/animatic.py board.json full.json out/<slug>/board voice.wav out/<slug>/animatic.mp4`
  (S2-21).
- **Stop.** Publish the review page at stage `direction` (animatic, cast sheet) and one stage `parts-<place>` per
  place (its parts plan and stills). Wait for every Approve (S2-30, S2-22). He judges direction: colours, people,
  anything missing in the story; he does not review frame by frame (S0-13). Nothing is built before then (S2-23).

### Stage 3. Set up the scenes

The film is built as scenes, not as one film (S5-39). Template and layout: `<toon-world>/templates/scene/README.md`
and `<toon-world>/templates/film-scenes/README.md`; the loop scripts: `<toon-video>/scripts/loop/README.md`.

1. Split the approved animatic into scenes of 5 to 10 s, cutting where the story changes place or beat. List them in
   `stories/<slug>/scenes.md`: name, seconds, place, the meaning-sheet beats it holds, and at most three shots per 5 s
   (S5-39).
2. Write a join card for each cut between scenes in `stories/<slug>/joins.json` (S5-51).
3. Do the shared parts once (S5-50): the cast in `src/stories/<slug>/cast.ts`, the one mix (S3-152..S3-165;
   `references/voice-and-sound.md`), and each place's world-and-light pass in `src/stories/<slug>/places/<place>.ts`,
   run as pass 1 below on that place's first scene.

### Stage 4. Build each scene in passes

Run up to four scenes at once, one builder each (S5-49). Say the cost before starting them (X-3): about 2 to 3 million
tokens a scene. Each scene runs these passes in order (S5-40); `node <toon-video>/scripts/loop/step.mjs
out/<slug>/scenes/<scene>` says what comes next and refuses when an input is missing (S5-48).

| Pass | Works on | Rules |
|---|---|---|
| Rig check | A pose sheet of every pose and prop the scene's words need | S5-54..S5-56 |
| 1. World and light | The blend, the light, the sky seam, water | S5-57..S5-62; `toon-world` |
| 2. People and acting | Faces per beat, others acting toward the hero, paths that clear | S5-63..S5-66; `references/acting.md` |
| 3. Motion and staging | Camera speed, the fall, secondary motion, cuts | S5-67..S5-69; `references/camera.md` |
| 4. Sound | Each effect heard at its cue, levels | S5-70 |

A round (S5-41), with the scene's loop folder as `$D` and the pass's round folder as `$R`:

1. The builder makes at most five changes, from `faults.md` and the judge's blame.
2. Stills sheet of the changed seconds (`templates/scene/` README), looked at before any render.
3. Render the scene (about 15 s), taking a render slot as the project says.
4. `scripts/loop/jumps.sh` and, in the sound pass, `scripts/loop/audible.py` for the two code facts (S5-47).
5. `scripts/loop/look.sh $R/clip.mp4 $R --focus <area>`: three reviewers, writing `faults.md` (S5-47).
6. `scripts/loop/abjudge.sh $D/best/clip.mp4 $R/clip.mp4 $R`: keep, revert or keep the credited parts (S5-42).

After a lost or tied round, skip step 5 next time (S5-46). The same top fault twice running means restaging that beat
(S5-45). A pass stops at 4 on its area, two rounds in a row with no win, or six rounds (S5-43). Compare clips side by
side within one judging (S5-44).

### Stage 5. Join and show the owner

1. Render the Film composition, which plays the scenes in order over the one mix (S5-52).
2. `node src/stories/<slug>/tools/join-times.mjs > out/<slug>/join-times.json`, then `scripts/loop/joins.sh <film>
   out/<slug>/join-times.json out/<slug>/film-<n>/joins` over the joins (S5-52); a bad join goes back to the scene that owns its
   card (S5-51).
3. `scripts/loop/abjudge.sh <last film> <new film> out/<slug>/film-<n> --judges 3` against the last film the owner saw
   (S5-52), plus `short_qa.py`, `brightness` and `levels.mjs` on the full film (S5-18, S4-8, S4-4).
4. Publish it on the review page at stage `render-<n>` (S5-53). Each of his notes goes to the scene it names and runs
   as a round there, then the film is joined again.

### Stage 6. Hand-back

Work through the hand-back lines of `checklist.md` and give the measured numbers with the video (S6-1). Captions
file: `python3 src/stories/<slug>/tools/srt.py full.json out/<slug>/captions.srt` (S6-3). Package with the
`story-thumbnails` skill (S6-4). Drafts only; the owner's "Looks good" on the finished video comes before any post
(S6-2). Log each step's time (S6-10), write the lessons (S6-11) and report the balance difference (S6-9). After a
week, log the audience numbers (S6-12, S6-13).

## Approvals

The owner's yes is his click on a review page; `step.mjs` reads it from `src/stories/<slug>/approvals.json` (S0-14, S5-48).
Agents read the page's store and copy it; they never create or change an approval row (S0-14, X-6).

**Publish the page.** One review page per story, republished at each stage, so one store holds each approval.

1. Copy `templates/review/index.html` to `out/<slug>/review/index.html`, with the media it shows under
   `out/<slug>/review/v/` (videos) and `c/` (images).
2. Fill the `#page-data` JSON: `story` (the slug), `stage` (`story`, `direction`, `parts-<place>` or `render-<n>`),
   `title`, `ask` (one plain sentence of what to decide) and `items` (each `{ kind, src, caption }`).
3. Publish with the Artifact tool: `file_path` the page, `files` the media, `icon: "film"`, and
   `capabilities: {"db":{"rules":[{"path":"","read":"view","write":"owner"}]},"user":{}}`. On later stages republish
   to the same URL, adding the new media. Write the page's URL at the top of `HANDOVER.md`.
4. Tell the owner the link and what the stage asks.

**Pull the approvals and notes.** Load `ArtifactData` (ToolSearch `select:ArtifactData`), then:

1. `ArtifactData` action `list`, the page's `url`, collection `approvals`. Each row is `approvals/<stage>` with
   `{ stage, story, approved, at, note, by, source: "page" }`.
2. Write the rows unchanged to `src/stories/<slug>/approvals.json` as `{ "<stage>": { ...row } }`. This file is a
   copy of the store; do not add, edit or infer a row.
3. For notes, `list` collection `notes` (rows `notes/<stage>-<ms>` with `{ stage, text, at }`) and write them
   unchanged to `src/stories/<slug>/notes.json` as `{ "<id>": { ...row } }`. Close each in `stories/<slug>/lessons.md`
   as `<id>: story-only` or `<id>: <rule id>` (S6-15).

Silence is not a yes at stages 1 and 2 (S0-15). A finished Short at its posting deadline follows the project's own
rule.

## The dynamics profile

Each video keeps the same backbone (hook and loop, meaning sheet, the blend, one cast style, captions, the mix, the
owner's stages, the scene loop) and picks its own dynamics in `profile.md` at stage 1 (S1-23). The reviewers' pace and hold
checks read the profile (S1-23).

| Dial | Range seen in the studies | Pick by |
|---|---|---|
| Pace (big changes a minute) | 25 (face-led jokes) to 50 (machines, journeys) | Faces slower; machines and journeys faster |
| Longest holds | 0.5 s to 2.3 s (on a joke) | Hold where a face or a reveal needs reading time |
| Joins | journeys and dissolves only, to 3 hard cuts plus the loop (S3-121) | Journeys for one big place; dissolves for many |
| Colour arc | by place, or with the plot | Whether the mood changes over the story |
| Camera energy | dives and skims, or pushes and orbits resting on faces | As pace |
| Voices | narration alone, or spoken lines with lip sync | Whether people talk in the story |

Take the nearest studied video from `references/playbook.md` and the project's studies, then change what this story
needs.

## Adding a rule

The register grows from every story: a lesson that stays a sentence in a chat is lost (X-12, S6-15).

1. At each owner note and each judge's or reviewer's finding, write a line in `stories/<slug>/lessons.md` (S6-15): `story-only` (a fix for
   this video) or the rule id it became.
2. A finding true of any video becomes a rule. Run
   `node scripts/add_rule.mjs --stage <S0-S6|X> [--section "<name>"] --text "<one sentence>" --proof "<check|file|owner ...>" --why "<reason>" --source "<story, whose note>"`.
   It picks the next id, refuses a rule with no proof or reason, refuses a near-duplicate (change that rule with
   `--replaces <id>`, or say how it differs with `--differs <id> "<how>"`), and logs it in `references/rules-log.md`.
3. Prefer a check over a reviewer proof: if a script could see the fault, name it and mark it `(new)`, then build it in
   the same PR. `node scripts/add_rule.mjs --unbuilt` lists the checks still waiting.
4. Cite the new id where the skill mentions it, run `node scripts/lint_rules.mjs <skills-root>`, and ship it by PR
   to the skills repo the same day. The next story's checklist is built from the register, so it carries the rule.

## References

Read each when its stage comes up; none links on to another.

| File | Read it when |
|---|---|
| `references/rules.md` | Always at stage 0, then for any id this skill cites (X-7) |
| `references/camera.md` | Stage 3 shots and joins: shots by subject, the camera checks, the joins stack |
| `references/acting.md` | Stage 3 people, props, action and words: faces, hands, reaches, the first-build table, pose gotchas |
| `references/voice-and-sound.md` | Stage 1 narrator and voicing; stage 3 music and the mix |
| `references/team-and-log.md` | Stage 3 when briefing agents (with the place agent brief), and for logging times and tool gotchas |
| `references/checks.md` | Stage 4 and 5: each measured check, its script, its aim and its rule id |
| `references/reviewer-brief.md` | Stage 4: the brief `look.sh` gives the three reviewers (S5-41) |
| `references/judge-brief.md` | Stages 4 and 5: the blind judge's brief for `abjudge.sh` (S5-44) |
| `references/playbook.md` | Stage 1 and 2: techniques from studied videos, for the profile and the plan |
| `references/findings.md` | After a round: past faults and the level each was fixed at (S5-27, S5-28) |
| `references/why.md` | When asked why a rule exists, or for old patterns you meet in an older story |
| `templates/review/index.html` | Stages 1, 2 and 5c: the review page with the owner's Approve button |

The scene loop's scripts sit in `scripts/loop/` (its README lists them). Scripts in `scripts/`: run `pitch.mjs`, `levels.mjs`, `animatic.py` and `production_log.py` as shown above; `lint_rules.mjs`
is run by whoever edits these skills (`node scripts/lint_rules.mjs <skills-root>`).
