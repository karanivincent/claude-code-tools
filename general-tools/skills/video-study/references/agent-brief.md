# The analysis agent's brief

Fill the `{…}` fields and send one copy to each part from `parts.json`. Opus, general-purpose, foreground.

---

You are analysing part {N} of {P} of a reference Short ({channel}, "{title}", {duration} s, {width}x{height}, {fps}
fps, {frames} frames) so we can learn how it is made and whether our own kit can make one like it. We make videos in
code (Remotion + Three.js): flat cartoon character cards in 3D places, in several looks chosen scene by scene.

Folder: {dir}
- ref.mp4 — the video
- sheets/NNN_T.TTs.jpg — every frame, 15 per sheet (half a second), labelled with frame number and time
- frames/fNNNN.jpg — every frame at 360x640 (fNNNN = frame N)
- full/sNNN.jpg — full-size frames, 2 a second (s001 = 0.0 s, sN = (N-1)/2 s)
- transcript.txt — narration with times (timing only; never quote it in your report)
- measures.json — measured pace, cuts, sharpness, fine edges, saturation, brightness, loudness

Our kit, to judge against (read these first): {skills}/toon-world/SKILL.md (looks scene by scene, the parts plan,
the game world, the look stack, people), {skills}/toon-world/templates/gameworld/README.md (what the working
game-world code already does), {skills}/toon-video/SKILL.md (story, meaning sheet, camera, acting, checks).

YOUR RANGE: sheets {s0} to {s1} ({t0} to {t1} s, frames {f0}–{f1}). Look at EVERY sheet in your range, every
frame, not a sample. Open full-size frames, or extract more with ffmpeg into analysis/p{N}-extra/, wherever detail
matters: faces, hands, feet, edges, textures, light, screen overlays. You may run Python ({python} has numpy, scipy,
PIL) to measure: frame differences for holds and cuts, whether characters move on ones or twos, camera versus
character motion, colour and brightness over time.

Report, with frame numbers as evidence:
1. Shot list: every shot with start and end frame, the place, who is in it, what the camera does, and how it joins
   the next (cut, dissolve, whip, match move, swoop, flash).
2. Meaning: for each beat, the one thing that changes, its cause, and how the shot shows it happening (or only
   shows a state). Note where they show a change clearly and where they skip it.
3. Colour and grade per place; how colour changes with time and mood.
4. Light: direction, shadows on people and ground, glow, how people sit in the light.
5. Background and effects: depth of field, haze, weather (rain, wet roads, drops on glass), particles, smoke, motion
   lines, shake, screen overlays (HUDs, recording frames, text on objects), on-screen words.
6. Camera: how often it moves, easing, speed, how still it ever is, its longest holds.
7. People: drawing style, outline, faces and expressions, mouth shapes and lip sync on spoken lines, blinks, hands,
   legs and walks, turns (angle drawings or flipped cards), clothes, how many at once.
8. Vehicles, machines and props that act: how they move, crash, deform; what is 3D.
9. Quality: sharpness, texture detail, any AI-picture look.
10. What is 3D, what is a flat picture or layer, what is a card: give the evidence (parallax or not).
11. **Our kit against it**: for each place and each effect in your range, the look we would use (picture room, game
    world, flat 2D place, drawn in code) and the source of each part (code, picture, image-to-3D, effect), and say
    whether our kit already does it (yes / partly / no) and what would be new work.
12. Hardest things to copy: the five hardest in your range, and why.

Write analysis/part{N}.md. Plain English, short sentences, measured not general. Work in the foreground only, no
background jobs, no browser, never post or upload anything, edit nothing outside the analysis folder. Final message:
the report path and a 10-line summary.
