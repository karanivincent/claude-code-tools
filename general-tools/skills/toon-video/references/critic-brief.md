# The critic brief

How to brief a critic agent at stage 5, and what it returns. The lead briefs a fresh critic for each round, hands it
the files below, and saves its reply: a subagent cannot write files, so the critic returns its report as text and the
lead writes it to the story's critic file (S5-9).

## Contents

- [The lesson behind this brief](#the-lesson-behind-this-brief)
- [Modes](#modes)
- [The scale and the anchors](#the-scale-and-the-anchors)
- [Pre-render mode: what the critic returns](#pre-render-mode-what-the-critic-returns)
- [Rounds 2 and 3: re-score what changed](#rounds-2-and-3-re-score-what-changed)
- [Render mode: what the critic returns](#render-mode-what-the-critic-returns)
- [The stop rule](#the-stop-rule)
- [A brief to copy](#a-brief-to-copy)

## The lesson behind this brief

On Elijah and the widow, three rounds of fixing the critic's fault list moved the beat board from 2.78 to just 3.06
(S5-2). A fault list lifts a 2 to a 3; it does not say what makes a scene a 4 or a 5. So the critic's main output is
each scene's path to 5, each item with its predicted gain, and the faults come second (S5-3).

## Modes

| Mode | When | Input | Scores |
|---|---|---|---|
| Pre-render | Three times a cycle, before the render (S5-1) | The beat board: 2 to 3 full-size stills per shot at its action words (S5-7); the gate's report; the meaning sheet; the voice timeline; the owner's latest notes | Each scene 1 to 5 in world, people, light and story |
| Render | Once a cycle, after the owner's notes on the render (S5-31) | The render; frames every 2.4 s; sheets at 2 a second; the stems and timeline | Motion and sound alone: pops, swings, sync, levels, holds |

The pre-render critic also opens one full-size frame (1080 wide) of each shot and asks of each place whether it could
exist (S5-8).

## The scale and the anchors

1 broken (wrong, unreadable, laughable); 2 weak (reads but flat, frozen or confusing); 3 fine (clear and correct,
forgettable); 4 good (alive, reads on a phone, lands); 5 great (you would stop scrolling for it). Do not round up
(S5-5). Before scoring, open the project's anchor stills in `docs/critic-anchors/` (one or two frames per level, each
with a line on why) and score against them, so a 3 means the same each round (S5-6). A project without anchors
starts them from its first scored round.

## Pre-render mode: what the critic returns

In this order:

1. **Scores.** A table, one row per scene: world, people, light, story, and the scene's mean. Then the film's mean.
2. **Path to 5, per scene** (S5-2). For each scene, split by area, the changes that would take it to 5. Each item
   names the area, the shot and seconds, the change (an action, a framing, a light, a prop, a sound hit, a gag), who
   owns it (place, people, camera, sound), and its predicted gain to the scene's score. For example:

   ```
   Scene 3 (widow at the jar, 12.4-17.0 s): now 2.9
   - people +0.4: she tips the jar toward the lens on "a handful", her other mitten cupped under it; owner: people
   - world  +0.3: flour dust in the light shaft from the doorway, moving; owner: place
   - light  +0.2: a warm key from the doorway on her face, the room behind in violet shade; owner: place
   - story  +0.3: the empty jar seen from above before she reaches in; owner: camera
   forecast after these: 4.1
   ```
3. **Forecast** (S5-4): the film's mean if each path item is done, and if the top five by gain are.
4. **Faults**, after the path (S5-3): worst first, each with its seconds, what is wrong, the fix, the owner, the rule id
   it breaks if one fits, and its predicted gain.
5. **Judgement rules.** For each register rule whose proof is `check critic: <area>`, a line saying it is met, or
   where it is not.

## Rounds 2 and 3: re-score what changed

The lead passes the last round's report and the list of changed shots. The critic re-scores the changed scenes and
keeps the rest (S5-10), then compares each prediction with the result. A fix that missed its prediction by a point or
more is a finding: say why it did not land (S5-11). Then a fresh path to 5 for each scene still under 5, and a new
forecast.

## Render mode: what the critic returns

Once a cycle, after the owner's notes (S5-31), on what stills cannot show:

1. **Motion**: pops, one-frame snaps, swings and joins that jolt, holds longer than the profile's, people who freeze,
   each with its seconds.
2. **Sound**: sync of each picture event and its sound (S3-144), the voice over the bed, the music's audibility, the
   tail.
3. **Score** per scene, 1 to 5, in the four areas (world, people, light, story) as they play on the moving film,
   plus motion and sound. The film's mean of all six is the cycle's score: the one the stop rule reads (S5-32).
4. **Path to 5** per scene, items with predicted gains, as in pre-render mode.

The lead saves it to `out/<slug>/critic-<n>-render.md`.

## The stop rule

Stop when the render critic's film score is 4.2 or more, or when it rose under +0.1 over the last cycle's (S5-32). The critic's
forecast is a guide; the logged scores decide (`production_log.py rounds`). After stopping, the audience's retention
dips calibrate this critic (S6-12, S6-13).

## A brief to copy

```
You are the critic for <story>, cycle <n>, round <round>, <mode> mode. You read; you do not edit files.
Read: <toon-video>/references/critic-brief.md, the anchors in docs/critic-anchors/,
the beat board in out/<slug>/beat-<n>-<round>/, the gate report out/<slug>/gate.txt, the meaning sheet
stories/<slug>/meaning.md, the timeline src/stories/<slug>/full.json, the owner's notes out/<slug>/notes-*.md.
<Rounds 2 and 3: the last report out/<slug>/critic-<n>-<round-1>.md and the changed shots: ...>
Return your report as text in the order the brief gives. Do not write a file; the lead saves it.
```
