# Acting, action, props and words on screen

How the people act and what the world shows at stage 3. Rule ids point into `rules.md`; the place, the look and the
card rig are in `toon-world`.

## Contents

- [What the first build already has](#what-the-first-build-already-has)
- [Faces and bodies](#faces-and-bodies)
- [Hands and reaches](#hands-and-reaches)
- [Props and effects on people](#props-and-effects-on-people)
- [Action](#action)
- [The world tells the story](#the-world-tells-the-story)
- [Words on screen](#words-on-screen)
- [The acting audit](#the-acting-audit)
- [Pose and card gotchas](#pose-and-card-gotchas)

## What the first build already has

Each shot is alive from its first build (S3-82). This table is what the first build carries; each row cost a round
when it was left for later.

| The first build has | Rule |
|---|---|
| An action or expression change on each beat of the words; nobody still for more than about 1 s | S3-134 |
| People acting with their bodies: walk, crouch, aim, point, throw, shake the head, fold the arms, salute | S3-134 |
| What the line says, happening on screen as it is said ("pitches a tent": the tent goes up) | S3-135 |
| Props held by hands; nothing riding on another prop or floating | S3-72 |
| Acting framed close enough to read: the person at least 25% of the frame high | S3-106 |
| A gesture the story turns on (a salute, a handover) held about 1 s and framed close | S3-136 |
| People who leave fall or walk out in clear view | S3-142 |
| Gunfire seen (flash, recoil, smoke, hits) and heard on top of the mix | S3-143 |
| Captions one word at a time | S3-146 |
| Dates and orders as cards; unfamiliar words as thought bubbles | S3-150 |
| A place sized to the story, its moving parts moving (boat, wake, waves) | S3-17 |
| A detail layer of real moving things in each shot | S3-9 |
| Fire that reads as fire: tall flickering tongues, smoke columns, embers, glow on the ground | S3-76 |

## Faces and bodies

- Emotion is drawn, not narrated (S3-68). The flat look's dot eyes and small mouths cannot show strong feeling, so
  each feeling gets a face on a 0..1 dial. Anger: a red flush, a glaring eye under a heavy lid, a thick brow, a
  shouting mouth with teeth, an anger mark, steam, a tremble. Fear, grief and joy get theirs the same way. If the
  narrator names it, the face shows it.
- Sad and worried faces have open eyes and steep brows, not lid eyes (S3-67).
- A face keeps its expression while it talks; the talking mouth sits on the expression's mouth (S3-66).
- Held poses, not a constant sway; brows do most of the acting (S3-69). Blinks every 0.5 to 2.3 s (S3-70).
- Poses change through in-betweens, never a one-frame snap (S3-137); each verb on the meaning sheet gets a keyed
  action of 0.3 s or more (S1-22).
- Cards face the camera; a side or back view needs its own drawing (S3-60). Stagger two people in depth (S3-61).
- A grown man in a long robe has a beard or a plait; a woman has hair or lashes, not a veil alone (S2-5, S2-6).

## Hands and reaches

- Toon figures wear mittens (S3-55). Mitten figures keep hand size 1; a grip in a shot wider than a face uses a
  side view (S3-56).
- A card's hand reaches on the screen with `cardReach`, which measures the target's offset at the card's depth
  (S3-138).
- A reach stays inside the card's own 600-unit canvas less the mitten's radius; past it, the arm reads as a thin line
  with no hand (S3-64).
- A target within a head's width above the head swings out beside it, on the target's side; a reach ends clear of
  small objects, or the mitten reads as holding them (S3-139).
- Each card and word canvas runs `edgeTouches` right after it draws; sides drawn to the edge on purpose go in `allow`
  (S3-62, S3-63).

## Props and effects on people

- A prop whose state matters is a kit `states` prop; a dial is drawn from `dial` (S3-71).
- Props are held: a drawn fist over a 3D prop, or the prop at the card's hand point (S3-72).
- An effect a card carries (a flame, a glow, a banner) is drawn from the card through its own transform, not from a
  crowd point plus an offset (S3-73).
- A prop passes from the world to a card on one quiet frame: same screen size and colour, nothing else changing;
  whatever it uncovers is keyed to when it moves (S3-74).
- Size the hero prop against a person first (S3-26).

## Action

- Violence and big moments are four beats: the feeling building, the wind-up, the act seen side-on with motion lines
  and a smear, the result with a camera jolt and a shudder (S3-140).
- Thrown things are about twice life thickness with a ghost trail (S3-78). A throw toward the camera is shown close,
  then the arrival (S3-141).
- The world keeps its state by time, not by shot: a spear that sticks stays stuck in later shots (S3-79). This is how
  picture jokes work: the camera comes back and the change carries the story.
- Every picture event has its sound within 0.1 s, and every sound its event (S3-144).

## The world tells the story

- Show how a device works before anyone reacts to it: a see-through "what if" copy of the moving part in the first
  five seconds (S3-113).
- Show time passing with something that moves (clock hands, light crossing a room), not a counting number (S3-114).
- One or two picture jokes that carry the story without words (S3-115).
- Facts as things in the world: a counter, a mark, a scroll, the objects themselves (S3-116).
- The thing a line is about reads as the subject even when it is small: smaller neighbours, a plainer wall, its own
  light pool (S3-27).
- Light follows the story (warm fire, blue danger, gold hope) and faces stay bright enough for a phone (S3-53).
- Nobody walks through solid scenery (S3-25).

## Words on screen

- Captions burn in one word at a time, white, in the portrait safe area; the template draws them (`captionsOf`) and
  `checkCaptions` fails a film without them (S3-146).
- Captions stay off faces and drawings being read, at one height per shot, no lower than 82% of the frame (S3-147).
- Words go on screen cards, not on the ground; a ground map is shapes alone (S3-148).
- Words on things are in the narration's language; mastheads and proper names may stay; the era shows through shapes
  and objects (S3-149).
- A card whose text is spoken arrives 0.4 s before to 0.2 s after its word (S3-151).
- The hook card is fully drawn on frame 0 (S1-8).

## The acting audit

The film's composition takes an `audit` flag: on each frame it logs one sample (people with a pose signature, head
and feet projected to the frame, held props with their holder's hand) instead of drawing the look stack.
`tools/audit.mjs` renders it tiny, one frame in three, and runs toon-kit `acting.ts` (`actingStills`, `actingTooSmall`,
`checkFraming`, `checkHeld`, `checkCues`, `checkSync`, `checkOpening`, `checkCaptions`) with the story's cards, word
times, picture events and sound cues. The gate runs it (S4-2); `references/checks.md` lists what each check fails on.

## Pose and card gotchas

- A hand over the mouth: `armR` about `[0.35, -2.75]`; smaller angles read as a wave.
- Mittens for a cast drawn before mittens: add new looks with `mitts: true` (`jacobM`, `manM`) rather than change old
  ones, so earlier videos render the same (X-8).
- Cards draw over 3D props in front of them unless the depth test is on; keep it on, off inside a solid alone (S3-58).
- Card textures have no mipmaps, or far people vanish (S3-59).
- A flock or crowd placed on one story's ground needs its heights set from the new story's land.
