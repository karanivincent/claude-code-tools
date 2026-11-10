# The film template

Start a story here: `node <toon-world>/scripts/new-film.mjs <project> <slug> <CompositionId>`. It copies these files
into `src/stories/<slug>/`, `../sound/story-sound.mjs` to `scripts/<slug>-sound.mjs`, syncs the toon-kit, and prints the
two compositions to register. The story brings its own `cast.ts` (exports `Person`, `Cast`, `SCALE`), `toon.ts`,
`full.json`, places and segments. Needs the look stack in `src/look/`, TypeScript 5, `@react-three/postprocessing@3.0.4`
and `postprocessing@6.39.5`. Built from the jungle holdout (Epiclings, November 2026).

| File | What it is |
|---|---|
| `story.ts` | The story's settings: slug, audio, named cast, picture events for the audit |
| `shots.ts` | The segment list on the voice, cards, papers, thought bubbles |
| `place.ts` | The contract each `places/<place>.ts` keeps: build once, shots as `(built, t?) => Shot`, `update(shot, t, cam)` |
| `places/` | The lazy place list and a stand-in place |
| `Stage.tsx` | One shot through the look stack; the still board (`Board`); lazy cached place loading; the audit sample |
| `Film.tsx` | The film: one place canvas at a time, swings, whips, overlays, audit config |
| `overlays.tsx` | `Card` (with a label), `Paper` (typed lines), `Thought` (a bubble with a picture), `cuesOf` |
| `detail.ts` | Trunks, vines, litter, mushrooms, butterflies, light shafts, motes, sparkles |
| `tools/` | `render.mjs` (film and stills by time), `stills.mjs` (board sheet), `audit.mjs` (the acting audit) |

## What each default prevents

| Default | What it prevents (the round it cost on the jungle holdout) |
|---|---|
| `W` throws on a word said twice in its line unless told which | A card on the wrong word (the 1972 card on "one by one", 1.8 s early) |
| Consecutive segments of one shot share its clock | Acting restarting at each camera move (the list's tick never landed) |
| A punch in at the middle of every segment over 1.8 s | Holds that read as stills (cut 1: 14% still frames) |
| A place's shots take the film's clock `t` | A board of stills played as a film ("he barely moves") |
| Swing inside a place, whip between places | Hard cuts everywhere, and swings flying through props when a cut was meant |
| One place canvas at a time, keyed by place, next place loaded early | Every place built on every frame, and a stall at each change of place |
| Background blur at least 11 px whenever people are in shot | Characters lost against a busy world |
| Overlays land on their words and are cues for the audit | Dates and orders missing or late ("I don't know what those are") |
| The audit sample skips people behind the lens or wholly off screen | False "head cut" reports with a negative height |
| The audit renders tiny, every 3rd frame, no look stack, before any render | Faults found only after a 15-minute render and a critic's round |
| Picture events and sound cues are checked against each other within 0.1 s | Gunshots heard with no flash, or a flash with no sound |
| The sound's action layer sits on top of the mix, not ducked | Gunfire buried under the narrator ("we should hear gunshots") |
| Music cut into sections at the story's turns from word times | Music that ignores the story's turns |
| ElevenLabs requests cached by their prompt | Paying again for an unchanged rerun |
| Limiter, then loudnorm to -14 LUFS | A mix too quiet, or clipping on the shots |
