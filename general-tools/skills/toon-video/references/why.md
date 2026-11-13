# Why: the history behind the rules

Dated stories, measurements and retired ways of working, moved out of the skill body. Read it when asked why a rule
exists, or when an older story uses a pattern the skill no longer does. Rule ids point into `rules.md`. The lint skips
this file.

## Contents

- [Old patterns](#old-patterns)
  - [The old order and the clip stage](#the-old-order-and-the-clip-stage)
  - [The old render gate](#the-old-render-gate)
  - [Seven rounds, then three: the old stop rule](#seven-rounds-then-three-the-old-stop-rule)
  - [The old score scale](#the-old-score-scale)
  - [The old toolkit and start point](#the-old-toolkit-and-start-point)
  - [Old looks and defaults](#old-looks-and-defaults)
- [Where the rules came from](#where-the-rules-came-from)
  - [Script and opening](#script-and-opening)
  - [Voice](#voice)
  - [Mix](#mix)
  - [Camera](#camera)
  - [Joins](#joins)
  - [Acting and the first build](#acting-and-the-first-build)
  - [The world and words](#the-world-and-words)
  - [The critic](#the-critic)
  - [Team and log](#team-and-log)

## Old patterns

### The old order and the clip stage

- Before 8 November 2026 a story went from script to render with no owner stages. Vincent, 7 November, after the train
  heist: "before any of this is animated ... I can review them fast." The stages a to e came from `ai-story-video`:
  comic, cast sheet, looks and places, still board, then the build.
- An older line said "render in clips of 15 to 20 s, critic after each clip". Elijah and the widow followed it from
  the approved still board straight to a render, with no cold read, no beat board and no critic. On 11 November 2026
  the clip stage was removed: the beat board and one render replaced it, and later the cycle (S5-1..S5-23).
- The d3 "story critic" on the animatic (11 November) is folded into stage 2's owner direction and the first critic
  round of the cycle.
- Before 11 November the owner reviewed the beat board in detail. He now gives direction twice, three times at most
  (S0-13), and sees every render (S5-20).

### The old render gate

The template's first `tools/render.mjs` refused a render over 8 s until `src/stories/<slug>/gates.json` held
`{ "beatBoard": { "ownerYes": "<date>: <his words>", "critic": 3.9 } }`. Agents wrote the owner's yes into it
themselves. It is replaced by `gate.mjs` reading `approvals.json` copied from the review page's store (S0-14, S4-1).

### Seven rounds, then three: the old stop rule

- Gibeon took six critique rounds and the Mona Lisa seven. Vincent asked on 9 November 2026 how seven could have been
  three. Three habits cost the extra rounds: fixes checked on small stills (in five of six Mona Lisa rounds, two to
  five of ten fixes landed only partly), fix rounds that fixed the top ten alone (Gibeon r5 left three findings that
  r6 listed again), and the owner seeing the shots only after the build (six Mona Lisa notes after round 6). Their
  fixes are S5-24, S5-25 and the owner stages.
- A fourth: the Wald bombers' round 4 scored the same as round 3 (2.43) because spreading the falling planes to fix
  the reveal's ratio shrank every fall from 15-25% to 5-12% of the width. With a comparison against the last two cuts
  in round 5 it rose to 2.51 (S5-26).
- The 10 November stop rule: ship when the critic's forecast for the next round is under +0.1, or after three critic
  rounds. The jungle holdout's last three rounds bought +0.14 for about 2.6M tokens. On 11 November it became the
  cycle: three critic rounds before each render, no render cap, stop at 4.2 or a cycle gaining under +0.1 (S5-23).

### The old score scale

Scores logged before 10 November 2026 were 0 to 3. Multiply them by 5/3 to compare with the 1 to 5 scale (S5-5).
Vincent: "out of five ... a rounded number that people use a lot". The railroads practice went from 1.2 to 1.8 on the
old scale (2.0 to 3.0 on the new) in three rounds with a team.

### The old toolkit and start point

- The toolkit was first built in bible-shorts: `src/spike2d/` (`Figure2D` in `figure.ts`, `LOOKS`, `Face` and props in
  `draw.ts`), with stories copying `src/spike2d/` and the newest story's `shots.ts` helpers. Stories branched from the
  newest toon story (`story/david-jonathan-2d`). On 11 November 2026 the kit and the film template moved to `main`
  and every story branches from it with `new-film.mjs` (S0-1, S0-2).
- `src/stories/david-jonathan-2d/shots.ts` held `C` and `CF` cameras, `swingAt` / `swingCam` (a 0.35 to 0.8 s swing
  with a lift of up to 14 m and a blur at the middle), `keys`, `lerpP`, walk cycles, the poses `RAGE`, `RAISE`, `HURL`,
  `HIDING`, `CROUCH`, `BOW`, `CALL`, `HUG`, `spearsAt`, `hits` and `SOLIDS`. The 14 m lift is gone (S3-125).
- `Figure2D` changes were checked by byte-comparing Baby Moses 2D frames 200 and 1500 before and after.
- A grip pose drawn at 2x hand size (the spike's cling) became balls the size of the head once figures wore mittens.

### Old looks and defaults

- The looks menu had a "drawn in code (3D)" look with flat colour. Removed 11 November 2026 (S2-8): flat code places
  read cheap; every place uses the blend (S2-7).
- Muted look targets and lifted blacks were once targets; deleted 11 November 2026 for bright, saturated colour
  (S3-30, S3-31).
- The template's `Stage.tsx` forced background blur of at least 11 px whenever people were in shot, wides included;
  replaced by blur by shot size (S3-35..S3-37).
- The template joined places by a whip pan with motion blur. Whips between places and motion blur are both gone
  (S3-38, S3-122).
- The old joins line allowed "one hard cut at most, saved for the twist"; the checks table said "under 10". Both are
  replaced by at most 3 plus the loop, each for a change of place or time (S3-121).
- Thin-finger hands were a default on some looks; toon figures wear mittens (S3-55). The fingers rule is for clay.

## Where the rules came from

### Script and opening

- Design second 0 first (Vincent, 10 November 2026): the jungle holdout opened on a small calm figure with its card at
  0.3 s, and all three click critics called it the weakest frame (S1-7, S1-8).
- The meaning sheet (Vincent, 8 November 2026, railroads practice: "the action of closing is the most important
  part"): a glowing rail is a state; a gap closing is the change (S1-20).
- Gibeon r3's must-see entry for "stood" listed the army and its leader and passed with the gate out of frame; the
  critic saw open desert. With the gate added, r4 was clean (frames 1082 to 1094) (S3-86).
- The backbone and the dynamics (Vincent, 8 November 2026: "some are slow, some are fast ... we need the backbone for
  everything"). Pace ranged from 25 (dashcam) to 50 (railroads) big changes a minute (S1-23).
- The jungle holdout planned one board shot per line and stayed at 22 to 24 picture changes a minute through six cuts,
  against Ricks Clips' 60 (S2-15).
- The owner's six Mona Lisa notes (French signs, a painting dwarfed by invented landscapes, the 28 hours as a number,
  the empty spots told, a cut head, half a roof) came after round 6; each would have shown on a still board (S2-18).
- The animatic (Vincent, 11 November 2026): "voice it so that you see it voicing from one still to another, so that
  we can see how the story is going to go" (S2-21).
- Elijah and the widow's first beat-board critique (2.78) was mostly acting the board never planned: no hand on
  "bread", no finger on "first", the widow blaming Elijah with her back to him (S2-19).

### Voice

- Laura was chosen on 7 November 2026 for her energy, and made the default narrator on 11 November (S1-9).
- On the Mona Lisa heist the owner liked takes at about 170 to 211 Hz; 11 of 12 young excited men in the library sat at
  103 to 141 Hz. A four-semitone formant-preserving lift took 141 Hz takes to about 176 Hz (S1-10).
- Laura fitted the Mona Lisa to 57.5 s at 206 words a minute; Ember, who replaced her, ran 62.9 s at the 1.3 tempo cap
  (188 words a minute), and every shot, effect and cue was re-timed (S1-11).
- A 0.04 s lead cut the P off "Paris", heard as "Chris" (Mona Lisa, Ember take, 9 November 2026) (S1-15).
- Whispers: Vincent dislikes them (Wald bombers' reveal, 10 November 2026); a +8 dB clamp left it at -31 LUFS (S1-17).
- The Mona Lisa's bed, levelled under Laura, sat 1.2 dB over Ember's plumber line (S4-4).

### Mix

- The 10 dB rule is Vincent's, 5 November 2026 (S3-157).
- The Mona Lisa's opening murmur and music drowned the narrator (owner, 9 November 2026). By average the first line sat
  10 dB over the bed; the check showed the bed's loudest moment over the voice under two lines. With the murmur cut
  and moved onto the music, averages rose to 12 to 21 dB and six lines still fell short, the plumber's steps 5.4 dB
  under his line. With the whole bed held: 12.0 dB least, 17.6 median. Gibeon's run-by-run hold: 10.8 least, 18.2
  median (S3-155, S3-161).
- A bed held through every short pause of a fast read showed holes of -35 to -39 LUFS; hence runs, not lines.
- The scripts live in the plugin cache because the voice-over-bed check and the hold were written in bible-shorts and
  never reached Epiclings, whose narrator was drowned.

### Camera

- Gibeon's night march (9 November 2026) used hand-typed keys that raced ahead of the column; "marched all night"
  showed an empty hillside. `follow` fixed it, and `checkMustSee` found the fault in under a second (S3-83).
- Kit 1.55.0 brought `matchCam`, `track` and `cardReach`; 1.56.0 brought `screenFix`, `mirrorAbout`, `track` with `to`
  and the look-point blend in `path` (a loaf held 1.3 m from the lens drifted out of frame, Gibeon r4 23.7 s); 1.57.0
  brought `matchOf` and the even-speed `track`.
- Gibeon's own `kit.ts` meant the 1.55.0 path fix changed nothing: the camera dump before and after was byte-identical
  (S3-90).
- Mona Lisa r7's only hard cut was a roof camera that jumped 2.0 m inside join 12 at 35.367 s, a 2-degree turn the
  turn limit passed (S3-101).
- One 6 m / 15% lens limit flagged 265 frames in 15 runs over the Mona Lisa's interiors; with groups and declared
  spans, none; the split check found a painting filling 87% behind the guard's face (r6, 35.8 s) (S3-96).
- The centre-only must-see check passed Joshua with his head cut by the right edge (Gibeon r4, 47.97 to 49.27 s) and
  cut at the chest under the card (58.13 to 60.37 s) (S3-88).
- A slate's "28" was covered by the caption at 64 to 80% of the height (Mona Lisa r4) (S3-89).
- A fix round tilted up to make room for a card: Joshua cut at the chest under 60 to 70% blank sky (Gibeon r5, 58.1 to
  60.4 s). `checkSky` finds it and one 0.2 s dissolve layer (S3-98).
- 1.56's `motion` measured the camera's path: a camera running with a rout scored 71 and 53 while the picture was
  nearly still (frame difference 5.4 and 6.5, Gibeon r4, 51 to 52 s). `frame_motion.py` replaced it (S5-16).
- Gibeon r2 keyed "stood" 6 frames after the word (36.05 s); r3 lands at frame 1076 for the word at 1082 (S3-85).
- Heads: workmen halved at the side edges (Mona Lisa 30 to 31.5 s), Peruggia half out of the left edge on "turns" (r7,
  43.53 to 45.00 s), Joshua sliding out on a tilt (Gibeon r6, 49.40 to 49.47 s) (S3-95).
- An eased backing move outran Peruggia mid-walk: sizes 0.75, 0.86, 0.80, 0.73 eased; 0.75, 0.83, 0.88, 0.92 even
  (Mona Lisa r6, 23.1 to 23.95 s) (S3-91).
- Railroads round 3 (Vincent): a camera skimming over a rail with a wide lens filled the frame with grain (S3-102).
- Wald bombers rounds 3 to 5: spreading the few to fix a ratio made them small everywhere (S3-108).
- A ring 250 m wide left each of five armies a speck for three rounds (Gibeon 42.3 s); counted arriving, they read
  (frames 1258 to 1297); five kings receding toward the lens ran from a fifth of the frame to nearly half (S3-109).
- Captions sat on Wald's eyes and on the chalk plane's engine dots in rounds 2 to 4 (S3-147).

### Joins

- Gibeon 2D rose into empty sky and fell onto the next place between every far place (Vincent, 9 November 2026: "what
  the acceptable options are and what the not-acceptable options are ... we use it when necessary, not any time")
  (S3-120, S3-124).
- Jacob wrestles 2D went from 19 hard cuts to 7: an inverted impact frame counted twice, a fast flight several times
  (S3-131, S3-132).
- Gibeon r3 ran the tip to the feet under a dissolve (9.1 s) and the shadow's slide under another (53.7 s); moved
  before the overlap, both read (S3-126).
- One path drove the person for both layers of a dissolve: an empty landing (Mona Lisa r4, 16.1 to 16.45 s) (S3-127).
- A shape-matched join aimed at typed points missed by a quarter frame (Gibeon r4, 45.0 s); `screenFix` brought both to
  (0.49, 0.46) (S3-128).
- A haze card on the horizon did not read as the town we arrive at (Gibeon r3, 5.4 to 6.2 s) (S3-130).
- Riding through a door needed 0.4 s of cream wash to hide the switch; `mirrorAbout` replaced it (Mona Lisa 22.77 to
  23.33 s).

### Acting and the first build

- The jungle holdout's first cut played the approved board stills in time with the voice with camera pushes. The
  owner: "he barely moves ... it's just his eyes and his mouth" (still frames 14%, characters 3 of 10). Four more cuts
  added the motion the first build lacked (S3-82, S3-134).
- First-build rows and their quotes: "He's just still in most of the images"; the leaflet and photo on the rifle's end;
  the salute and the sword missing in cut 4; three men popping out; "if he's still fighting we should hear gunshots";
  "a panda and a yeti, but I don't know what those are"; "that island is too small"; "we need a lot of sparkling here
  and there"; "the village doesn't look like it's burning".
- The jungle holdout was built fresh from the board, lost its captions, and went out without (10 November 2026);
  five critic rounds scored what was on screen and none noticed (S3-146).
- The painter's arm went off the frame on a world-right reach (Mona Lisa r4, 33.8 s); a target at x 620 on a 600-unit
  card cut the mitten off (r5, 33.95 s); his mitten behind his beret read as a stub (r6) (S3-138, S3-64, S3-139).
- A marching column's flames hung beside unlit torches (Gibeon r4, 45.7 s) (S3-73).
- A step, an uncovered patch and a gilt of another colour changed on one frame and read as a cut (Mona Lisa r4, 10.25 to
  10.35 s) (S3-74).

### The world and words

- The owner could not read FERMÉ, HEURES, VISITEURS or LE VOLEUR in the Mona Lisa heist (9 November 2026) (S3-149).
- Two invented landscapes dwarfed the Mona Lisa (owner, 9 November 2026) (S3-27).
- The Mona Lisa's hours were a number on a slate; the owner asked for a moving clock (S3-114).
- Cold read (S4-13): "it reads as something else" came back three rounds running: hail as fire, rocks as snow, fear as
  cheering, then Gibeon r3's stones as posts.
- Could this place exist (S5-8): a hall door stood at waist height with its rail across the doorway, and five rounds of
  critics on 540 px sheets missed it; the owner found it (Mona Lisa 21.6 to 22.6 s). Round 6's first critique with
  full-size frames found five more: a magnified canvas the wall showed through (7.5 s), light patches like glass slabs
  (15.0 to 15.6 s, 38.6 s), half a window view (40.4 s), bars floating at a man's knees (23.7 to 24.0 s), planks through
  workmen's necks (31.5 s).
- `edgeTouches` on each card found 16 cut sides in 9 cards, none seen by a critic: a thought cloud with a straight top
  and a card ending in a line across a robe (Gibeon r4-r5, 18.0 to 23.3 s) (S3-62).
- Fixes checked on stills came back: the walker on "strolls" (r6), DECEMBER 1913 clean for four frames then six (r6,
  r7), workmen's heads fixed at 30.5 s and back at 31.0 and 31.5 s (r7) (S5-25).

### The critic

- The jungle holdout (10 November 2026): fifteen fixes moved the score only 3.26 to 3.32. Fixed seconds rose (3.09 to
  3.29), untouched seconds drifted down (3.46 to 3.39, a fresh critic's noise), and 93% of seconds sat at 3 with 1% at
  4 or more. Hence predictions, raises, anchors and re-scoring only what changed (S5-4, S5-6, S5-10).
- Elijah and the widow (11 November 2026): fixing the fault list moved the beat board 2.78 to 3.06 over three rounds.
  Hence the path to 5 per scene as the critic's main output (S5-2, S5-3).

### Team and log

- The railroads practice went from 2.0 to 3.0 out of 5 in three rounds with a team, where one lead builder alone
  stopped at 2.0 (X-4).
- Vincent, 9 November 2026: "track the time it takes to build a whole story ... keep data". Gibeon r3 and Mona Lisa r4's
  fix agents looked for the log tool in the project, did not find it and logged nothing (S6-10).
- Vincent, 10 November 2026: log each area and the methods, so the weak area and its method show (S0-11, S5-12).
- A series library: a rough guess, not measured, of about 1.5M tokens for a 15-second clip once the library exists
  (S6-14).

### Areas in order across the film (13 November 2026)

- The cliff film (Josh at the lake, 60 s) was the first film built with the scene loop: three builders, three scenes
  each, every builder doing every pass on its own scenes. Its jump scene came out clearly worse than the 5 s spike of
  the same beat. The film's shots were wide with faces at about 1/20 of the frame; the cameras looked away from the
  far picture, so the sky was a flat gradient; builders changed shared place files under each other, so A/B rounds
  judged two worlds at once, and Josh's height changed across a join two builders made; each round was judged only
  against the scene's own last best, so scenes climbed from about 2.5 to 3.3 and stopped. Render 1 also had no words
  on screen, and was judged against a 5 s clip.
- Vincent chose to build by areas in order across the whole film, each locked before the next: one world agent, one
  shots agent, then scene builders for people and motion only, with any earlier build of a beat as that scene's
  reference (S5-71 to S5-90).
