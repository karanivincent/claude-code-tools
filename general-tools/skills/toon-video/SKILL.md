---
name: toon-video
description: Makes short animated videos in a drawn 2D toon look - flat cartoon people drawn in code as cards inside 3D places, rendered with Remotion and Three.js, voiced and scored with ElevenLabs - for any subject, such as a story, an explainer, a product demo, a history piece, a kids' tale or a brand clip. Runs the whole order - script, voice and meaning sheet; cast, parts plan and animatic; the build; the gate; then cycles of critic rounds and one render each until the score reaches 4.2 - with the owner's approvals read from a review page. Use when asked for a "toon video", a "2D animated short", a "cartoon explainer", a "drawn video", to "make it in 2D", something "like Ricks Clips", or to "animate this story". For a Bible in Clay story in the toon look, use toon-story-video, which adds that channel's rules on top of this one; for places, the look and the people, load toon-world beside it.
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
**critic round** (a scored beat board with each scene's path to 5), **render** (the whole film at full size; 8 s or
less is a fix check), **cycle** (three critic rounds, one render, owner notes, one render critic), **the blend**,
**parts plan**, **detail layer**.

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
### Stage 3. Build
- [ ] Places in the blend, light and look stack (S3-1..S3-54)
- [ ] People, props and effects (S3-55..S3-80)
- [ ] Shots and joins from the meaning sheet (S3-81..S3-133)
- [ ] Acting, action and words on screen (S3-134..S3-151)
- [ ] Sound: pauses, music, mix with stems (S3-152..S3-165)
### Stage 4. Audit                                  stop: the gate passes
- [ ] Cold read: out/<slug>/coldread.json (S4-13..S4-15)
- [ ] node src/stories/<slug>/tools/gate.mjs critic passes (S4-1..S4-12, S4-16)
### Stage 5. Cycle <n>                              stop: score 4.2, or a cycle gains under +0.1
- [ ] Each round logged as it ends: critique row with --file, fix row with --cycle and --round, findings section (S5-38)
- [ ] Critic round 1, fixed: out/<slug>/critic-<n>-1.md (S5-1..S5-12, S5-25..S5-28, S5-33, S5-34, S5-37)
- [ ] Critic round 2, fixed: out/<slug>/critic-<n>-2.md
- [ ] Critic round 3, fixed: out/<slug>/critic-<n>-3.md
- [ ] gate.mjs render passes; one render: out/<slug>/render-<n>.mp4 (S5-13..S5-19); log report and rounds beside it (S5-35)
- [ ] Owner's render notes pulled from the review page (S5-20)
- [ ] Render critic: out/<slug>/critic-<n>-render.md (S5-31)
- [ ] Stop rule checked; next cycle starts from both sets of notes (S5-22, S5-32)
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

### Stage 3. Build

Build what the approved animatic shows (S3-1), as a team when the film is longer than a few seconds (X-4;
`references/team-and-log.md`). Order of work:

1. Places in the blend with their detail layer, light and the look stack (S3-1..S3-54; `toon-world`).
2. People, props and effects (S3-55..S3-80; `references/acting.md`).
3. Shots by subject from the meaning sheet's must-see entries (S3-83), timed on words, and joins from the stack with a
   reason each (S3-81..S3-133; `references/camera.md`).
4. Acting on every beat, action beats, words on screen and captions (S3-134..S3-151; `references/acting.md`).
5. Sound: pauses settled, music in sections, the mix with voice and bed stems (S3-152..S3-165;
   `references/voice-and-sound.md`). Run `node scripts/<slug>-sound.mjs`, then
   `node <toon-video>/scripts/levels.mjs out/<slug>/voice.wav out/<slug>/bed.wav full.json`.

While building, check moving stretches with short renders of 8 s or less (S5-25), not the whole film.

### Stage 4. Audit

Run the cold read first (S4-13..S4-15): one clean still per new place, prop, effect, material and face, read by a
fresh cheap agent with `<toon-world>/references/cold-read-brief.md`; save the answers to `out/<slug>/coldread.json`.

