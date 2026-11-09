---
name: toon-video
description: Use when making any short animated video in a drawn 2D toon look - flat cartoon characters drawn in code as cards inside 3D sets, rendered with Remotion and Three.js, voiced and scored with ElevenLabs - for any subject - a story, an explainer, a product demo, a history piece, a kids' tale, a brand clip. Covers the script, sets, camera without hard cuts, acting (anger, fear, hiding), action beats, hands, light, and the checks before the hand-back. Triggers - "toon video", "2D animated short", "cartoon explainer", "drawn video", "make it in 2D", "like Ricks Clips", "animate this story". For a Bible in Clay story in the toon look, use toon-story-video, which adds that channel's rules on top of this one.
---

# Toon video (2D cards in 3D sets)

A toon video is flat drawn people (cards that always face the camera) standing in full 3D sets, filmed
by a moving camera. Everything is drawn in code, so pictures cost nothing to redo; only voices, music
and effects cost money. This skill holds the craft. A project or channel can add its own rules on top
(Bible in Clay does, in `toon-story-video`).

## First

1. Find the toolkit. It was built in `/Users/vince/Projects/bible-shorts`: `src/spike2d/` (the
   `Figure2D` card, `draw.ts` faces, hands and props) and the story folders that use it, newest first
   (`src/stories/david-jonathan-2d/` has the camera swings, sets, rage face and action beats). A new
   project copies `src/spike2d/` and the newest story's `shots.ts` helpers; it does not import across
   repos. See `references/toolkit.md` for what each helper does and the gotchas.
   When planning a story, read `references/playbook.md`: the techniques learned from studying the best Shorts,
   each with a blueprint and whether it is built. Pick the ones this story needs; build a blueprint-only piece
   when the story calls for it, then mark it built there.
2. If the project has its own making-of doc (`docs/MAKING-A-STORY.md` or similar), read it all. Its
   rules win over this skill.
3. Read the ElevenLabs balance before the first credit and after the last, and report the difference.
   Never print a key: hand secrets files to node with `--env-file`, never `cat`, `grep` or `source` them.
4. Know the form: 9:16 (a Short, 50–65 s) or 16:9. Portrait is narrow, which drives the camera rules.
5. The place, the look and the people come from `toon-world`: which route to build a set by (pictures then
   3D, a picture warped by depth, or drawn in code), the look stack (background blur, ink on the world,
   two-tone light, grade) and lit bean-head cards. Load it before the first set.

## The order

1. **Script.** Open on the strangest true thing within three seconds, build in steps, land the turn at
   the end. Write about 150 words for 60 s (narration runs about 3 words a second with pauses). Bring in
   every person and object before it matters: if the payoff needs a stone, show the stone early. The
   hook needs its payoff soon after it. Facts you cannot show stay out; an imagined feeling is said as
   imagined.
2. **Voice.** The narrator is Laura (ElevenLabs `FGY2WhTYpPnrIDTdsKH5`, eleven_v3, stability 0.3, played
   at about 1.2× with `atempo`), chosen on 7 November 2026 for her energy. One voice per speaker, `say` with eleven_v3 tags, each line cached by a hash of its text
   and voice, so a rerun costs nothing. Check every line with whisper. Lines reused from an earlier
   version are copied (mp3 and align files) and cost nothing. Read the total duration now and cut lines
   here, not after the music. A new narrator is picked by measured pitch, each line is cut with a lead
   before its first letter, and a slower narrator's length is checked first ("Voice", below).
3. **Retell check.** Give a fresh agent only the script (or the contact sheet) and ask it to retell the
   story. Anything it gets wrong, the viewer will too. Fix and repeat until it retells it right.
   **Then the meaning sheet** (required, approved with the script and the comic): a table with one row per beat
   giving the thing that changes, its cause, and the shot that shows the change happening. A glowing rail is a
   state; a gap closing is a change, and the change is the shot (Vincent, 8 November 2026, railroads practice:
   "the action of closing is the most important part"). Name the one thing the viewer must see in each second,
   too. Every later stage is checked against this sheet, not against a reference's pictures. The same list goes into
   code as must-see entries (`MustSee`: the word, the subjects by name, the size), and the shots are written from it.
   When the meaning names a place (at the gate, on the wall, in the doorway), the place is a subject of the entry too.
   Why: Gibeon r3's entry for "stood" listed the army and its leader and passed while the gate was out of frame and the
   critic saw open desert; with the gate added, r4 is clean with the gate in frame (frames 1082 to 1094).
