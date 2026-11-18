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
  - [The spikes of 18 November 2026](#the-spikes-of-18-november-2026)
  - [The owner's six changes, 18 November 2026](#the-owners-six-changes-18-november-2026)

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

### The spikes of 18 November 2026

A gap study of four of our newest toon videos against the newest Short of a much larger channel in the same look found
the same gaps in all four: a picture that never settles, few props, no light source you can see, effects with no
weight. The owner asked for short spikes, "maybe a few 15-second ones", to improve the work and the process. Two series
ran that day (method: `spikes.md`; the bar: `bar.md`). Proof status: proven on a 15-second and a 5.6-second stretch,
not yet on a whole film (X-30). Bar clips: https://claude.ai/artifact/YZschJbe19yUVJ2WiwurZJ and
https://claude.ai/artifact/8oFxfFAA2aW8VjLjJnPgko; branches `spike/garbo-bar-5-combine` and `spike/garbo-night` of the
project the spikes ran in.

**garbo-bar** (the first 15.2 s of a toon Short: a café, a cloud wipe, a street; seven spikes, about 3.0M tokens):

- Baseline: no clean cuts, three big jumps (a cloud wipe, two whips), an inset box for 3.9 s, a median change per
  frame of 20 against the reference's 4; 3 of the 10 checks the stretch could show passed. "Median change per frame"
  came from this run (S3-173).
- Spike 1, fill: 14 set pieces and 11 extras changed 1 to 4% of the street's pixels, because the hero filled
  two-thirds of the frame with under 1 m of floor behind him (S3-185, S3-186). A black cat and pigeons against his
  black hair blurred his outline (S3-189). The single spikes were not independent: hence the order (X-18).
- Spike 2, light: the street stopped reading as a painting (gold cobbles, blue shade, shadows that agree); the café
  did not. The café parapet shaded the whole table at the old sun angle (S3-192); a shadow on a road already in shade
  and long "noon" shadows read as puddles (S3-193); the grade turned the white table cream (S3-194). Its question named
  awnings the street does not have (X-14). Two reviewers counted out-of-stretch checks as 5 and 1 (X-16).
- Spike 3, camera: one slow journey took the churn from 20 to 7.5 and passed 8 of 10 checks, and the hero was whole
  everywhere the baseline cut him (S3-175). But facts were lost: dropping the inset dropped who received the reports
  (S3-176), the NO stamps could not be read and the embassy sign was cut (S3-172). The calm camera showed every empty
  patch and a one-frame head flip the busy camera had hidden.
- Spike 4, acting: hits reacted on their contact frame, but a chicken burst with no cause turned the birds to cotton
  balls (S3-179, S3-182), and stamp puffs heaped over the NO sheets (S3-180). The builder judged puffs best at 20 to 30
  frames and 0.8 opacity; the reviewer saw a heap (S3-181, X-22). Background people's small actions did not read at
  those shot sizes (S3-183).
- Spike 5a, combine camera and fill: four fact push-ins raised the churn from 7.5 to 9.3 (S3-174); the address on the
  envelope the hero holds out replaced a whole inset scene (S3-176). A close-up with a sideways move slid anyone behind
  him behind his head (S3-187).
- Spike 5b, combine light and effects: 6 of 10 checks; merges broke small things nobody owned, a stray stick in the
  sky, a shadow the wrong way (X-25); the NO stamps got weaker a second time (X-20). Separate reviewers gave 8 and 6 to
  clips of one quality (X-21). Effects tuned never to cover a fact became too small to read (S3-180). Daylight with
  well-placed shadows still read flat with no source in frame (S3-195).
- Spike 5c, one fix round of eight items in order: six fixed, the one that mattered (the NO stamps) missed, 105
  minutes (X-26). The "stick" was the tram's trolley pole seen from a new angle (S3-190). "One journey" in the briefs
  had made builders avoid the cut the payoff needed (X-28); the reference Short has 8 hard cuts, all angle changes
  inside one place. This clashed with S3-121; the owner replaced it the same day (S3-201, change A below).

**garbo-night** (a 5.6 s night office scene; five spikes on one branch, about 1.7M tokens):

- Baseline: a bright room with a violet tint (mean 120, darkest 5% under 8), glow sprites that light nothing, an inset
  box for 2.4 s, churn 16.8. Two beats named as must-not-get-worse: the date on the calendar and "too late".
- Spike 1, room and camera: five shots cut inside the one room brought the churn to 3.9, as calm as the reference
  (S3-174); the calendar and clock read because the wide showed them first (S3-171). "Too late" got worse: a wedge on
  the clock face read as "on time" (S3-178), and the named beat in the brief is what caught it (X-20).
- Spike 2, light: turning off every glow that lit the room from out of shot did more than any grade (S3-196). Grade A
  (mean 78.5) read as night; grade B (mean 112, above a day-story brightness floor) read as dusk. The owner chose a
  night of about 85. The lamp behind the hero threw his shadow at the lens (S3-197); a straight light edge split the
  clock face with no source to point to (S3-199); the rim was an even outline all round (S3-198).
- Spike 3, acting and effects (45 minutes, the cheapest, with camera and light locked: X-19): the hero's face changed
  five times; two-frame tap glows read only as flicker and barely showed in grade B (S3-181, S3-200). "Too late" read
  partly: the clock showed one time at a time (S3-177).
- Spike 4, one ranked fix round with half the budget on the first item: "too late" fixed with a LANDINGS tag at half
  past six, hands running to eight and a RECEIVED stamp landing on the word (S3-177, X-26). The hard edge was the key
  light's shadow map on faces turned away from it. Mitten hands could not show a finger on the key (S3-184).

### The owner's six changes, 18 November 2026

After the two spike series the owner was shown each place where an older rule disagreed with a spike lesson, with a
recommendation, and answered "apply all". Source of each: owner's decision, 18 November 2026, after spike series
garbo-bar and garbo-night. The old rules stay in `rules.md`, struck through, and their old wording is in
`rules-log.md`. Not changed, by the same decision: the narration pace (S1-35), no haze (S3-15), sharp backgrounds
(S3-35) and the sharpness and saturation measures (S5-97).

| | Old | New | Why |
|---|---|---|---|
| A. Cuts inside one place | S3-121: hard cuts only for a change of place or time, at most 3 plus the loop | S3-201: a hard cut may change the angle inside one place, jump in time or loop; a change of place is a join or a moving dissolve. S3-202 (was S3-174) gives a fact a cut to a close shot and back | Five cuts inside one room took the churn from 16.8 to 3.9; the reference Short has 8 angle cuts; "one journey" made builders avoid the cut a payoff needed |
| B. Push-ins on a hold | S3-118: segments over 1.8 s punch in at the middle | S3-203: hold with a slow drift; one push-in every 4 s at most. The kit keeps its punch-in on for older films (X-8); the film template turns it off | Four fact push-ins raised the churn from 7.5 to 11; the reference sits near 4 |
| C. Night | S3-48: night by hue, brightness and one warm light; S3-31: black point near black; S3-30: bright and saturated | S3-205: the room goes dark, lit by lamps you can see that fade with distance; mean near 85, darkest 5% 25 or more, faces and facts readable, saturation kept. S3-206 and S3-207 keep S3-31 and S3-30 for day and point at night. S3-204 (was S3-196) turns off out-of-shot glows. S4-18 (the Bible in Clay floor) unchanged: no night scene tested there | A violet day room did not read as night; the dark grade (mean 78.5) read as the reference's night |
| D. How big the hero is | S3-105: medium shots by default (camera.md: the person about half the frame high); S5-88: a wide only places the scene, 1.5 s at most | S3-208: about a third of the frame height where the place must read, about half for acting; S5-102: a wide with the hero at a third or more may carry a scene, the 1.5 s limit only for smaller wides. S3-211 (was S3-170) points at both | With the hero at two-thirds, 14 set pieces and 11 extras changed 1 to 4% of the pixels |
| E. Light on the people | S3-42: one warm key per framing, set relative to the camera; S5-58: warm and cool rims on the cards | S3-209: the key is the place's named source, placed with the set; S5-103: a warm rim on the key side; S3-210 (was S3-198): at most a faint cool edge on the far side | A lamp behind the hero threw his shadow at the lens; an all-round rim read as a sticker |
| F. Dates and facts | S3-150: dates and orders show as cards | S3-212: on a prop in the place (a wall calendar, an envelope), a card only when no prop can carry it | The date on the wall calendar and the address on the envelope read inside the place; inset boxes and cards took facts out of it |

Code that followed: `shots-check.mjs` flags a long wide only when the hero is under a third; the kit's `checkJoins`
no longer counts or asks a reason for a cut to a new angle inside one place; the film template sets `punch: false`.

### The rendered world, 18 November 2026

A third spike series, "garbo-world" (the same 5.6-second night stretch, spikes 0 to 4), put the reference's frames
beside ours again. Its people are flat cards too; what differed was the world, which is rendered where ours was drawn.
Likeness to the reference's frames went from 3 to 6 of 10 over four spikes, and the last review said the stretch tops
out near 7, because set depth, lens, cast design and light level were fixed before the series began. So the next film,
"hannibal-oxen", built its hardest scene to these rows from the first frame: 3 on the shot board, 5 after one build
and one fix round, the reviewer naming about 3 more points as fixable. The owner saw that scene and chose the look as
the place to start from. Source of each replacement: owner's decision, 18 November 2026, after spike series
garbo-world and hannibal-oxen scene one. Old wording: `rules-log.md`. **Proof status: two night scenes of 5.6 and 10
seconds; no day scene and no whole film yet (X-30).** A second pass follows when the film is finished.

| | Old | New | Why |
|---|---|---|---|
| G. Ink on the world | S3-39: near-black ink on the world, thinned over painted detail | S3-213: no ink on the world, the ink pass off; S3-214 to S3-217: painted materials at their real scale, a painted shape for each object, colour kept | Ink off alone changed little; flat two-tone surfaces were the large part. Things drawn as a line alone vanished with it |
| H. Shade | S3-41: two-tone light, blue-grey or violet-blue shade | S3-218: smooth shade that keeps the surface's colour and texture; S3-219: at night a neutral fill, cool away from the lamp, warm round it; S3-220: night highlights near 175 | Two flat tones read as drawn. Neutral shade alone turned the room amber from edge to edge; the cool fill then washed out the warm pool |
| I. Shadows | S3-43: indoors only contact blobs and free-standing floor things cast the key's shadow | S3-221: soft shadows from furniture, props and people, the edge widening with distance, and darkening where things meet; S3-222: grounding checked after a light change | A fixed blur only blurs the shape. Softer shadows took the people's shadows away until grounding was rebuilt |
| J. People | S3-57: cards lit by the scene; S3-210: a warm rim on the key side; S5-103: the same in the world stage | S3-223: cards flatter than the world, one even tone per colour area; S3-224: no light rim; S5-106: the place's light without the rim; S3-225 to S3-228: outline on each limb, a tight contact, held things in front of the card, white faces out of the grade's tint | Builder and reviewer both picked the flat cards: a gradient and a rim read as glow and pasted the hero on |
| K. Places | (none) | S3-229 to S3-233: a lit far view, floor that leads in, three depths; sky in the top 40% outdoors; a probe still beside the reference frame; a sky in the reference's colour; things to sit on and hold | A scene's ceiling is set when it is built. A mountain wall built to a plan's numbers read as a dune |
| L. Order | (none) | S2-36: one reference frame per scene; S5-104, S5-105: the hardest place first, to likeness 7, and the owner's yes to the look before the other places | One build to the rows moved a scene as far in 32 minutes as four spikes moved a locked scene in four hours |
| M. Method | (none) | X-31 to X-34: a fix round gets a review; three piles for what is left; a look is judged on a full-size clip; the reference's frame beside ours before a gap is named | A builder reported five of five items closed and the review found two. The owner read a half-size clip as a soft picture |

Left out, as builders' claims no reviewer confirmed (X-22): the three things a metal needs; a glow wider than twice
its flame turning a blue sky pink; measuring night second by second; choosing each place's far view when the map is
drawn. Not yet in `templates/look/`: the code these rules lean on (soft shadows, contact darkening, the flat card mode,
limb outlines, the night grades). It lives in the film's `src/look/` until it is brought over.