Then the gate, as a loop:

1. Run `node src/stories/<slug>/tools/gate.mjs critic`.
2. Read what it names: each failure gives its check, the rule id and the frame or file.
3. Fix that cause. Do not touch the gate, its thresholds or `approvals.json` (X-6).
4. Run the gate again. Go on to stage 5 only when it passes (S4-1).

The gate runs the acting and camera audit, the sound levels, the look checks, brightness and sharpness, and checks
the files and approvals (S4-2..S4-11). What each check measures, its script and its rule are in
`references/checks.md`.

### Stage 5. The cycle

A cycle is three critic rounds on the frames, one render, the owner's notes, and one look by the critic at the
render. Repeat cycles until the score is 4.2 or a cycle gains under +0.1 (S5-32). There is no cap on renders, and
the owner sees each one (S5-13, S5-20).

**a. Three critic rounds before the render** (S5-1..S5-12):

1. Make the beat board: 2 to 3 full-size stills per shot at its action words
   (`node src/stories/<slug>/tools/beat.mjs out/<slug>/beat-<n>-<round>`), plus the gate's report and the meaning
   sheet (S5-7). It renders several stills at once and copies any frame the look check already rendered (S5-39).
2. Brief a fresh critic agent from `references/critic-brief.md`, pre-render mode. It scores each scene 1 to 5 in
   world, people, light and story, and gives each scene its path to 5: what would take it there, each item with its
   predicted gain, then a forecast (S5-2..S5-5). Faults come after the path (S5-3).
3. The critic replies with its report as text; save it to `out/<slug>/critic-<n>-<round>.md` (S5-9). Log it at once:
   `production_log.py add ... --stage critique --cycle <n> --round <round> --mode stills --file critic-<n>-<round>.md`
   with `--score`, `--areas` and `--judge` (S5-12). From round 2 on, write its `## <n>-<round>` section in
   `stories/<slug>/findings.md`: each prediction against the result, each finding with what allowed it, the change
   and its level (S5-11, S5-27). The gate refuses without them (S5-38).
4. Fix the top five path items and faults by gain (S5-33), the rest first on the next list, at the strongest level
   that fits (S5-27). Two builders at once, split by place, each owning its files. Check each fix on a short moving
   render of its stretch (S5-25) and against the last two cuts (S5-26): every join and acting change with
   `ranges.mjs <dir> --ranges <a-b,...> --stills <t,...> --probe`, which runs the motion probe on each stretch (S5-40).
5. Run the gate once (`gate.mjs critic`) and fix until it passes (S5-34); it runs the audit and the look check at
   once (S5-39). End the round on one full-size frame of every shot, each asked whether the place could exist (S5-37): the look check's own `out/<slug>/look/post-<NNN>.png` are that frame (listed in
   `look/stills.json`); copy them to `out/<slug>/fix-<n>-<round>/` rather than render them again. Log the fix row with
   `--cycle <n> --round <round>` and the round's `production_log.py tooltime` line in `--note`.
6. Repeat for rounds 2 and 3. Rounds 2 and 3 re-score what changed and compare each prediction with the
   result (S5-10, S5-11). The aim is three rounds from the first cut to the owner's yes; `rounds` counts them (S5-36).

**b. One render** (S5-13..S5-19). Run `node src/stories/<slug>/tools/gate.mjs render`; when it passes, render with
`node src/stories/<slug>/tools/render.mjs out/<slug>/render-<n>.mp4`, mux the mix, and run the render checks in
`references/checks.md` (`frame_motion.py`, `short_qa.py`, `pace.py`). Save `production_log.py report` and `rounds` for
the story to `out/<slug>/log-<n>.txt`; it goes on the review page with the render (S5-35).

**c. The owner's notes** (S5-20). Publish the render on the review page at stage `render-<n>` and wait for his
notes. Pull them (see Approvals). His notes lead the next cycle.

