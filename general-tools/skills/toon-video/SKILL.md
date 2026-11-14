---
name: toon-video
description: Makes short animated videos in a drawn 2D toon look - flat cartoon people drawn in code as cards inside 3D places, rendered with Remotion and Three.js, voiced and scored with ElevenLabs - for any subject, such as a story, an explainer, a product demo, a history piece, a kids' tale or a brand clip. Runs the whole order - script, voice and meaning sheet; cast, parts plan, scenes and animatic; then the film built by areas across the whole film, each locked before the next - one world agent for all the places, one shots agent for all the cameras and shot sizes, then up to four scene builders for people and motion, where three AI reviewers watch each round and a blind judge keeps or undoes it against the best so far and any earlier good build of the beat; then the scenes joined, captioned and shown to the owner - with the owner's approvals read from a review page. Use when asked for a "toon video", a "2D animated short", a "cartoon explainer", a "drawn video", to "make it in 2D", something "like Ricks Clips", or to "animate this story". For a Bible in Clay story in the toon look, use toon-story-video, which adds that channel's rules on top of this one; for places, the look and the people, load toon-world beside it.
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
**scene** (5 to 10 s, its own composition), **stage** (one area built across the whole film, then locked: world,
shots, scenes, join), **pass** (one area worked on in rounds), **round** (up to five changes, a render, reviewers, a
blind judge), **reference** (an earlier good build of a beat, which each round of that scene is also judged against: S5-77),
**lock** (`out/<slug>/locks.json`: files a later stage may not change), **join card** (the shared frame at a cut
between scenes), **render** (the joined film), **the blend**, **parts plan**, **detail layer**.

## Where the scripts are

`<toon-video>` and `<toon-world>` below mean the skills in the plugin cache:
`~/.claude/plugins/cache/vince-tools-marketplace/general-tools/<newest version>/skills/toon-video` (and `toon-world`).
Run their scripts from there; they are not copied into projects. Tools copied into a story by `new-film.mjs` sit in
`src/stories/<slug>/tools/` and run from the project root.

## Start

1. Branch from the project's `main`, which holds the toon kit and the film template (S0-1):
   `git switch main && git pull && git switch -c story/<slug>`. A Bible in Clay story uses a worktree, as the
   project's CLAUDE.md says. A story that reuses a practice build still branches from `main`; bring the practice's
   files in by path (`git checkout <practice-branch> -- <paths>`), and its clip becomes that scene's reference (S0-20).
2. Start the film (S0-2 to S0-6, S0-8):
   `node <toon-world>/scripts/new-film.mjs <project> <slug> <CompositionId>`. It copies the template, syncs the kit,
   writes `stories/<slug>/checklist.md` from the register, registers the film in `src/Root.tsx` and prints the
   `npm i -E` line to run. If it ends with "STILL TO DO: src/look is older", run it again with `--look`; it lists the
   other stories that import `src/look`, so render one still of one of them before and after (S0-21).
3. Read `references/rules.md` stage S0 and the X rules, then the project's making-of doc in full (S0-9).
4. Record the profile (S0-11) in the log of the project the story is built in (make the file if it has none):
   `python3 <toon-video>/scripts/production_log.py profile docs/production-log.jsonl --story <slug> --channel <c> --look toon --methods code-3d,painted-texture,bean-cards`.
