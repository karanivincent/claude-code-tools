# Findings: what the critic found, and what changed in the making

One row per kind of fault, not per video. Level: 1 made impossible (kit), 2 the right way made easy (kit block),
3 a rule with a picture (skill), 4 a check. When a kind comes back, its fix was too weak: move it up a level. Rules in
`toon-video` SKILL.md, "After every critique: fix the making".

| Fault | Seen in | What allowed it | Change | Level | Status |
|---|---|---|---|---|---|
| The thing the line names is out of frame on its word (no army on "marched all night", no axe on "cutting wood", nobody opens the door) | Gibeon r1-r2, Mona Lisa r1-r3, train v2 | Shots typed as positions; nothing names the subject | Shots by subject: `shot`, `follow`; must-see list in code | 2 | Kit 1.50.0; proven on Gibeon's night march |
| Camera under the ground or inside a wall | Gibeon r1 (4 s, 41 s) | Key paths overshoot between far keys | `safe` in the kit | 1 | Kit 1.50.0 |
| Picture flips looking straight down (map names upside down) | Gibeon r1 (34 s) | No up vector near vertical | `upFor` in the kit | 1 | Kit 1.50.0 |
| A swing too fast to read (180° in a quarter second) | Mona Lisa r3 (16 s), Gibeon r1 | No speed limit on turns | `audit` turn limit; whips must be declared | 4 | Kit 1.50.0; needs a level 1 or 2 fix (a fast turn becomes a dissolve) |
| The camera arrives before the person | Mona Lisa r2 (13 s), Gibeon r2 (44 s) | The camera is not tied to the person's path | `follow` | 2 | Kit 1.50.0 |
| Something blocks the subject (a rock in front of the column) | Gibeon night march, 9 Nov | The must-see check has no line of sight | Blockers in `checkMustSee`, built from the scene's own scatter list | 4 | Kit 1.51.0; proven on Gibeon (found the rock at 45.5 s) |
| A prop shows the wrong state (the scale needle backwards) | Train v2 | A state typed as an angle in two places | Props with named states; a dial whose needle and marks share one angle; `checkStates` | 2 | Kit 1.51.0; tested on the needle bug, not yet used in a video |
| A thing reads as something else (hail as fire, rocks as snow, fear as cheering) | Gibeon r1-r2, Mona Lisa r2 | Effects, materials and faces judged only after the render | A cold read of every new face, effect and material before the shots | 3 | Not in the skill yet |
| Look measured on stills, lost in the encode (sharpness 897 on stills, 796 in the video) | Gibeon r2 | Measuring JPEG stills | Measure on a short real encode | 3 | Not in the skill yet |
| Videos look alike | Mona Lisa and train heist | People code copied between stories | Share techniques, never looks (`toon-world` "The toon-kit") | 3 | Skill 1.50.0 |
| The camera moves for no reason; far places joined by rising into empty sky and falling onto the next | Gibeon 2D (Vincent, 9 Nov) | The skill's rule "No hard cuts: swing" and its sky-whip row | The joins stack (`references/joins.md`): each join picked for what it has to do, with its reason; the sky whip listed as not acceptable; toon-kit `approach` for far places | 2 and 3 | Skill and kit 1.52.0; Gibeon's opening rebuilt (Jericho from above, Gibeon on the horizon) |
| Pale, old-looking colours for a period story | Mona Lisa heist (Vincent, 9 Nov) | The plan told 1911 by colour: period picture, faded memory grade, saturation at the bottom of its range | Era through objects, colours bright and modern (`toon-world` look stack) | 3 | Skill 1.52.0; the Mona Lisa not regraded yet |
