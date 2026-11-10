# The critic brief (story videos)

Learned on the jungle holdout (10 November 2026). Fifteen fixes moved its score only 3.26 to 3.32: the fixed seconds
rose (3.09 to 3.29) and the weak seconds halved, but untouched seconds drifted down (3.46 to 3.39, a fresh critic's
noise), and 93% of seconds sat at 3 ("fine, forgettable") with 1% at 4 or more. A list of faults lifts a 2 to a 3; it
never says what makes a second a 4 or a 5. So the critic now also predicts, proposes raises, anchors its scale and
re-scores only what changed.

## Modes

| Mode | When | Input | Scores |
|---|---|---|---|
| **Beat board** | After the build and the audit, before any full render (where most of the reviewing happens) | 2 to 3 full-size stills per shot at its action words, the audit report, the voice timeline, the meaning sheet | Each beat 1 to 5 on world, people, light, story by picture |
| **Full** | Once, after the one full render | Frames every 2.4 s, sheets at 2 a second, the video for pulling frames and measuring audio | Each second 1 to 5 on world, camera, people, light, story by picture, sound |
| **Delta** | After a fix round | Last round's table, the list of changed seconds | Only the changed seconds; the rest keep last round's score |

## The scale, with anchors

1 broken (wrong, unreadable, laughable); 2 weak (reads but flat, frozen or confusing); 3 fine (clear and correct,
forgettable); 4 good (alive, reads on a phone, lands); 5 great (you would stop scrolling for it). Never round up.
Before scoring, open the project's anchor stills (`docs/critic-anchors/`: one or two frames per level from earlier
videos, each with a line on why it got that score) and score against them, so a 3 means the same every round. A
project without anchors starts them from its first scored round.

## What the critic writes

1. The table (per beat or per second) and the averages.
2. **Faults**, worst first: the second, what is wrong, the fix, the owner, and a **prediction**: the second's score now
   and after the fix, per area.
3. **Raises**, separate from faults: for the ten seconds with the most room, what would take each to 4 or 5 (an action,
   a framing, a sound hit, a gag), with the same prediction.
4. **The forecast**: the overall average if every fault and raise is done, and if only the top five are.

## After a fix round

Re-score in delta mode. Compare each prediction with the new score: a fix that missed its prediction by a point or
more is the finding (why did it not land?), and goes in the findings table if its kind comes back. Report the forecast
against the result.