5. Read the ElevenLabs balance before the first credit (S6-9): `node --env-file=<secrets.env>
   <toon-video>/scripts/eleven-balance.mjs --log stories/<slug>/checklist.md`. Hand secrets files to node with
   `--env-file` (X-1).

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
### Stage 2. Cast, look, parts plan, scenes, animatic  stop: owner "Direction yes" and "Parts plan yes" per place
- [ ] Cast sheet: out/<slug>/cast.png (S2-1..S2-6, S2-24)
- [ ] Library checked first; parts plan per place, the blend proved on one place: stories/<slug>/parts.md (S2-32, S2-7..S2-14, S2-17, S2-25)
- [ ] Reference stills per place and hero beat from the catalog: stories/<slug>/references.md; owner's pick per place (S2-34)
- [ ] Each place's background picture rich by the template (S3-166..S3-168)
- [ ] Scenes split and roughly built: stories/<slug>/scenes.md, references named (S5-39, S2-31, S5-76)
- [ ] Still board from the rough scenes: out/<slug>/board/, stories/<slug>/board.md (S2-15, S2-16, S2-18..S2-20)
- [ ] Animatic: out/<slug>/animatic.mp4 (S2-21)
- [ ] Review page at stage "direction", one "parts-<place>" and one "picture-<place>" per place; all approved (S2-30, S2-33, S2-22, S2-23)
### Stage 3. World stage (one agent, every place)    stop: places locked
- [ ] Cast and the one mix done once (S3-152..S3-165); the film's captions on (S5-81)
- [ ] Every place built and checked from every scene's planned cameras; world rounds (S5-71, S5-57..S5-62)
- [ ] Far pictures face the cameras; screen direction in marks.ts (S5-72, S5-79)
- [ ] Places locked: out/<slug>/locks.json "world" (S5-71)
### Stage 4. Shots stage (one agent, every scene)    stop: shots locked
- [ ] Every scene's camera, beats and shot list in shots.ts, copying any reference (S5-73, S5-76, S5-88)
- [ ] Spectacle: each shot's reason and what moves behind; hero moments staged big (S5-91, S5-92, S3-169)
- [ ] 2 to 3 candidate stills per hero beat; owner's pick on the review page at stage "shots" (S5-93)
- [ ] Each person's size once in sizes.ts; join cards written (S5-74, S5-51, S5-86)
- [ ] shots-check, cam-speed and path-check clean (S5-72, S5-88, S5-67, S5-80)
- [ ] Rough film rendered and judged against the animatic: out/<slug>/film-0/ (S5-84)
- [ ] Shots locked: out/<slug>/locks.json "shots" (S5-73)
### Stage 5. Scene stage, up to four at once         stop: each pass at 4 (and at or above its reference), two rounds with no win, or six rounds
- [ ] Rig check: out/<slug>/scenes/<scene>/poses.jpg (S5-54..S5-56, S5-85)
- [ ] People and acting rounds (S5-63, S5-64, S5-66, S5-78, S5-80)
- [ ] Motion and staging rounds (S5-67..S5-69, S5-87)
### Stage 6. Join                                    stop: owner's notes taken into the scenes
- [ ] Film joined; joins.sh clean; sound checked once on the mix (S5-52, S5-83)
- [ ] Three judges against a film-length reference; owner's pick logged against theirs (S5-82, S5-96)
- [ ] Render on the review page; notes sent to their scenes (S5-53)
### Stage 7. Hand-back                               stop: owner "Looks good"
- [ ] Captions, package, hand-back checklist with numbers (S6-1..S6-4)
- [ ] Times logged; lessons written; balance difference reported (S6-9..S6-11)
- [ ] Improved library entries given back by PR (S6-17)
```

### Stage 0. Start

As in Start above. Proof is the branch base and the files `new-film.mjs` writes.

### Stage 1. Script, voice and meaning sheet

- Write the script to S1-1..S1-8: the strangest true thing within three seconds, about 190 words for 60 s with Laura
  (S1-35), frame 0 designed first with the hook card drawn on frame 0. Sources go in `stories/<slug>/facts.md`
  (S1-6). When the primary source cannot be read, use the author's own published words and list what is unchecked
  (S1-33). A reused practice set, cast or clip is checked against the facts too (S1-34).
- Narrator: Laura by default (S1-9). Another voice is picked by pitch (S1-10):
  `node <toon-video>/scripts/pitch.mjs takes/*.mp3 --band <lo>-<hi>`; record the pick in `voices.md` (S1-12).
- Voice with the project's voice script; it caches each line (S1-13, S1-14). Cut leads and check the cut lines with
  whisper (S1-15, S1-16): `whisper-cli -m <model> -f <line.wav> -oj`; find a model with
  `ls ~/.cache/*/whisper/*.bin`. Read the total length now and cut lines here (S1-18).
- Retell: give a fresh agent the script alone and ask it to retell the story; fix and repeat until it is right. Save
  its last answer to `out/<slug>/retell.md` (S1-19).
- Meaning sheet `stories/<slug>/meaning.md` (S1-20..S1-22): per beat, the thing that changes, its cause, and the shot
  that shows the change; the one thing to see each second; a keyed action per verb. The same entries go into code as
  must-see entries later (S3-83).
- Dynamics profile `stories/<slug>/profile.md` from the nearest studied video (S1-23); the dials are below.
- **Stop.** Publish the review page at stage `story` with the script, the narration (an `audio` item) and the meaning
  sheet (a `text` item), and wait for the owner's Approve (S1-24). Notes he sends instead are fixed and the page
  republished.

### Stage 2. Cast, look, parts plan, scenes and animatic

Template and layout: `<toon-world>/templates/film-scenes/README.md` and `<toon-world>/templates/scene/README.md`.

- Cast sheet `out/<slug>/cast.png`: each person and animal as a flat card in this story's own style
  (S2-1..S2-6): `npx remotion still src/index.ts <Film>-cast out/<slug>/cast.png`. Load `toon-world` for the cards.
- Library first: read `<toon-world>/library/index.md` and copy any place, vehicle, prop or costume that fits, so the
  budget goes on shots and acting (S2-32). Each copied entry is named in the parts plan.
- Parts plan `stories/<slug>/parts.md`, one section per place: the source of sky, far band, middle, ground, detail
  layer, hero props, people, effects and words, and the story's state for the place (S2-7..S2-14). The blend is
  the look on every place (S2-7); prove it on one place (S2-17).
- Reference stills first (S2-34, S2-35): for each place and each hero beat choose 3 to 6 stills from the project's
  reference catalog by tag and subject (Bible in Clay: `docs/references/index.json`, private). List them in
  `stories/<slug>/references.md` with what each is for ("the ballast at the lens: copy the stone sizes"), offer 2 or 3
  sets per place on the review page as `refs-<place>`, and give the picked stills to each builder and judge (S2-35)
  (`abjudge.sh --stills <dir>`, S5-97). Measure each render with `<toon-world>/scripts/measure_sharp.py` against them.
- Background pictures by the template in `<toon-world>/references/picture-rules.md`: rich light, near, middle and
  far layers, dense detail, a sky that adds colour (S3-166, S3-167).
- Split the voice into scenes of 5 to 10 s before the board (S2-31), cutting where the story changes place, light or
  beat. List them in `stories/<slug>/scenes.md`: name, seconds, place, the meaning-sheet beats it holds, at most three
  shots per 5 s (S5-39), and its reference when an earlier build of the beat exists (S5-76). Same place in two
  lights is two places in `places/index.ts` made by one build function.
- Still board from the rough scenes: `node src/stories/<slug>/tools/board.mjs stories/<slug>/board-stills.json
  out/<slug>/board` (S2-16, S2-31), 2 to 3 framings per line (S2-15), with the planner's notes and each person's
  gesture on its word in `stories/<slug>/board.md` (S2-18, S2-19).
- Animatic: `python3 <toon-video>/scripts/animatic.py out/<slug>/board/board.json src/stories/<slug>/full.json
  out/<slug>/board <voice.wav> out/<slug>/animatic.mp4` (S2-21), with a python that has Pillow.
- **Stop.** Publish the review page with a section at stage `direction` (animatic, cast sheet), one section
  `parts-<place>` per place (its parts plan as a `text` item, and stills), and one section `picture-<place>` per place
  with its background picture (S2-33). Wait for every Approve (S2-30, S2-22); the
  page says which stages still wait. He judges direction: colours, people, anything missing in the story; he does not
  review frame by frame (S0-13). Nothing is built before then (S2-23).

### Stages 3 to 6: the film, by areas

The film is built as scenes (S5-39), but by areas in order across the whole film, each locked before the next
(S5-71, S5-73, S5-75). One agent owns each of the first two areas, so every scene sits in the same world and is shot
the same way. Say the cost before starting agents (X-3). Loop scripts: `<toon-video>/scripts/loop/README.md`.

| Stage | Who | Works on | Then | Rules |
|---|---|---|---|---|
| 3. World | one world agent | every place: sky, far band, middle, ground, detail layer, light | lock `world` | S5-71, S5-72, S5-79, S5-57..S5-62 |
| 4. Shots | one shots agent | every scene's camera, beats, shot sizes; each person's size; join cards | rough film, lock `shots` | S5-73, S5-74, S5-76, S5-84, S5-88 |
| 5. Scenes | up to four builders | people and acting, then motion and staging, on their own scenes | each scene to its stop | S5-75, S5-77, S5-78, S5-80, S5-87 |
| 6. Join | the lead | the joined film, its joins, its one mix, the owner | notes back to scenes | S5-52, S5-82, S5-83, S5-86 |

`node <toon-video>/scripts/loop/step.mjs <loop folder>` says what comes next in any stage and refuses when an input
is missing or a locked file changed (S5-48). Locks: `node <toon-video>/scripts/loop/lock.mjs out/<slug> set|check|reopen`.
A builder who needs a place, a camera or a size changed asks the lead; the lead reopens that stage, changes it through
its own loop and locks it again.

### Stage 3. World stage

Before it: the cast in `src/stories/<slug>/cast.ts` and the one mix (S3-152..S3-165; `references/voice-and-sound.md`)
are done once; the Film plays captions from the first render (S5-81).

1. The world agent builds every place in `src/stories/<slug>/places/` from the approved parts plans (S5-57).
2. It writes rough shots for each scene first (or takes the board's), and checks each place from each scene's
   planned camera (S5-71): stills at each scene's key frames (`tools/stills-sheet.mjs <scene> --frames a,b,c`).
3. It runs world-and-light rounds in one loop folder, `out/<slug>/world/`
   (`step.mjs out/<slug>/world init --code src/stories/<slug>/places --passes world`), on clips of a few seconds from
   several scenes, and stops by S5-43.
4. Each far picture faces where the cameras look (S5-72; `places/marks.ts FAR`, checked by `tools/shots-check.mjs`),
   and each place writes its screen direction and its blockers in `marks.ts` (S5-79, S5-80).
5. Lock: `node <toon-video>/scripts/loop/lock.mjs out/<slug> set world src/stories/<slug>/places public/<slug>`.

### Stage 4. Shots stage

1. The shots agent writes each scene's `scenes/<scene>/shots.ts`: beats from the word times, the camera keys, and the
   shot list (S5-73). A beat with a face or an action holds the hero at a third of the frame height or more; wides
   only place the scene, and briefly (S5-88). A scene with a reference copies its shot sizes and camera side, and its
   loop is started with `--ref <clip>` (S5-76).
   Choose each shot for size and drama by the spectacle brief in `references/camera.md`: each shot names why its
   angle and what moves behind the hero (S5-91, S3-169); the hero moment reads as big (S5-92).
   For each hero beat render 2 to 3 candidate stills, forced apart in angle and size, and publish them on the review
   page at stage `shots`. The owner picks one by note; he does not rank many (S5-93).
2. Each person's size goes once into `src/stories/<slug>/sizes.ts` (S5-74). The join cards go into
   `stories/<slug>/joins.json` (S5-51): `tools/join-card.mjs <scene>`, or `--jump --dip 8` for a jump in time (S5-86).
3. Checks, on each scene: `tools/shots-check.mjs`, `tools/cam-speed.mjs` (planned cuts in `shots.ts CUTS`) and
   `tools/path-check.mjs <scene>` (S5-72, S5-88, S5-67, S5-80, S5-87).
4. Render the film rough (the scenes' stand-in poses, captions, the mix) and judge it against the animatic:
   `scripts/loop/abjudge.sh out/<slug>/animatic.mp4 <rough film> out/<slug>/film-0 --judges 3 --stills <refs>` (S5-84, S5-97). Film-level
   faults (dead stretches across joins, missing words) show here, not in a scene.
5. Lock: `lock.mjs out/<slug> set shots src/stories/<slug>/scenes/*/shots.ts src/stories/<slug>/sizes.ts stories/<slug>/joins.json`.

### Stage 5. Scene stage

Up to four builders at once, one per group of scenes (S5-49, S5-75): about 2 to 3 million tokens a scene. Each scene's
loop folder is `out/<slug>/scenes/<scene>`:
`step.mjs $D init --code src/stories/<slug>/scenes/<scene> [--ref <clip>]` (passes: people, then motion). Write the
scene's words with `scripts/loop/words.mjs src/stories/<slug>/full.json --scene <scene> --plan
src/stories/<slug>/plan.ts --out $D/words.json`. The rig check comes first: a pose sheet of each pose and prop the
words need (S5-54..S5-56, S5-85).

A round (S5-41), with `$R` the round folder:

1. The builder makes at most five changes, from `best/faults.md`, in its own scene's `story.ts`.
2. Stills sheet of the changed seconds, looked at before any render; `tools/pose-check.mjs <scene>` (S5-78) and,
   when someone moves past others, `tools/path-check.mjs <scene>` (S5-80).
3. Render the scene (about 15 s): `tools/render.mjs <scene> --scale 0.5 --out $R/clip.mp4`, taking a render slot as
   the project says.
4. `scripts/loop/jumps.sh` for the code fact (S5-47).
5. `scripts/loop/look.sh $R/clip.mp4 $R --focus <pass> --words $D/words.json`: three reviewers, writing `faults.md`.
6. `scripts/loop/abjudge.sh $D/best/clip.mp4 $R/clip.mp4 $R [--ref <clip>]`: keep, revert or keep the credited parts
   (S5-42). With a reference the judge sees it too and scores the new clip against both (S5-77).

Run steps 5 and 6 with a 10-minute command timeout. After a lost or tied round, skip step 5 next time (S5-46);
`step.mjs` writes `faults.md` from best's faults and the judge's notes (S5-90). The same top fault twice running means
restaging that beat (S5-45). A pass stops at 4 on its area, two rounds in a row with no win, or six rounds (S5-43),
whatever a brief says (S5-89); with a reference, the target stop also needs best to beat or tie it (S5-77). Compare
clips side by side within one judging (S5-44).

### Stage 6. Join and show the owner

1. Render the Film composition: the scenes in order over the one mix, with captions and dips (S5-52, S5-81).
2. `node src/stories/<slug>/tools/join-times.mjs > out/<slug>/join-times.json`, then `scripts/loop/joins.sh <film>
   out/<slug>/join-times.json out/<slug>/film-<n>/joins` over the joins (S5-52); a dip is a planned fade (S5-86). A
   bad join goes back to the scene that owns its card (S5-51).
3. The sound check, once on the film's mix: `audible.py` on every cue, then `levels.mjs` (S5-83).
4. `scripts/loop/abjudge.sh <reference film> <new film> out/<slug>/film-<n> --judges 3`, where the reference film is
   the last film the owner saw, else the rough film or the animatic: never a short clip (S5-82). Then `short_qa.py`
   on the full film (S5-18), faces bright enough for a phone, night included (S4-19), and the project's own brightness
   rule (Bible in Clay: S4-18).
   The owner's pick outranks the judges. When his pick differs from a judge's, write the clips, the model and both
   picks in `stories/<slug>/judge-vs-owner.md` (S5-96).
5. Publish it on the review page at stage `render-<n>` (S5-53). Each of his notes goes to the scene it names and runs
   as a round there, then the film is joined again.

### Stage 7. Hand-back

Work through the hand-back lines of `checklist.md` and give the measured numbers with the video (S6-1). Captions
file: `python3 <toon-world>/templates/film/tools/srt.py src/stories/<slug>/full.json out/<slug>/captions.srt` (S6-3).
Package with the `story-thumbnails` skill (S6-4). Drafts only; the owner's "Looks good" on the finished video comes
before any post (S6-2). Log each step's time (S6-10), write the lessons (S6-11) and report the balance difference
(S6-9). Give back each library entry the story improved, by PR to the skills repo (S6-17). After a week, log the
audience numbers (S6-12, S6-13).

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
| `references/camera.md` | Stage 4 shots and joins: the spectacle brief, shots by subject, the camera checks, the joins stack |
| `references/acting.md` | Stage 5 people, props, action and words: faces and what each looks like, hands, held things, reaches, pose gotchas |
| `references/voice-and-sound.md` | Stage 1 narrator and voicing; the music and the mix before stage 3 |
| `references/team-and-log.md` | Stages 3 to 5 when briefing the world agent, the shots agent and the scene builders, and for logging times and tool gotchas |
| `references/checks.md` | Stages 3 to 6: each measured check, its script, its aim and its rule id |
| `references/reviewer-brief.md` | Stages 3 to 5: the brief `look.sh` gives the three reviewers (S5-41) |
| `references/judge-brief.md` | Stages 3 to 6: the blind judge's brief for `abjudge.sh`, with the reference clip (S5-44, S5-77) |
| `references/playbook.md` | Stage 1 and 2: techniques from studied videos, for the profile and the plan |
| `references/findings.md` | After a round: past faults and the level each was fixed at (S5-27, S5-28) |
| `references/why.md` | When asked why a rule exists, or for old patterns you meet in an older story |
| `templates/review/index.html` | Stages 1, 2 and 6: the review page, one section and Approve button per stage |

The scene loop's scripts sit in `scripts/loop/` (its README lists them). Scripts in `scripts/`: run `pitch.mjs`, `levels.mjs`, `animatic.py`, `eleven-balance.mjs` and `production_log.py` as shown above; `lint_rules.mjs`
is run by whoever edits these skills (`node scripts/lint_rules.mjs <skills-root>`).
