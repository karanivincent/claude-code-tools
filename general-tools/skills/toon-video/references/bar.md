# The bar: 15 checks against a reference

A stretch of ours is at the reference's level when it passes these. They came from a survey of the newest Short of a
much larger channel in the same look, and from 20 of its Shorts studied earlier (November 2026). Each check is answered
yes or no on frames, with the frame as evidence. A spike (`references/spikes.md`) is measured on them with
`scripts/bar-check.py` and one reviewer (X-16).

A stretch of 15 s cannot show each check. The series plan says which ones its stretch can show; the others are
marked "not in this stretch", not "pass", and the review brief repeats that list (X-16).

| # | Check | How it is measured | Rule |
|---|---|---|---|
| 1 | Frame 0 shows a person doing the strange act, with the key prop in hand | Reviewer, frames 0 to 15 | S1-7 |
| 2 | Each wide shot holds at least 8 distinct props or set pieces; no frame outside a deliberate close-up holds fewer than 4 | Reviewer counts on one frame a second and lists what was counted | S3-2 |
| 3 | Each scene with people shows at least 2, with far figures in outdoor wides; nobody near the camera stands idle | Reviewer | S3-169 |
| 4 | The camera is not still for 0.7 s or more | `bar-check.py`: longest still stretch | S3-173 |
| 5 | A change of place is a 5 to 10-frame moving dissolve or a join made from the world. Hard cuts change the angle inside one place or jump in time. No wipes, no inset boxes | `bar-check.py` lists the cuts; the reviewer names each join | S3-121 (differs: see below) |
| 6 | At least one unbroken camera move longer than 10 s | `bar-check.py`: longest run without a cut; the reviewer confirms it is one move | S3-173 |
| 7 | Light comes from a thing in the place (sun, window, lamp, fire) with a clear direction; people cast shadows that fall the same way; shadows are coloured, not pure black. At night: a blue-violet sky and a warm light with bloom | Reviewer, full frames | S3-191, S3-193, S3-196 |
| 8 | The grade changes at least once with the plot | Reviewer | S3-53 |
| 9 | The main face changes expression at least each 2 s, with 6 or more expressions in a minute (2 or more in 15 s) | Reviewer | S3-134 |
| 10 | At least 3 poses that are not standing (seated, lying, crouching, back view, carrying, two-handed) in a minute (1 or more in 15 s) | Reviewer | S3-134 |
| 11 | Each hit, landing or strike shows sparks, dust or debris within 2 frames and leaves a mark that stays | Reviewer, every-frame strips | S3-179..S3-181 |
| 12 | The mechanism is shown on the real object in the story's place, with no chart, card or overlay | Reviewer | S3-116 |
| 13 | An everyday object or a side-by-side comparison sits next to the real thing | Reviewer | S3-116 |
| 14 | Each quoted line has a moving mouth | Reviewer | S3-66 |
| 15 | Narration at 205 to 230 words a minute with gaps under 0.3 s | Word timings | S1-35 (differs: see below) |

## The calm number and the brightness numbers

`bar-check.py` also prints two numbers a reviewer cannot see on frames:

- **Median change per frame**: how much the picture churns. The reference sits near 4; our first film measured 20
  and the night baseline 16.8. The target is under 8, aiming at 4 (S3-173). Fact push-ins raise it and a cut does not
  (S3-174).
- **Brightness**: the mean, the darkest 5% and the brightest 5%, from 0 to 255. The reference's night Short: 77, 33
  and 173. The owner chose a night of about 85 on 18 November 2026 (S3-196). A project's own brightness floor still
  applies to what it posts (Bible in Clay: S4-18).

## What the owner judges on

The reviewer answers these too, in words, scored 0 to 3 against the reference frames (S5-94):

- the camera angle chosen;
- how effects react (a splash that lands well and is not too fast);
- the hero kept in frame, not at the edge or cut off;
- small details in the other people's actions;
- strong colour;
- detail in rocks and background; shadows when people move.

## Where the bar and the register differ

Three lines of this bar were measured on the reference and disagree with rules in `rules.md`. The register holds
until the owner decides (X-7); a spike may test the bar's version and say so in its plan.

- Check 5 allows hard cuts that change the angle inside one place (the reference Short has 8); S3-121 keeps hard cuts
  for a change of place or time.
- Check 15 asks 205 to 230 words a minute; S1-35 writes about 190 words for 60 s.
- The survey found that sharpness, saturation and brightness do not track the reference channel's views; the register
  still aims at bright colour and the reference stills' sharpness (S3-30, S5-97).
