# Spikes: a 15-second experiment before a whole film

A spike is a small, cheap experiment on one short stretch of film. It answers one question, it is not posted, and
what it teaches is written down the same day, whether it worked or not (X-13, X-17). Spike first whenever a look, a
method or a fix is unproven: a whole film takes a day and teaches one thing at the end, mixed up with everything else
that changed; a spike takes about an hour and teaches one thing you can name. A 15-second stretch renders in under a
minute at half size, so one spike can try a change ten times.

Rule ids point into `rules.md` (the method is X-13 to X-34, the craft it found is S3-171 to S3-200, with the owner's replacements of 18 November 2026 at S3-201 to S3-212, S5-102 and S5-106, and the rendered-world look of the third series at S3-213 to S3-234). The 15 checks a
spike is measured on are in `references/bar.md`.

## Proof status

The method and the craft rules came from two series run on 18 November 2026 on a toon Short, measured against the
newest Short of a much larger channel in the same look: "garbo-bar" (the first 15.2 s, seven spikes) and
"garbo-night" (a 5.6 s night scene, five spikes).

**Proven on a 15-second and a 5.6-second stretch, not yet on a whole film.** A skill change from a spike is not done
until a run of the skill matches or beats the spike's clip in a blind judging (X-30). The bar:

| Series | Result page | Branch in the project the spikes ran in |
|---|---|---|
| garbo-bar | https://claude.ai/artifact/YZschJbe19yUVJ2WiwurZJ | `spike/garbo-bar-5-combine` |
| garbo-night | https://claude.ai/artifact/8oFxfFAA2aW8VjLjJnPgko | `spike/garbo-night` |

The next film made with this skill is the proof run. Its judge sees those clips beside the film's same beats
(`abjudge.sh --ref`, S5-77), and the result is written here and in `why.md`.

## Contents

- [The rules of a spike](#the-rules-of-a-spike)
- [The loop](#the-loop)
- [Planning a series](#planning-a-series)
- [Process lessons](#process-lessons)
- [The scripts](#the-scripts)
- [Where things live](#where-things-live)
- [Builder brief](#builder-brief)
- [Reviewer brief](#reviewer-brief)
- [Log entry](#log-entry)

## The rules of a spike

1. **One stretch, 15 s or less**, the same stretch for the whole series, so clips can be compared (X-13).
2. **One question**, written before any code, with a guess at the answer: "does filling the café to 8 props and three
   busy extras lift the frame?", not "make it better". It names only things the place has (X-14).
3. **One thing changed.** A spike on fill does not touch the camera; if two things change, nobody knows which one
   worked (X-14).
4. **A fixed start.** A spike starts from the series baseline, or in a layered series from the last kept spike, and
   is judged against the baseline clip (X-15, X-19).
5. **A budget.** One builder, about 90 minutes and about 0.5M tokens. When it is spent the spike stops and reports
   what it has (X-15).
6. **The same checks each time**: `bar-check.py` and the bar. No new yardstick mid-series (X-16).
7. **A log entry, always.** A spike that failed still teaches something. No entry, no spike (X-17).
8. **Two spikes at once at most**, or as many as the project's render slots allow, if fewer.

## The loop

| Step | What happens | Who | Time |
|---|---|---|---|
| 1. Ask | Write the question, the one thing that changes, the checks it should move, and a guess | Lead | 5 min |
| 2. Build | A worktree on the series branch. Change only that one thing. Place with stills, render to confirm (X-24) | One builder agent | up to 90 min |
| 3. Measure | `bar-check.py <clip>`: hard cuts, joins, still stretches, longest run, calm number, brightness | Script | 20 s |
| 4. Judge | One reviewer with no part in the build sees the baseline, the best so far and the new clip together and scores the bar on frames (X-21) | One reviewer agent | 5 min |
| 5. Log | One entry in `docs/spikes/LOG.md`: what changed, numbers, checks passed, what it taught, what it cost (X-17) | Lead | 5 min |
| 6. Show | The owner sees the baseline and the best clip side by side and picks; never more than three clips (X-27) | Owner | 2 min |
| 7. Keep | A lesson the reviewer backed goes into `toon-video` or `toon-world` through `add_rule.mjs`, with the spike's clip named as the bar (X-22, X-30) | Lead | later |

## Planning a series

A series is a set of spikes on one stretch, aimed at one bar. Write `docs/spikes/<series>/PLAN.md` before the first
build. It holds:

1. **The stretch**: the frames, the scenes in it, why it was picked, and its render command.
2. **The baseline (spike 0)**: the stretch rendered as it is, with `bar-check.py` and a review. Its numbers go in the
   plan.
3. **The checks this stretch can show**, and the ones out of it (X-16). The review brief repeats the list.
4. **The beats that must not get worse**: the one or two payoff moments of the stretch, named in every brief (X-20).
5. **One row per spike**: name, question, what changes, what it leaves alone, the checks it should move.
6. **The budget**, and afterwards what it cost and what comes next.

Run the spikes in the order a picture is built (X-18), on one branch, each builder starting from the last one's
commit and told what is locked (X-19):

| # | Spike | Changes | Locked |
|---|---|---|---|
| 1 | Camera and shot size | Camera keys, shot sizes (hero at about a third of the frame in a wide, S3-211, S3-208), cuts inside the place, dropped devices and the new homes of what they carried (S3-176), the set's props for the new camera | Light, grade, acting, effects |
| 2 | Fill | Set pieces, props and extras placed for the locked camera (S3-185..S3-189) | Camera |
| 3 | Light | Named sources, the key lamp placed with the set, shadows, rims, grade (S3-191..S3-200) | Camera, props' places, acting |
| 4 | Acting and effects | Faces, hands, small actions, effects with their causes and marks (S3-179..S3-184) | Camera, set, light |

Fill and camera can share a spike when the place is small (garbo-night 1 did); split anything over about 90 minutes
of work between two builders. Each spike ends with a fault sweep (X-25) and one paired review (X-21). After the last:
one fix round at most, ranked, half its budget on the first item (X-26), then the owner sees the baseline against the
best (X-27). If the single spikes ran apart from the baseline instead of layered, a combine spike brings them together
in the same order, starting from the camera spike's branch and fixing each layer for the new camera; it owns
"whatever the facts need", said in its row.

## Process lessons

Each is a rule in the register; the source spike is in `rules-log.md` and `why.md`.

| # | Lesson | Rule |
|---|---|---|
| 1 | Fix what "not in this stretch" means in the plan before the first review, and repeat the list in the review brief | X-16 |
| 2 | A question names only things the place has; adding a missing thing is a second change | X-14 |
| 3 | Run the spikes in the order a picture is built: camera and shot size, then fill, then light, then acting and effects | X-18 |
| 4 | A builder's rules are claims until the reviewer sees the same thing | X-22 |
| 5 | One reviewer sees the baseline, the best so far and the new clip together and reports what changed | X-21 |
| 6 | Name the beats that must not get worse; a spike that weakens one has failed | X-20 |
| 7 | One branch, each layer locked before the next; each builder told what is locked | X-19 |
| 8 | A fix round gets a ranked list and half its budget on the first item | X-26 |
| 9 | Reports go into the repo the same hour, before a worktree goes | X-29 |
| 10 | One fix round, then show: fix rounds have falling returns | X-26, X-27 |
| 11 | Watch the words in a brief: say what is allowed as plainly as what is not ("one camera journey" made builders avoid the cut a payoff needed) | X-28 |
| 12 | A combine or a layered spike ends with a fault sweep: frame edges, facts, shadow directions, light sources | X-25 |
| 13 | Judge motion on every frame; one frame a second hides effects and one-frame pops | X-23 |
| 14 | Place with stills, render to confirm: a stills sheet takes 10 to 20 s and did most of the work | X-24 |
| 15 | The baseline over the try at the same seconds is the fastest judgement | X-24 |

What the two series cost, for planning: garbo-bar ran seven spikes in about two and a half hours with fourteen
agents, about 3.0M tokens; garbo-night ran five in about two hours with seven agents, about 1.7M tokens. A layered
spike with its camera and light locked was the cheapest (45 minutes).

## The scripts

All in `<toon-video>/scripts/`; they need ffmpeg, and `bar-check.py` needs a python with numpy (run it with `-I`).

| Script | Run | Gives |
|---|---|---|
| `bar-check.py` | `python3 -I <toon-video>/scripts/bar-check.py <clip.mp4> [--json out.json]` | Hard cuts, soft joins, big jumps, still stretches, the longest unbroken run, the median change per frame and the brightness numbers (checks 4, 5 and 6 of the bar) |
| `spike-frames.sh` | `sh <toon-video>/scripts/spike-frames.sh <clip.mp4> <dir>` | `<dir>/full/sNNN.jpg` twice a second (sN = (N-1)/2 s), `<dir>/sheets/NN.jpg` with 60 frames each in order, `<dir>/strip.jpg` one frame a second |
| `spike-ab.sh` | `sh <toon-video>/scripts/spike-ab.sh <baseline dir> <try dir> <out.jpg> ["0 1 2 3"]` | The baseline's frames over the try's at the same seconds, one picture |

Known limits of `bar-check.py`: with a calm camera a one-frame pose pop can show as a hard cut, and a wipe or dissolve
inside fast motion shows as a big jump; the reviewer names each join.

Every-frame strips around a hit, for the reviewer (X-23), from any clip at 30 fps:
`ffmpeg -ss <s - 0.2> -t 0.6 -i clip.mp4 -vf "scale=270:480,tile=9x2" -frames:v 1 hit.jpg`.

## Where things live

| Path in the project | What |
|---|---|
| `docs/spikes/LOG.md` | Each spike, newest first, with a table of series at the top (X-17) |
| `docs/spikes/<series>/PLAN.md` | The series plan |
| `docs/spikes/<series>/brief-build.md`, `brief-review.md` | The briefs its builders and reviewers worked from, filled from the templates below |
| `docs/spikes/<series>/reports/` | Every builder's notes and every review, committed the same hour (X-29) |
| `out/spikes/<series>/<spike>/` | Clips, frames and reports (gitignored); the bar clip is kept (X-30) |
| Branch `spike/<series>` (layered) or `spike/<series>-<n>-<name>` | Each spike's code; not merged as is. The lesson goes into the skills, the clip stays as the bar |

## Builder brief

Fill each `{field}`. Adapted from the garbo-night briefs, the series whose spikes each passed more checks than the
one before.

```markdown
# Builder brief: one spike of the series "{series}"

You are building ONE spike: a small experiment on a {length}-second stretch of our toon video "{film}". It is never
posted. Its job is to answer one question and to teach us something we can write down. A clear "this did not work,
and here is why" is a good result.

Your prompt gives you {n} and {name} (the spike) and its row of `docs/spikes/{series}/PLAN.md`. Your worktree is
{worktree} (branch {branch}); work only inside it. Your output folder is `out/spikes/{series}/{n}-{name}/`.

## Read first, in this order
1. `<toon-video>/references/spikes.md` (the rules of a spike and the process lessons: read each one),
   `<toon-video>/references/bar.md`, and `docs/spikes/{series}/PLAN.md` in full: the baseline numbers, the beats that
   must not get worse, your row.
2. `docs/spikes/LOG.md`: the "Taught" lists of earlier entries, and this series' entries so far.
3. The level to reach: {reference frames: folder and the frame names that matter}. Learn how it is made; copy none of
   its content.
4. The baseline: {baseline dir} (`clip.mp4`, `strip.jpg`, `full/`, `sheets/`), and the best so far: {best dir or "none"}.
5. The code: {scene and place files}, the look stack, the kit.
6. The part of the skills that covers your spike: {toon-world sections, toon-video references}. Read only what you need.

## What is locked
{The layers earlier spikes settled, by file: do not change them. If your change needs one changed, say so in your notes
and stop that part.}

## The loop
1. Write your plan in `notes.md` before any code: what you will change and what you expect to see. Ten minutes at most.
2. Place with stills, render to confirm. Stills: {stills command} (10 to 20 s). Render: {render command} (about
   {seconds} s). If the render slots are taken, wait a minute and try again.
3. Look: `sh <toon-video>/scripts/spike-frames.sh <clip> <out>/rN`, then
   `sh <toon-video>/scripts/spike-ab.sh {baseline dir} <out>/rN <out>/rN-ab.jpg "{seconds}"`, and compare with the
   reference frames. Judge anything that moves on the every-frame sheets. One line in notes.md per try: what changed,
   what you saw, keep or undo.
4. Measure: `python3 -I <toon-video>/scripts/bar-check.py <clip>` on any try you think is your best.
5. Stop when the question is answered, or after about 90 minutes or 10 full renders.

## Rules
- Change only what your row lists. If the kit lacks something, build the smallest piece that answers the question and
  say so. Do not start a new system.
- The beats in PLAN.md must not get worse: {beat 1}; {beat 2}. Check them at phone size.
- Allowed: {what is allowed, said plainly; for example "a hard cut inside the place to a close shot of a fact and back"}.
  Not allowed: {for example "inset boxes, overlays, wipes"}.
- The story's words, voice, captions and sound stay exactly as they are.
- The hero stays whole and readable; nothing dark sits on his outline; nothing covers a fact.
- Before you hand back, sweep the every-frame sheets: each frame edge for cut-off or stray things, each fact for
  reading size, each shadow's direction, each light for a source you can point to. List what you found and fixed.
- The project's type check passes. Foreground only: no background jobs, no dev server, no browser. Never post or push.
- Commit on the branch when you finish, with a plain message that lists the changes.

## Hand back
Copy your best try to `clip.mp4`, run `spike-frames.sh` on it into `best/`, write the baseline-over-best picture to
`ab.jpg`, and finish notes.md with: 1. Answer (yes, no or partly, in two sentences). 2. What I changed, each with its
file. 3. Tries (the table). 4. What worked and what did not, each with its frame or second. 5. The beats: for each,
the frame where it reads and its size on screen. 6. What the kit lacked, with a size (small, medium, large). 7. Rules
for the skill: two to five, each checkable on frames or in code; claims until a reviewer sees the same. 8. About the
process. 9. For the next builder: what they need to start from your branch. 10. Cost: tries, minutes, what is undone.

Then copy notes.md to `docs/spikes/{series}/reports/{n}-{name}-notes.md` and include it in your commit.
Final message: the paths to notes.md and clip.mp4, and your answer in five lines.
```

## Reviewer brief

```markdown
# Reviewer brief: one clip of the series "{series}"

You judge one {length}-second stretch of our toon video "{film}" against a fixed bar, beside the baseline and the best
clip so far. You had no part in building it. Be strict and specific: each answer names a frame.

Your prompt gives you {clip dir} (the new clip's folder), {name}, the question the spike asked, and {best dir} (the
best clip so far, or "none"). The baseline is {baseline dir}.

## What you have
- Each clip folder holds `clip.mp4`, `strip.jpg` (one frame a second), `sheets/NN.jpg` (each frame, 60 a sheet) and
  `full/sNNN.jpg` (twice a second). If frames are missing: `sh <toon-video>/scripts/spike-frames.sh <clip.mp4> <dir>`.
- The level to reach: {reference frames}. Compare picture against picture.
- `<toon-video>/references/bar.md` and `docs/spikes/{series}/PLAN.md` (baseline numbers, the beats that must not get
  worse).
- The machine check: `python3 -I <toon-video>/scripts/bar-check.py <clip.mp4>` on the new clip and the best so far.

Look at each sheet of the new clip, its strip and its full frames, the same frames of the baseline and of the best so
far, and the reference frames. Judge anything that moves on the every-frame sheets, and cut every-frame strips around
each hit with ffmpeg if you need them (inside {clip dir}).

## Write {clip dir}/review.md
1. What changed, against the baseline and against the best so far: better, same or worse, one row each for
   {the rows this series cares about: the place reads as one place; props and things near the lens; the people's
   places and sizes; camera and cuts; calm; a light source you can see; shadows; the people lit by the light; effects
   on each hit; faces and small actions}.
2. Checks: one row for each of checks {in-stretch checks}: pass or fail, the frame, better, same or worse than the
   baseline and than the best so far. Checks {out-of-stretch checks} are out of this stretch: do not score them.
3. The beats: for {beat 1} and {beat 2}: does it read at phone size, on which frame, better, same or worse?
4. The owner's six (bar.md): a score 0 to 3 each against the reference frames, with one sentence of evidence.
5. {A series-specific section, such as "Night": the brightness numbers beside the reference's; each light you can
   point to and what it lights.}
6. What got worse or looks wrong: anything pasted on, too busy, cut by a frame edge, a shadow or light with no source,
   a fact covered, the hero lost.
7. Against the reference: the three biggest differences left, and one likeness number from 1 to 10 against the
   scene's reference frame (S2-36), beside the same number for the baseline and the best so far. Where the series
   judges the rendered-world look, one row for each world row W1 to W7 of bar.md: pass or fail, with the frame.
8. Three things to do next, ranked by what the viewer gains, each small and specific.

End with two lines: `CHECKS: pass=N fail=N` and `OWNER: a,b,c,d,e,f`; a series that scores likeness adds a third,
`LIKENESS: new=N best=N baseline=N`.
Foreground only, no browser, write nothing outside {clip dir}. Do not read any builder's notes. Final message: the
review path, the two lines, and eight lines of summary.
```

## Log entry

```markdown
## {series} {n}: {name} ({date})

- **Question:** {the question as asked}
- **Changed:** {the one thing, by file}. Branch {branch} at {commit}. Clip: {path}.
- **Answer: yes, no or partly.** {two sentences}
- **Numbers:** median change per frame {x} (baseline {y}, reference {z}); checks {n} of {m}; owner's six {a,b,c,d,e,f};
  brightness {mean / darkest 5% / brightest 5%} where light changed.
- **What got worse:** {with frames}
- **Taught:** {numbered; only what the reviewer also saw}
- **For the skill:** {which skill and section; the rules, each checkable}
- **Kit lacked:** {with sizes}
- **About the process:** {what to change in the loop or the briefs}
- **Cost:** {minutes, renders, tokens, for the builder and the reviewer}
```
