---
name: toon-video
description: Use when making any short animated video in a drawn 2D toon look - flat cartoon characters drawn in code as cards inside 3D sets, rendered with Remotion and Three.js, voiced and scored with ElevenLabs - for any subject - a story, an explainer, a product demo, a history piece, a kids' tale, a brand clip. Covers the script, sets, camera without hard cuts, acting (anger, fear, hiding), action beats, hands, light, and the checks before the hand-back. Triggers - "toon video", "2D animated short", "cartoon explainer", "drawn video", "make it in 2D", "like Ricks Clips", "animate this story". For a Bible in Clay story in the toon look, use toon-story-video, which adds that channel's rules on top of this one.
---

# Toon video (2D cards in 3D sets)

A toon video is flat drawn people (cards that always face the camera) standing in full 3D sets, filmed
by a moving camera. Everything is drawn in code, so pictures cost nothing to redo; only voices, music
and effects cost money. This skill holds the craft. A project or channel can add its own rules on top
(Bible in Clay does, in `toon-story-video`).

## First

1. Find the toolkit. It was built in `/Users/vince/Projects/bible-shorts`: `src/spike2d/` (the
   `Figure2D` card, `draw.ts` faces, hands and props) and the story folders that use it, newest first
   (`src/stories/david-jonathan-2d/` has the camera swings, sets, rage face and action beats). A new
   project copies `src/spike2d/` and the newest story's `shots.ts` helpers; it does not import across
   repos. See `references/toolkit.md` for what each helper does and the gotchas.
   When planning a story, read `references/playbook.md`: the techniques learned from studying the best Shorts,
   each with a blueprint and whether it is built. Pick the ones this story needs; build a blueprint-only piece
   when the story calls for it, then mark it built there.
2. If the project has its own making-of doc (`docs/MAKING-A-STORY.md` or similar), read it all. Its
   rules win over this skill.
3. Read the ElevenLabs balance before the first credit and after the last, and report the difference.
   Never print a key: hand secrets files to node with `--env-file`, never `cat`, `grep` or `source` them.
4. Know the form: 9:16 (a Short, 50–65 s) or 16:9. Portrait is narrow, which drives the camera rules.
5. The place, the look and the people come from `toon-world`: which route to build a set by (pictures then
   3D, a picture warped by depth, or drawn in code), the look stack (background blur, ink on the world,
   two-tone light, grade) and lit bean-head cards. Load it before the first set.

## The order

1. **Script.** Open on the strangest true thing within three seconds, build in steps, land the turn at
   the end. Write about 150 words for 60 s (narration runs about 3 words a second with pauses). Bring in
   every person and object before it matters: if the payoff needs a stone, show the stone early. The
   hook needs its payoff soon after it. Facts you cannot show stay out; an imagined feeling is said as
   imagined.
2. **Voice.** The narrator is Laura (ElevenLabs `FGY2WhTYpPnrIDTdsKH5`, eleven_v3, stability 0.3, played
   at about 1.2× with `atempo`), chosen on 7 November 2026 for her energy. One voice per speaker, `say` with eleven_v3 tags, each line cached by a hash of its text
   and voice, so a rerun costs nothing. Check every line with whisper. Lines reused from an earlier
   version are copied (mp3 and align files) and cost nothing. Read the total duration now and cut lines
   here, not after the music.
3. **Retell check.** Give a fresh agent only the script (or the contact sheet) and ask it to retell the
   story. Anything it gets wrong, the viewer will too. Fix and repeat until it retells it right.
   **Then the meaning sheet** (required, approved with the script and the comic): a table with one row per beat
   giving the thing that changes, its cause, and the shot that shows the change happening. A glowing rail is a
   state; a gap closing is a change, and the change is the shot (Vincent, 8 November 2026, railroads practice:
   "the action of closing is the most important part"). Name the one thing the viewer must see in each second,
   too. Every later stage is checked against this sheet, not against a reference's pictures. The same list goes into
   code as must-see entries (`MustSee`: the word, the subjects by name, the size), and the shots are written from it.