4. **The stages the owner reviews.** Nothing moves to the next stage before his yes (Vincent, 8 November 2026,
   taken from `ai-story-video`):
   - a. **Comic.** The script as one page of panels drawn in code, a panel per line, the words under it. Free;
     the story is fixed here.
   - b. **Cast sheet.** Every person and animal as a flat cartoon card in the story's cast style (`toon-world`).
   - c. **Looks and places.** A look proposed for each scene with its reason (picture room, game world, flat 2D
     place, drawn in code: `toon-world` "Looks, scene by scene"), the parts plan (which part comes from code, a
     picture, a 3D model or an effect), and one picture per place where the look uses pictures. Vincent picks; looks
     may differ scene by scene, never within one frame.
   - d. **Still board.** One Higgsfield still per beat (`gpt_image_2_6`, 9:16, with `resolution: "2k"` and `quality:
     "high"` for any picture that becomes a texture; without them the result comes back about 750 px wide), each made with the place's master
     picture and the cast sheet as image references, the prompt saying the people and animals stay flat 2D cartoon
     cards exactly as on the cast sheet, lit by the place, never realistic or 3D. Check every still at full size: a
     realistic person or a 3D animal is redone, not approved. The 3D build then follows the approved stills.
     The owner sees the board before anything is built, and beside each still the planner writes down what the owner
     judges by eye: the words on things, the language they are in, the line's subject's size against its neighbours,
     and how the thing the line names is shown (seen happening, or only told). Why: the owner's six Mona Lisa notes
     (French signs, a painting dwarfed by invented landscapes, the 28 hours as a number, the empty spots told, a cut
     head, half a roof) came after round 6, and every one would have been seen on a still board; each cost a round.
   - e. **Clips.** Build and render the video in clips of 15 to 20 seconds (about four for a minute), cut at story
     beats, and show each clip before building the next. A clip reaches the owner only after the measured checks
     below pass and a critic agent has scored it against the meaning sheet (and a reference when there is one). The
     critic also opens one full-size frame of every shot and asks whether the place could exist ("Could this place
     exist", below).
   (Vincent, 7 November 2026, after the train heist: "before any of this is animated ... I can review them fast.")
5. **Sets.** A set list per place before any shot: 8 or more props, a full background, extras.
   People are small inside a big place. Crowds are painted once and reused. Build only what the
   approved still board shows.
6. **Cold read** (required, before the shots). Every new place, prop, effect, material and face gets one still, shown
   to a fresh, cheap agent that knows nothing of the story, with `toon-world/references/cold-read-brief.md`. It
   says what the thing is, what is happening and what the face feels. Redraw anything it misreads, and read it again.
   Why: "it reads as something else" came back in three rounds running (hail as fire, rocks as snow, fear as cheering,
   then Gibeon r3's stones as posts), each time found only by the critic after the render.
7. **Shots.** Time each shot on a word of the voice. Build the camera, the acting and the action by the
   rules below. Look at the contact sheet after every round, and re-sheet only what changed.
8. **Music and mix.** Settle every pause first, then music in sections with a coda, then the mix:
   voice on top, the whole bed held down under every run of words, effects on their words, about −14 LUFS. The mix
   writes a voice stem and a bed stem, and `scripts/levels.mjs` must pass on them before any render is handed back,
   and again whenever the narrator changes ("Music and mix", below).
9. **Render, check, hand back.** Run the checks below and give their numbers with the video. Nothing
   posts without the owner's yes on the finished video; drafts only.
10. **Fix rounds: three, not seven** (below, "Three rounds, not seven"). Each fix round fixes every finding the
   critique lists and checks each fix on a short full-size moving render of its stretch before the round ends.

## The backbone and the dynamics

Every video starts from the same backbone, so it begins from somewhere good, and then gets its own dynamics, so
no two feel the same (Vincent, 8 November 2026: "some are slow, some are fast ... we need the backbone for
everything, even when we are getting inspiration from them").

- **The backbone (always):** a hook in the first line and a payoff that loops back to it; the meaning sheet; a look
  per scene with its parts plan; one cast style with flat faces that carry the acting; sharp, detailed, saturated
  pictures measured against a reference; captions one word at a time; a mix at about −14 LUFS; the owner's stages
  and the checks below.
- **The dynamics (chosen per video, written as a short profile at stage a, approved with the script):**

  | Dial | Range seen in the studies | Pick by |
  |---|---|---|
  | Pace (big changes a minute) | 25 (dashcam, face-led jokes) to 50 (railroads, machines) | What carries the story: faces slower, machines and journeys faster |
  | Longest holds | 0.5 s (railroads) to 2.3 s (dashcam, on a joke) | Hold where a face or a reveal needs reading time |
  | Joins | almost none (railroads: journeys and dissolves) to 7 cuts plus wiper wipes (dashcam) | Journeys for one big place; cuts and world-made wipes for many places |
  | Colour arc | by place (railroads) or with the plot (dashcam darkens as the scheme grows, clears to sun at the payoff) | Whether the mood changes over the story |
  | Camera energy | dives and skims (railroads) or pushes and orbits that rest on faces (dashcam) | The same as pace |
  | Voices | narration only, or spoken lines with lip sync | Whether people talk in the story |

  Take the profile from the nearest studied video in `references/playbook.md` and `docs/STUDIES.md`, then change
  what this story needs. The checks measure against the profile, not one fixed number.

## Camera

- **Shots by subject** (toon-kit `camera.ts`, synced with `toon-world/scripts/sync-kit.mjs`). Write each shot from the
  must-see list: `shot(word, { subjects, size, az, el })` for a held framing, `follow(...)` for someone moving. The
  camera is worked out from what must be seen, so it cannot fall off the subject. Use `approach` for a journey to a far place (the
  destination stays in sight). Keep raw keys for whip reveals and world-made joins only. Gibeon's night march (9 November 2026) used hand-typed keys that raced ahead of the column,
  so "marched all night to save them" showed an empty hillside; `follow` on the column fixed it, and the check below
  found the fault in under a second with no render.
- **More kit shots** (1.55.0): `matchCam` holds a shape at one screen spot and size from any bearing, for a
  shape-matched dissolve; `track` pans from a fixed spot on a moving subject (a stairwell, a hall, a corridor) and
  refuses a subject whose path jumps; `cardReach` aims a card's hand on the screen. `path` blends the view's
  direction and its look distance apart, so mixing near and far look points no longer flips the picture.
- **Kit shots added in 1.56.0.** `path` blends look points again where neighbouring keys' look points are close, so a
  still, near subject the camera moves round keeps its spot: 1.55's direction-only blend let a loaf held 1.3 m from
  the lens drift out of the frame (Gibeon r4, 23.7 s, frame 711; clean on the 1.56 path over the whole film).
  `screenFix` aims `matchCam` at where a shape is drawn (see `references/joins.md`). `mirrorAbout` turns a camera
  about an opening for the join through a door. `track` with `to` backs the camera along a line: for a walk toward or
  away from the lens, the camera moves more slowly than the walker, never `follow` at a fixed size, which kept him one
  size against a doorway that did not move and he read as frozen (Mona Lisa r5, 23.2 to 24.0 s).
- **Kit shots added in 1.57.0.** `matchOf` reads the `Match` and bearing off a camera already on screen, so the other
  side of a shape-matched dissolve copies a framing that works instead of a hand-worked guess (Mona Lisa r6: worked by
  hand, join 11's guard side came within 7 cm of the old two-shot; `matchOf` gives az 221.6, size 0.12, el 5.1 and the
  face at (0.615, 0.042), and `matchCam` rebuilds the camera exactly). `track` with `to` now moves the camera at an even
  speed and refuses a walk whose distance turns back anywhere (see below).
- **Use the kit's path blocks, never a copy.** A story that keeps its own `path`, `K` or `curve` never gets a kit fix:
  Gibeon's own `kit.ts` meant the 1.55.0 path fix changed nothing (the camera dump before and after the sync was
  byte-identical). `sync-kit.mjs` names any such copy; import from `src/toon-kit/camera` instead.
- **Check the camera before any render.** Run `safe` on every camera (above the ground, outside solids, a usable up),
  then `audit` (turns over 4° a frame outside a planned whip, and a position jump: a move in one frame several times
  its neighbours', which is a hard cut whatever dissolve is around it; Mona Lisa r7's only hard cut was a roof camera
  that jumped 2.0 m inside join 12 at 35.367 s, a 2° turn the turn limit passed; over both films it finds that frame
  and nothing else), `checkMustSee` (every must-see subject in frame and
  big enough on its word, not behind a rock, and no rock crowding the lens) and `checkLens` (nothing within about 6 m
  filling over 15% of the frame, on every frame, not only on words) over the whole film, every layer of a dissolve
  included: `layerRuns` turns the film's layer function into runs, one per canvas on screen, and `audit` and
  `checkLens` take them. Build the blockers from the same list the scene draws its rocks and bushes from, so the check and the
  picture cannot disagree; people who are not the subject are blockers too. Indoors, give `checkLens` groups, each with
  its own limits (wall pictures and furniture at 6 m and 30%, floor props at 3 m and 15% worked), and declare each span
  framed on purpose with its reason (`framed`; the report prints the reasons). Why: one 6 m and 15% limit flags 265
  frames in 15 runs over the Mona Lisa's interiors, where the two groups and two declared spans flag none; split this
  way, the check's first run found the one real fault, a painting filling 87% behind the guard's face (r6, 35.8 s).
  A must-see entry for a subject that must not be cut (a person, a head and a raised arm) says `whole: true`: its whole
  sphere stays inside the frame, not only its centre. Under an overlay (a follow card, a title), `under` gives the
  overlay's bottom edge as a share of the height, and the subject's top stays below it. Why: the centre-only check
  passed Joshua with his head cut by the right edge (Gibeon r4, 40 frames at 47.97 to 49.27 s) and cut at the chest under
  the card (68 frames at 58.13 to 60.37 s); with `whole` both fail, and the fixed r5 cameras pass. A must-see entry for something the
  viewer must read (a clock, a calendar, a sign) says `words: true`, which asks for 10% of the frame height, and
  `checkMustSee`'s `captions` option (the caption band's top and bottom as shares of the height, from where the
  project draws its captions) fails one that reaches into the band. Why: the size check passed a slate at 64 to 80%
  of the height and the caption covered its "28" (Mona Lisa r4; at 24 to 41% it reads, r5 25.0 to 25.7 s). Give a
  words entry the words themselves as its subject, sized to the lettering, not the thing they hang on.
- **No empty sky.** `checkSky` over every frame and layer, with the terrain: more than 45% of the frame's centre column
  empty sky (meeting neither the ground nor a subject) fails, and so does a view over 12° up with no subject whole in
  the frame; a planned look at the sky (the sun the line names) is declared. Why: the joins stack forbids rising into
  empty sky, yet a fix round brought it back to make room for a card, Joshua cut at the chest under 60 to 70% blank
  sky (Gibeon r5, 58.1 to 60.4 s), and nothing caught it; over the whole film this check finds that ending and one
  0.2 s dissolve layer, and passes the opening's loaf held up against the sky.
- **Measure how the picture moves, not how the camera moves.** On the first render of a clip (quarter size is enough)
  and on every fix round's moving check, run `toon-world/scripts/frame_motion.py <video>`: the mean frame difference
  each second, with the runs of still seconds longer than the profile's longest hold flagged (floor 8, planned holds
  given with `--hold`); `checkMotion` takes the same numbers. Before a render, toon-kit `screenMotion` follows the
  subjects and landmarks on screen and points at camera-still stretches, but it cannot see texture or acting, so it
  never clears a stretch on its own. Why: 1.56's `motion` measured the camera's path, and a camera running with a
  rout scored 71 and 53, among the film's liveliest seconds, while the picture was nearly still (Gibeon r4, 51 to 52 s;
  the render's frame difference 5.4 and 6.5). The frame difference is the critic's own measure: on Gibeon r5 it gives
  his numbers and flags exactly his two still findings (the valley at 51 to 52 s and the card hold at 59 to 60 s).
  Gibeon's `scripts/gibeon-2d-camera-check.ts` is the worked example; it found the foreground rock on the night
  march that the first subject-framed shot put in front of the column.
