# Channel survey: one video, one agent

You are studying one Short ("{title}" from {channel}, {views} views, id {id}) as part of a survey of that channel's best
recent Shorts. The goal is NOT to rebuild it. We make our own original videos in code (Remotion + Three.js): flat cartoon
character cards in places built in one of four looks, chosen scene by scene. We are learning how he makes videos that
reach millions, so that for any story of ours it is obvious which way to build each part, and what we still lack.

Folder: {study}/{id}
- survey/NNN_T.TTs.jpg: every frame, 60 per sheet (2 seconds, 10 x 6), each labelled with frame number and time.
  Your main view. Look at EVERY survey sheet, in order. No sampling. One conversation can hold only so many images:
  join pairs of sheets at half size in {id}/analysis/scratch/ first, so every sheet fits, and keep full frames for detail.
- full/sNNN.jpg: full-size frames, 2 a second (sN = (N-1)/2 s). Open them wherever detail matters: faces, hands,
  textures, edges, light, text on things, whether a place is 3D or a flat picture. Open at least 20.
- frames/fNNNN.jpg: every frame at 360x640, for checking motion between two frames.
- transcript.txt: the narration with times (for timing and story only; never quote it in your report, retell it).
- measures.json: measured pace, hard cuts, stillness, sharpness, fine edges, saturation, brightness, loudness.
- glance.jpg: one picture of the whole video.
You may run Python ({python} has numpy, scipy, PIL) to measure things.

Our kit, read these first (skills folder {skills}):
- toon-world/SKILL.md: the four looks ("Looks, scene by scene": picture room, game world, flat 2D place, drawn in
  code), the parts plan, the game world, people.
- toon-world/templates/gameworld/README.md: what our working game-world code already does.
- toon-video/SKILL.md: story, meaning sheet, camera, acting, the backbone and the dynamics profile, checks.
- toon-video/references/playbook.md: techniques already learned from his railroads and dashcam Shorts.

Write analysis/survey.md, about 1,500 to 2,500 words, plain English, short sentences, frame numbers as evidence:

1. **In one line**: what the video is about and its hook (retold in your words).
2. **Story spine**: the opening line's idea, the question it plants, each beat with its time range and the one thing
   that changes in it, the twist or payoff, how it ends (loop back to the start or not). Name the story shape (a true
   mechanism explained, an experiment, a "levels of" ladder, an "X versus Y", a what-if, a con or trick revealed,
   another). Why would people watch to the end and share it?
3. **Scenes**: a table, one row per place or scene: time range, place, how HE made it (real 3D with parallax, flat
   picture or painted layer, cards, a diagram, stock-like footage; give the evidence), and the look WE would use for
   something like it (picture room, game world, flat 2D place, drawn in code) with the source of each part (code,
   AI picture, image-to-3D, effect volume, free model).
4. **Look and light**: palette per scene, how colour or grade changes with the story, light direction and shadows,
   glow, haze, depth of field. Compare measures.json with ours (the channel medians in the latest `lessons.md`, or our own last
   video's `measure_sharp.py` numbers).
5. **Camera and joins**: how much it moves, the longest holds, cuts versus dissolves versus swoops, any join idea
   worth stealing.
6. **People**: how many, faces and expressions, angles drawn (front, side, back, three-quarter), poses, hands, walks,
   lip sync, clothes or costume detail, crowds. Which drawings we would need that `people.ts` does not have.
7. **Things that act and effects**: machines, vehicles, animals, objects that move, break or transform; particles,
   fire, water, smoke, motion lines, text on screen or on objects; diagrams or charts, if any.
8. **Sound**: narration pace (words a minute from the transcript), music feel, sound effects you can infer from the
   picture.
9. **Could we make one like it now?** A verdict (yes / mostly / partly / no), then what is missing, each item in one
   of these kinds: story, plot, detail, colour, people, effects, camera, sound, assets. Give each item a size (small:
   under a day; medium: a few days; large: a new system) and say whether our kit has it (built), knows how (blueprint
   in the playbook) or not at all.
10. **Techniques worth learning**: each technique in this video that would lift any story of ours, with why it works,
    a short blueprint of how we would build it, and whether the playbook already has it (new or already there).
11. **Three lessons**: the three things from this video that matter most for our own videos.

Work in the foreground only, no background jobs, no browser, never post or upload anything, write nothing outside
{id}/analysis/. Final message: the report path and a 10-line summary, the last line being the verdict.
