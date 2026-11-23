---
name: toon-video
description: Makes short animated videos in a drawn 2D toon look - flat cartoon people drawn in code as cards inside 3D places, rendered with Remotion and Three.js, voiced and scored with ElevenLabs - for any subject, such as a story, an explainer, a product demo, a history piece, a kids' tale or a brand clip. Runs the whole order - script, voice and meaning sheet; cast, parts plan, scenes and animatic; then the hardest scene first, as a spike to likeness 7, for the owner's yes to the look; then each other place in turn - set, cameras, fill and light, each locked - by a world agent and a shots agent; then up to four scene builders for people and motion, where three AI reviewers watch each round and a blind judge keeps or undoes it against the best so far and any earlier good build of the beat; then the scenes joined, captioned and shown to the owner - with the owner's approvals read from a review page. Use when asked for a "toon video", a "2D animated short", a "cartoon explainer", a "drawn video", to "make it in 2D", something "like Ricks Clips", or to "animate this story". For a Bible in Clay story in the toon look, use toon-story-video, which adds that channel's rules on top of this one; for places, the look and the people, load toon-world beside it.
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
**scene** (5 to 10 s, its own composition), **stage** (one step of the order below), **pass** (one area worked on
in rounds), **round** (up to five changes, a render, reviewers, a blind judge), **lock** (`out/<slug>/locks.json`:
files a later step may not change), **join card** (the shared frame at a cut between scenes), **render** (the joined
film), **first scene** (the hardest place and one scene in it, built first as a spike: S5-108), **probe still** (a
still from a place's widest camera, put beside the scene frame before the place is built out: S3-231), **the blend**,
**parts plan**, **detail layer**.

"Reference" alone is ambiguous here; say which of these five:

| Name | What it is | Where it lives | Rule |
|---|---|---|---|
| reference stills | 3 to 6 stills from the project's catalog per place and hero beat, for their standard of detail and light | `stories/<slug>/references.md`; `abjudge.sh --stills` | S2-34, S5-113 |
| scene frame | one frame per scene of its own kind and light level; the likeness number 1 to 10 is scored against it | `stories/<slug>/parts.md`, "Scene frames"; none in the catalog: ask the lead, never score without one | S2-37 |
| beat reference | an earlier good build of a beat (a spike, a practice clip, an earlier version) that the scene copies and is judged against | `scene.json` `ref`; `step.mjs --ref`, `abjudge.sh --ref` | S5-76, S5-112 |
| reference video | another channel's Short copied shot for shot as practice, never posted | `out/practice/<slug>/ref.mp4` (`toon-replicate`) | X-9 |
| reference channel | the larger channel in this look whose numbers set the bar: calm, cuts, brightness | `references/bar.md` | X-16 |

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
   writes `stories/<slug>/checklist.md` from the order below and the register, the `parts.md` and `lessons.md` stubs, registers the film in `src/Root.tsx` and prints the
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
- [ ] Cast sheet: out/<slug>/cast.png; the people and their props wear the palette's strongest colours (S2-1..S2-6, S2-24, S3-251)
- [ ] Library checked first; parts plan per place, the blend proved on one place: stories/<slug>/parts.md (S2-32, S2-7..S2-14, S2-17, S2-25)
- [ ] Reference stills per place and hero beat from the catalog, picked by the lead: stories/<slug>/references.md (S2-34)
- [ ] Each place's light source and side named in its parts plan (S3-191)
- [ ] One scene frame per scene, of its own kind and light level: stories/<slug>/parts.md "Scene frames" (S2-37)
- [ ] Each place's background picture rich by the template (S3-166..S3-168)
- [ ] Scenes split and roughly built: stories/<slug>/scenes.md, beat references named; the one or two beats per scene that must not get worse (S5-39, S2-31, S5-76, X-20)
- [ ] Still board from the rough scenes: out/<slug>/board/, stories/<slug>/board.md (S2-15, S2-16, S2-18..S2-20)
- [ ] Animatic: out/<slug>/animatic.mp4 (S2-21)
- [ ] Review page at stage "direction", one "parts-<place>" and one "picture-<place>" per place; all approved (S2-30, S2-33, S2-22, S2-23)
### Stage 3. First scene and the look (a spike)      stop: likeness 7, then owner "Look yes"; lock "look"
- [ ] Cast and the one mix done once (S3-152..S3-165); the film's captions on (S5-81)
- [ ] Hardest place and one scene in it picked: stories/<slug>/scenes.md "First scene" (S5-108)
- [ ] World agent briefed from team-and-log.md "World agent brief", first-scene form (X-36, X-13)
- [ ] Probe still beside the scene frame before the place is built out: out/<slug>/places/<place>/probe.jpg (S3-231, X-34)
- [ ] Place, rough shots and stand-in people built to toon-world "A rendered world behind drawn people" (S3-213..S3-234)
- [ ] Colour: no place light with sat under 1 (world-check.mjs); the scene's clip at a mean saturation of 0.33 or more (bar-check.py --gate) (S3-252, S3-206, S3-250)
- [ ] Likeness 7 or more and every world row passing, from a reviewer who did not build it: out/<slug>/first-scene/review.md (S2-37, S5-108, X-21, X-31)
- [ ] Review page stage "look": the scene full size beside its scene frame; "look" approved (S5-105, X-33)
- [ ] Look locked: lock.mjs set look; what the scene taught written into the other places' parts plans (S5-105, S2-30)
### Stage 4. The other places, one at a time          stop: "world" and "shots" locked whole
- [ ] Per place, a. Set: structure only, no fill; probe still per scene (S3-229, S3-230, S3-232, S3-231)
- [ ] Per place, b. Cameras and shot sizes with the set; checks and cut budget clean; candidate stills per hero beat; lock.mjs set shots --add (S3-249, S3-241, S5-102, S5-72, S5-91..S5-93, S3-235..S3-238, S5-121)
- [ ] Per place, c. Fill for what those cameras show, then light: source, key lamp, fill, shadows (S3-185..S3-190, S3-197, S3-209, S3-218..S3-222)
- [ ] Per place, d. World rounds to 4 with the world rows; marks.ts; lock.mjs set world --add (S5-110, S5-57..S5-62, S5-72, S5-79, S5-120)
- [ ] Each person's size once in sizes.ts; join cards written (S5-74, S5-51, S5-86)
- [ ] Rough film rendered and judged against the animatic: out/<slug>/film-0/ (S5-84)
- [ ] World and shots locked whole: lock.mjs set world, set shots (S5-120, S5-121)
### Stage 5. Scene stage, up to four at once         stop: each pass at 4 (and at or above its reference), two rounds with no win, or six rounds
- [ ] Rig check: out/<slug>/scenes/<scene>/poses.jpg (S5-54..S5-56, S5-85)
- [ ] People and acting rounds; each round's bar gate runs tools/acting-audit.mjs, and reviewers judge acting on the strips (S5-63, S5-64, S5-66, S5-78, S5-80, S3-134, S5-124, S5-126)
- [ ] Motion and staging rounds (S5-67..S5-69, S5-87)
- [ ] Each hero object and effect measured against its stills every round: stories/<slug>/heroes.json (S5-99, S5-122)
- [ ] Opus lead, Sonnet builders, reviewers and judges (S5-101)
### Stage 6. Join                                    stop: owner's notes taken into the scenes
- [ ] Film joined; joins.sh clean; sound checked once on the mix (S5-52, S5-83)
- [ ] motion-check.py <film> --gate passes: at most 4 quiet seconds a minute, never two in a row, none in the first second (S5-127, S1-37)
- [ ] Three judges against a film-length reference; owner's pick logged against theirs (S5-82, S5-96)
- [ ] Render on the review page; notes sent to their scenes (S5-53)
### Stage 7. Hand-back                               stop: owner "Looks good"
- [ ] Captions, package, hand-back checklist with numbers (S6-1..S6-4)
- [ ] Times logged; lessons written; balance difference reported (S6-9..S6-11)
- [ ] Improved library entries given back by PR (S6-17)
```

### Stage 0. Start

As in Start above. Proof is the branch base and the files `new-film.mjs` writes. Write the film's token budget in
`stories/<slug>/budget.md` from the price list in `references/team-and-log.md`, and stop to ask the owner when it is
spent (X-37).

### Stage 1. Script, voice and meaning sheet

- Write the script to S1-1..S1-8: the strangest true thing within three seconds, about 190 words for 60 s with Laura
  (S1-36), frame 0 designed first with the hook card drawn on frame 0. Sources go in `stories/<slug>/facts.md`
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
  Then a cast review (S2-39): three reviewers see the sheet at phone size beside the reference and write, for each
  person, what they read as in three words, in `out/<slug>/cast-review.md`. A person who reads wrong is redrawn now.
- Library first: read `<toon-world>/library/index.md` and copy any place, vehicle, prop or costume that fits, so the
  budget goes on shots and acting (S2-32). Each copied entry is named in the parts plan.
- Parts plan `stories/<slug>/parts.md`, one section per place: the source of sky, far band, middle, ground, detail
  layer, hero props, people, effects and words, and the story's state for the place (S2-7..S2-14). The blend is
  the look on every place (S2-7); prove it on one place (S2-17).
- Reference stills first (S2-34, S2-35): for each place and each hero beat the lead chooses 3 to 6 stills from the
  project's reference catalog (Bible in Clay: `docs/references/index.json`, private) for their standard of detail, light
  and style, not their subject. List them in `stories/<slug>/references.md` with what each is for ("the ballast at the
  lens: copy the stone density"); the owner is not asked to pick them. Give them to each builder and judge
  (`abjudge.sh --stills <dir>`, S5-113), and measure each render with `<toon-world>/scripts/measure_sharp.py` against them.
- Scene frames (S2-37): for each scene the lead picks one frame of its own kind and light level (a night camp against
  a night camp) and lists it in the "Scene frames" table of `parts.md`. With none in the catalog, ask the owner for
  one; a scene is not scored without its frame. Each place's light source and its side go in its parts plan (S3-191).
- Background pictures by the template in `<toon-world>/references/picture-rules.md`: rich light, near, middle and
  far layers, dense detail, a sky that adds colour (S3-166, S3-167).
- Split the voice into scenes of 5 to 10 s before the board (S2-31), cutting where the story changes place, light or
  beat. List them in `stories/<slug>/scenes.md`: name, seconds, place, the meaning-sheet beats it holds, at most three
  shots per 5 s (S5-39), its beat reference when an earlier build of the beat exists (S5-76), and the one or two beats
  that must not get worse (X-20). Same place in two lights is two places in `places/index.ts` made by one build
  function.
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

### Stages 3 to 6: the film

The film's ceiling is set when a scene is built, so its hardest scene is built first, as a spike, and the owner says
yes to the look on it before another place is built (S5-108, S5-105). Each other place then gets its cameras before
its fill and its light, because fill and the key lamp serve what a locked camera shows (S3-185, S3-197, X-18). The
look itself: `toon-world`, section "A rendered world behind drawn people" (S3-213..S3-234), with the world rows W1 to
W7 in `references/bar.md`. Say the cost before starting agents (X-3). Loop scripts: `<toon-video>/scripts/loop/README.md`.
Each agent is briefed from the filled templates in `references/team-and-log.md` (X-36).

| Stage | Who | Works on | Then | Rules |
|---|---|---|---|---|
| 3. First scene | the world agent, one reviewer who did not build it | the hardest place and one scene in it: world, rough shots, stand-in people | likeness 7, owner's Look yes, lock `look` | S5-108, S5-105, S2-37, S3-231 |
| 4. Other places | the world agent and the shots agent, in turn on each place | a. set, b. cameras and shot sizes, c. fill and light, d. world rounds | per place `shots` then `world`; at the end both whole, after the rough film | S3-185, S3-197, S3-249, S5-120, S5-121, S5-84 |
| 5. Scenes | up to four builders | people and acting, then motion and staging, on their own scenes | each scene to its stop | S5-75, S5-112, S5-78, S5-80, S5-87 |
| 6. Join | the lead | the joined film, its joins, its one mix, the owner | notes back to scenes | S5-52, S5-82, S5-83, S5-86 |

`node <toon-video>/scripts/loop/step.mjs <loop folder>` says what comes next in any stage and refuses when an input
is missing or a locked file changed (S5-48).

**Locks.** `node <toon-video>/scripts/loop/lock.mjs out/<slug> set|check|list|reopen`, run from the project root.

| Lock | Set when | Holds | It refuses |
|---|---|---|---|
| `look` | stage 3, after the owner's Look yes | `src/look/`, `src/stories/<slug>/stage.tsx` | to set without an approved `look` row in `approvals.json` newer than its last reopen (S5-105) |
| `shots`, place by place | stage 4b, once a place's cameras pass their checks | that place's scenes' `shots.ts` (`--add`) | to set before `look` (S5-105) |
| `world`, place by place | stage 4d, after the place's world rounds | `places/<place>.ts` and its pictures in `public/<slug>/` (`--add`) | to set while `shots` is empty: cameras come before fill (S3-185) |
| `world` and `shots`, whole | end of stage 4, after the rough film | all of `places/` and `public/<slug>/`; each scene's `shots.ts`, `sizes.ts`, `joins.json` | as above (S5-120, S5-121) |

A builder who needs a locked file changed asks the lead. The lead reopens that file alone, changes it through its own
step and locks it again: `lock.mjs out/<slug> reopen world src/stories/<slug>/places/<place>.ts --why "<what, who
asked>"`, then world rounds, then `lock.mjs out/<slug> set world --add <same file>`. A camera reopened in `shots`
shows a new view, so that place's fill and light are checked again before both lock (S3-185). Reopening `look` sends
the look back to the owner: `set look` is refused until his newer Look yes (S5-105). Every reopen is logged in
`out/<slug>/locks-log.md`.

### Stage 3. First scene and the look

1. Before it: the cast in `src/stories/<slug>/cast.ts` and the one mix (S3-152..S3-165; `references/voice-and-sound.md`)
   are done once; the Film plays captions from the first render (S5-81).
2. Pick the hardest place (the most to build, or the payoff's light) and one scene in it, and write both under "First
   scene" in `stories/<slug>/scenes.md` with that scene's beats that must not get worse (S5-108, X-20).
3. Brief the world agent from `references/team-and-log.md`, "World agent brief", in its first-scene form. It builds
   the place, the scene's rough shots and stand-in people, as one spike (X-13): stills first, a render to confirm
   (X-24), in `out/<slug>/first-scene/`. The templates still build the drawn look; `toon-world`'s section says which
   files to copy in.
4. Before the place is built out, the probe still from its widest camera goes beside the scene frame (S3-231, X-34):
   `out/<slug>/places/<place>/probe.jpg`.
5. One reviewer who did not build it fills the reviewer brief of `references/spikes.md`: likeness 1 to 10 against the
   scene frame and each world row W1 to W7 (S2-37, X-21). The builder's count of what it fixed is a claim (X-31).
   The world agent goes again from the review, resumed (X-4). Done at likeness 7 or more with every world row
   passing (S5-108); log it in `docs/spikes/LOG.md` under the film's name (X-17). A scene that stalls below 7 goes
   to the owner as its best try beside the scene frame, with the review, and he decides (X-27).
6. **Stop.** Publish the review page at stage `look`: the scene's clip at full size, its scene frame beside it, the
   probe still and the review's likeness line (X-33). Wait for his Approve (S5-105); a note goes back to step 5.
7. Lock the look: `lock.mjs out/<slug> set look src/look src/stories/<slug>/stage.tsx`. Write what the scene taught
   into the other places' parts plans; a changed plan goes back to its `parts-<place>` button (S2-30).

### Stage 4. The other places

One place at a time, the first place included for its other scenes. The world agent and the shots agent take turns;
resume both each time (X-4). While the shots agent sets one place's cameras, the world agent may start the next
place's set. It does not build a set while another place runs world rounds: a revert copies the whole `places/`
folder back from its best snapshot.

a. **Set** (world agent): the structure and no fill (S3-185): walls or land, the floor that leads in, the far view or a lit far
   wall, sky, the big pieces at three depths (S3-229, S3-230, S3-232). A probe still from each of the place's scenes
   beside its scene frame (S3-231).
b. **Cameras** (shots agent): each of the place's scenes gets `scenes/<scene>/shots.ts`: beats from the word times,
   the camera keys, the shot list (S5-121). Shot sizes are chosen with the set (S3-249): a beat with a face or an
   action holds the hero at a third of the frame height or more; a wide with the hero at a third or more may carry the
   scene, and a smaller wide places it briefly (S5-102, S3-241). A scene with a beat reference copies its shot sizes
   and camera side (S5-76). Each shot names why its angle and what moves behind the hero (S5-91, S3-169); the hero
   moment reads as big (S5-92); the spectacle brief is in `references/camera.md`. For each hero beat render 2 to 3
   candidate stills, forced apart in angle and size, on the review page at stage `shots`; the owner picks one (S5-93).
   Checks: `tools/shots-check.mjs` (sizes, the far picture, the cut budget S3-235..S3-238), `tools/cam-speed.mjs`
   (planned cuts in `shots.ts CUTS`) and `tools/path-check.mjs <scene>` (S5-72, S5-102, S5-67, S5-80, S5-87). Then
   `lock.mjs out/<slug> set shots --add src/stories/<slug>/scenes/<scene>/shots.ts ...`.
c. **Fill and light** (world agent), for what those cameras show: fill by S3-185..S3-190; the light source and its
   side from the parts plan (S3-191), the key lamp in front of the hero and to one side for these cameras (S3-197,
   S3-209), the fill on the side away from it, smooth shade, soft shadows and contact (S3-218..S3-222, S5-107).
d. **World rounds** (world agent): one loop folder per place,
   `step.mjs out/<slug>/world/<place> init --code src/stories/<slug>/places --passes world`, on clips of a few
   seconds from the place's scenes, stopping by S5-110, the world rows scored each round. The far picture faces where
   the cameras look (S5-72; `places/marks.ts FAR`), and the place writes its screen direction and blockers in
   `marks.ts` (S5-79, S5-80). Then `lock.mjs out/<slug> set world --add src/stories/<slug>/places/<place>.ts
   public/<slug>/<its pictures>`.

After the last place:

1. Each person's size goes once into `src/stories/<slug>/sizes.ts` (S5-74). The join cards go into
   `stories/<slug>/joins.json` (S5-51): `tools/join-card.mjs <scene>`, or `--jump --dip 8` for a jump in time (S5-86).
2. Render the film rough (the scenes' stand-in poses, captions, the mix) and judge it against the animatic:
   `scripts/loop/abjudge.sh out/<slug>/animatic.mp4 <rough film> out/<slug>/film-0 --judges 3 --stills <refs>` (S5-84, S5-113). Film-level
   faults (dead stretches across joins, missing words) show here, not in a scene.
3. Lock both whole (a plain `set` replaces the place-by-place lists):
   `lock.mjs out/<slug> set world src/stories/<slug>/places public/<slug>` and
   `lock.mjs out/<slug> set shots src/stories/<slug>/scenes/*/shots.ts src/stories/<slug>/sizes.ts stories/<slug>/joins.json`.

### Stage 5. Scene stage

Up to four builders at once, one per group of scenes (S5-49, S5-75): about 2 to 3 million tokens a scene. Brief each
from `references/team-and-log.md`, "Scene builder brief", and resume the same builder every round (X-4). Each scene's
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
   (S5-42). With a reference the judge sees it too and scores the new clip against both (S5-112).

A text round (a trial, S5-128): on a scene's first people round, the change list may come from
`scripts/loop/textround.py $D/best/clip.mp4 $R --limits $D/limits.md --meaning $D/meaning.md --protect $D/protect.md
--facts $D/facts.md --words $D/words.json --window <a-b>` instead of from the builder's reading of `best/faults.md`. It
writes the clip out as text, has text reviewers and a reviser work on the text, and leaves `$R/text/changes.md`: the
builder builds exactly that list and proves its check table; then judge first, and `look.sh` when the judge
would keep the round (S5-46). It needs the frame's hard limits in `limits.md` and takes about 12 minutes and 0.6M tokens; run
it as a background command. Read `references/text-round.md` first.

A round is kept on a clear win (S5-133): over 0.3 from one judge, or, for a margin of 0.1 to 0.3, a second judge in
the other order who also prefers it; a tie keeps best. When two kept rounds in a row leave likeness under 7,
`step.mjs` says so: the next round is the lead's, on the place or the cast (S5-129). After a scene's second round the
lead reads its `requests.md` and takes any fault the reviewers all named twice (S5-130).

Run steps 5 and 6 with a 10-minute command timeout. After a lost or tied round, skip step 5 next time (S5-46);
`step.mjs` writes `faults.md` from best's faults and the judge's notes (S5-90). The same top fault twice running means
restaging that beat (S5-45). A pass stops at 4 on its area, two rounds in a row with no win, or six rounds (S5-110),
whatever a brief says (S5-111); with a reference, the target stop also needs best to beat or tie it (S5-112). Compare
clips side by side within one judging (S5-44).

### Stage 6. Join and show the owner

1. Render the Film composition: the scenes in order over the one mix, with captions and dips (S5-52, S5-81).
2. `node src/stories/<slug>/tools/join-times.mjs > out/<slug>/join-times.json`, then `scripts/loop/joins.sh <film>
   out/<slug>/join-times.json out/<slug>/film-<n>/joins` over the joins (S5-52); a dip is a planned fade (S5-86). A
   bad join goes back to the scene that owns its card (S5-51).
3. Each join person by person (S5-131): place, pose, step, face and what is held carry over, and the camera's speed,
   in `out/<slug>/joins/notes.md`. Then the sound's cues are re-timed to the actions as built, each new contact given
   a cue (S5-132), and the sound check runs once on the film's mix: `audible.py` on every cue, then `levels.mjs` (S5-83).
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

The owner's yes is his click on a review page, copied into `src/stories/<slug>/approvals.json` (S0-14). Agents read
the page's store and copy it; they never create or change an approval row (S0-14, X-6). `lock.mjs set look` refuses
without an approved `look` row. `step.mjs` does not read the file yet, so the lead checks the row for a stage before
starting the next one (S2-23, S5-48). A yes he gives in chat: ask him to click it on the page.

**Publish the page.** One review page per story, republished at each stage, so one store holds each approval.

1. Copy `templates/review/index.html` to `out/<slug>/review/index.html`, with the media it shows under
   `out/<slug>/review/v/` (videos) and `c/` (images).
2. Fill the `#page-data` JSON: `story` (the slug), `stage` (`story`, `direction`, `parts-<place>`, `picture-<place>`,
   `look`, `shots` or `render-<n>`),
   `title`, `ask` (one plain sentence of what to decide) and `items` (each `{ kind, src, caption }`). At `look` and
   `render-<n>` the clip is full size, and a smaller copy says its size in its caption (X-33); at `look` its scene
   frame and probe still sit beside it.
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
| Joins | cuts to new angles inside a place, dissolves or joins between places (S3-201) | Calm holds with a slow drift (S3-203) and angle cuts for one place; dissolves for many |
| Colour arc | by place, or with the plot | Whether the mood changes over the story |
| Camera energy | dives and skims, or pushes and orbits resting on faces | As pace |
| Voices | narration alone, or spoken lines with lip sync | Whether people talk in the story |

Take the nearest studied video from `references/playbook.md` and the project's studies, then change what this story
needs.

## Spikes

When a look, a method or a fix is unproven, spike 15 seconds first, before a whole film (X-13): one stretch, one
question, one thing changed, judged against a fixed baseline on the bar's 15 checks. The method, the series order, the
brief templates and the scripts (`bar-check.py`, `spike-frames.sh`, `spike-ab.sh`): `references/spikes.md`; the
checks: `references/bar.md`. The rules the 18 November 2026 spikes found (X-13..X-34, S3-171..S3-200 and their replacements S3-201..S3-212, S5-102, S5-107) are
proven on short stretches only; the next film made with this skill is their proof run (X-30). So is the rendered-world
look the owner chose the same day (S3-213..S3-234, S2-37, S5-108, S5-105): `toon-world`, "A rendered world behind drawn
people", built at stage 3 above. A spike inside a film works on one scene behind a switch, names its beats that
must not get worse (X-20), and changes no other scene's locked files (X-19).

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
| `references/camera.md` | Stage 4b cameras and joins: the spectacle brief, shots by subject, the camera checks, the joins stack |
| `references/acting.md` | Stage 5 people, props, action and words: faces and what each looks like, hands, held things, reaches, pose gotchas |
| `references/voice-and-sound.md` | Stage 1 narrator and voicing; the music and the mix before stage 3 |
| `references/team-and-log.md` | Stages 3 to 5: the briefs for the world agent (first scene; a place), the shots agent and the scene builders, filled in and not rewritten (X-36); logging times; tool gotchas |
| `references/checks.md` | Stages 3 to 6: each measured check, its script, its aim and its rule id |
| `references/reviewer-brief.md` | Stages 3 to 5: the brief `look.sh` gives the three reviewers (S5-41) |
| `references/text-round.md` | Stage 5, before a text round: what was measured, the limits and facts files, the steps, what it does not do (S5-128) |
| `references/judge-brief.md` | Stages 3 to 6: the blind judge's brief for `abjudge.sh`, with the reference clip (S5-44, S5-112) |
| `references/playbook.md` | Stage 1 and 2: techniques from studied videos, for the profile and the plan |
| `references/findings.md` | After a round: past faults and the level each was fixed at (S5-27, S5-28) |
| `references/spikes.md` | Before trying an unproven look, method or fix: the spike rules, the loop, planning a series, brief templates, the scripts (X-13) |
| `references/bar.md` | Measuring a spike or a stretch against a reference: the 15 checks, the calm and brightness numbers (X-16) |
| `references/why.md` | When asked why a rule exists, or for old patterns you meet in an older story |
| `templates/review/index.html` | Stages 1, 2 and 6: the review page, one section and Approve button per stage |

The scene loop's scripts sit in `scripts/loop/` (its README lists them). Scripts in `scripts/`: run `pitch.mjs`, `levels.mjs`, `animatic.py`, `eleven-balance.mjs` and `production_log.py` as shown above, `motion-check.py <film> --gate` on the joined film (it needs numpy and opencv: its first lines say how), and `bar-check.py`, `spike-frames.sh` and `spike-ab.sh` as `references/spikes.md` shows; `lint_rules.mjs`
is run by whoever edits these skills (`node scripts/lint_rules.mjs <skills-root>`).
