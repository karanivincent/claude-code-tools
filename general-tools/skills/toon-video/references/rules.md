# The rule register

Every rule of `toon-video`, `toon-world` and `toon-story-video`, one line each, in the order a story is made. The skill
text cites a rule by its id and never restates it; `scripts/lint_rules.mjs` fails any line in those skills that says
must, never, always, every or only without an id.

## Contents

- [How to read a rule](#how-to-read-a-rule)
- [Terms](#terms)
- [S0 Start](#s0-start)
- [S1 Script and voice](#s1-script-and-voice)
- [S2 Cast, look and animatic](#s2-cast-look-and-animatic)
- [S3 Build](#s3-build)
  - [Places and the blend](#places-and-the-blend)
  - [Light and the look stack](#light-and-the-look-stack)
  - [People](#people)
  - [Props and effects](#props-and-effects)
  - [Shots and camera](#shots-and-camera)
  - [Joins](#joins)
  - [Acting and action](#acting-and-action)
  - [Words on screen](#words-on-screen)
  - [Sound](#sound)
- [S4 Audit](#s4-audit)
- [S5 Scene loop](#s5-scene-loop)
  - [Critic rounds](#critic-rounds)
  - [The render](#the-render)
  - [Owner notes and the render critic](#owner-notes-and-the-render-critic)
  - [Fixing](#fixing)
- [S6 Hand-back](#s6-hand-back)
- [X Any stage](#x-any-stage)

## How to read a rule

`- **ID** rule. Proof: <how it is proved>. Why: <reason>.`

- IDs are stable and never reused. A dropped rule keeps its id, struck through, so old citations still resolve.
- `check <name>`: a script or kit function that `tools/gate.mjs` runs and that fails on a breach. `(new)` marks a check
  the rewrite spec asks for that is not built yet.
- `file <path>`: a file that has to exist; the gate refuses without it.
- `owner <button>`: Vincent's click on the review page, read by the gate from `src/stories/<slug>/approvals.json`.
- `check critic: <area>`: a judgement call. The critic round asks about it by id. It is the weakest proof; move such a
  rule to a script when one can see it.

## Terms

| Term | Means |
|---|---|
| still board | 2 to 3 stills per line, from the real parts, made at stage 2 |
| animatic | the still board played over the recorded voice |
| beat board | 2 to 3 full-size stills per shot at its action words, from the built film; the critic round's input |
| render | the whole film rendered at full size; a check of 8 s or less is a fix check, not a render |
| critic round | the critic scores the beat board and gives each scene's path to 5 |
| cycle | three critic rounds with fixes, one render, owner notes, one render critic |
| the blend | far band one picture; middle and ground code 3D with painted textures; a detail layer |
| parts plan | per place, the source of every part of the picture (`stories/<slug>/parts.md`) |
| detail layer | small real things in a place that move: flies, smoke, dust in light, cloth, birds |

## S0 Start

- **S0-1** Every story branches from `main`, where the toon kit and film template live; never from another story's branch. Proof: check `gate.mjs: branch base is main` (new). Why: story branches drifted and conflicted in six files. (Vincent, 11 Nov 2026)
- **S0-2** Start the film with `new-film.mjs`; never copy `src/spike2d`, another story's folder or its `shots.ts`. Proof: check `sync-kit.mjs` (names local `path`, `K`, `curve`). Why: copied code made videos alike and blocked kit fixes.
- **S0-3** `new-film.mjs` copies `templates/look/` without `cast.ts` and `toon.ts`, and prints the exact `npm i -E` line. Proof: check `new-film.mjs: look and pins` (new). Why: without them the build passes but nothing renders.
- **S0-4** Pin `@react-three/postprocessing@3.0.4`, `postprocessing@6.39.5`, three 0.186 and TypeScript 5. Proof: check `new-film.mjs: version pins` (new). Why: postprocessing 3.2 renders blank; TypeScript 7 breaks Remotion's bundler.
- **S0-5** Bring the kit in with `sync-kit.mjs` and leave `src/toon-kit/` unedited; a kit fix goes into the skills repo. Proof: check `sync-kit.mjs` (stops on an edited copy). Why: an edited copy never receives later kit fixes.
- **S0-6** Copy from `templates/` into the story; never import from the skill folder. Proof: check `sync-kit.mjs`. Why: a skill update would change a finished story.
- **S0-7** The kit holds techniques with settings; people, faces, costumes, places, props, palettes and grade values stay in the story. Proof: check `critic: kit PR`. Why: shared looks made two videos look alike.
- **S0-8** `new-film.mjs` writes `checklist.md` from this register; handovers and task lists copy it word for word and tick it. Proof: file `stories/<slug>/checklist.md` (new). Why: retold steps outlived the rule they retold.
- **S0-9** Read the project's making-of doc in full before planning; fix any clash with this register the same day. Proof: file `stories/<slug>/checklist.md` (ticked line). Why: project lessons hold rules this register lacks.
- **S0-10** Know the form first: a 9:16 Short of 50 to 65 s, or 16:9. Proof: check `gate.mjs: duration within form` (new). Why: portrait width drives every camera rule.
- **S0-11** Record the profile first: `production_log.py profile` with methods from its list (`code-3d`, `painted-texture`, `bean-cards`...). Proof: check `production_log.py areas`. Why: per-method averages show which method makes the weak area.
- **S0-12** A coordinator's brief for a finished video keeps the owner's buttons at stages 1 and 2. Proof: owner `Story yes`, `Direction yes`. Why: a "finished render" brief once skipped every owner stage.
- **S0-13** Vincent's early looks are two, three at most, for direction only; he never reviews frame by frame. Proof: owner `Story yes`, `Direction yes`. Why: his time goes on direction, not frame critique. (Vincent, 11 Nov 2026)
- **S0-14** A yes is Vincent's click on the review page; the gate reads `approvals.json` from the page's store and no agent writes it. Proof: file `src/stories/<slug>/approvals.json` (new). Why: agents wrote the old gate's yes themselves. (Vincent, 11 Nov 2026)
- **S0-15** Silence is a yes only for a finished Short at its posting deadline, never for stages 1 and 2. Proof: owner `Story yes`, `Direction yes`. Why: early stages need his explicit direction. (Vincent, 11 Nov 2026)
- **S0-16** Bible in Clay: the story key ends in `-2d` and its catalog entry says `"look": "toon"`. Proof: check `catalog-refresh.mjs: look field` (new). Why: the review page and records show which look it is.
- **S0-17** Bible in Clay: a 2D remake keeps the 3D story's files and draft; both go on the review page. Proof: owner `Looks good`. Why: Vincent picks between the two looks.
- **S0-18** Bible in Clay: one look per story, clay or toon, never both. Proof: check `catalog-refresh.mjs: look field` (new). Why: a story drifting between looks reads as two videos.
- **S0-19** Bible in Clay: merge main before building and run every check docs/REVIEW-LESSONS.md lists. Proof: check gate.mjs (new: review-lessons list). Why: one review note teaches every video.
- **S0-20** A story that reuses a practice build branches from main and brings the practice's files in by path; the practice clip becomes the scene's reference. Proof: file out/<slug>/scenes/<scene>/scene.json (ref). Why: the skill had no line for starting from a practice.
- **S0-21** Before new-film.mjs --look updates src/look, it lists the other stories importing it; render one still of one before and after. Proof: check new-film.mjs (look importers). Why: --look rewrote shared drawing code other stories use.

## S1 Script and voice

- **S1-1** Open on the strangest true thing within three seconds, build in steps, land the turn at the end. Proof: check `critic: story`. Why: the viewer needs a reason to stay in one second.
- ~~**S1-2** Write about 150 words for 60 s of film. Proof: check `gate.mjs: words per minute` (new). Why: narration runs about 3 words a second with pauses.~~ Replaced by S1-35.
- **S1-3** Bring in every person and object before it matters. Proof: check `critic: story`. Why: a payoff with an unseen prop reads as a cheat.
- **S1-4** The hook's payoff comes soon after it, and the last line loops back to frame 0. Proof: check `critic: story`. Why: a looping Short lands the hook again.
- **S1-5** Leave out facts you cannot show; say an imagined feeling as imagined. Proof: check `critic: story`. Why: told facts with no picture lose the viewer.
- **S1-6** Record each fact from a primary source with its page in `facts.md`; OCR a scan that will not fetch. Proof: file `stories/<slug>/facts.md`. Why: a claim without a source cannot be checked.
- **S1-7** Design second 0 first: a big face or subject over 30% of the frame, motion from frame 1, the hook card at 0.0 s. Proof: check `checkOpening`. Why: in the feed frame 0 is the package.
- **S1-8** The hook card is fully drawn on frame 0 (`pop: false`), and `checkCues` accepts an opening card. Proof: check `checkCues` (new: opening card). Why: a 0.35 s pop showed no card on frame 0.
- **S1-9** The narrator is Laura (`FGY2WhTYpPnrIDTdsKH5`, eleven_v3, stability 0.3, about 1.2x `atempo`) unless the story needs another voice. Proof: file `stories/<slug>/voices.md`. Why: one known voice, chosen for her energy. (Vincent, 11 Nov 2026)
- **S1-10** Another narrator is picked by measured pitch with `pitch.mjs` on the same 30 words, and shown to Vincent. Proof: owner `Story yes`. Why: library descriptions missed the wanted pitch band.
- **S1-11** Before choosing a slower narrator, work out the film's length at the tempo cap against the form. Proof: check `gate.mjs: duration within form` (new). Why: a slower voice forced re-timing every shot and cue.
- **S1-12** The voices file records the voice, its id, settings, pitch, how many were tried and why. Proof: file `stories/<slug>/voices.md`. Why: the next story reuses or changes it knowingly.
- **S1-13** One voice per speaker, eleven_v3 tags, each line cached by a hash of its text and voice. Proof: check `story-voice.mjs: cache hit` (new). Why: a rerun of unchanged lines costs nothing.
- **S1-14** Lines reused from an earlier version copy their mp3 and align files. Proof: check `story-voice.mjs: cache hit` (new). Why: matching hashes cost no credits.
- **S1-15** Cut each line from at least 0.10 s before its first letter and 0.12 s after its last. Proof: check `story-voice.mjs: lead` (new). Why: a 0.04 s lead turned "Paris" into "Chris".
- **S1-16** Check every cut line with whisper, not the raw take. Proof: file `out/<slug>/whisper.json` (new). Why: cut bursts only show on the cut line.
- **S1-17** No `[whispers]` or `[hushed]` tags; mark a reveal with a pause and a slower, lower read in full voice. Proof: check `story-voice.mjs: banned tags` (new). Why: Vincent dislikes whispers; they sat at -31 LUFS.
- **S1-18** Read the total voice length now and cut lines here, not after the music. Proof: check `gate.mjs: duration within form` (new). Why: cuts after the music re-time everything.
- **S1-19** A fresh agent retells the story from the script alone; fix and repeat until it retells it right. Proof: file `out/<slug>/retell.md` (new). Why: what the agent misreads, the viewer misreads.
- **S1-20** Write the meaning sheet: per beat, the thing that changes, its cause, and the shot showing the change happen. Proof: file `stories/<slug>/meaning.md`. Why: a state is not a change; the change is the shot.
- **S1-21** The meaning sheet names the one thing the viewer must see each second. Proof: file `stories/<slug>/meaning.md`. Why: every later check measures against it.
- **S1-22** Every verb on the meaning sheet gets a keyed action of 0.3 s or more, with in-between poses. Proof: check `acting.ts: verbActions` (new). Why: actions between board samples showed only in motion.
- **S1-23** The dynamics profile (pace, longest holds, joins, colour arc, camera energy, voices) is written from the nearest studied video. Proof: file `stories/<slug>/profile.md` (new). Why: the checks measure against the story's own profile.
- **S1-24** Vincent approves the story and narration by button before stage 2. Proof: owner `Story yes`. Why: the story is cheapest to change here. (Vincent, 11 Nov 2026)
- **S1-25** Bible in Clay: 50 to 65 s, opening on the passage's strangest true detail. Proof: check `gate.mjs: duration within form` (new). Why: the channel's Short form.
- **S1-26** Bible in Clay: quotation marks hold only exact Berean Standard Bible words, each naming its speaker. Proof: check `quotes.mjs: BSB match` (new). Why: the channel quotes scripture word for word.
- **S1-27** Bible in Clay: never invent an event the text does not have. Proof: check `critic: story`. Why: the channel retells, it does not add.
- **S1-28** Bible in Clay: a mystery telling holds every Bible name back until the reveal. Proof: check `critic: story`. Why: an early name gives the mystery away.
- **S1-29** Bible in Clay: reuse the 3D version's voice lines where the words match. Proof: check `story-voice.mjs: cache hit` (new). Why: matching hashes cost no credits.
- **S1-30** Bible in Clay: a panel picks the story's package before the script, per docs/story-choice/PANEL.md. Proof: file docs/story-choice/<date>/decisions.md. Why: the package decides who clicks.
- **S1-31** Bible in Clay: the script ends on the detail most people miss and a question to the viewer. Proof: check critic: story. Why: the question drives comments.
- **S1-32** A crowd speaks with one voice, or the verse's words split in order across two or three voices. Proof: check critic: sound. Why: a stacked chorus is muddy and unclear.
- **S1-33** When the primary source cannot be read, use the author's own published words and list each unchecked fact for the owner in facts.md. Proof: file stories/<slug>/facts.md. Why: the book was not available; nothing said what to do.
- **S1-34** A practice set, cast or clip reused for a story is checked against facts.md; anything the facts do not have is dropped. Proof: file stories/<slug>/facts.md. Why: the practice clips had invented friends and a cap.
- **S1-35** Write about 190 words for 60 s with Laura at 1.2x tempo; time another narrator's rate on the first voiced line. Proof: check gate.mjs: words per minute (new). Why: 196 words ran 60 s, against the old 150.

## S2 Cast, look and animatic

- **S2-1** Every story designs its own cast style: faces, clothes, hats and palette. Proof: owner `Direction yes`. Why: copied people made two videos look alike.
- **S2-2** The bean-head card rig may carry over; a story's people and places never come from another story. Proof: check `critic: kit PR`. Why: techniques are shared, looks are not.
- **S2-3** The cast sheet shows every person and animal as a flat cartoon card in the story's style. Proof: owner `Direction yes`. Why: one sheet fixes the cast before any shot.
- **S2-4** No 3D model of anything alive; no realistic or painted person or animal. Proof: check `critic: people`. Why: a realistic figure breaks the drawn world.
- **S2-5** A grown man in a long robe has a beard or a plait. Proof: check `coldread.json: sex read` (new). Why: a beardless robed man read as a woman.
- **S2-6** A woman has hair or lashes, never only a veil. Proof: check `coldread.json: sex read` (new). Why: a grey veil read as an old man.
- **S2-7** Every place uses the blend: far band one picture, middle and ground code 3D with painted textures, plus a detail layer. Proof: check `look.mjs: plainMeshes` (new). Why: plain code colour reads as plastic. (Vincent, 11 Nov 2026)
- **S2-8** "Drawn in code" with flat colour is not a look; it is gone from the looks menu and templates. Proof: check `look.mjs: plainMeshes` (new). Why: flat code places read cheap and fake. (Vincent, 11 Nov 2026)
- **S2-9** Write a parts plan per place: the source of sky, far band, middle, ground, detail layer, hero props, people, effects, words. Proof: file `stories/<slug>/parts.md`. Why: parts mixed by plan, not by habit.
- ~~**S2-10** Vincent approves each place's parts plan by button. Proof: owner `Parts plan yes`. Why: he picks how each place is made. (Vincent, 11 Nov 2026)~~ Replaced by S2-30.
- **S2-11** Props are real 3D built in code; Higgsfield image-to-3D only when Vincent asks for it. Proof: file `stories/<slug>/parts.md`. Why: code props move and break; credits stay low. (Vincent, 11 Nov 2026)
- **S2-12** One look in any single frame, and every look keeps the same flat cartoon people. Proof: check `critic: world`. Why: mixed looks in one frame read as a collage.
- **S2-13** The parts plan says the story's state for each place (a drought: dry trees, no clouds). Proof: file `stories/<slug>/parts.md`. Why: a drought with green trees told the wrong story.
- **S2-14** A gate, a door or a wall the story names has the town or room behind it in the plan. Proof: file `stories/<slug>/parts.md`. Why: a gate with nothing behind read as a prop.
- **S2-15** The still board plans 2 to 3 framings per line: a wide, a medium, a close or an insert. Proof: check `checkPace`. Why: one framing per line held pace at 22 to 24.
- **S2-16** Board stills render from the real parts through the look stack, one small place file per place. Proof: check `stills.mjs`. Why: what is approved is what moves.
- **S2-17** The blend is proved on one place first, then other place agents are briefed from it. Proof: check `look.mjs` (new) on the first place. Why: a proved mix stops every agent guessing.
- **S2-18** Beside each still the planner notes words on things, their language, the subject's size against neighbours, and how the line's thing is shown. Proof: file `stories/<slug>/board.md` (new). Why: six owner notes after round 6 were all visible on stills.
- **S2-19** The shot plan names each person's gesture, look and action on its word. Proof: file `stories/<slug>/board.md` (new). Why: a 2.78 first score was mostly unplanned acting.
- **S2-20** Show the board on a phone-friendly page: at most three stills a row, each with its line, words, what is shown, flaws in red. Proof: owner `Direction yes`. Why: Vincent reviews on his phone.
- **S2-21** The animatic plays the still board over the recorded voice with words and still names (`animatic.py`). Proof: file `out/<slug>/animatic.mp4` (new). Why: the whole story is seen in a minute, cheaply.
- **S2-22** Vincent gives overall direction (colours, characters, anything missing) on the animatic by button. Proof: owner `Direction yes`. Why: direction changes cost least before the build. (Vincent, 11 Nov 2026)
- **S2-23** Nothing is built before both stage buttons are in `approvals.json`. Proof: check `gate.mjs: approvals` (new). Why: building before direction cost whole rounds.
- **S2-24** An AI still for the board uses the place's master and the cast sheet as references and stays flat 2D cartoon. Proof: check `critic: people`. Why: stills drifted to realistic or 3D people.
- **S2-25** A picture that becomes a texture is made at `resolution: "2k"` and `quality: "high"`. Proof: check `look.mjs: smallTextures` (new). Why: without them pictures come back about 750 px wide.
- **S2-26** Bible in Clay: God and the angel of the LORD are a voice and a light, never a drawn person. Proof: check `critic: people`. Why: the channel never draws God.
- **S2-27** Bible in Clay: crowds match the text's numbers. Proof: check `critic: world`. Why: a feast or an army of 90 is the story.
- **S2-28** Bible in Clay: Ricks Clips (`docs/RICKS-STUDY.md`) is the reference for pace and fullness of the world. Proof: check `critic: world`. Why: the channel measures itself against its best reference.
- **S2-29** A flat 2D place is an exception the parts plan must justify and the owner approves. Proof: owner Approve direction. Why: flat places read as bare and toy-like.
- **S2-30** Vincent approves each place's parts plan by button, and again whenever that plan changes. Proof: owner Parts plan yes (gate.mjs: parts-<place>). Why: he picks how each place is made.
- **S2-31** Split the scenes before the still board; board.mjs renders the board from rough scenes in the real places. Proof: check tools/board.mjs. Why: the board needed places, cast and rough cameras first.
- **S2-32** Before planning a place, look in toon-world/library/ for a place, vehicle, prop or costume to copy; the parts plan names each entry it copies. Proof: file stories/<slug>/parts.md (library line). Why: rebuilding the world spent the budget shots and acting needed.
- **S2-34** At stage 2 the lead picks 3 to 6 stills from the reference catalog for each place and hero beat, for their standard of detail, light and style, not their subject (a still of a ship's deck can set the bar for a cockpit); they are listed in `stories/<slug>/references.md` with what each is for. The owner is not asked to pick them. Proof: file stories/<slug>/references.md. Why: the B-17 stretch, built with no reference stills, measured a sixth of the railroads Short's sharpness; Vincent could not pick a cockpit set from stills of other places. (Vincent, 14 Nov 2026)
- **S2-35** Builders get the picked stills in their briefs and copy their detail: separate objects near the lens, materials, light; a still marked `no` in the catalog becomes a playbook blueprint before anyone builds it. Proof: check briefs name the stills. Why: a builder copies what it sees, not what a rule describes.
- **S2-33** Vincent approves each background picture itself by its own picture-<place> button at stage 2, beside the parts plan. Proof: owner Picture yes (gate.mjs: picture-<place>). Why: a flat midday picture passed under an approved parts plan.

## S3 Build

### Places and the blend

- **S3-1** Build only what the approved animatic shows. Proof: owner `Direction yes`. Why: unseen detail costs time and no score.
- **S3-2** A set list per place before any shot: 8 or more props, a full background, extras. Proof: file `stories/<slug>/parts.md`. Why: talking heads on plain ground score 2.
- **S3-3** The far band is one picture on a curved screen that follows the camera. Proof: check `look.mjs: flatShare` (new). Why: a far picture barely moves, so it holds.
- **S3-4** A far picture seen all round is one 360-degree strip with the geography in one direction. Proof: check `critic: world`. Why: a repeated picture put the sea on every side.
- **S3-5** A backdrop screen extends below its picture, and a low camera gets a sky dome. Proof: check `checkSky`. Why: otherwise flat colour shows under the picture.
- **S3-6** Far backdrop bands reach below the lowest point the ground's far edge reaches. Proof: check `checkSky`. Why: a sky strip under the hills read as a lake.
- **S3-7** Middle and ground are code 3D with painted tileable textures; no plain-colour mesh near the camera. Proof: check `look.mjs: plainMeshes` (new). Why: painted pictures on code shapes read real. (Vincent, 11 Nov 2026)
- **S3-8** Textures near the camera are 2048 px with mipmaps and 16x anisotropy. Proof: check `look.mjs: smallTextures` (new). Why: 1024 and 256 textures measured 5.5 times softer.
- **S3-9** Every shot has a detail layer of real moving things (flies, smoke, dust in light shafts, cloth, birds, a goat), not dots. Proof: check `look.mjs: detailCount` (new). Why: speckle dots read as noise, not life. (Vincent, 11 Nov 2026) Background life behind the hero: S3-169.
- **S3-10** The flat-colour share of each beat-board still stays under the look threshold. Proof: check `look.mjs: flatShare` (new). Why: flat areas read as an unfinished place.
- **S3-11** Scatter painted 2D litter decals on the ground band. Proof: check `look.mjs: detailCount` (new). Why: a bare ground reads as a stage floor.
- **S3-12** A calm area stays right behind every face; detail goes round the edges, on the ground and in the air. Proof: check `critic: world`. Why: a busy cut-out behind a person read as clutter.
- **S3-13** At most one busy band per frame, away from faces; thin repeated parts are fewer and thicker. Proof: check `critic: world`. Why: dozens of braces filled the frame with noise.
- **S3-14** A repeated part that is the hero in a close shot gets full detail. Proof: check `critic: world`. Why: then it is the subject, not clutter.
- **S3-15** Pictures are rich, saturated and crisp with no haze; clean each cut-out's fringe (erode 2 px, fill from inside). Proof: check `measure_sharp` (new: exit code). Why: a hazy cut-out of hills was rejected as fake.
- **S3-16** Never cut a picture through a subject. Proof: check `critic: world`. Why: a cut subject shows a hard false edge.
- **S3-17** A place sized to the story, its moving parts moving (boat, wake, waves). Proof: check `critic: world`. Why: an island too small undercut a 29-year hunt.
- **S3-18** Indoors, a projected master picture may paint the middle band, built to a numbered floor plan. Proof: file `stories/<slug>/parts.md`. Why: a fitted projection gives rich walls on code shapes.
- **S3-19** Fit a master picture's camera with `fit-camera-example.mjs`; never trust the prompt's numbers. Proof: check `fit-camera-example.mjs` (fit error under about 15 px). Why: heights came out 2.3 to 3.8 m for 1.6 asked.
- **S3-20** Never generate a separate close-up of a place; model the close object or crop the master. Proof: check `critic: world`. Why: a fresh close-up redraws the room.
- **S3-21** Picture prompts follow `picture-rules.md`: plan paragraph, camera on the plan, lens in words, named light, no people, no haze. Proof: check `critic: world`. Why: pictures agree only on what the prompt pins.
- **S3-22** To remove an object from a projected master, `hallMaterial` `holes` lays the wall's own tile in phase, v = 1 - t. Proof: check `critic: world`. Why: v = t laid the tile upside down and banded.
- **S3-23** Every doorway reaches the floor and every opening is open; cut bands, rails and skirting with `trimSpans`. Proof: check `set.ts: trimSpans` tests. Why: a band across a door read as a cupboard.
- **S3-24** Set pieces in one plane are offset 3 to 6 cm, or the trim gets `polygonOffset`. Proof: check `critic: world`. Why: coplanar edges flicker as dashed lines.
- **S3-25** Nobody walks through solid scenery: list the solids and check every path. Proof: check `audit.mjs: walk through solids` (new). Why: a figure through a wall breaks the world.
- **S3-26** Size the hero prop against a person first. Proof: check `critic: world`. Why: a prop twice too big crowds every shot.
- **S3-27** Invented things round a small subject stay near its size, and the subject gets its own light pool. Proof: check `critic: world`. Why: invented canvases dwarfed the Mona Lisa.
- **S3-28** Cameras on uneven ground give heights above the ground under each point. Proof: check `safe`. Why: absolute heights put cameras underground.
- **S3-29** Crowds are painted once and reused, their phase offsets kept positive (`frac = v => ((v % 1) + 1) % 1`). Proof: check `kit tests`. Why: a negative phase picked a missing picture and crashed three.js.
- **S3-166** A background picture has rich light: golden hour, low sun, storm light or a dramatic sky; flat midday only when the story needs it, then raked light and strong shadows. Proof: owner Picture yes. Why: the B-17's flat midday picture gave plain, dull colour.
- **S3-167** A background picture holds near, middle and far layers under a sky that adds colour, densely detailed, never a thin row on an empty field. Proof: owner Picture yes. Why: two thirds empty sky and one row of objects read flat.
- **S3-168** The picture takes no more of the frame than its band; code middle, ground and detail layer fill the rest. Proof: check critic: world. Why: most of the B-17 frame was the dull generated picture.
- **S3-169** Every shot has something moving behind the hero that fits the story: other planes, vehicles, people working, flags, birds, dust, smoke or water. Proof: check critic: world. Why: nothing moved behind the hero in all three B-17 builds.

### Light and the look stack

- **S3-30** Colour is bright and saturated: saturated sky and grass, warm golden sun, shade tinted blue or violet, never grey. Proof: check `measure_look` (new: exit code). Why: Vincent wants bright game colour. (Vincent, 11 Nov 2026)
- **S3-31** No muted albedos and no lifted blacks; the black point stays near black. Proof: check `measure_look` (new: exit code). Why: lifted blacks and muted colour read washed out. (Vincent, 11 Nov 2026)
- **S3-32** Push colour in passes, each with before and after sheets of the same frames, watching large flat surfaces. Proof: check `measure_look` (new: exit code). Why: grade pushes turned shade lilac and grass acid.
- **S3-33** Composer order: ink, lens blur, bloom on light sources, neutral tone map, grade; MSAA 4. Proof: check `look.mjs: composer order` (new). Why: ink merged with blur smears the lines.
- **S3-34** Every pixel size in the look stack scales with output height / 1920. Proof: check `look.mjs: composer order` (new). Why: fixed pixel sizes change the look at quarter size.
- **S3-35** Backgrounds stay sharp in every shot size, close-ups included, as in the reference stills; people read by light, outline and a calm area behind the face (S3-12), not by blur. Proof: check `look.mjs: blurByShot` (new). Why: every studied reference keeps its background sharp in close-ups, and our blur was one reason the B-17 stretch measured soft (sharpness 207 against their 1251). (Vincent, 14 Nov 2026; replaces blur behind people, 11 Nov)
- **S3-36** A shot sets a background blur (at most 4 px at 1080 wide) only when its reference still shows a soft background; the default is 0. Proof: check `look.mjs: blurByShot` (new). Why: copy the reference, not a rule of our own. (Vincent, 14 Nov 2026)
- **S3-37** `Stage.tsx` has no forced blur floor; a shot's blur comes from its size. Proof: check `look.mjs: blurByShot` (new). Why: a forced 11 px floor blurred every wide.
- **S3-38** No motion blur anywhere. Proof: check `look.mjs: no motion blur import` (new). Why: it doubled arms and softened the picture. (Vincent, 11 Nov 2026)
- **S3-39** Ink on the world: near-black, about 5 px near to 3 px far, its own pass, thinned over painted detail. Proof: check `measure_look` (new: ink share). Why: ink on painted detail doubles the clutter.
- **S3-40** People cards sit on the `NOINK` layer and carry their own outline. Proof: check `look.mjs: card layers` (new). Why: world ink crossed faces.
- **S3-41** Two-tone light: shade blue-grey indoors, violet-blue outdoors at sunset, never brown or black. Proof: check `measure_look` (new: exit code). Why: grey or brown shade reads dull.
- **S3-42** Indoors use one warm key per framing, set relative to the camera. Proof: check `critic: light`. Why: one key keeps faces and props readable.
- **S3-43** Indoors only people's contact blobs and free-standing floor things cast the key's shadow. Proof: check `critic: light`. Why: rail and bar shadows read as glass slabs.
- **S3-44** Bloom only on real light sources (threshold 1.0); white faces never glow. Proof: check `look.mjs: bloom threshold` (new). Why: glowing faces read as pasted on.
- **S3-45** No bloom or glow source within 4 m of the lens. Proof: check `audit.mjs: glow near lens` (new). Why: lamps beside the lens whited out the lower third.
- **S3-46** Nothing translucent or additive in front of the face a line is about. Proof: check `measure_look` (new: face saturation). Why: glare and a light pool turned a face milky.
- **S3-47** Time of day multiplies every lit material through `timeOfDay`, before people and effects. Proof: check `light.ts: timeOfDay` tests. Why: a blue sky over day ground read as afternoon.
- **S3-48** Night is shown by hue, brightness and one warm light; saturation stays at or above the day's. Proof: check `measure_look` (new: exit code). Why: drained saturation turned a red room grey.
- **S3-49** The era shows through objects; colours stay bright and modern, no sepia; a faded grade only for a marked flashback. Proof: check `measure_look` (new: exit code). Why: a faded 1911 read old and pale.
- **S3-50** A light volume fades by viewing angle (|N.V| to the power 2 to 3) and to nothing below its top, with no outline. Proof: check `critic: light`. Why: an even cylinder read as a glass box.
- **S3-51** A faded light volume keeps enough strength to read as light on a full-size frame. Proof: check `critic: light`. Why: over-faded shafts read as grey haze.
- **S3-52** Metals and gold at about 60% albedo. Proof: check `critic: light`. Why: higher albedo goes lemon under the lit multiplier.
- **S3-53** Light follows the story (warm fire, blue danger, gold hope) and every face stays bright enough for a phone. Proof: check `brightness.mjs`. Why: a dark face is lost on a phone.
- **S3-54** Check a lit place by rendering from the master's camera and comparing mean brightness with the picture. Proof: check `measure_look` (new: exit code). Why: the first light was 30% too bright.

### People

- **S3-55** Toon figures wear mittens, never fingers; the fingers rule is for clay figures only. Proof: check `audit.mjs: mitts set` (new). Why: thin fingers read as claws on a phone. (Vincent, 11 Nov 2026)
- **S3-56** Mitten figures keep hand size 1; a grip in a shot wider than a face uses a side view. Proof: check `critic: people`. Why: a 2x grip became balls the size of the head.
- **S3-57** Cards are lit by the scene (`cardshade`), faces near white (about 0.93), with a soft contact blob; never emissive. Proof: check `look.mjs: card material` (new). Why: emissive cards look pasted on.
- **S3-58** Cards keep the depth test on (alphaTest, depthWrite, depthFunc Always, polygonOffset -6/-6000); off only inside a solid. Proof: check `audit.mjs: card depthTest` (new). Why: depth-off cards let ink and blur cross faces.
- **S3-59** Card textures have no mipmaps. Proof: check `look.mjs: card material` (new). Why: mipmapped alpha made far people vanish.
- **S3-60** Cards only face the camera; a side or back view needs its own drawing. Proof: check `critic: people`. Why: a front card seen side-on reads as a sheet.
- **S3-61** Stagger two people in depth rather than side by side. Proof: check `critic: people`. Why: side by side in portrait both shrink.
- **S3-62** Every card and word canvas runs `edgeTouches` right after it draws, bean cards included; sides drawn to the edge are listed in `allow`. Proof: check `audit.mjs: edgeTouches` (new). Why: 16 cut sides in 9 cards; no critic saw them.
- **S3-63** A drawing whose outline dips under its baseline gets canvas below it. Proof: check `audit.mjs: edgeTouches` (new). Why: hooves and board edges were cut flat.
- **S3-64** A sideways reach is shortened to stay inside the card's own 600-unit canvas less the mitten's radius. Proof: check `audit.mjs: edgeTouches` (new). Why: an arm off the canvas showed with no hand.
- **S3-65** A close card's crop is chosen from the frame's projected edges, moved out until they are off screen. Proof: check `critic: people`. Why: a crop from distance ended in a line across a robe.
- **S3-66** A face keeps its expression while it talks; the talking mouth sits on the expression's mouth. Proof: check `acting.ts: talkKeepsFace` (new). Why: talking replaced the sad mouth with a neutral one.
- **S3-67** Sad and worried faces have open eyes and steep brows, not lid eyes. Proof: file `out/<slug>/coldread.json`. Why: lid eyes read as annoyed, not sad.
- **S3-68** Emotion is drawn, not narrated: anger, fear, grief and joy each have a face on a 0..1 dial on every beat the words name. Proof: check `critic: people`. Why: "his anger burned" over a calm face fails.
- **S3-69** Held poses, not a constant sway; brows do most of the acting. Proof: check `critic: people`. Why: sway reads as noise; brows read on a phone.
- **S3-70** Blinks every 0.5 to 2.3 s. Proof: check `critic: people`. Why: a face that never blinks reads as frozen.

### Props and effects

- **S3-71** A prop whose state matters is a kit `states` prop; a dial is drawn from `dial`. Proof: check `checkStates`. Why: a state typed twice put a needle backwards.
- **S3-72** Props are held by hands (a drawn fist over it, or at the card's hand point); nothing rides on another prop or floats. Proof: check `checkHeld`. Why: a leaflet sat on a rifle's end like a sign.
- **S3-73** An effect a card carries (a flame, a glow, a banner) is drawn from the card through its own transform. Proof: check `checkHeld`. Why: flames hung in the air beside unlit torches.
- **S3-74** A prop passes from world to card on one quiet frame, same screen size and colour, nothing else changing. Proof: check `critic: world`. Why: three changes on one frame read as a cut.
- **S3-75** Fire, smoke, dust and water are code volumes or cards; a Higgsfield element only when code fails. Proof: file `stories/<slug>/parts.md`. Why: the code fireball cost no credits.
- **S3-76** Fire reads as fire: tall flickering tongues, smoke columns, embers, flickering glow on the ground. Proof: file `out/<slug>/coldread.json`. Why: the burning village did not read as burning.
- **S3-77** A raymarched volume leaves `glslVersion` unset. Proof: check `look.mjs: shader version` (new). Why: GLSL3 draws nothing, silently.
- **S3-78** Thrown things are about twice life thickness with a ghost trail. Proof: check `critic: people`. Why: life-size throws vanish on a phone.
- **S3-79** The world keeps its state by time, not by shot: a stuck spear stays stuck in every later shot. Proof: check `checkStates`. Why: state carried by time makes picture jokes work.
- **S3-80** Code clouds are not used; the sky is a picture on a dome. Proof: file `stories/<slug>/parts.md`. Why: code clouds read as pills.

### Shots and camera

- **S3-81** Time each shot on a word of the voice; word times come from `W(line, word, nth)`. Proof: check `timing.ts: W` (throws on an unnamed repeat). Why: a card landed on the wrong "by".
- **S3-82** Every shot is a function of the film's clock, alive from the first build; never board stills on a timer. Proof: check `actingStills`. Why: stills on a timer took four cuts to come alive.
- **S3-83** Write each shot from the meaning sheet's must-see entries with `shot` or `follow`, not typed positions. Proof: check `checkMustSee`. Why: typed cameras raced ahead of a marching column.
- **S3-84** Keep raw keys for whip reveals and world-made joins only. Proof: check `audit`. Why: raw keys lose the subject between keys.
- **S3-85** A must-see entry starts on its word's first frame; a move bringing the subject in lands on or before it. Proof: check `checkMustSee`. Why: an entry 6 frames late passed on rooftops.
- **S3-86** A place the meaning names (the gate, the wall) is a subject of its must-see entry. Proof: check `checkMustSee`. Why: the entry passed with the gate out of frame.
- **S3-87** Every must-see subject is at least 8% of the frame height on its word. Proof: check `checkMustSee`. Why: smaller subjects do not read on a phone.
- **S3-88** A person or head that must not be cut says `whole: true`; under an overlay, `under` gives its edge. Proof: check `checkMustSee`. Why: centre-only checks passed a head cut by the edge.
- **S3-89** Words to read say `words: true` (10% of height), wrap the lettering, and stay clear of the caption band. Proof: check `checkMustSee`. Why: a caption covered the slate's "28".
- **S3-90** Use the kit's `path`, `K` and `curve`; never a story copy. Proof: check `sync-kit.mjs`. Why: a story's copy got none of the kit's path fixes.
- **S3-91** A camera backing from a walker uses `track` with `to`, never a smoothstep or eased move. Proof: check `track` (refuses a walk that turns back). Why: eased moves outran the walker and he shrank.
- **S3-92** Start a backing track once the walker is walking. Proof: check `track`. Why: from a stand he is slower than any camera.
- **S3-93** Aim at the people, not the place; two people stay within about 10 degrees of the centre line. Proof: check `checkMustSee`. Why: a 9:16 frame is only about 26 degrees across.
- **S3-94** Two people far apart side-on are shot on a diagonal from above. Proof: check `checkMustSee`. Why: side-on they do not fit a portrait frame.
- **S3-95** A named person is reframed, never cut by an edge; an extra cut by an edge leaves the picture for that frame. Proof: check `checkHeads`. Why: heads were halved at the edges in three stories.
- **S3-96** Nothing near the lens fills over its group's share (6 m, 15% outdoors); indoor groups and framed spans carry reasons. Proof: check `checkLens`. Why: a painting filled 87% behind a face.
- **S3-97** Blockers for the checks come from the same list the scene draws its rocks and bushes from; non-subject people are blockers. Proof: check `checkMustSee`. Why: check and picture cannot then disagree.
- **S3-98** No empty sky: over 45% of the centre column empty fails, so does a view over 12 degrees up with nothing whole. Proof: check `checkSky`. Why: a tilt for a card left 60 to 70% blank.
- **S3-99** A planned look at the sky (the sun the line names) is declared to `checkSky`. Proof: check `checkSky`. Why: declared looks pass; accidents fail.
- **S3-100** Camera glides between shots in one place never pass through walls or floors. Proof: check `audit.mjs: safe on glides` (new). Why: glides went through walls; no check found it.
- **S3-101** No turn over 4 degrees a frame and no one-frame position jump outside a declared whip. Proof: check `audit`. Why: a 2 m jump inside a join read as a cut.
- **S3-102** Big near surfaces do not sweep across the frame: sit back, use a longer lens, glide slowly with long eases. Proof: check `checkLens`. Why: grain flicking past a wide lens read as busy.
- **S3-103** One clear thing per second, from the meaning sheet, framed big and sharp. Proof: check `checkMustSee`. Why: two subjects in one second split the eye.
- **S3-104** At least three kinds of view: from above, a map or cut-away, ground level. Proof: check `critic: camera`. Why: one kind of view reads flat.
- **S3-105** Medium shots by default; at most one frame in four is a face close-up. Proof: check `audit.mjs: closeUpShare` (new). Why: the world is the star.
- **S3-106** Acting is framed close enough to read: the person at least 25% of the frame high while acting. Proof: check `actingTooSmall`. Why: acting in locked wides was missed by every viewer.
- **S3-107** The camera shakes only on hits. Proof: check `critic: camera`. Why: shake elsewhere reads as a glitch.
- **S3-108** A ratio the story states (41 of 400) is held by framing wide for that beat, not by moving the objects. Proof: check `critic: story`. Why: spreading the few made them small everywhere.
- **S3-109** A count from high only when the things fit in about 50 m; otherwise they arrive one by one, each on a beat. Proof: check `checkMustSee`. Why: five armies in a 250 m ring were specks.
- **S3-110** An empty place (a seat, a bed) is shot low across it with nothing on the line. Proof: check `checkLens`. Why: cards draw over what you meant to show.
- **S3-111** Hiding needs cover between hider and seeker for the whole run, shot over the hider's shoulder. Proof: check `critic: story`. Why: a seeker walking past in plain view breaks it.
- **S3-112** A name is spoken while its person is on screen, within about 0.2 s. Proof: check `checkMustSee`. Why: otherwise the shot loses its point.
- **S3-113** Show how a device works before anyone reacts to it, within the first five seconds. Proof: check `critic: story`. Why: a reaction to an unknown device reads as noise.
- **S3-114** Show time passing with something that moves (clock hands, light crossing a room), not a counting number. Proof: check `critic: story`. Why: a number tells; a moving thing shows.
- **S3-115** One or two picture jokes carry the story without words. Proof: check `critic: story`. Why: they reward a rewatch.
- **S3-116** Facts appear as things in the world: a counter, a mark, a scroll, the objects themselves. Proof: check `critic: story`. Why: things read with the sound off.
- **S3-117** One shot split into several camera moves keeps one clock (`clock` in `shots.ts`). Proof: check `timing.ts: resolveClocks`. Why: the acting restarted at each split.
- **S3-118** Segments over 1.8 s punch in at the middle unless the subject would leave the frame. Proof: check `checkPace`. Why: long holds read as stills.
- **S3-119** While building, sheet the first and last frame of any shot where people move, and re-sheet only what changed. Proof: check `stills.mjs`. Why: people sit 2 to 3 degrees outside a portrait frame.

### Joins

- **S3-120** Joins are picked from the joins stack in `camera.md` for what they have to do, each with its reason written in the shot list. Proof: check `audit.mjs: join reasons` (new). Why: moves without a reason read as the camera showing off.
- **S3-121** Hard cuts only for a change of place or time: at most 3 plus the loop, each listed with its reason. Proof: check `audit.mjs: hardCuts` (new). Why: joins read as one film; cuts jolt. (Vincent, 11 Nov 2026)
- **S3-122** The template's default between places is a join from the stack, never a whip. Proof: check `audit.mjs: join reasons` (new). Why: a whip between places travels with no reason.
- **S3-123** A whip pan only reveals someone already waiting inside one place. Proof: check `audit.mjs: join reasons` (new). Why: whips used to travel read as glitches.
- **S3-124** Never rise into empty sky and fall onto the next place; never tilt into empty sky inside a shot. Proof: check `checkSky`. Why: it shows nothing and the person sinks.
- **S3-125** Swings never rise above what the subject needs; the old 14 m swing lift is gone. Proof: check `checkSky`. Why: lifts into sky came back in fix rounds.
- **S3-126** The change a join's reason names plays in full view, before or after the overlap. Proof: check `critic: camera`. Why: a change inside a dissolve is not seen.
- **S3-127** A dissolve between two framings of one place draws the person on both paths. Proof: check `checkMustSee`. Why: one path left an empty landing.
- **S3-128** A shape-matched dissolve uses `matchCam`, aims with `screenFix` or `matchOf`, and eases onto the match. Proof: check `audit`. Why: hand aims missed by a quarter frame.
- **S3-129** A far place the viewer should place uses a horizon approach (`approach`) or a map zoom. Proof: check `checkMustSee`. Why: the destination stays in sight.
- **S3-130** A horizon approach's far view has the arrival's colour and silhouette, about a tenth of the frame wide. Proof: check `critic: camera`. Why: a haze card did not read as the town.
- **S3-131** A far flight eats about 0.8 s and dips to white at its middle; start it a word later after a line that matters. Proof: check `audit.mjs: hardCuts` (new). Why: a fast flight counts as several cuts.
- **S3-132** Show a hit with speed lines alone, not an inverted impact frame. Proof: check `audit.mjs: hardCuts` (new). Why: an inverted frame counts as two cuts.
- **S3-133** A camera never arrives before the person it waits for; `follow` the person. Proof: check `checkMustSee`. Why: an empty frame on the word.

### Acting and action

- **S3-134** An action or expression change on every beat of the words; nobody still for more than about 1 s. Proof: check `actingStills`. Why: one frown in 57 s scored 3 of 10.
- **S3-135** What the line says happens on screen, as it happens. Proof: check `checkMustSee`. Why: "still fighting" over a man standing still.
- **S3-136** A key gesture the story turns on (a salute, a handover) is held about 1 s and framed close. Proof: check `actingTooSmall`. Why: half-second gestures were missed.
- **S3-137** No one-frame pose snaps; poses change through in-betweens. Proof: check `acting.ts: poseSnaps` (new). Why: snaps between board samples showed only in motion.
- **S3-138** A card's hand reaches on the screen with `cardReach`, clamped to the card. Proof: check `audit.mjs: edgeTouches` (new). Why: a world-right reach pointed off the frame.
- **S3-139** A reach within a head's width above the head swings out beside it, and ends clear of small objects. Proof: file `out/<slug>/coldread.json`. Why: a mitten behind a beret read as a stub.
- **S3-140** Violence and big moments are four beats: build, wind-up, the act side-on with motion lines, the result with a jolt. Proof: check `critic: people`. Why: an act with no wind-up does not land.
- **S3-141** A throw toward the camera is shown close, then the arrival. Proof: check `critic: camera`. Why: a throw toward the lens hides the thrower.
- **S3-142** People who leave fall or walk out in clear view; nobody vanishes. Proof: check `actingStills`. Why: three men popped out of existence.
- **S3-143** Gunfire is seen (flash, recoil, smoke, hits) and heard on top of the mix. Proof: check `checkSync`. Why: "if he's still fighting we should hear gunshots".
- **S3-144** Every picture event has its sound within 0.1 s, and every sound its event. Proof: check `checkSync`. Why: a flash with no sound reads as a glitch.
- **S3-145** A place exports its action times and the sound script reads the same numbers. Proof: check `checkSync`. Why: an acting change then re-syncs the sound.

### Words on screen

- **S3-146** Every film burns in captions, one word at a time, white, in the portrait safe area. Proof: check `checkCaptions`. Why: a Short went out without captions.
- **S3-147** Captions never cover a face or a drawing being read; one height per shot, never below 82% of the frame. Proof: check `audit.mjs: captionOverlap` (new). Why: captions sat on eyes for three rounds.
- **S3-148** Words go on screen cards, never on the ground; a ground map is shapes only. Proof: check `critic: world`. Why: ground text reads backwards from half the cameras.
- **S3-149** Words on things are in the narration's language; mastheads and proper names may stay. Proof: file `out/<slug>/coldread.json`. Why: Vincent could not read the French signs.
- **S3-150** Dates and orders show as cards; a word the viewer may not picture gets a thought bubble on its word. Proof: check `checkCues`. Why: the viewer could not picture a panda or a yeti.
- **S3-151** A card whose text is spoken arrives 0.4 s before to 0.2 s after its word. Proof: check `checkCues`. Why: a card on the wrong word confuses.

### Sound

- **S3-152** Settle every pause first, then music in sections with a coda, then the mix. Proof: check `story-sound.mjs: order` (new). Why: a moved pause re-times the music.
- **S3-153** Music sections are 3 s or longer; merge a shorter beat and mark the change with an effect. Proof: check `story-sound.mjs: section length` (new). Why: ElevenLabs refuses shorter sections (HTTP 422).
- **S3-154** The mix writes `voice.wav` and `bed.wav` stems on the film's clock, before the final loudness gain. Proof: file `out/<slug>/voice.wav`. Why: `levels.mjs` measures the stems.
- **S3-155** The bed is held under each whole line: 0.2 gain through the line, pauses included, 0.4 between lines closer than 0.9 s, full in longer gaps. Proof: check `levels.mjs`. Why: a compressor alone let hits through.
- **S3-156** The hold is a 1 kHz gain track smoothed over 0.16 s, `amultiply`d into the bed, then `sidechaincompress` ratio 6, 150 ms release. Proof: check `levels.mjs`. Why: the template's ratio 4 / 250 ms let hits through.
- **S3-157** Under every line the bed's loudest 400 ms sits at least 10 dB below the voice, the last 30 s included. Proof: check `levels.mjs`. Why: the narrator was drowned by the bed.
- **S3-158** The music stays audible: no more than 20 dB under the voice, aiming at 15 to 20 dB. Proof: check `levels.mjs: ceiling` (new). Why: music 35 to 40 dB under was inaudible.
- **S3-159** No silent tail: the film ends 0.5 s after the last word, or the music runs to the end. Proof: check `levels.mjs: silent tail` (new). Why: dead air on a looping Short.
- **S3-160** The sound script takes the narrator folder from `story.ts`, never a fixed `laura/`. Proof: check `story-sound.mjs: narrator path` (new). Why: the mix wrote to the wrong narrator's folder.
- **S3-161** Ambience made of voices goes on the bed, held with it, its 300 Hz to 3 kHz band cut about 10 dB. Proof: check `levels.mjs`. Why: a crowd murmur masked the narrator.
- **S3-162** Action sounds the story turns on (gunshots, a scream) go on top, not under the voice. Proof: check `checkSync`. Why: buried gunfire read as silence.
- **S3-163** Level each effect to a loudness (LUFS of the file alone), not a raw gain. Proof: check `story-sound.mjs: effect LUFS` (new). Why: quiet and loud takes then sit alike.
- **S3-164** Limiter, then two-pass `loudnorm` to about -14 LUFS for the whole mix. Proof: check `short_qa.py`. Why: too quiet or clipping on the shots.
- **S3-165** ElevenLabs music and effect requests are cached by their prompt. Proof: check `story-sound.mjs: cache hit` (new). Why: an unchanged rerun costs nothing.

## S4 Audit

- ~~**S4-1** `tools/gate.mjs` runs before the first critic round and before every render, and refuses on any failure. Proof: check `gate.mjs` (new). Why: checks that only print were skipped nine times.~~ Replaced by the scene loop (S5-39 to S5-70).
- ~~**S4-2** `audit.mjs` runs the acting audit and the camera checks (`audit`, `checkMustSee`, `checkLens`, `checkHeads`, `checkSky`) over every frame and layer, with a failing exit code. Proof: check `audit.mjs` (new: exit code, camera checks). Why: camera checks existed, but no tool called them.~~ Replaced by the scene loop (S5-39 to S5-70).
- ~~**S4-3** The camera checks run over every layer of a dissolve, through `layerRuns`. Proof: check `layerRuns`. Why: a fault in the outgoing layer passes a one-camera check.~~ Replaced by the scene loop (S5-39 to S5-70).
- **S4-4** `levels.mjs` runs on the stems with its floor, ceiling and silent-tail checks, and again whenever the narrator, music or an effect's level changes. Proof: check `levels.mjs` (new: ceiling, tail). Why: a new narrator shifted every line's margin.
- ~~**S4-5** The look checks run: `plainMeshes`, `smallTextures`, `detailCount`, `flatShare`. Proof: check `tools/look.mjs` (new). Why: nothing looked at materials or textures.~~ Replaced by the scene loop (S5-39 to S5-70).
- ~~**S4-6** `measure_sharp.py` and `measure_look.py` run against the reference with exit codes. Proof: check `measure_sharp`, `measure_look` (new: exit codes). Why: they were never run on Elijah.~~ Replaced by the scene loop (S5-39 to S5-70).
- ~~**S4-7** Measure sharpness on a short real encode, not on stills. Proof: check `measure_sharp` (new: exit code). Why: stills measured 897, the encode 796.~~ Replaced by the scene loop (S5-39 to S5-70).
- ~~**S4-8** `brightness.mjs` passes: opening 120 or more, nothing too dark on a phone. Proof: check `brightness.mjs`. Why: a dark opening loses the swipe.~~ Replaced by S4-18.
- ~~**S4-9** The planned pace is checked against the story's profile, not a fixed 40. Proof: check `checkPace` (new: reads profile). Why: the profile ranges from 25 to 50 changes a minute.~~ Replaced by the scene loop (S5-39 to S5-70).
- ~~**S4-10** The gate refuses without the meaning sheet, a parts plan per place and the cold-read result. Proof: file `stories/<slug>/meaning.md`, `stories/<slug>/parts.md`, `out/<slug>/coldread.json`. Why: Elijah skipped the cold read and parts plan.~~ Replaced by the scene loop (S5-39 to S5-70).
- ~~**S4-11** The gate refuses without both stage buttons in `approvals.json`. Proof: check `gate.mjs: approvals` (new). Why: the owner's direction comes before the build.~~ Replaced by the scene loop (S5-39 to S5-70).
- ~~**S4-12** Every gate threshold carries a comment saying where its number came from. Proof: check `critic: kit PR`. Why: a number without a source gets changed to pass.~~ Replaced by the scene loop (S5-39 to S5-70).
- **S4-13** Every new place, prop, effect, material and face gets one clean still read cold by a fresh cheap agent with `cold-read-brief.md`. Proof: file `out/<slug>/coldread.json`. Why: hail read as fire, fear as cheering.
- **S4-14** Cold-read stills carry no captions or labels. Proof: check `stills.mjs: --clean` (new). Why: labels told the reader the story.
- **S4-15** Anything misread is redrawn and read again by a new fresh agent until it reads; "cannot tell" is a miss. Proof: file `out/<slug>/coldread.json`. Why: a guess that passes is not a read.
- ~~**S4-16** The template's example place passes the gate, and a flat-colour test place fails it. Proof: check `kit tests: template gate` (new). Why: templates teach by example. (Vincent, 11 Nov 2026)~~ Replaced by the scene loop (S5-39 to S5-70).
- **S4-17** Bible in Clay: run sight-check.mjs so nobody whose verses have them seeing is drawn blind. Proof: check sight-check.mjs. Why: closed eyes read as blind on a phone.
- **S4-18** Bible in Clay: brightness.mjs passes, opening 120 or more and nothing too dark; its floor is the channel's rule, not the toon skill's. Proof: check brightness.mjs. Why: a night story failed a floor made for day stories.
- **S4-19** A night scene keeps every face bright enough to read on a phone (S3-53), however dark the frame around it. Proof: check critic: light. Why: the toon skill had no rule for night stories.

## S5 Scene loop

Spikes 3 to 7 (12 November 2026) built a 5 s clip this way and lifted each area it worked on: world and light 2 to 4,
story 3 to 4, at 25 to 40 minutes a pass. The cycle rules below the loop are replaced by it.

The first film built this way (the cliff film, 13 November 2026) came out worse than the 5 s spike of its key beat:
wide shots with faces at 1/20 of the frame, cameras turned away from the far picture, places changed by three builders
under each other, and every round judged against the scene's own last best only. So the film is now built by areas in
order across the whole film, each area locked before the next: the world stage (every place), the shots stage (every
camera, shot size and person's size), then the scene stage (people and motion, scenes in parallel), then the join.

### The loop

- **S5-39** Build the film as scenes of 5 to 10 s, each its own composition playing its slice of the one mix (`templates/scene/`), with at most three shots in 5 s. Proof: file `src/stories/<slug>/scenes/`. Why: a scene renders in about 15 s, so a round takes minutes; five beats in 5 s needed hard cuts the judges docked (spikes 3-7, 12 Nov 2026).
- ~~**S5-40** Each scene runs the passes in order, one area a pass: rig check, world and light, people and acting, motion and staging, sound. Proof: check `scripts/loop/step.mjs`. Why: each pass moved its own area, and a round that restaged the whole clip lost by 1.2 (spikes 4-7).~~ Replaced by S5-75.
- **S5-41** A round is: at most five changes from `faults.md`, a stills sheet before the render, the render, three reviewers at 6 fps (`look.sh`, `reviewer-brief.md`), then one blind A/B judge against the best so far (`abjudge.sh`). Proof: file `out/<slug>/scenes/<scene>/<pass>-r<n>/verdict.json`. Why: the stills sheet caught a fault before the render in five rounds of six (spike 4).
- **S5-42** Keep a win and snapshot it to `best/`; revert a loss by copying `best/` back; on a tie keep what the judge credited and drop what it blamed. Proof: check `step.mjs`. Why: one judge scored the same clip 3.4, 3.0 and 2.6 (spike 3).
- **S5-43** A pass stops when its area reaches 4 on the three-judge average, after two rounds in a row with no win, or after six rounds. Proof: file `verdict.json`. Why: a fixed 4.5 was never reached; extra rounds after two losses moved nothing (spikes 3-7).
- **S5-44** Compare clips only side by side in one judging; a score from one judging is never set against another's. Proof: check `abjudge.sh`. Why: spike 4's best scored 3.60 beside its round 0 and 2.67 beside spike 5's best.
- **S5-45** When reviewers or the judge name the same top fault in two rounds running, the next round restages that one beat with a new pose drawing or a new shot; the whole scene is not restaged. Proof: file `faults.md`. Why: restaging the water entry alone won its round; restaging the clip lost by 1.2 (spike 4).
- **S5-46** After a lost or tied round the reviewers are not run again; the next builder works from the best clip's `faults.md` and the judge's blame. Proof: check `step.mjs`. Why: the best clip is unchanged, so its notes still stand (spike 3).
- **S5-47** Reviewers and judges run in the foreground with `claude -p`. Code gives them two facts: one-frame jumps (`jumps.sh`) and effect loudness at each cue (`audible.py`); no gate and no look scripts. Proof: check `scripts/loop/look.sh`. Why: the gate found none of 9 known faults in 27 minutes, Sonnet at 6 fps found 8.5 in 2 minutes, and background agents died when a turn ended (12 Nov 2026).
- **S5-48** `step.mjs` runs before each step and refuses when the step's input file or the owner's approvals are missing; each phase logs one line with its minutes. Proof: check `step.mjs`. Why: rules with no check were skipped on Elijah and the widow (10-12 Nov 2026).
- **S5-77** A scene with a reference shows it to the judge every round; the scene stops only when best beats or ties it, or by S5-43's other stops. Proof: check scripts/loop/step.mjs (reference). Why: rounds judged only against their own best stalled at 3.3.
- **S5-89** No brief caps a pass below S5-43's stop rules; a pass runs until its area reaches 4, two rounds without a win, or six rounds. Proof: check scripts/loop/step.mjs (pass stops). Why: two-round caps stopped passes at 2.5 to 3.1.
- **S5-90** After a lost or tied round step.mjs writes faults.md from best's faults and the judge's credit and blame, so the next round always has one. Proof: file out/<slug>/scenes/<scene>/best/faults.md. Why: kept rounds after a loss left faults.md empty.
- **S5-94** Reviewers and judges score Vincent's criteria: camera angle, effects landing well and not too fast, the hero big, background people's details, strong colour, ground detail, shadows, spectacle. Proof: file references/judge-brief.md (owner's criteria). Why: AI judges under-rated effect animation against his picks.
- **S5-95** Judges see at least 6 frames a second of the clip, so effects and their timing count in the score. Proof: check scripts/loop/abjudge.sh (6 fps sheets). Why: judges on sparse stills under-rated effects Vincent valued.
- **S5-97** Judges and reviewers see the picked reference stills beside the clip (`abjudge.sh --stills <dir>`) and score how close its detail comes; every render is measured with `measure_sharp.py` against the stills' sharpness and fine edges. Proof: check abjudge.sh --stills; file round folder sharp.json. Why: judges scoring two weak clips against each other kept passing soft work.
- **S5-96** Vincent's pick outranks every judge; when a judge's pick differs from his, log the clips, the model (Opus or Sonnet) and both picks. Proof: file stories/<slug>/judge-vs-owner.md. Why: Opus judges picked against him; Sonnet judges matched him.

### Scenes in parallel and the join

- **S5-49** Up to four scenes are built at once, one builder each; renders queue for the project's render slots. Proof: owner `scene count`. Why: building, not rendering, takes the time; Vincent chose four (12 Nov 2026).
- ~~**S5-50** Before scenes split, the cast, the one mix and each place's world-and-light pass are done once; a place file in `src/stories/<slug>/places/` has one owner. Proof: file `src/stories/<slug>/places/`. Why: scenes in one place built apart would not match.~~ Replaced by S5-71.
- **S5-51** Every cut between scenes has a join card in `stories/<slug>/joins.json` (camera, and each person's place, pose and face); the scene before ends on it and the scene after starts on it, and no scene changes a card alone. Proof: file `stories/<slug>/joins.json`. Why: scenes built in parallel jump at their joins without a shared frame.
- **S5-52** The Film composition joins the scenes over the one mix; `joins.sh` runs on every join, then three blind judges score the film against the last film the owner saw. A bad join goes back to the scene that owns its card. Proof: file `out/<slug>/film-<n>/verdict.json`. Why: a join is only seen in the joined film.
- **S5-53** The owner sees the joined film on the review page; each note goes to the scene it names and runs as a round there. Proof: owner `Render notes`. Why: his notes lead the work (Vincent, 11 Nov 2026).
- **S5-81** The Film template plays captions from the voice's word times from the first render, before any judge sees it. Proof: check templates/film-scenes/Film.tsx (Captions). Why: render 1 had no words on screen; every judge blamed it.
- **S5-82** A film is judged against a film of about its length: the last film the owner saw, else the animatic or a studied video; never a short clip. Proof: check scripts/loop/abjudge.sh (length). Why: a 60 s film lost to a 5 s spike on length alone.
- **S5-86** A jump in time between scenes is a join card with dip frames that holds nobody (join-card.mjs --jump); join-times.mjs writes it as a dip. Proof: check tools/join-times.mjs (kind dip). Why: six planned dips were flagged as faulty cuts.

### Rig check

- **S5-54** Before the first build of a scene, list every pose and prop the scene's words need and draw them on one pose sheet (`PoseSheet.tsx`); a card turned on its side is not a pose. Proof: file `out/<slug>/scenes/<scene>/poses.jpg`. Why: the rig check moved the score more than any round (spike 3).
- **S5-55** Draw each repeated action differently, and rest feet, knees and shins on what they touch. Proof: file `poses.jpg`. Why: judges docked "the same pose with the card changing" in every round (spike 3).
- **S5-56** Draw limbs wide of the body: knees up, arms back and hands overhead clear the torso and head, and a hand at the face is drawn after the face. Proof: file `poses.jpg`. Why: the pose sheet caught four hidden limbs before a render (spike 6).
- **S5-85** Draw a walk on the pose sheet at mid-step, not at contact, where both feet are down and the step hides. Proof: file out/<slug>/scenes/<scene>/poses.jpg. Why: a walk on the sheet hid its step.

### World stage

- **S5-57** Dress each place with the blend before round 1: a far picture on a curved screen, a surface displaced in code, a middle band and a moving detail layer. Proof: file `src/stories/<slug>/places/`. Why: world went from 2 to 4 with every judge in one pass (spike 5).
- **S5-58** Light each place for a time of day: a warm key from the side, a cool fill, warm and cool rims on the cards, a cool fog, and a grade with teal shadows and warm highlights. Proof: file `src/stories/<slug>/places/`. Why: light went from 2 to 4; a key from behind the camera gives the cards no rim (spike 5).
- **S5-59** Change the light one step a round, and keep a warm subject against a cool or dark field, never cool on cool. Proof: file `verdict.json`. Why: moving the sun behind the figures lost by 0.4 (spike 5).
- **S5-60** Fade the sky picture into a dome of its own colour and check the seam on a full-size still. Proof: file `stills.jpg`. Why: judges named a "cut-out sky band" in two rounds (spike 5).
- **S5-61** A water effect is see-through, narrower than the frame and over in under a second. Proof: file `stills.jpg`. Why: a white crown filling the frame read as a paper cup to every reviewer (spikes 4-5).
- **S5-62** Where a figure must read clear of a wall, the camera is side-on so the space behind him is sky or water, and props near the action's path are cleared. Proof: file `stills.jpg`. Why: a three-quarter view read as "pasted on the wall" to every judge, and boulders read as landing on rocks (spike 7).
- **S5-71** One world agent builds every place before any scene, checks it from every scene's planned cameras, runs world-and-light rounds, then locks the places with lock.mjs. Proof: check scripts/loop/lock.mjs (stage world in out/<slug>/locks.json). Why: builders changed shared places under each other.
- **S5-72** Each far picture faces where the cameras look: every shot's look direction falls inside a far picture's arc, or the shot says why not. Proof: check tools/shots-check.mjs (far picture). Why: the jump looked at an empty flat sky.
- **S5-79** Each place writes its screen direction in marks.ts: from the side the cameras film it, which way is screen right. Proof: file src/stories/<slug>/places/marks.ts (SCREEN). Why: a round was lost to a walk the wrong way.

### Shots stage

- **S5-73** One shots agent sets every scene's camera path, beats and shot sizes before any acting, fixes each person's size, writes the join cards, then locks them. Proof: check scripts/loop/lock.mjs (stage shots). Why: acting built on shots that later moved.
- **S5-74** Each person's card size is set once in sizes.ts; a scene's sx and sy are squash and stretch only, held across joins by holdCards. Proof: check joins.ts assertJoins (sx, sy). Why: Josh's height jumped at a join two builders made.
- **S5-76** An earlier build of a beat (a spike, a practice clip, an earlier version) is that scene's reference: the shots copy its shot sizes and camera side. Proof: file out/<slug>/scenes/<scene>/scene.json (ref). Why: the film dropped the spike's shot sizes.
- **S5-84** Before the scene stage, render the whole film rough (locked places and shots, stand-in poses, captions, the mix) and judge it against the animatic. Proof: file out/<slug>/film-0/verdict.json. Why: film faults showed only once the scenes were joined.
- **S5-88** A beat with a face or an action holds the hero at a third of the frame height or more; a wide only places the scene, 1.5 s at most. Proof: check tools/shots-check.mjs (size). Why: film faces at 1/20 of the frame lost to the spike.
- **S5-91** Each shot in shots.ts names why its angle was chosen and what moves behind the hero; a shot with no reason or nothing behind is restaged. Proof: file src/stories/<slug>/scenes/<scene>/shots.ts (why and behind per shot). Why: shots were not chosen for spectacle; Vincent: choose the shot wisely.
- **S5-92** Stage the hero moment high, wide or close enough to read as big: a climb visibly high above the ground, a fall seen whole from start to impact. Proof: owner Shot pick. Why: the B-17's climb and stall did not read as big.
- **S5-93** For each hero beat the shots agent renders 2 to 3 candidate stills, forced apart in angle and size; Vincent picks one, never ranks many. Proof: owner Shot pick (review page stage shots, his note names the still). Why: Vincent picks well between few; ranking many tires him.

### Scene stage: people and acting

- **S5-63** Give each face beat its own expression with a soft change between; hold a shocked face open, and let the eyes carry it when a brim hides the brows. Proof: file `poses.jpg`. Why: the "dare" face was credited, and shut eyes on a shocked friend read as a yawn (spike 6).
- **S5-64** Other people act toward the hero and never mirror him. Proof: file `verdict.json`. Why: a friend pointing at Josh was credited; both men with arms up was blamed (spike 6).
- ~~**S5-65** Before a render, project the action's path onto the screen with the shot's camera to check it clears every other figure. Proof: check `templates/scene/` path projection. Why: moving a figure on a hunch twice did not clear the jump; the projection fixed it at once (spike 6).~~ Replaced by S5-80.
- **S5-66** Keep the hero's silhouette through the action, and keep a story image a judge credited when restaging around it. Proof: file `verdict.json`. Why: Josh read as a different boy once his cap flew off, and the lone cap on the water told "never came up" better than a prettier world (spike 7).
- **S5-75** Scene builders, up to four at once, run only the people and motion passes, with places, cameras and sizes locked; a change to those goes to the lead. Proof: check scripts/loop/step.mjs (passes, locks). Why: A/B rounds judged two worlds at once.
- **S5-78** A face change eases over three frames or more through an in-between (exprTo, exprK), and no hand jumps in one frame. Proof: check tools/pose-check.mjs. Why: judges at 6 fps blamed one-tile face and arm swaps.
- **S5-80** Before a render, project the action's path through the shot's camera: it clears every other figure, and no wall, post or rock in BLOCKERS hides the hero. Proof: check tools/path-check.mjs. Why: a post hid the hero and the old check missed it.

### Scene stage: motion and staging

- **S5-67** Measure the camera per frame and keep it under about 0.3 m and 1.5 degrees a frame, easing every start and stop. Proof: check `templates/scene/` camera-speed probe. Why: faster moves read as a whip or a snap on 6 fps sheets, and a camera stopping dead on a beat read as a jolt (spike 7).
- **S5-68** A fall tips over with bent, kicking legs. Secondary motion is kept where it reads at phone size (hair, a cap) and dropped where it does not (hem flaps). Proof: file `verdict.json`. Why: a straight fall read as "lowered on a wire", and hem flaps read as a spiky skirt (spikes 6-7).
- **S5-69** The front card turns as one piece, so motion tops out near 3.3; the motion pass stops at its two-loss rule and does not chase 4. Proof: file `verdict.json`. Why: people work and a restage each left motion at 3.3, and Vincent chose to keep the flat card (12 Nov 2026).
- **S5-87** An action's last frame falls inside its scene; move the boundary or the action, never leave the end unseen. Proof: check tools/path-check.mjs (action end). Why: Josh's entry landed after his scene's last frame.

### Sound, once on the mix

- ~~**S5-70** Run `audible.py` on the scene's slice: every effect is heard at its cue, and `levels.mjs` passes. The sound pass has no blind judge (judges see frames alone) and stops when no cue is masked or just heard, or at six rounds. Proof: check `scripts/loop/audible.py`. Why: half of Elijah's effects sat 11-14 dB under the mix and passed the old bed check (12 Nov 2026).~~ Replaced by S5-83.
- **S5-83** The sound check runs once on the film's one mix at the join: audible.py on every cue, then levels.mjs; scenes have no sound pass. Proof: check scripts/loop/audible.py. Why: one mix serves every scene; per-scene passes repeated it.

### Replaced cycle rules

- ~~**S5-33** A fix round takes the critic's top five items by gain; the rest go first on the next round's list. Two builders work at once, split by place, each owning its own files; one builder alone when a change spans both. Proof: file `out/<slug>/critic-<cycle>-<round>.md` (new). Why: on Elijah and the widow one builder fixing nine items took 64 minutes a round and landed about a third of the forecast; fixes kept making new faults (Vincent, 12 Nov 2026).~~ Replaced by the scene loop (S5-39 to S5-70).
- ~~**S5-34** Tools bundle the film with the story's own public folder linked (`tools/public.mjs`), and a builder runs the full gate once, at the end of its round, with quick stills in between. Proof: check `grep storyPublic src/stories/<slug>/tools/*.mjs`. Why: bundle() copies its publicDir into every bundle: the project's 3.5 GB public made each bundle 23 s and 1 GB, against 5.5 s for the story's own folder (Elijah and the widow, 12 Nov 2026).~~ Replaced by the scene loop (S5-39 to S5-70).
- ~~**S5-32** Stop when the render critic's score reaches 4.2, or rises under +0.1 from the last cycle's. Proof: check production_log.py rounds. Why: more rounds then buy little; the next story gains more.~~ Replaced by the scene loop (S5-39 to S5-70).

### Critic rounds

- ~~**S5-1** Each cycle runs three critic rounds on the beat board before any render, fixing after each. Proof: file `out/<slug>/critic-<cycle>-<round>.md` (new). Why: still fixes are cheaper than render fixes. (Vincent, 11 Nov 2026)~~ Replaced by the scene loop (S5-39 to S5-70).
- ~~**S5-2** The critic gives every scene its path to 5, split by world, people, light and story, each item with its predicted gain. Proof: file `out/<slug>/critic-<cycle>-<round>.md` (new). Why: fixing the fault list moved Elijah only 2.78 to 3.06. (Vincent, 11 Nov 2026)~~ Replaced by the scene loop (S5-39 to S5-70).
- ~~**S5-3** The critic's fault list is secondary to the path to 5. Proof: check `critic-brief.md` structure. Why: faults lift a 2 to a 3, never to 5.~~ Replaced by the scene loop (S5-39 to S5-70).
- ~~**S5-4** Each critic round ends with a forecast: the score if every path item is done, and if the top five are. Proof: file `out/<slug>/critic-<cycle>-<round>.md` (new). Why: the forecast decides when to stop.~~ Replaced by the scene loop (S5-39 to S5-70).
- ~~**S5-5** Every critic scores 1 to 5: 1 broken, 2 weak, 3 fine, 4 good, 5 great; never round up. Proof: check `production_log.py rounds`. Why: one scale lets rounds compare. (Vincent, 10 Nov 2026)~~ Replaced by the scene loop (S5-39 to S5-70).
- ~~**S5-6** The critic scores against the project's anchor stills (`docs/critic-anchors/`), started from the first scored round. Proof: file `docs/critic-anchors/`. Why: a 3 then means the same every round.~~ Replaced by the scene loop (S5-39 to S5-70).
- ~~**S5-7** The beat board is 2 to 3 full-size stills per shot at its action words, plus the audit report and meaning sheet. Proof: check `stills.mjs`. Why: 540 px sheets hid doors and cut heads.~~ Replaced by the scene loop (S5-39 to S5-70).
- ~~**S5-8** The critic opens one full-size frame (1080 wide) of every shot and asks whether each place could exist. Proof: check `critic: world`. Why: five critic rounds on sheets missed a floating door.~~ Replaced by the scene loop (S5-39 to S5-70).
- ~~**S5-9** A critic subagent replies with its report; the lead saves it to the story's critic file. Proof: file `out/<slug>/critic-<cycle>-<round>.md` (new). Why: subagents cannot write files.~~ Replaced by the scene loop (S5-39 to S5-70).
- ~~**S5-10** After a fix, the critic re-scores only what changed and compares each prediction with the result. Proof: file `out/<slug>/critic-<cycle>-<round>.md` (new). Why: unchanged seconds drift with critic noise.~~ Replaced by the scene loop (S5-39 to S5-70).
- ~~**S5-11** A fix that missed its prediction by a point or more is itself a finding. Proof: file `references/findings.md`. Why: the miss shows why the fix failed.~~ Replaced by the scene loop (S5-39 to S5-70).
- ~~**S5-12** Every critique row is logged with `--score`, `--areas` and `--judge`. Proof: check `production_log.py areas`. Why: the weakest area and its method show after a few videos.~~ Replaced by the scene loop (S5-39 to S5-70).
- ~~**S5-36** The aim is three critique rounds from the first cut to the owner's yes; production_log.py rounds counts them. Proof: check production_log.py rounds. Why: Gibeon took six rounds and the Mona Lisa seven.~~ Replaced by the scene loop (S5-39 to S5-70).

### The render

- ~~**S5-13** One render per cycle, after the third critic round; no render cap across cycles. Proof: check `render.mjs` (counts renders per cycle, new). Why: renders are for motion and sound, not framing. (Vincent, 11 Nov 2026)~~ Replaced by the scene loop (S5-39 to S5-70).
- ~~**S5-14** A render over 8 s needs the gate's pass; a check of 8 s or less is a fix check. Proof: check `render.mjs` (calls `gate.mjs`). Why: fix checks stay cheap; renders stay gated.~~ Replaced by the scene loop (S5-39 to S5-70).
- **S5-15** Before trusting a long render, check `df` and the output file's time. Proof: check `render.mjs: disk and mtime` (new). Why: a full disk failed every frame and kept the old file.
- ~~**S5-16** On every render run `frame_motion.py`; no still run longer than the profile's longest hold where it wants pace. Proof: check `frame_motion.py` (exit 3). Why: path-based motion called a still picture fast.~~ Replaced by the scene loop (S5-39 to S5-70).
- ~~**S5-17** `screenMotion` before a render only points; it never clears a stretch. Proof: check `frame_motion.py`. Why: it cannot see texture or acting.~~ Replaced by the scene loop (S5-39 to S5-70).
- **S5-18** On every render run `short_qa.py`: black, white, frozen and popping frames, and loudness. Proof: check `short_qa.py`. Why: pops show only in the encode.
- ~~**S5-19** On every render run `pace.py` and the hard-cut count; both sit within the story's profile. Proof: check `pace.py`. Why: pace measured on the picture, not the plan.~~ Replaced by the scene loop (S5-39 to S5-70).
- ~~**S5-35** Each render goes on the review page with the output of production_log.py report and rounds for the story. Proof: file out/<slug>/log-<cycle>.txt (new). Why: The owner sees what each step cost beside the video.~~ Replaced by the scene loop (S5-39 to S5-70).

### Owner notes and the render critic

- **S5-20** Vincent watches every render first and gives notes on the review page. Proof: owner `Render notes`. Why: his notes lead the next cycle. (Vincent, 11 Nov 2026)
- ~~**S5-21** After his notes the critic reviews the render once, for what only motion and sound show: pops, swings, sync, levels. Proof: file `out/<slug>/critic-<cycle>-render.md` (new). Why: stills cannot show motion or sound.~~ Replaced by S5-31.
- ~~**S5-22** The next cycle starts from his notes and the render critic's, then build, audit, critic rounds. Proof: check `gate.mjs` (new). Why: notes skipped come back as notes.~~ Replaced by the scene loop (S5-39 to S5-70).
- ~~**S5-23** Stop at a score of 4.2, or when a cycle gains under +0.1. Proof: check `production_log.py rounds`. Why: more rounds then buy little; the next story gains more. (Vincent, 11 Nov 2026)~~ Replaced by S5-32.
- ~~**S5-31** After his notes the critic scores the render once: the four areas on the moving film, plus motion and sound. Proof: file out/<slug>/critic-<cycle>-render.md (new). Why: stills cannot show motion or sound.~~ Replaced by the scene loop (S5-39 to S5-70).

### Fixing

- ~~**S5-24** A fix round fixes every item the critic lists, not only the top ten. Proof: file `out/<slug>/critic-<cycle>-<round>.md` (new). Why: left items came back in the next critique.~~ Replaced by S5-33.
- ~~**S5-25** Check each fix on a short full-size moving render of its stretch (about 2 s either side), with the measured checks. Proof: check `render.mjs --from --to`. Why: fixes judged on stills landed only partly.~~ Replaced by the scene loop (S5-39 to S5-70).
- ~~**S5-26** Compare each fix with the last two cuts at the same seconds before committing it. Proof: check `stills.mjs: compare` (new). Why: one fix undid another's gain; the score stayed flat.~~ Replaced by the scene loop (S5-39 to S5-70).
- **S5-27** Sort each finding by what allowed it and fix at the strongest level: impossible, easy, rule with a picture, check. Proof: file `references/findings.md`. Why: a weak fix lets the fault come back.
- **S5-28** A kind of finding that comes back moves its fix up a level. Proof: file `references/findings.md`. Why: repeat findings prove the fix too weak.
- **S5-29** A fix true of any video goes into the kit or the skills through the skills repo; a story fix stays in the story. Proof: check `critic: kit PR`. Why: lessons in one story never reach the next.
- **S5-30** Never put a look into the kit. Proof: check `critic: kit PR`. Why: a shared look makes videos alike.
- ~~**S5-37** Every fix round ends on one full-size frame of every shot, asked whether each place could exist. Proof: file out/<slug>/fix-<cycle>-<round>/ (new). Why: Fixes made new faults the next critic had to find.~~ Replaced by the scene loop (S5-39 to S5-70).
- ~~**S5-38** The gate refuses a critic report without its critique row (--file), a fixed round without its fix row, or a later round without its findings section. Proof: check gate.mjs: loggingOf. Why: On Elijah nobody logged anything for two days.~~ Replaced by the scene loop (S5-39 to S5-70).

## S6 Hand-back

- **S6-1** Run the hand-back checklist in `checklist.md` and give the measured numbers with the video. Proof: file `stories/<slug>/checklist.md` (new). Why: numbers show what the eye misses.
- **S6-2** Nothing posts without the owner's yes on the finished video; agents make drafts only. Proof: owner `Looks good`. Why: posting is public and cannot be undone.
- **S6-3** Add the narration as an English caption file made by `srt.py` from `full.json`. Proof: file `out/<slug>/captions.srt` (new). Why: YouTube's own captions misspell names.
- **S6-4** Make the package (thumbnail, title, first frame) with the `story-thumbnails` skill. Proof: file `out/<slug>/package.md` (new). Why: the package is what makes people click.
- **S6-5** Bible in Clay: a cover goes in `stories/covers.json` and renders with `covers.mjs`. Proof: file `stories/covers/<id>.jpg`. Why: the Shorts tab needs covers to tell stories apart.
- **S6-6** Bible in Clay: update `docs/catalog.json` in the same commit as the change. Proof: check `catalog-refresh.mjs`. Why: the catalog is the single record.
- **S6-7** Bible in Clay: for a redo, move the old `publer.json` entry to `replaced` before running the drafts. Proof: file `stories/<slug>/publer.json`. Why: otherwise the redo silently makes no draft.
- **S6-8** Bible in Clay: the hand-back gives the coordinator the video, draft id, cost and the measured counts. Proof: file `stories/<slug>/checklist.md` (new). Why: the coordinator schedules from these.
- **S6-9** Report the ElevenLabs balance before and after, and the difference. Proof: file `stories/<slug>/checklist.md` (new). Why: the account also feeds other projects.
- **S6-10** Log every step's time to the project's `docs/production-log.jsonl` with `production_log.py add` from the plugin cache. Proof: check `production_log.py report`. Why: agents looked in the project and logged nothing.
- **S6-11** Write what the story taught: project lessons to the making-of doc, general lessons to the skills by PR. Proof: file `references/findings.md`. Why: a lesson kept in one story helps none.
- **S6-12** Seven days after posting, log the audience numbers with `production_log.py audience` and set dips against the critic's scores. Proof: check `production_log.py audience`. Why: the audience calibrates the critic.
- **S6-13** Change the critic's anchors where the audience disagrees with them. Proof: file `docs/critic-anchors/`. Why: critic scores do not compare across critics.
- **S6-14** A series builds its worlds, cast, props and effects in episode one in one shared folder. Proof: check `critic: kit PR`. Why: later episodes become staging, not modelling.
- **S6-15** Close every owner note and critic finding as story-only or with a rule id from add_rule.mjs. Proof: file stories/<slug>/lessons.md (new: gate render checks every note has a line). Why: a lesson not written as a rule is forgotten.
- **S6-16** Bible in Clay: titles name God or the person. Proof: check critic: package. Why: names are what people search for.
- **S6-17** At hand-back, a story gives back each library entry it improved, by PR to the skills repo, with the entry's known faults updated. Proof: file stories/<slug>/lessons.md (library line). Why: a library improves only when stories give their fixes back.

## X Any stage

- **X-1** Never print a key; hand secrets files to node with `--env-file`, never `cat`, `grep` or `source` them. Proof: check `critic: kit PR`. Why: printed keys leak into logs.
- **X-2** Agents run in the foreground, never the background, and none drives a browser. Proof: check `critic: kit PR`. Why: background work dies with the agent's turn.
- **X-3** Say the cost of a round of agents before starting it (about 0.5M tokens an agent call). Proof: check `production_log.py report`. Why: parallel agents burned a week's usage in hours.
- **X-4** Build as a team: each agent owns its files, the camera goes last, the same agents resume each round. Proof: check `critic: kit PR`. Why: the team took a score from 2.0 to 3.0.
- **X-5** Brief each place agent from the place agent brief in `team-and-log.md`, every bracket filled. Proof: check `critic: kit PR`. Why: a placeholder brief leaves the agent guessing.
- **X-6** Nobody edits `step.mjs`, the judge and reviewer briefs or `approvals.json` to get past them. Proof: check `critic: kit PR`. Why: a check that bends proves nothing.
- **X-7** This register is the only order; a stage named anywhere else follows it, and a clashing line is fixed the same day. Proof: check `lint_rules.mjs`. Why: two orders let agents pick the easy one.
- **X-8** A change to shared drawing code adds an option and never changes a default; byte-compare two frames of an earlier video. Proof: check `kit tests`. Why: a changed default silently changes old videos.
- **X-9** A practice copy of another channel's video is never posted, drafted or catalogued. Proof: check `catalog-refresh.mjs` (new: no practice keys). Why: its script and art belong to its maker.
- **X-10** Copy the reference's look and timing, never its meaning; write the meaning sheet first. Proof: file `stories/<slug>/meaning.md`. Why: a copied hot rail missed the gap closing.
- **X-11** Bible in Clay: anything the toon skills leave unsaid is done as `clay-story-video` says. Proof: check `critic: kit PR`. Why: one channel, one set of defaults.
- **X-12** A rule enters the register only through add_rule.mjs, with a stage, a proof and a reason. Proof: check lint_rules.mjs. Why: rules written as prose were skipped.