**d. The render critic, once** (S5-31). With his notes in, first run
`python3 <toon-video>/scripts/critic_prep.py out/<slug>/render-<n>.mp4 out/<slug>/critic-prep-<n> --stems public/<dir of STORY.audio>`
(S5-40: frames every 2.4 s, sheets at 2 a second, the motion probe's spikes and cuts, each cue's effect against the
voice). Then brief a critic in render mode (`references/critic-brief.md`) and hand it that folder. It scores the
four areas on the moving film plus motion and sound (pops, swings, sync, levels); its film score is the cycle's score. Save its report to
`out/<slug>/critic-<n>-render.md`, log it with `--mode render --round render --file critic-<n>-render.md`, and write
its `## <n>-render` findings section (S5-38).

**e. The stop rule** (S5-32). Stop when the render critic's score is 4.2 or more, or when it rose by under
+0.1 over the last cycle's. Otherwise start the next cycle from his notes and the render critic's (S5-22): build, run the
gate, then critic round 1 again.

Why the path to 5 leads: on Elijah and the widow, fixing the fault list alone moved the beat board from 2.78 to 3.06
over three rounds (S5-2). A fault list lifts a 2 to a 3; the path says what makes a scene a 4 or a 5.

### Stage 6. Hand-back

Work through the hand-back lines of `checklist.md` and give the measured numbers with the video (S6-1). Captions
file: `python3 src/stories/<slug>/tools/srt.py full.json out/<slug>/captions.srt` (S6-3). Package with the
`story-thumbnails` skill (S6-4). Drafts only; the owner's "Looks good" on the finished video comes before any post
(S6-2). Log each step's time (S6-10), write the lessons (S6-11) and report the balance difference (S6-9). After a
week, log the audience numbers (S6-12, S6-13).

## Approvals

The owner's yes is his click on a review page; the gate reads it from `src/stories/<slug>/approvals.json` (S0-14).
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
   as `<id>: story-only` or `<id>: <rule id>` (S6-15); the gate refuses while a note is open.

Silence is not a yes at stages 1 and 2 (S0-15). A finished Short at its posting deadline follows the project's own
rule.

## The dynamics profile

Each video keeps the same backbone (hook and loop, meaning sheet, the blend, one cast style, captions, the mix, the
owner's stages, the gate) and picks its own dynamics in `profile.md` at stage 1 (S1-23). The gate's pace and hold
checks read the profile (S4-9).

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

1. At each owner note and each critic finding, write a line in `stories/<slug>/lessons.md` (S6-15): `story-only` (a fix for
   this video) or the rule id it became.
2. A finding true of any video becomes a rule. Run
   `node scripts/add_rule.mjs --stage <S0-S6|X> [--section "<name>"] --text "<one sentence>" --proof "<check|file|owner ...>" --why "<reason>" --source "<story, whose note>"`.
   It picks the next id, refuses a rule with no proof or reason, refuses a near-duplicate (change that rule with
   `--replaces <id>`, or say how it differs with `--differs <id> "<how>"`), and logs it in `references/rules-log.md`.
3. Prefer a check over a critic proof: if a script could see the fault, name it and mark it `(new)`, then build it in
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
| `references/critic-brief.md` | Stage 5: brief each critic from it (S5-2) |
| `references/playbook.md` | Stage 1 and 2: techniques from studied videos, for the profile and the plan |
| `references/findings.md` | After a critic round: past faults and the level each was fixed at (S5-27, S5-28) |
| `references/why.md` | When asked why a rule exists, or for old patterns you meet in an older story |
| `templates/review/index.html` | Stages 1, 2 and 5c: the review page with the owner's Approve button |

Scripts in `scripts/`: run `pitch.mjs`, `levels.mjs`, `animatic.py`, `production_log.py`, `motion_probe.py` and
`critic_prep.py` as shown above; `lint_rules.mjs`
is run by whoever edits these skills (`node scripts/lint_rules.mjs <skills-root>`).