4. **The stages the owner reviews.** Nothing moves to the next stage before his yes (Vincent, 8 November 2026,
   taken from `ai-story-video`):
   - a. **Comic.** The script as one page of panels drawn in code, a panel per line, the words under it. Free;
     the story is fixed here.
   - b. **Cast sheet.** Every person and animal as a flat cartoon card in the story's cast style (`toon-world`).
   - c. **Looks and places.** A look proposed for each scene with its reason (picture room, game world, flat 2D
     place, drawn in code: `toon-world` "Looks, scene by scene"), the parts plan (which part comes from code, a
     picture, a 3D model or an effect), and one picture per place where the look uses pictures. Vincent picks; looks
     may differ scene by scene, never within one frame.
   - d. **Still board.** One Higgsfield still per beat (`gpt_image_2_6`, 9:16), each made with the place's master
     picture and the cast sheet as image references, the prompt saying the people and animals stay flat 2D cartoon
     cards exactly as on the cast sheet, lit by the place, never realistic or 3D. Check every still at full size: a
     realistic person or a 3D animal is redone, not approved. The 3D build then follows the approved stills.
   - e. **Clips.** Build and render the video in clips of 15 to 20 seconds (about four for a minute), cut at story
     beats, and show each clip before building the next. A clip reaches the owner only after the measured checks
     below pass and a critic agent has scored it against the meaning sheet (and a reference when there is one).
   (Vincent, 7 November 2026, after the train heist: "before any of this is animated ... I can review them fast.")
5. **Sets.** A set list per place before any shot: 8 or more props, a full background, extras.
   People are small inside a big place. Crowds are painted once and reused. Build only what the
   approved still board shows.
6. **Shots.** Time each shot on a word of the voice. Build the camera, the acting and the action by the
   rules below. Look at the contact sheet after every round, and re-sheet only what changed.
7. **Music and mix.** Settle every pause first, then music in sections with a coda, then the mix:
   voice on top, music ducked under speech, effects on their words, about −14 LUFS.
8. **Render, check, hand back.** Run the checks below and give their numbers with the video. Nothing
   posts without the owner's yes on the finished video; drafts only.

## The backbone and the dynamics