- **Must-see entries start on their word.** An entry starts on its word's first frame, and a move that brings the
  subject in lands on or before the word. Why: Gibeon r2 keyed "stood" 6 frames after the word, so the check passed
  while the word showed rooftops (36.05 s); r3 lands the glide at frame 1076 for the word at 1082.
- **No head cut by the frame.** toon-kit `headCut(cam, feet, height)` says when the bottom edge cuts a person's head
  (at any distance) or a side edge cuts it (nearer than 6 m). An extra it names leaves the picture for that frame (the
  draw loop skips him); a named person is reframed, never dropped, and `checkHeads` reports a named person cut by any
  edge at any distance over every frame. Scenery never crowds the lens. Why: the old rule ("a crowd member within 7 m
  leaves") did not fit an interior, where the wanted front rows stand at 5 to 8 m, and it never covered the named cast:
  workmen's heads were halved at the side edges (Mona Lisa 30 to 31.5 s), Peruggia's shocked face sat half out of the
  left edge for the whole of "turns" (r7, critic 44.0 to 44.8 s; `checkHeads` reports every frame from the shot's first at 43.53 s to 45.00 s, when the camera leaves him) and Joshua's face slid out at the right
  edge on a tilt (Gibeon r6; it reports 49.40 to 49.47 s, the critic saw 49.3 to 49.5 s).
- **A camera that backs from a walker stays slower than him on every frame.** Use `track` with `to`, which moves at
  an even speed and refuses a walk whose distance turns back; never a smoothstep or eased move, whose middle runs 1.5
  to 1.9 times its average. Why: "slower than the walk" on average still outran Peruggia mid-walk, and he shrank (Mona
  Lisa r6: his size 0.75, 0.86, 0.80, 0.73 eased; 0.75, 0.83, 0.88, 0.92 even, 23.1 to 23.95 s). Start the track once
  he is walking: from a stand he is slower than any camera for his first steps.
- **Props with states.** A prop whose state matters to the story (a gauge, a door, a level) is a toon-kit `states`
  prop, and a dial is drawn from `dial` so its needle and its marks share one angle. Check its state on its words in
  the same no-render check.
- **Aim at the people, not the place.** A 9:16 frame at a 44° field of view is only about 26° across.
  Most first-sheet faults are a person just off-frame. For two people, aim between them and keep both
  within about 10° of the centre line. Two people far apart, side-on, do not fit: shoot a diagonal from
  above.
- **Cameras on uneven ground are ground-relative.** Give heights above the ground under each point,
  not absolute heights, or cameras end up underground.
- **Joins come from the stack, each with its reason** (`references/joins.md`, 9 November 2026). For every join, say
  what it has to do (go far and show where, go in time, follow cause to effect, go inside), pick the entry that does
  it, and write the reason in the shot list. A move whose reason you cannot say out loud is not a join: hold,
  dissolve or cut. Never rise into empty sky and fall onto the next place: Gibeon 2D did that between every far place
  and it read as the camera moving for its own sake. Within one place, follow the subject. One hard cut at most,
  saved for the twist, plus the loop back to frame 0.
- **What the hard-cut count sees** (Jacob wrestles 2D, 19 cuts down to 7): an inverted impact frame counts twice (in
  and out), and a fast flight between far places counts several times. Show a hit with speed lines alone, and dip
  the picture to white across a far flight (peak at its middle). A far flight eats about 0.8 s, so start it a word
  later when the shot before carries a line that matters.
- **Smooth, not busy.** Big near surfaces must not sweep across the frame: a camera skimming a few centimetres
  over a rail with a wide lens fills the frame with grain flicking past even when the overall motion matches the
  reference (Vincent, railroads round 3). Sit a little further back, use a slightly longer lens, glide slowly with
  long eases, and let the thing that changes (the heat travelling, the gap closing) be the motion the eye follows.
- **One clear thing per second**, from the meaning sheet, framed big and sharp.
- At least three kinds of view: from above, a map or cut-away, ground level.
- At most one frame in four is a face close-up. The world is the star.
- The camera shakes only on hits.

**A ratio the story states is held by the framing, not by moving the story's objects.** When a frame must say "a few
lost among many" (41 of 400), frame wide over the whole group for that beat and close on the few for the beat that
shows them; spreading the few apart to fix the ratio makes them small everywhere else (Wald bombers, rounds 3 to 5).

**Captions never cover a face: make it impossible.** Place each caption word from the projected boxes of every visible
head, the line's subject and any drawing being read, keep one height per shot and never lower than about 82% of the
frame (the phone's Short buttons sit below), and make the camera check fail on any overlap. Why: captions sat on Wald's
eyes in his puzzled close-up and on the chalk plane's engine dots in rounds 2 to 4, each time after a critic had to
find them.

## Acting

- **Emotion is drawn, not narrated.** The flat look's dot eyes and small mouths cannot show strong
  feeling, so add a face for it. For anger: a red flush, a glaring eye under a heavy lid, a thick brow,
  a shouting mouth with teeth, an anger mark, steam, a tremble, on a 0..1 dial. Use it on every beat the
  words call angry. The same goes for fear, grief and joy: if the narrator names it, the face shows it.
- **Hands are mittens.** Thin-finger hands read as claws on a phone. Mittens by default on every look.
- Held poses, not a constant sway. Brows do most of the acting.
- Cards only face the camera; a side or back view needs its own drawing. Stagger two people in depth
  rather than side by side.
- **A card's hand reaches on the screen.** Aim a point, a reach or a hand-over with toon-kit `cardReach`, which
  measures the target's offset on the screen at the card's depth. Why: along the world's right, a card near the
  frame's edge points away from a farther target (Mona Lisa r4, 33.8 s: the painter's arm went off the frame).
- **A hand target stays inside the card.** Clamp the reach to the card's drawable area less the mitten's radius. Past
  the card's edge the mitten and the arm's outline are cut off and the arm reads as a thin coloured line with no hand
  (Mona Lisa r5, 33.95 s: a target at x 620 on a 600-unit card; up and out at the hooks on the card, 33.7 to 34.2 s).
- **A reach ends clear of the card's own head and of small things.** When the target sits within a head's width
  above the head, swing the reach out beside the head on the target's side; aim at a point clear of small objects, or
  the mitten on one reads as holding it. Why: the painter's mitten ended behind his beret and read as a stub, and a
  mitten touching the plaque read as lifting it; the cold read caught both, which every critique had missed (Mona Lisa
  r6, 33.6 to 34.5 s; read right after the change).
- **An effect a card carries is drawn from the card.** A torch's flame, a lamp's glow, a banner: draw it from the card
  itself (its hand, or a point in card units through the card's own transform), never from the crowd point plus a
  typed offset. Why: the world drew a marching column's flames at the column point plus an offset, so they hung in
  the air beside unlit torch heads (Gibeon r4, 45.7 s; on the torches at frames 1372 and 1380).
- **A prop passes from the world to a card on one quiet frame.** At the swap the prop keeps its screen size and
  colour, and nothing else changes on that frame (no step, no light change); whatever the prop uncovers is keyed to
  when the prop moves, not to the swap. Why: a step, the uncovered patch and a gilt of another colour all changed on
  one frame and read as a cut (Mona Lisa r4, 10.25 to 10.35 s; clean after at 9.90, 10.25, 10.33 and 10.45 s).

## Action

- **Violence and big moments are four beats:** the feeling building, the wind-up, the act seen side-on
  with motion lines and a smear, then the result with a camera jolt and a shudder. Show the action the
  narrator names, as it happens.
- **Thrown things** are about twice as thick as life, with a ghost trail, or they vanish on a phone. A
  throw toward the camera hides the thrower: show the throw close, then the arrival.
- **Hiding needs a real sightline.** The cover (a stone, a wall) stands between the hider and the
  seeker for the whole run. Route the seeker on the far side and shoot over the hider's shoulder at the
  seeker. Never let a seeker walk past the hider in plain view.
- **An empty place** (a seat, a bed, a desk) is shot low, across it, with nothing in front. Cards draw
  over everything, so any figure on that line covers what you meant to show.
- **The world keeps its state by time, not by shot.** A spear that sticks stays stuck in every later
  shot; a cup knocked over stays over. This is how picture jokes work: the camera comes back to the same
  place and the change carries the story without words.

## The world

- Build the place and its look with `toon-world`. Without its background blur, ink lines and lit cards, a
  3D render reads as flat and the people as pasted on.
- **Medium shots, not faces.** The person stands about half the frame high, with the whole prop beside
  them and the room above. A face fills the frame only on an emotional turn (about 3 frames in 20).
- **Size the hero prop against a person first.** A prop twice too big crowds every shot of the person, whatever
  the camera does.
- **Show how a device works before anyone reacts to it**: a see-through "what if" copy of the moving part
  (a ball dropping from the dragon into the frog) in the first five seconds.
- **A camera that ends high shows a count**: orbit and rise until the eight of something can be counted. In 9:16,
  count from high only when the things fit in about 50 m; spread wider, have them arrive one by one, each on a beat.
  Why: a portrait frame is about 26° across, so a ring 250 m wide left each of five armies a speck for three rounds
  (Gibeon 42.3 s); counted arriving, the five read (frames 1258 to 1297). A portrait frame is tall, so arrivals side by
  side are small (five kings an eighth of the frame each, Gibeon r4 42 to 43 s). One way that fits it: line them up
  receding toward the lens, each a step nearer and to alternate sides, so none hides another (the screen spacing, side
  offset over distance, wider than half a body); Gibeon's five kings then ran from a fifth of the frame to nearly half
  (frames 1275 to 1305). It is an example, not the only way.
- **A name is spoken while its person is on screen**, within about 0.2 s, or the shot loses its point.
- One or two picture jokes that carry the story without words.
- Facts as things in the world: a counter, a mark, a scroll, the objects themselves.
- **Words on things are in the narration's language.** Signs, slates, labels and pages say what they say in the
  language the viewer hears; the era and the place come through shapes and objects (clothes, lettering style, props),
  not through foreign words. Mastheads and proper names (a newspaper's title, a city's name) may stay. Why: the owner
  could not read FERMÉ, HEURES, VISITEURS or LE VOLEUR in the Mona Lisa heist, so each sign showed a word that told
  him nothing (9 November 2026).
- **The thing a line is about reads as the subject, even when its true size is small.** Scale or frame the invented
  things around it so it wins: smaller neighbours, a plainer wall, a frame that crops them. Why: two landscapes
  invented to hang beside the Mona Lisa dwarfed her, so the shot read as a room of big paintings (owner, 9 November
  2026).
- **Show time passing with something that moves**: a clock's hands turning, light crossing a room, a candle burning
  down, rather than a number counting. A number tells; the moving thing shows. Why: the Mona Lisa's hours were a
  number on a slate, and the owner asked for a moving clock instead (9 November 2026).
- Light follows the story: warm firelight, blue night for danger, gold dawn for hope. Keep every face
  bright enough for a phone.
- **Words go on screen cards, never on the ground.** Text laid on the ground reads backwards from half
  the cameras. A map on the ground is shapes only, laid on the terrain point by point.
- Nobody walks through solid scenery: list the solids and check the paths.
- Captions: one word at a time, white, in the portrait safe area.

## Voice

This skill's own scripts (`levels.mjs`, `pitch.mjs`, `production_log.py`) run from the plugin cache,
`~/.claude/plugins/cache/vince-tools-marketplace/general-tools/<newest version>/skills/toon-video/scripts/`, written
`<toon-video>/scripts/` below. They are not in any project. Why: the voice-over-bed check and the bed hold were
written in one project (bible-shorts) and never reached the next (Epiclings), whose narrator was drowned.

- **Pick a narrator by measured pitch.** "Higher, excited, still a normal person" is a pitch band, not a word to search
  for. Search the voice library by energy and use case, voice the same opening lines (about 30 words, the hook
  included) with every candidate at the same settings and tempo, then run `node <toon-video>/scripts/pitch.mjs
  takes/*.mp3 --band <lo>-<hi>` and show the owner the takes ordered with their numbers. Why: on the Mona Lisa heist
  the owner liked takes at about 170 to 211 Hz, and men there are rare: 11 of 12 young excited men from the library sat
  at 103 to 141 Hz (one at 200). A formant-preserving lift is an option for a voice he likes that sits low (ffmpeg
  `rubberband=pitch=1.26:formant=preserved`, four semitones, lifted 141 Hz takes to about 176 Hz); offer it beside the
  voices already in the band. Record the pick in the story's voices file: the voice and its id, the settings, its
  pitch, how many were tried, and why this one.
- **A slower narrator lengthens the film.** Before choosing, work out each finalist's length for the whole script at
  the tempo cap (the fastest `atempo` the lines stay clear at; 1.3 on the Mona Lisa) and check it against the form
  (50 to 65 s for a Short). Why: Laura fitted the Mona Lisa to 57.5 s at 206 words a minute; Ember, who replaced her,
  reads more slowly and the film ran 62.9 s at the cap (188 words a minute), and every shot, effect and music cue was
  re-timed.
- **Cut each line from at least 0.10 s before the alignment's first letter** (and about 0.12 s after its last). The
  alignment marks a plosive's vowel, not its burst, so a shorter lead cuts the burst off. Why: a 0.04 s lead cut the P
  off "Paris", heard as "Chris" (Mona Lisa, Ember take, 9 November 2026). Check with whisper on the cut line, not the
  raw take.
- **A whispered or hushed line needs room to be lifted.** Level each line to the film's line loudness with a gain
  clamp wide enough for it (up to +16 dB); a clamp of +8 left a whispered reveal at −31 LUFS, far under its neighbours
  (Wald bombers, 9 November 2026).
- **A new narrator re-runs the mix check.** A quieter or more dynamic narrator (Ember at stability 0) changes every
  line's margin over the same bed: the Mona Lisa's bed, levelled while Laura narrated and left as it was, sat 1.2 dB
  over Ember's plumber line at its loudest.

## Music and mix

- **The voice is the loudest thing under every line, measured.** The mix writes two stems on the film's clock, before
  the final loudness gain (which moves them together): the voice as it goes into the mix, and the bed, everything else
  (music, ambience, effects) exactly as it sits under the voice after its ducking and hold. Then
  `node <toon-video>/scripts/levels.mjs voice.wav bed.wav timeline.json` (the timeline gives each line's `start` and
  `end`): under every spoken line the bed's loudest 400 ms moment stays at least 10 dB below the line, the last 30 s
  included (Vincent's rule, 5 November 2026). Exit 3 names each line that falls short. Required before any render is
  handed back, and again whenever the narrator, the music or an effect's level changes.
- **Hold the whole bed down for every run of words**, not only duck it with a compressor keyed on the voice. A
  compressor reacts after the sound starts, so a sharp hit landing between two words passes at full level. The
  settings that work (Gibeon's mix): join words into runs where the gap is under 0.25 s; from 0.15 s before a run to
  0.12 s after it the bed's gain is 0.2 (−14 dB); in a pause under 0.9 s it is 0.4 (−8 dB); in a longer pause the bed
  is full; smooth the gain over 0.16 s. Write the gain as a track at 1 kHz (raw 32-bit floats), read it in ffmpeg with
  `-f f32le -ar 1000 -ac 1 -i gain.f32`, resample it to the mix rate and `amultiply` it into the bed; then a
  `sidechaincompress` keyed on the voice (threshold 0.02, ratio 6, attack 15 ms, release 150 ms) catches what still
  pokes up. Why runs, not whole lines: a fast read has many short pauses, and a bed held down through them read as
  holes of −35 to −39 LUFS. A hold per line also passes (the Mona Lisa: 9 dB with 0.08 s ramps).
- **Ambience made of voices** (a crowd's murmur, a room of chatter) masks speech far more than its level says, because
  it fills the same band. It goes on the bed and is held with it, never left beside the voice, and its speech band
  (300 Hz to 3 kHz) is cut by about 10 dB (ffmpeg `equalizer=f=950:t=o:w=3.3:g=-10` measures −10 dB at 1 kHz, −5 dB
  at 300 Hz and 3 kHz, −1 dB at 100 Hz and 8 kHz).
- Why all three: the Mona Lisa's opening murmur and music drowned the narrator (owner, 9 November 2026). By average
  loudness the first line sat 10 dB over the bed and looked fine; the check shows the bed's loudest moment over the
  voice under two lines and every line short. With the murmur cut and moved onto the music, and the bed turned down,
  the averages rose to 12 to 21 dB and six lines were still short, the plumber's steps 5.4 dB under his line. With the
  whole bed held under each line: 12.0 dB at the least, 17.6 median. Gibeon's run-by-run hold: 10.8 least, 18.2 median.
- **Music in sections: each section is 3 s or longer.** ElevenLabs' composition plan refuses a shorter section (HTTP
  422); merge a short beat into its neighbour and mark the change with an effect instead.
- Effects still land on their words: level each effect to a loudness (LUFS of the file alone), not a raw gain, so a
  quiet take and a loud one sit alike. Then two-pass `loudnorm` to about −14 LUFS for the whole mix.

## Building as a team

For anything longer than a few seconds, build each clip with specialist agents that own separate files: places and
track, effects, people and props that act (a train), sound at the same time; then the camera last, because it frames
what the others built; then a critic that scores the clip, from the sheets and from one full-size frame of every shot
(below). Resume the same agents for the next round so they keep
their knowledge of the code. The railroads practice went from 1.2 to 1.8 out of 3 in three rounds this way, where
one lead builder alone stopped at 1.2. Each agent writes a short report with notes for the camera.

## Log every step's time

Vincent, 9 November 2026: "track the time it takes to build a whole story ... keep data". Every step goes into the
project's `docs/production-log.jsonl` the moment it ends, with this skill's own `scripts/production_log.py add`. The
tool is the skill's, not the project's: find it in the plugin cache at
`~/.claude/plugins/cache/vince-tools-marketplace/general-tools/<version>/skills/toon-video/scripts/production_log.py`
(newest version) and run it from there; create the log file if the project has none. Both Gibeon r3 and Mona Lisa
r4's fix agents looked for the tool in the project, did not find it and logged nothing. Log: the story, the stage
(study, script, voice, plan, world, people, camera, build, render, critique, fix, spike, review), the round, who did
it, minutes and tokens. An agent's minutes and tokens are in its finish notice (`duration_ms`, `subagent_tokens`;
a resumed agent reports its running total, so log what this run added). A render's minutes are in its output; make
render tools print them. `production_log.py report <log>` sums each story by stage and averages each stage across
stories; a critique row carries `--score`, and `production_log.py rounds <log>` lists each story's scores with the
hours spent to reach each one, and ends with the count of rounds against the aim. Put both on the review page with
the video. **Count the rounds: the aim is three** critiques from the first cut to the owner's yes. Gibeon took six and
the Mona Lisa seven; the levers below are what would have saved the rest.

## After every critique: fix the making

The critic finds faults; the build is changed so the next video cannot make them. Before the next fix round, sort
each finding by what in the making allowed it, and fix it at the strongest level that fits:

1. **Make it impossible**: the toon-kit refuses it (the camera cannot go under the ground or lose its up).
2. **Make the right way the easy way**: a kit block does it right (shots by subject, props with named states).
3. **A rule with a picture**: a line here with one right and one wrong frame, for judgement calls.
4. **A check**: only behind 1 to 3.

A fix that is true of any video goes into the kit or this skill through the skills repo; one that belongs to the
story stays in the story. Never put a look into the kit (see `toon-world` "The toon-kit"). Every fix round ends, like
the critique, on one full-size frame of every shot, asked whether each place could exist (the check below). Record each finding in
`references/findings.md`: the fault, what allowed it, the change and its level. A kind of finding that comes back
means its fix was too weak: move it up a level.

### Three rounds, not seven: the levers

Vincent asked, 9 November 2026, how the Mona Lisa's seven rounds could have been three. Three habits cost the extra
rounds, and each has its fix:

1. **Check each fix on a short full-size moving render of its stretch, not on small stills.** Render the seconds the
   fix touches (about 2 s either side) at full size, play them, and look at the fault where it was; then run the
   measured checks on that clip (`frame_motion.py`, brightness). A still shows one frame of a move that fails on
   another. Why: in five of the Mona Lisa's six rounds, two to five of the ten fixes landed only partly and came back
   as findings in the next critique: the walker on "strolls" stopped growing after r5's fix (r6), DECEMBER 1913 was
   clean for four frames and then six, still a blink (r6, r7), and the workmen's cut heads were fixed at 30.5 s and
   came back at 31.0 and 31.5 s (r7).
2. **A fix round fixes every finding the critique lists**, the smaller list after the ten included, each with its
   seconds. A finding left for later is a finding the next critique scores again. Why: Gibeon r5 left the faces cut at
   the mouth by rock tops, the loose hand and the tip inside the smoke, and r6's critique listed all three again; the
   Mona Lisa's plumber cut by the frame's edge was left in round 6 and found again in round 7.
3. **The owner sees the still board before the build** (step 4 d), with the planner's notes on words, language, the
   subject's size against its neighbours and how the line's thing is shown. Why: his six Mona Lisa notes came after
   round 6 and each would have been seen on the board.
4. **A fix is compared with the last two cuts at the same seconds before it is committed**, so it cannot undo an
   earlier gain. A fix for one finding often moves something another fix depended on. Why: the Wald bombers' round 4
   scored the same as round 3 (2.43): spreading the falling planes' slots to fix the reveal's ratio shrank every fall
   from 15 to 25% of the width to 5 to 12%, and the first colour push added lilac shade and lime grass. With the
   comparison in round 5, it rose to 2.51.

## Long videos: the series library

A series builds its worlds, cast, props and effects in its first episode and keeps them in one folder every later
clip imports. Later clips are then staging, camera and sound, not modelling. Most fixes move earlier: the meaning
sheet and the looks are approved once, and machines run the checks before the owner sees a clip. (Rough guess, not
measured: about 1.5M tokens for a 15-second clip once the library exists.)

## Checks before the hand-back

Give the numbers with the video. Scripts under `<toon-video>/scripts/` and `<toon-world>/scripts/` run from the
plugin cache ("Voice", above); the others are in the toolkit project, so copy them.

| Check | How | Aim |
|---|---|---|
| Pace | `python3 scripts/pace.py <video>` | within about 10 of the video's profile (25 to 60 big changes a minute); still only where the profile holds |
| Hard cuts | `ffmpeg -i <video> -vf "select='gt(scene,0.3)',showinfo" -f null - 2>&1 \| grep -c pts_time` | under 10 |
| Face close-ups | `ffmpeg -i <video> -vf fps=0.4,tile=7x4 sheet.png`, count by eye | at most 1 in 4 |
| Brightness | `node scripts/brightness.mjs <video>` | opening 120+, nothing too dark on a phone |
| Walking | `node scripts/walk-check.mjs` | nobody through a solid |
| Loudness | two-pass `loudnorm` on the mix | about −14 LUFS |
| Voice over the bed (required) | the mix writes a voice stem and a bed stem; `node <toon-video>/scripts/levels.mjs voice.wav bed.wav timeline.json`, on every mix handed back and again whenever the narrator changes | exit 0: under every spoken line the bed's loudest 400 ms moment at least 10 dB below the line, the last 30 s included |
| Retell | a fresh agent retells it from the sheet | it gets the story right |
| Sharp and popping | `python3 <toon-world>/scripts/measure_sharp.py ours.mp4 [reference.mp4]` | sharpness, fine edges, saturation and brightness within reach of the reference |
| Meaning shown | a critic agent checks each row of the meaning sheet on the frames | every change is seen happening, big and sharp |
| Could this place exist | the critic, and every fix round, opens one full-size frame (1080 wide) of every shot, not the sheets, and asks of each place whether it could exist | doors reach the floor, openings are open, things stand on the ground; nothing floats, passes through a body or fights another surface; no head cut by the frame or a set piece |
| Camera and must-see | toon-kit `audit`, `checkMustSee`, `checkLens` and `checkHeads` over every frame and every layer (`layerRuns`), no render | nothing under the ground or inside a solid; no turn over 4° a frame outside a planned whip and no one-frame position jump; every must-see subject in frame and at least 8% of the height on its word (10% for words to read, clear of the caption band), whole where it says `whole`, under any overlay; nothing within each group's distance of the lens filling over its share (6 m and 15% outdoors), outside declared spans; no named person's head cut by an edge |
| Picture motion | `python3 <toon-world>/scripts/frame_motion.py <video>` on a quarter-size render (`--hold` for planned holds); toon-kit `screenMotion` before a render, as a pointer | no run of seconds under 8 longer than the profile's longest hold where the profile wants pace |
| Empty sky | toon-kit `checkSky` over every frame and layer, with the terrain | no frame over 45% empty sky, none looking up with nothing whole in frame, outside declared looks at the sky |
| Drawings cut by their canvas | toon-kit `edgeTouches` on every card and word canvas right after it draws, logged over a small render of every frame (`toon-world` "The people") | no drawing touches its canvas's border (except a side declared to run off the frame). Why: a thought cloud with a straight top and side and a card ending in a straight line across a robe, two cuts running (Gibeon r4-r5, 18.0 to 22.6 s, 23.1 to 23.3 s); run on every card, it found 16 cut sides in 9 cards, none seen by a critic |
| Cold read | a fresh cheap agent names each new place, prop, effect, material and face from one still (`toon-world/references/cold-read-brief.md`) | nothing misread |
| Score | a critic agent scores each second 0–3 on world, camera, people, light, story by picture, sound | rising every round; 2.5 is the aim |

Why the full-size frame: the sheets the critic reads are about 540 px wide, where a door is about 50 px tall. A hall
door stood on the wall's lower band at waist height, its rail across the doorway, and five critic rounds scoring story
on the sheets missed it; the owner found it (Mona Lisa 21.6 to 22.6 s). Round 6's first critique with full-size frames
found five more places that could not exist: a magnified canvas the wall showed through (7.5 s), light patches like
glass slabs (15.0 to 15.6 s, 38.6 s), half a window view (40.4 s), bars floating at a man's knees (23.7 to 24.0 s) and
planks through workmen's necks (31.5 s). Heads cut by the frame came back the same way (Gibeon r3, Mona Lisa 30 s).

After any change to shared drawing code, render two frames of an earlier video and byte-compare them
with frames from before the change. A new look is a new option, never a changed default.

## Common mistakes

| Mistake | Instead |
|---|---|
| Talking heads on plain ground | A set list per place; at most 1 frame in 4 a face |
| A hard cut between every shot | A join from `references/joins.md`, with its reason |
| Aiming at the place, so a person sits just off-frame | Aim between the people, both within 10° of centre |
| "His anger burned" over a calm face | The anger face, on every angry beat |
| A thrown thing nobody sees | Four beats, twice as thick, a ghost trail, a side-on throw |
| A hider in plain view of the seeker | Cover between them for the whole run, shot over the hider's shoulder |
| An empty seat with someone standing in front of it | Low, across it, nothing on the line |
| Thin-finger hands | Mittens |
| A beardless grown man in a long robe (reads as a woman) | A beard, or a pharaoh's plait |
| A swing that flies through walls between far places, or a rise into empty sky and down again | A horizon approach or a map zoom that shows where the next place is, or a moving dissolve (`references/joins.md`) |
| Trusting a render that ran overnight | Check `df` and the output file's time: a full disk fails every frame write while the old file stays |
| Words on the ground | Words on a screen card |
| A prop that appears only when it matters | Introduce it early |
| A full render to find a framing fault | The contact sheet, every round |
| Animating before the owner has seen the shots | The shot board first, his picks, then animation |
| Posting because every check passed | Drafts; the owner's yes on the finished video |
| Showing a state where the story needs a change (a hot rail, not the gap closing) | The meaning sheet's change, seen happening |
| Copying a reference's pictures without its meaning | The meaning sheet first; the reference only for look and timing |
| A camera skimming close with a wide lens | Further back, a longer lens, a slow glide |
| Judging places on the small sheets only | One full-size frame per shot: could each place exist? |
| Signs in the story's foreign language | Words in the narration's language; the era through shapes and objects |
| A walk toward the lens with `follow` at a fixed size | `track` with `to`: the camera backs more slowly than the walker |
| A flame or glow placed at the crowd point plus an offset | Drawn from the card that carries it |
| A story's own copy of `path` | Import the kit's; `sync-kit.mjs` names the copies |
| Tilting up to make room for a card | Put the card in sky already there, or push in on the person; `checkSky` |
| Judging pace from the camera path | `frame_motion.py` on a cheap render; `screenMotion` only points |
| A crowd rule by distance; a named person cut at the edge | `headCut` drops extras; `checkHeads` reframes the named |
| A one-frame camera jump inside a join | `audit` reports the jump; one camera, eased onto the match |
| Checking fixes on small stills | A short full-size moving render of each fixed stretch |
| A fix round that fixes the top ten only | Every finding, the smaller list too |
| Building before the owner has seen the still board | The board first, with notes on words, language, sizes and how each line's thing is shown |
| Ducking the music with a compressor and trusting the averages | The whole bed held under every run of words; `levels.mjs` on the stems |
| A crowd murmur beside the voice at its own level | On the bed, held with it, its 300 Hz to 3 kHz band cut |
| Picking a narrator by the library's words ("young, excited") | The same lines from every candidate, `pitch.mjs`, ordered with the numbers |
| Cutting a line at the alignment's first letter | At least 0.10 s before it, or plosives go |
