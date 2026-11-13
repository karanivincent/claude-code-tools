# Camera, shots and joins

How to write the shots and the joins between them at stage 3. Rule ids point into `rules.md`; the reasons behind them
are in `why.md`.

## Contents

- [The spectacle brief](#the-spectacle-brief)
- [Shots in the film template](#shots-in-the-film-template)
- [Shots by subject](#shots-by-subject)
- [Kit camera blocks](#kit-camera-blocks)
- [Framing](#framing)
- [The camera checks](#the-camera-checks)
- [Joins: what the join has to do](#joins-what-the-join-has-to-do)
- [Rules for each join](#rules-for-each-join)
- [The joins stack](#the-joins-stack)
- [Not acceptable](#not-acceptable)
- [Camera gotchas](#camera-gotchas)

## The spectacle brief

Vincent, after the B-17 proof test: "choose the shot wisely, make it bigger, put other things happening behind".
Choose each shot for size and drama, as a big channel would, not for coverage.

- **The hero big.** On its key moments the hero fills a third of the frame height or more (S5-88). A wide only places
  the scene.
- **The angle for a reason.** Each shot in `shots.ts` names why its angle was chosen (`why: 'low, so the plane climbs
  over the stand'`) (S5-91). No reason means restage it.
- **Something behind.** Each shot names what moves behind the hero (`behind: 'second plane taxiing, crew running'`):
  other planes, vehicles, people working, flags, birds, dust, smoke, water, as the story fits (S3-169, S5-91).
- **The hero moment reads as big.** Stage it high, wide or close enough: a plane climbs visibly high above the
  ground and the people; a fall is seen whole, from the tip to the impact (S5-92).
- **Light makes colour.** Shoot toward the low sun for rims, or across it for long shadows; a flat front light from
  behind the camera gives plain colour (S3-166, S5-58).
- **Few candidates, one pick.** For each hero beat render 2 to 3 candidate stills, forced apart: a different camera
  side, height and shot size, not the same shot nudged. Put them on the review page at stage `shots`; Vincent picks
  one by note, and he is not asked to rank many (S5-93).

## Shots in the film template

`new-film.mjs` copies the template; its `README.md` in `<toon-world>/templates/film/` lists what each file does.
The parts that matter for the camera:

- **One place file per place** (`places/<place>.ts`) builds the world once and names its shots. A shot is a function
  of the built place and the film's clock: `shots[name](built, t) => { view, people, focus, blur }` (S3-82). The
  board calls it without `t` and it falls back to the shot's own `t`, so one file serves the still board, the beat
  board and the film. The world animates in `update(shot, t, cam)`.
- **`shots.ts`** lists the segments on the voice: `a` and `b` from word times with `W(line, word, nth)` (S3-81),
  where the camera goes, and how it joins the last:
  - `to` and `from`: another shot's framing, or a push `{ push, side, rise, fov, aim }`.
  - `into`: `swing` inside one place; between places a join from the stack below, the template's default being a
    dissolve (S3-122); `whip` for a reveal inside one place (S3-123); `cut` for a change of place or time, counted
    against S3-121.
  - `punch`: a punch in at the middle of segments over 1.8 s (S3-118); off where the subject would leave the frame.
  - `clock`: consecutive segments of one shot share its clock (S3-117); `clock: 'own'` restarts it; a number shares
    a clock across shots.
  - `lead`: start a shot's clock early when its start moved earlier.
- **Times shared with the sound**: a place exports its action times and the sound script reads them (S3-145).

## Shots by subject

Write each shot from the meaning sheet's must-see entries (S3-83), not typed positions:

- `shot(word, { subjects, size, az, el })` for a held framing.
- `follow(...)` for someone moving; the camera waits on the person, not ahead of them (S3-133).
- `approach` for a journey to a far place, the destination in sight (S3-129).
- Raw keys only for a whip reveal and joins made by the world (S3-84).

A must-see entry (`MustSee`, S3-83) gives the word, the subjects by name and the size. It starts on its word's first frame,
and a move bringing the subject in lands on or before the word (S3-85). A place the meaning names is a subject too
(S3-86). Options:

| Option | Use it for | Rule |
|---|---|---|
| `size` | at least 8% of the frame height on the word | S3-87 |
| `whole: true` | a person or head that must not be cut by an edge | S3-88 |
| `under` | the bottom edge of an overlay (a card, a title) the subject stays below | S3-88 |
| `words: true` | words to read: 10% of the height, the lettering as the subject, clear of the caption band | S3-89 |

## Kit camera blocks

All from `src/toon-kit/camera` (synced by `sync-kit.mjs`); a story keeps no copy of `path`, `K` or `curve` (S3-90).

| Block | What it does |
|---|---|
| `shot`, `follow` | Cameras worked out from the must-see entries (S3-83) |
| `approach` | A journey to a far place that keeps it in sight; `seenFrom` says when it comes into view |
| `matchCam` | Holds a shape at one screen spot and size from any bearing, for a shape-matched dissolve (S3-128) |
| `matchOf` | Reads the `Match` and bearing off a camera already on screen, so the other side copies it |
| `screenFix` | Aims `matchCam` at where a shape is drawn, measured on one rendered frame per side |
| `mirrorAbout` | Turns a camera 180 degrees about an opening, for the join through a door |
| `track` with `to` | Backs the camera along a line at an even speed, slower than a walker; refuses a walk that turns back (S3-91, S3-92) |
| `cardReach` | Aims a card's hand on the screen (S3-138) |
| `path` | Blends direction and look distance between keys; keeps a near, still subject in its spot |
| `headCut`, `checkHeads` | Says when an edge cuts a head; extras leave the frame, named people are reframed (S3-95) |
| `states`, `dial` | Props whose state matters, checked on their words (S3-71) |

## Framing

The shots stage sets every scene's shots before any acting and locks them (S5-73): a beat with a face or an action
holds the hero at a third of the frame height or more, and a wide only places the scene, 1.5 s at most (S5-88). Every
shot looks into the place's far picture (S5-72). When an earlier build of the beat exists, its shot sizes and camera
side are copied (S5-76). `tools/shots-check.mjs` measures all of it. The cliff film's jump, framed "side-on, tilt
down" from the plan alone, came out with faces at 1/20 of the frame and lost to the spike that held Josh at a third.

- Aim at the people, not the place: a 9:16 frame at a 44-degree field of view is about 26 degrees across. Two people
  stay within about 10 degrees of the centre line; far apart and side-on, shoot a diagonal from above (S3-93, S3-94).
- Stagger two people in depth rather than side by side (S3-61).
- Cameras on uneven ground give heights above the ground under each point (S3-28).
- Medium shots by default: the person about half the frame high, the prop beside them, the room above. A face
  close-up on an emotional turn, about 3 frames in 20 (S3-105). Acting framed with the person at least 25% of the
  frame high (S3-106).
- One clear thing per second, from the meaning sheet (S3-103). At least three kinds of view: from above, a map or
  cut-away, ground level (S3-104).
- Smooth, not busy: big near surfaces do not sweep across the frame. Sit back, use a longer lens, glide slowly, and
  let the thing that changes be the motion the eye follows (S3-102).
- The camera shakes on hits alone (S3-107).
- A ratio the story states (41 of 400) is held by a wide framing for that beat (S3-108).
- A count from high when the things fit in about 50 m; otherwise they arrive one by one, each on a beat. One way
  that fits a portrait frame: line arrivals up receding toward the lens, each a step nearer and to alternate sides
  (S3-109).
- An empty place (a seat, a bed) is shot low and across it, nothing on the line (S3-110).
- Hiding: cover between hider and seeker for the whole run, shot over the hider's shoulder (S3-111).
- A name is spoken while its person is on screen (S3-112).

## The camera checks

`audit.mjs` runs these over each frame and each layer of a dissolve (through `layerRuns`); in the scene loop they are facts for the
reviewers, not a gate (S5-47). Build the blockers from the same list the scene draws its rocks and bushes from; people who are not
the subject are blockers too (S3-97).

| Check | Fails on | Rule |
|---|---|---|
| `safe` | a camera under the ground, inside a solid, or with no usable up | S3-28, S3-100 |
| `audit` | a turn over 4 degrees a frame outside a declared whip; a one-frame position jump | S3-101 |
| `checkMustSee` | a must-see subject out of frame, too small, hidden, cut or under an overlay on its word | S3-85..S3-89 |
| `checkLens` | anything near the lens over its group's share; indoors, groups and framed spans carry reasons | S3-96 |
| `checkHeads` | a named person's head cut by any edge | S3-95 |
| `checkSky` | over 45% empty sky in the centre column, or over 12 degrees up with nothing whole; planned looks at the sky are declared | S3-98, S3-99, S3-124 |
| `screenMotion` | points at camera-still stretches before a render; it clears none (S5-47) | S5-47 |

Indoors, give `checkLens` groups (wall pictures and furniture at 6 m and 30%, floor props at 3 m and 15% worked), and
declare each span framed on purpose with its reason (`framed`).

## Joins: what the join has to do

The joins stack is a menu, not a default. For each join, say what it has to do, pick the entry that does it, and
write the reason in the shot list (S3-120). A move whose reason you cannot say out loud is not a join: hold, dissolve,
or (for a change of place or time) cut.

| The join has to | Look first at |
|---|---|
| Go to a far place and show where it is | Horizon approach, map zoom, crane to aerial and dive |
| Go to a far place whose position does not matter | Moving dissolve, shape-matched dissolve |
| Go in time (later, earlier, a memory) | Freeze into a photo, a page, light wash, shape-matched dissolve across time |
| Go from a person to what they see or think | Into a screen, lens, eye or page; point of view |
| Follow cause to effect | Follow what travels |
| Go inside or outside | Through a door, window or gap |
| Reveal someone already there, inside one place | Whip pan reveal (S3-123) |
| Change place or time with a jolt | A hard cut: at most 3 plus the loop, each with its reason (S3-121) |
| Anything else inside one place | Follow the subject, or hold |

## Rules for each join

- The template's default between places is a dissolve from the stack, not a whip (S3-122).
- The change a join's reason names plays in full view, before or after the overlap (S3-126).
- A dissolve between two framings of one place draws the person on both paths for its length (S3-127).
- A shape-matched dissolve holds both cameras on the same `Match` from before the overlap until after it, eases onto
  the match, and aims at where the shape is drawn (`screenFix`, `matchOf`) (S3-128).
- A horizon approach's far view has the arrival's colour and silhouette, about a tenth of the frame wide, and the
  dissolve begins as the start place leaves the frame (S3-130).
- A far flight eats about 0.8 s and dips to white at its middle; start it a word later after a line that matters
  (S3-131). Show a hit with speed lines, not an inverted frame (S3-132).
- A swing rises no higher than its subject needs (S3-125), and no join or shot rises or tilts into empty sky
  (S3-124).

## The joins stack

Short names are studied Shorts (the project's study library holds the timed moments). Add a row for each new join,
with where it was seen or who proposed it.

| Join | Use it when | Not when | Seen in | How we build it |
|---|---|---|---|---|
| Moving dissolve, 6 to 12 frames, both cameras moving | Two places with nothing to show between them | The journey itself is the point | all 20 | Two canvases overlapping; built |
| Shape-matched dissolve | Two places share a shape (a grid, a ring, a column, a flame) | The shapes sit in different screen places | scratch cards, storm oil, spear and shield, random numbers, ancient jar, grave bell; Gibeon 2D flame to flame | `matchCam` on both canvases with the same `Match`, each its own shape and bearing; `screenFix` from one rendered frame per side; `matchOf` when one side keeps a framing already on screen; ease onto the match before the overlap; built |
| Horizon approach | The next place is far and the viewer should see where and how far; compose the shot before facing the journey's way | The places face opposite ways and there is no time to turn (about a frame per 3 degrees) | Gibeon 2D opening | `approach`; promise the destination from `seenFrom`; built |
| Map zoom | Geography is the point | The map has nothing new to say | Gibeon 2D map | Pull up until the place is its icon, travel on the map, dive into the next icon at matching size |
| Crane to an aerial and dive into another example | One becomes many | There is one example | expulsion room, pink prison, pachinko, spear and shield, random numbers | Terrain with tiny copies; blueprint |
| Into a screen, lens, eye, mirror, icon or page; out in what it shows | A person and what they see or read | Nothing in the scene shows the next place | pink prison, mirror race, second draw, time test, idea zone, expulsion room, teleporter, dashcam, random numbers | Render the next place onto the object; push until it fills the frame; blueprint |
| Through a door, window, porthole or gap | Inside to outside, or room to room | The opening is not in the scene already | grave bell, pink prison, pachinko, expulsion room, railroads, dashcam, storm oil | Ride: one path through the opening, switch sets inside it. Turn: a 6 to 8 frame shape-matched dissolve to the camera turned about the opening (`mirrorAbout`), the person on the threshold in both layers, for a symmetric opening; both built |
| Follow what travels | A thrown, falling or flowing thing causes the next beat | Nothing travels | railroads, storm oil, cannonballs, second draw, mirror race, ancient jar | `follow` on the object for its last third, match on arrival; built |
| Smoke, flash, light wash or iris as the wipe | The scene makes smoke or light anyway | Used to hide a lazy join | railroads, cannonballs, cashiers, spear and shield, burglar, mirror race | A frame-filling smoke card or bloom-out; blueprint |
| A scene shrinks into an object or freezes into a photo | The join is also a punchline, or a memory | The object has no meaning in the story | cashiers, burglar, time test | Render the scene into the object; pull out; blueprint |
| A near object crosses the lens and hides the dissolve | The join sits inside an action | Nothing near the lens belongs there | railroads, pachinko | A prop fills about 60% of the frame; dissolve under it |
| Whip pan reveal | Someone is already waiting in the same place (a comic arrival) | Travel between places (S3-123) | scratch cards, random numbers, ancient jar, mirror race | 0.3 s pan onto the person, speed lines, no motion blur (S3-38) |
| Hard cut | A change of place or time a join cannot carry, or the loop to frame 0; at most 3 plus the loop (S3-121) | Inside one place | roller coaster | A cut on the word, its reason in the shot list |
| A wipe made by the world (a wiper, a passing train) | The world has a sweeping thing | Forced | dashcam | A pivoting mask with the blade drawn over it |
| Split screen | One person in two places at once | Two different stories | teleporter | Two cameras into halves |
| Through a break in the world (a hole, a tear, a crack) | Something breaks open and the story goes inside | Nothing in the story breaks | cannonballs, spear and shield, ancient jar | One path through the opening as it forms; switch places inside it |
| Dive into a machine, out in its cut-away | How a machine works matters next | The inside is not the point | cannonballs | Push into the opening until dark; open on a see-through model |
| Fly past a head into the next view | From a person to what is in front of them | The person is not facing it | storm oil | Push past the edge of the head, dissolve under it |
| Rewind dissolve | Going back in time to replay | No clock or counter on screen | dashcam | A dissolve while on-screen numbers run backward |
| Scan-bar wipe | One person shown two ways in the same place | Changing places | idea zone | A glowing bar sweeps the frame, swapping one drawing for the other |
| Swoop from a far place back home | After a glimpse of somewhere far, back to the main place | The far place is the next stop | ancient jar | `approach` back to the main place's framing |

## Not acceptable

| Join | Why not | Instead |
|---|---|---|
| Rise into empty sky, fall onto the next place (S3-124) | Shows nothing; the camera moves for its own sake | Horizon approach, map zoom or a moving dissolve |
| Tilt or rise into empty sky inside a shot, to make room for a card (S3-124) | Half the frame shows nothing and the person sinks to the edge | The card in sky already in frame, or a push on the person; `checkSky` |
| A whip to travel between places (S3-122, S3-123) | Travel with no reason reads as a glitch | A dissolve from the stack, or a hard cut within the count |
| A swing with no subject at either end (S3-120) | The viewer cannot tell why it moved | Follow the subject, or dissolve |
| A camera that arrives before its person (S3-133) | An empty frame on the word | `follow` the person |
| A flight through walls or under the ground (S3-100) | Breaks the world | `safe`; a door or window join |
| A turn faster than about 6 degrees a frame outside a whip reveal (S3-101) | A glitch on a phone | A slower turn, or dissolve |

## Camera gotchas

- Word lookups match the voice timeline's words, apostrophes included (`david's`, not `david`); a word said twice in
  its line needs its occurrence number (S3-81).
- A camera aimed at a set from its middle often leaves a person 2 to 3 degrees outside a portrait frame: sheet the
  first and last frame of a shot where people move (`--at 0.1`, `--at 0.9`) (S3-119).
- A walk toward or away from the lens uses `track` with `to`; `follow` at a fixed size keeps the walker one size
  against a doorway and he reads as frozen (S3-91).