Every video starts from the same backbone, so it begins from somewhere good, and then gets its own dynamics, so
no two feel the same (Vincent, 8 November 2026: "some are slow, some are fast ... we need the backbone for
everything, even when we are getting inspiration from them").

- **The backbone (always):** a hook in the first line and a payoff that loops back to it; the meaning sheet; a look
  per scene with its parts plan; one cast style with flat faces that carry the acting; sharp, detailed, saturated
  pictures measured against a reference; captions one word at a time; a mix at about −14 LUFS; the owner's stages
  and the checks below.
- **The dynamics (chosen per video, written as a short profile at stage a, approved with the script):**

  | Dial | Range seen in the studies | Pick by |
  |---|---|---|
  | Pace (big changes a minute) | 25 (dashcam, face-led jokes) to 50 (railroads, machines) | What carries the story: faces slower, machines and journeys faster |
  | Longest holds | 0.5 s (railroads) to 2.3 s (dashcam, on a joke) | Hold where a face or a reveal needs reading time |
  | Joins | almost none (railroads: journeys and dissolves) to 7 cuts plus wiper wipes (dashcam) | Journeys for one big place; cuts and world-made wipes for many places |
  | Colour arc | by place (railroads) or with the plot (dashcam darkens as the scheme grows, clears to sun at the payoff) | Whether the mood changes over the story |
  | Camera energy | dives and skims (railroads) or pushes and orbits that rest on faces (dashcam) | The same as pace |
  | Voices | narration only, or spoken lines with lip sync | Whether people talk in the story |

  Take the profile from the nearest studied video in `references/playbook.md` and `docs/STUDIES.md`, then change
  what this story needs. The checks measure against the profile, not one fixed number.

## Camera

- **Shots by subject** (toon-kit `camera.ts`, synced with `toon-world/scripts/sync-kit.mjs`). Write each shot from the
  must-see list: `shot(word, { subjects, size, az, el })` for a held framing, `follow(...)` for someone moving. The
  camera is worked out from what must be seen, so it cannot fall off the subject. Use `approach` for a journey to a far place (the
  destination stays in sight). Keep raw keys for whip reveals and world-made joins only. Gibeon's night march (9 November 2026) used hand-typed keys that raced ahead of the column,
  so "marched all night to save them" showed an empty hillside; `follow` on the column fixed it, and the check below
  found the fault in under a second with no render.
- **Check the camera before any render.** Run `safe` on every camera (above the ground, outside solids, a usable up),
  then `audit` (turns over 4° a frame outside a planned whip) and `checkMustSee` (every must-see subject in frame and
  big enough on its word, not behind a rock, and no rock crowding the lens) over the whole film. Build the blockers
  from the same list the scene draws its rocks and bushes from, so the check and the picture cannot disagree.
  Gibeon's `scripts/gibeon-2d-camera-check.ts` is the worked example; it found the foreground rock on the night
  march that the first subject-framed shot put in front of the column.
- **Props with states.** A prop whose state matters to the story (a gauge, a door, a level) is a toon-kit `states`
  prop, and a dial is drawn from `dial` so its needle and its marks share one angle. Check its state on its words in
  the same no-render check.
- **Aim at the people, not the place.** A 9:16 frame at a 44° field of view is only about 26° across.
  Most first-sheet faults are a person just off-frame. For two people, aim between them and keep both
  within about 10° of the centre line. Two people far apart, side-on, do not fit: shoot a diagonal from
  above.
- **Cameras on uneven ground are ground-relative.** Give heights above the ground under each point,
  not absolute heights, or cameras end up underground.
- **Joins come from the stack, each with its reason** (`references/joins.md`, 9 November 2026). For every join, say
  what it has to do (go far and show where, go in time, follow cause to effect, go inside), pick the entry that does
  it, and write the reason in the shot list. A move whose reason you cannot say out loud is not a join: hold,
  dissolve or cut. Never rise into empty sky and fall onto the next place: Gibeon 2D did that between every far place
  and it read as the camera moving for its own sake. Within one place, follow the subject. One hard cut at most,
  saved for the twist, plus the loop back to frame 0.
- **What the hard-cut count sees** (Jacob wrestles 2D, 19 cuts down to 7): an inverted impact frame counts twice (in
  and out), and a fast flight between far places counts several times. Show a hit with speed lines alone, and dip
  the picture to white across a far flight (peak at its middle). A far flight eats about 0.8 s, so start it a word
  later when the shot before carries a line that matters.
- **Smooth, not busy.** Big near surfaces must not sweep across the frame: a camera skimming a few centimetres
  over a rail with a wide lens fills the frame with grain flicking past even when the overall motion matches the
  reference (Vincent, railroads round 3). Sit a little further back, use a slightly longer lens, glide slowly with
  long eases, and let the thing that changes (the heat travelling, the gap closing) be the motion the eye follows.
- **One clear thing per second**, from the meaning sheet, framed big and sharp.
- At least three kinds of view: from above, a map or cut-away, ground level.
- At most one frame in four is a face close-up. The world is the star.
- The camera shakes only on hits.

## Acting

- **Emotion is drawn, not narrated.** The flat look's dot eyes and small mouths cannot show strong
  feeling, so add a face for it. For anger: a red flush, a glaring eye under a heavy lid, a thick brow,
  a shouting mouth with teeth, an anger mark, steam, a tremble, on a 0..1 dial. Use it on every beat the
  words call angry. The same goes for fear, grief and joy: if the narrator names it, the face shows it.
- **Hands are mittens.** Thin-finger hands read as claws on a phone. Mittens by default on every look.
- Held poses, not a constant sway. Brows do most of the acting.
- Cards only face the camera; a side or back view needs its own drawing. Stagger two people in depth
  rather than side by side.

## Action

- **Violence and big moments are four beats:** the feeling building, the wind-up, the act seen side-on
  with motion lines and a smear, then the result with a camera jolt and a shudder. Show the action the
  narrator names, as it happens.
- **Thrown things** are about twice as thick as life, with a ghost trail, or they vanish on a phone. A
  throw toward the camera hides the thrower: show the throw close, then the arrival.
- **Hiding needs a real sightline.** The cover (a stone, a wall) stands between the hider and the
  seeker for the whole run. Route the seeker on the far side and shoot over the hider's shoulder at the
  seeker. Never let a seeker walk past the hider in plain view.
- **An empty place** (a seat, a bed, a desk) is shot low, across it, with nothing in front. Cards draw
  over everything, so any figure on that line covers what you meant to show.
- **The world keeps its state by time, not by shot.** A spear that sticks stays stuck in every later
  shot; a cup knocked over stays over. This is how picture jokes work: the camera comes back to the same
  place and the change carries the story without words.

## The world

- Build the place and its look with `toon-world`. Without its background blur, ink lines and lit cards, a
  3D render reads as flat and the people as pasted on.
- **Medium shots, not faces.** The person stands about half the frame high, with the whole prop beside
  them and the room above. A face fills the frame only on an emotional turn (about 3 frames in 20).
- **Size the hero prop against a person first.** A prop twice too big crowds every shot of the person, whatever
  the camera does.
- **Show how a device works before anyone reacts to it**: a see-through "what if" copy of the moving part
  (a ball dropping from the dragon into the frog) in the first five seconds.
- **A camera that ends high shows a count**: orbit and rise until the eight of something can be counted.
- **A name is spoken while its person is on screen**, within about 0.2 s, or the shot loses its point.
- One or two picture jokes that carry the story without words.
- Facts as things in the world: a counter, a mark, a scroll, the objects themselves.
- Light follows the story: warm firelight, blue night for danger, gold dawn for hope. Keep every face
  bright enough for a phone.
- **Words go on screen cards, never on the ground.** Text laid on the ground reads backwards from half
  the cameras. A map on the ground is shapes only, laid on the terrain point by point.
- Nobody walks through solid scenery: list the solids and check the paths.
- Captions: one word at a time, white, in the portrait safe area.

## Building as a team

For anything longer than a few seconds, build each clip with specialist agents that own separate files: places and
track, effects, people and props that act (a train), sound at the same time; then the camera last, because it frames
what the others built; then a critic that scores the clip. Resume the same agents for the next round so they keep
their knowledge of the code. The railroads practice went from 1.2 to 1.8 out of 3 in three rounds this way, where
one lead builder alone stopped at 1.2. Each agent writes a short report with notes for the camera.

## Log every step's time

Vincent, 9 November 2026: "track the time it takes to build a whole story ... keep data". Every step goes into the
project's `docs/production-log.jsonl` the moment it ends, with `scripts/production_log.py add`: the story, the stage
(study, script, voice, plan, world, people, camera, build, render, critique, fix, spike, review), the round, who did
it, minutes and tokens. An agent's minutes and tokens are in its finish notice (`duration_ms`, `subagent_tokens`;
a resumed agent reports its running total, so log what this run added). A render's minutes are in its output; make
render tools print them. `production_log.py report <log>` sums each story by stage and averages each stage across
stories; put its numbers on the review page with the video.

