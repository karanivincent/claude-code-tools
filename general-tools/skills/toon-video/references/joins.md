# Joins: the stack of transitions

A menu, not a default (Vincent, 9 November 2026: "what the acceptable options are and what the not-acceptable options
are ... we add that to our stack of transitions, and we use it when necessary, not any time"). For every join in the
plan, say what the join has to do, pick the entry that does it, and write the reason next to it in the shot list. A
camera move whose reason you cannot say out loud is not a join; hold, dissolve or cut instead.

Where an entry was seen: the short names are Ricks Clips Shorts from the channel study, with the second where it
happens when known. Every timed moment is in the study library, `docs/studies/ricks-clips/index.md` in bible-shorts
(154 techniques, 613 moments). New entries come from every studied
video and from our own ideas; add a row with where it was seen or who proposed it.

## What the join has to do

| The join has to | Look first at |
|---|---|
| Go to a far place and show where it is | Horizon approach, map zoom, crane to aerial and dive |
| Go to a far place that does not matter where it is | Moving dissolve, shape-matched dissolve |
| Go in time (later, earlier, a memory) | Freeze into a photo, a page, light wash, shape-matched dissolve across time |
| Go from a person to what they see or think | Into a screen, lens, eye or page; point of view |
| Follow cause to effect | Follow what travels |
| Go inside or outside | Through a door, window or gap |
| Reveal someone already there | Whip pan reveal |
| Jolt at the twist | The one hard cut |
| Anything else inside one place | Follow the subject (`follow`), or hold |

## Rules for every join

- **The change a join's reason names plays in full view**, before the overlap starts or after it ends. A change inside
  a dissolve is not seen. Why: Gibeon r3 ran the tip to the feet under the dissolve at 9.1 s and the shadow's slide at
  53.7 s; with the move before the overlap, both read (frames 268 to 279, and 1612 against 1630).
- **A dissolve between two framings of one place draws the person on both paths** for the dissolve's length, each
  where its own camera expects him (or ends the outgoing path only after the dissolve passes half). Why: one path
  drove him for both layers, so when the incoming layer needed him the outgoing layer, still on top, showed an empty
  landing (Mona Lisa r4, 16.1 to 16.45 s; both layers occupied at 16.05, 16.15 and 16.30 s).

## The stack

| Join | Use it when | Not when | Seen in | How we build it |
|---|---|---|---|---|
| Moving dissolve, 6 to 12 frames, both cameras moving | Two places with nothing to show between them | The journey itself is the point | all 20 | Two canvases overlapping; built |
| Shape-matched dissolve | Two places share a shape (a grid, a ring, a column, a flame) | The shapes sit in different screen places | scratch cards, storm oil, spear and shield, random numbers, ancient jar, grave bell; Gibeon 2D flame to flame (45.0 s) | toon-kit `matchCam`: both canvases get the same `Match` (size, elevation, screen spot, lens), each its own shape and bearing, held from before the overlap until after it, then they move. Aim at where the shape is drawn, not at a typed point: measure the shape on one rendered frame per side and correct once with `screenFix` (a flame on a card's torch sits where the card's hand puts it; Gibeon r4 missed by a quarter of the frame, then (0.27, 0.44) and (0.25, 0.52) became (0.49, 0.46) on both sides); built (Gibeon r3, frames 1344 to 1366: two flames on one screen point) |
| Horizon approach | A far place the story goes to next, and the viewer should see where it is and how far. Compose the shot before it facing the way the journey goes | The two places face opposite ways and there is no time to turn (a turn takes about a frame for every 3°) | Vincent, 9 Nov; Gibeon 2D opening (Jericho's ring from above, Gibeon's towers on the horizon) | toon-kit `approach`; promise the destination from `seenFrom` in the must-see list. The far view has the arrival's colour and silhouette, about a tenth of the frame wide, and the dissolve begins as the start place leaves the frame: a low-detail haze card drawn apart from the place did not read as the town we arrive at (Gibeon r3, 5.4 to 6.2 s; right at frames 160 to 190); built |
| Map zoom | Geography is the point (how near, which way, where the road goes) | The map has nothing new to say | Vincent, 9 Nov; Gibeon 2D map (33 s) | Pull up until the place becomes its icon on a map, travel on the map, dive into the next icon; match the icon's size to the place's size on screen |
| Crane to an aerial and dive into another example | One becomes many | Only one example exists | expulsion room, pink prison, pachinko, spear and shield, random numbers | Terrain with tiny copies; blueprint |
| Into a screen, lens, eye, mirror, icon or page; out in what it shows | A person and what they see or read | Nothing in the scene shows the next place | pink prison, mirror race, second draw, time test, idea zone, expulsion room, teleporter, dashcam, random numbers | Render the next place onto the object; push until it fills the frame; blueprint |
| Through a door, window, porthole or gap | Inside to outside, or room to room | The opening is not in the scene already | grave bell, pink prison, pachinko, expulsion room, railroads, dashcam, storm oil | Two ways. Ride: one path through the opening, switch sets inside it; built in Gibeon (the gate). Turn: a shape-matched dissolve of 6 to 8 frames from the camera on one side to the same camera turned 180° about the opening's upright centre line (toon-kit `mirrorAbout`), so the opening keeps its place and size, with the person on the threshold in both layers; built in the Mona Lisa (22.77 to 23.33 s), where riding through had needed 0.4 s of cream wash to hide the switch. Turn when the opening is symmetric (a door, an arch, a gate) and the person stands in it |
| Follow what travels | A thrown, falling or flowing thing causes the next beat | Nothing travels | railroads, storm oil, cannonballs, second draw, mirror race, ancient jar | `follow` on the object for its last third, match on arrival; built |
| Smoke, flash, light wash or iris as the wipe | The scene makes smoke or light anyway | Used only to hide a lazy join | railroads, cannonballs, cashiers, spear and shield, burglar, mirror race | A frame-filling smoke card or bloom-out; blueprint |
| A scene shrinks into an object or freezes into a photo | The join is also a punchline, or a memory | The object has no meaning in the story | cashiers, burglar, time test | Render the scene into the object; pull out; blueprint |
| A near object crosses the lens and hides the dissolve | The join sits inside an action | Nothing near the lens belongs there | railroads, pachinko | A prop fills about 60% of the frame; dissolve under it |
| Whip pan reveal | Someone is already waiting there (a comic arrival) | Used to travel between places | scratch cards, random numbers, ancient jar, mirror race | 0.3 s pan with blur onto the person |
| The one hard cut | The twist's first word; the loop back to frame 0 | Anywhere else | roller coaster | A cut on the word |
| A wipe made by the world (a wiper, a passing train) | The world has a sweeping thing | Forced | dashcam | A pivoting mask with the blade drawn over it |
| Split screen | One person in two places at once | Two different stories | teleporter | Two cameras into halves |
| Through a break in the world (a hole, a tear, a crack) | Something breaks open and the story goes inside or beyond it | Nothing in the story breaks | cannonballs 2.2 s, spear and shield 37 s, ancient jar 61 s | One path through the opening as it forms; switch places inside it |
| Dive into a machine, out in its cut-away | How a machine works matters next | The inside is not the point | cannonballs 26.6 s | Push into the opening until dark; open on a see-through model of the inside |
| Fly past a head into the next view | From a person to what is in front of them | The person is not facing it | storm oil 59.7 s | Push past the edge of the head, dissolve under it to the view |
| Rewind dissolve | Going back in time to replay | No clock or counter on screen | dashcam 56.2 s | A dissolve while on-screen numbers run backward |
| Scan-bar wipe | One person shown two ways (outside, inside) in the same place | Changing places | idea zone 12.4 s, 18.6 s | A glowing bar sweeps the frame, swapping one drawing for the other |
| Swoop from a far place back home | After a glimpse of somewhere far, back to the main place | The far place is the next stop | ancient jar 59.5 s | `approach` back to the main place's framing |

## Not acceptable

| Join | Why not | Instead |
|---|---|---|
| Rise into empty sky, fall onto the next place | Shows nothing; reads as the camera moving for its own sake (Gibeon 2D, 9 Nov) | Horizon approach, map zoom or a moving dissolve |
| Tilt or rise into empty sky inside a shot (to make room for a card, at the end of a push) | Same: half the frame shows nothing, and the person sinks to the edge (Gibeon r5, 58.1 to 60.4 s) | Card in sky already in frame, or a push on the person; toon-kit `checkSky` finds it on every frame |
| A swing with no subject at either end | The viewer cannot tell why it moved | Follow the subject, or dissolve |
| A camera that arrives before the person it waits for | An empty frame on the word | `follow` the person |
| A flight through walls or under the ground | Breaks the world | `safe` in the kit; a door or window join |
| A turn faster than about 6° a frame outside a whip reveal | Reads as a glitch on a phone | A slower turn, or dissolve |
