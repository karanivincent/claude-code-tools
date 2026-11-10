# Bible in Clay: the channel's thumbnail rules

Moved from the `clay-thumbnails` skill (27 October 2026 onward) when it became part of `story-thumbnails`. The project,
`/Users/vince/Projects/bible-shorts`, holds `docs/thumbnails/README.md` (the process, the tools, the Results table) and
`docs/thumbnails/RESEARCH.md` (the rules and the 8-part rubric, with sources). Jericho's run, `stories/jericho/thumbs/`,
is the worked example: copy its briefs.

## Frames (clay)

- A `<Story>Frame` composition, copying `JerichoFrame`: `Scene` takes `at` (a time in the video), `cam` (`pos`,
  `look`, `fov`) and `shot` (a thumbnail-only shot). Register it at 1920x1080 with the captions off.
- The moments menu: `node scripts/shots.mjs --story <story> --moments <Story>Frame --only a,b,c` (each at its shot's
  middle; times picked by eye landed in the next shot for half the furnace's first menu), then
  `node scripts/thumbs.mjs --story <story> --spec moments.json --out moments`.
- Cards: `stories/<story>/thumbs.json`, rendered with `node scripts/thumbs.mjs --story <story>`; plain frames first
  (`--out test`). On frames in the vivid grade keep `punch` near 0.2 (more washed the furnace's faces out). Indoors,
  frame the people low (the look point above their heads) so the top third is plain wall for the words.

## Rules only this channel has

- Words and titles say only what the Berean Standard Bible text says. A detail the video stages but the text does not
  state (Rahab's stretch of wall standing) is never written as fact. The editor checks every card against the BSB.
- Titles name the person or God in the first three words.
- Clay faces: a moustache hides an open mouth, so a shout or a scream needs a face without one. Brows carry worry and
  anger well.
- Small figures and pale dust disappear at phone size: lift the colour, crop in, or drop the card.
- "NOT ONE WORD" was turned down (no moment, nothing about the story); "THREW 3 / SAW 4" over a frame where three
  figures showed was turned down; the four in a row, the fourth in front, went out.
- YouTube Studio for this channel: Claude in Chrome, the profile signed in to the Bible in Clay channel (the "Udongo"
  Chrome holds two channels: check which is active). A/B testing needs the channel's one-time verification.
