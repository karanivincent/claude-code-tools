# The film from the board: every shot alive from the first build

Learned on the jungle holdout (Epiclings story 2, 10 November 2026; code in `epiclings/src/stories/jungle-holdout/`:
`shots.ts`, `Film.tsx`, `board/Board.tsx`, `places/*.ts`). Its first cut played the approved board stills in time with
the voice with camera pushes, and the owner's verdict was "he barely moves ... it's just his eyes and his mouth"
(still frames 14%, characters 3 of 10). Four more cuts went on adding the motion that should have been there in the
first build. Build it in from the start.

## The parts

- **One place file per place** (`places/<place>.ts`) builds the world once and names its shots. A shot is a
  function of the built place and **the film's clock**: `shots[name](built, t) => { view, people, focus, blur }`.
  The board calls it without `t` (it falls back to the shot's own `t`), so the same file serves the still board
  and the film. People are computed by time inside it (walk, gesture, hold, throw, fall); the world animates in the
  place's `update(shot, t, cam)` (water, planes, paper, fire, smoke, birds, sparkles).
- **`shots.ts`**: every shot with its stretch of the voice (`a`, `b` from word times), where its camera goes and
  how it joins the last:
  - `to`: another shot's framing, or a push `{ push, side, rise, fov, aim }` (`aim` moves the look point and the
    camera together, so a push can re-centre lower, on a held page). `from`: where it starts, the same way.
  - `into`: `swing` (same place, the camera flies from the last framing), `whip` (between places, motion blur), or
    `cut` (when a swing would pass through a prop or a person, or for a shock).
  - `punch`: shots over 1.8 s get a punch in at their middle; turn it off where the subject would leave the frame.
  - `clock`: when one shot is split into several camera moves, give the later ones the first one's start, or the
    acting restarts at every split (the jungle holdout's list lost its tick this way).
  - `lead`: start a shot's clock early when its start was moved earlier.
- **`Film.tsx`**: one place on screen at a time, its canvas keyed by the place; the next place loads while this one
  plays. Overlays drawn in HTML over the picture: year cards (with an optional small label: "THE WAR ENDED / 1945"),
  a typed paper for orders or a list that types on each line on its word, thought bubbles with a picture for any
  word the viewer may not picture (a panda, a yeti).
- **Times shared with the sound**: a place exports its action times (shots fired, hits, falls) and the sound script
  reads the same numbers, so a change of acting re-syncs the gunshots (`HOOK_FIRE`, `HIS_SHOTS`-style exports).

## What the first build must already have (each cost a round on the jungle holdout)

| Rule | What happened without it |
|---|---|
| An action or an expression change on every beat of the words; nobody still for more than about 1 s | Cut 1: one frown from 0 to 57 s |
| People act with their bodies: walk, crouch, aim, point, throw, shake the head, fold the arms, salute | "He's just still in most of the images" |
| What the line says happens on screen: firing on "still fighting", the tent going up on "pitches a tent", the paper falling on "flutters down" | The hook showed a man standing on a rock |
| Props are held by hands (a drawn fist over a 3D prop, or the prop at the card's hand point); nothing rides on a rifle or floats | The leaflet and the photo sat on the rifle's end like signposts |
| A gesture the story turns on is held about 1 s and framed close enough to read: a salute, a handover, a tick on a list | The salute and the sword "missing" in cut 4 |
| People who leave fall or walk out, in clear view, never vanish | Three men popped out of existence |
| Gunfire is seen (flash, recoil, smoke, dust where it hits) and heard on top of the mix | "If he's still fighting we should hear gunshots" |
| Dates and orders on screen as cards; unfamiliar words as thought bubbles | "A panda and a yeti, but I don't know what those are" |
| A place sized to the story (an island worth a 29-year hunt), its moving parts moving (boat, wake, waves) | "That island is too small" |
| Sparkle and small moving things in every shot: glints, embers, dust, insects, birds | "We need a lot of sparkling here and there" |
| Fire that reads as fire: tall flickering tongues, smoke columns, embers, flickering glow on the ground | "The village doesn't look like it's burning" |

## Checking it

Half-size moving renders of each stretch (not stills) while building; then the full render, `pace.py` (still
frames under 1%), a 3-frames-a-second strip, and full-size stills at the action beats. The owner reviews; then the
critic scores 1 to 5 per second.