## After every critique: fix the making

The critic finds faults; the build is changed so the next video cannot make them. Before the next fix round, sort
each finding by what in the making allowed it, and fix it at the strongest level that fits:

1. **Make it impossible**: the toon-kit refuses it (the camera cannot go under the ground or lose its up).
2. **Make the right way the easy way**: a kit block does it right (shots by subject, props with named states).
3. **A rule with a picture**: a line here with one right and one wrong frame, for judgement calls.
4. **A check**: only behind 1 to 3.

A fix that is true of any video goes into the kit or this skill through the skills repo; one that belongs to the
story stays in the story. Never put a look into the kit (see `toon-world` "The toon-kit"). Record each finding in
`references/findings.md`: the fault, what allowed it, the change and its level. A kind of finding that comes back
means its fix was too weak: move it up a level.

## Long videos: the series library

A series builds its worlds, cast, props and effects in its first episode and keeps them in one folder every later
clip imports. Later clips are then staging, camera and sound, not modelling. Most fixes move earlier: the meaning
sheet and the looks are approved once, and machines run the checks before the owner sees a clip. (Rough guess, not
measured: about 1.5M tokens for a 15-second clip once the library exists.)

## Checks before the hand-back

Give the numbers with the video. The scripts named are in the toolkit project; copy them.

