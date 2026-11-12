# The film template

Start a story here: `node <toon-world>/scripts/new-film.mjs <project> <slug> <CompositionId>`. It copies these files
into `src/stories/<slug>/`, `../sound/story-sound.mjs` to `scripts/<slug>-sound.mjs`, syncs the toon-kit, and prints the
two compositions to register. It also writes the paperwork the gate reads (`stories/<slug>/meaning.md`, `parts.md`,
`checklist.md`, `findings.md`, `src/stories/<slug>/approvals.json`), copies the look stack to `src/look/` when missing, and copies
`levels.mjs`, `measure_sharp.py` and `measure_look.py` into `tools/`. The story brings `full.json`, its places and
segments, and replaces the stand-in cast. Needs TypeScript 5, `@react-three/postprocessing@3.0.4` and
`postprocessing@6.39.5`. Built from the jungle holdout (Epiclings) and Elijah and the widow 2D (November 2026).

| File | What it is |
|---|---|
| `story.ts` | The story's settings: slug, audio, named cast, picture events for the audit |
| `shots.ts` | The segment list on the voice, cards, papers, thought bubbles |
| `place.ts` | The contract each `places/<place>.ts` keeps: build once, shots as `(built, t?) => Shot`, `update(shot, t, cam)`; the blend |
| `places/` | The lazy place list and a stand-in courtyard built to the blend (painted textures, a moving detail layer) |
| `paint.ts` | Painted canvas textures at 2048, mipmapped, 16x anisotropic: plaster, ground, stone, wood, cloth; `lit`, `block` |
| `cast.ts` | Bean-head people as cards lit by `cardshade`, depth-tested, hands kept in the canvas, expression kept while talking |
| `Stage.tsx` | One shot through the look stack; the still board (`Board`); lazy cached place loading; the audit sample |
| `Film.tsx` | The film: one place canvas at a time, swings and reasoned cuts (no whips), overlays, audit config |
| `overlays.tsx` | `Card` (with a label), `Paper` (typed lines), `Thought` (a bubble with a picture), `cuesOf` |
| `detail.ts` | The detail layer: flies, smoke, a hanging cloth, birds, a light shaft with dust (tagged and ticked); sparkles, which do not count |
| `tools/` | `gate.mjs` (critic and render gates: runs every check, and refuses unlogged critic rounds, S5-38), `audit.mjs` (acting and camera audit), `look.mjs` (look checks), `render.mjs`, `stills.mjs`, `round_backdrop.py` (one 360-degree far strip from two pictures), `public.mjs` (bundles with the story's own public folder only; `toolTime` writes `out/<slug>/tool-times.jsonl`) |

## What each default prevents

| Default | What it prevents (the round it cost on the jungle holdout) |
|---|---|
| `W` throws on a word said twice in its line unless told which | A card on the wrong word (the 1972 card on "one by one", 1.8 s early) |
| Consecutive segments of one shot share its clock | Acting restarting at each camera move (the list's tick never landed) |
| A punch in at the middle of every segment over 1.8 s | Holds that read as stills (cut 1: 14% still frames) |
| A place's shots take the film's clock `t` | A board of stills played as a film ("he barely moves") |
| Swing inside a place, a cut with its reason between places, at most 3 | Whip pans (motion blur, banned) and unexplained hard cuts |
| One place canvas at a time, keyed by place, next place loaded early | Every place built on every frame, and a stall at each change of place |
| Background blur behind people in medium shots (11 px) and close-ups (13 px), wides sharp | Characters lost against a busy world, and soft wides |
| Overlays land on their words and are cues for the audit | Dates and orders missing or late ("I don't know what those are") |
| The audit sample skips people behind the lens or wholly off screen | False "head cut" reports with a negative height |
| The audit renders tiny, every 3rd frame, no look stack, before any render | Faults found only after a 15-minute render and a critic's round |
| Picture events and sound cues are checked against each other within 0.1 s | Gunshots heard with no flash, or a flash with no sound |
| Effects sit on their own layer, neither held nor sidechained | Gunfire buried under the narrator ("we should hear gunshots") |
| Music cut into sections at the story's turns from word times | Music that ignores the story's turns |
| ElevenLabs requests cached by their prompt | Paying again for an unchanged rerun |
| Limiter, then loudnorm to -14 LUFS | A mix too quiet, or clipping on the shots |
| The hook card drawn whole at 0.0 s; the opening audited for a big subject, motion from frame 1 and the card | A first frame with no card and nothing moving (Elijah) |
| The film ends 0.5 s after the last word | Dead air on a looping Short (Elijah's 1.4 s silent tail) |
| Every check fails the gate unless `STORY.acknowledged` gives a reason | An audit that printed and passed |
