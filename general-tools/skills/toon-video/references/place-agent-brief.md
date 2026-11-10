# Template brief: a place agent that animates its shots

Copy into the scratchpad, fill the brackets, and give it to each place agent with its own file list and shot table.
It worked on the jungle holdout: four agents, two or three places each, about 0.25M tokens each per round.

---

# Brief: animate your places for <story>

Repo: `<repo path>` (branch `<branch>`). Run in the foreground only; never start background work. Do not commit. Do
not edit files outside your list.

## What this is

<One paragraph: the film, the look, the owner's last verdict in his words.> Your job: make your shots alive. People
act and move, things fly, fall, burn, splash and sparkle, every second.

## How the film drives a shot

- `shots.ts` lists every shot with its stretch of the film (table below). The film calls your place's shot function
  as `shots[name](built, t)`: `t` starts at the shot's own `t:` and runs up by the seconds passed in the shot. The board
  calls it without `t` (use `t ?? <the shot's t>`). Compute people by time inside it; keep the returned `view` as the
  board framing (the film eases the camera from it).
- `update(shot, t, cam)` runs every frame with the same `t`: animate the world there.
- Land each action inside its shot's stretch, early enough to read, on the word that names it (word times are in the
  story's `full.json`).
- If you export action times (shots fired, falls), say so in the report: the sound is synced to them.

### People can do

<The card options: modes (walk, fall), phase, hand targets in design space, expressions, look, tilt, lean, roll,
lift, vis; a salute's hand point; how a held 3D prop gets drawn fists.>

- An expression or a gesture on every beat; nobody frozen for more than about a second.
- Props in hands, never floating or resting on another prop. A key gesture held about 1 s.
- People who leave fall or walk out in clear view; nobody pops out of existence.

### Detail helpers (read-only)

<The detail layer: trunk, vine, litter, mushrooms, butterfly, shaft, motes, sparkles(... ).tick(t, cam).> Glints on
water, metal and wet leaves; embers over fire; dust in light.

## The owner's likes (keep)

<From the lessons file: background blurred behind people, calm area behind faces, rich colour, events shown
happening, lots of small details.> Keep the shot names.

## Checking your work

- The typecheck passes.
- Take a render slot; render a short moving stretch of your shots at half size; tile it at 6 frames a second and look
  at it; look at 2-3 full-size stills at your action beats. Free the slot.

## Report

Per shot: what now moves, and anything still off. Under 400 words.