| Check | How | Aim |
|---|---|---|
| Pace | `python3 scripts/pace.py <video>` | within about 10 of the video's profile (25 to 60 big changes a minute); still only where the profile holds |
| Hard cuts | `ffmpeg -i <video> -vf "select='gt(scene,0.3)',showinfo" -f null - 2>&1 \| grep -c pts_time` | under 10 |
| Face close-ups | `ffmpeg -i <video> -vf fps=0.4,tile=7x4 sheet.png`, count by eye | at most 1 in 4 |
| Brightness | `node scripts/brightness.mjs <video>` | opening 120+, nothing too dark on a phone |
| Walking | `node scripts/walk-check.mjs` | nobody through a solid |
| Loudness | mix about −14 LUFS; each line audible over the music | |
| Retell | a fresh agent retells it from the sheet | it gets the story right |
| Sharp and popping | `python3 <toon-world>/scripts/measure_sharp.py ours.mp4 [reference.mp4]` | sharpness, fine edges, saturation and brightness within reach of the reference |
| Meaning shown | a critic agent checks each row of the meaning sheet on the frames | every change is seen happening, big and sharp |
| Camera and must-see | toon-kit `audit` and `checkMustSee` over every frame, no render | nothing under the ground or inside a solid; no turn over 4° a frame outside a planned whip; every must-see subject in frame and at least 8% of the height on its word |
| Score | a critic agent scores each second 0–3 on world, camera, people, light, story by picture, sound | rising every round; 2.5 is the aim |

After any change to shared drawing code, render two frames of an earlier video and byte-compare them
with frames from before the change. A new look is a new option, never a changed default.

## Common mistakes

| Mistake | Instead |
|---|---|
| Talking heads on plain ground | A set list per place; at most 1 frame in 4 a face |
| A hard cut between every shot | A join from `references/joins.md`, with its reason |
| Aiming at the place, so a person sits just off-frame | Aim between the people, both within 10° of centre |
| "His anger burned" over a calm face | The anger face, on every angry beat |
| A thrown thing nobody sees | Four beats, twice as thick, a ghost trail, a side-on throw |
| A hider in plain view of the seeker | Cover between them for the whole run, shot over the hider's shoulder |
| An empty seat with someone standing in front of it | Low, across it, nothing on the line |
| Thin-finger hands | Mittens |
| A beardless grown man in a long robe (reads as a woman) | A beard, or a pharaoh's plait |
| A swing that flies through walls between far places, or a rise into empty sky and down again | A horizon approach or a map zoom that shows where the next place is, or a moving dissolve (`references/joins.md`) |
| Trusting a render that ran overnight | Check `df` and the output file's time: a full disk fails every frame write while the old file stays |
| Words on the ground | Words on a screen card |
| A prop that appears only when it matters | Introduce it early |
| A full render to find a framing fault | The contact sheet, every round |
| Animating before the owner has seen the shots | The shot board first, his picks, then animation |
| Posting because every check passed | Drafts; the owner's yes on the finished video |
| Showing a state where the story needs a change (a hot rail, not the gap closing) | The meaning sheet's change, seen happening |
| Copying a reference's pictures without its meaning | The meaning sheet first; the reference only for look and timing |
| A camera skimming close with a wide lens | Further back, a longer lens, a slow glide |
