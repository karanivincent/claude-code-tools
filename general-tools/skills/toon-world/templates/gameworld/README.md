# The game-world kit

A complete working example of the game-world look (`SKILL.md` section 1b): the railroads practice, 15.7 s, from the
bible-shorts branch `practice/railroads-gameworld` at commit 5807caa (round 4, critic score 3.0 of 5 after round 3; 1.8 on the old 0–3 scale).
Copy the folder into a story, rename, and replace what is story-specific. Never import from the skill folder.

| File | What it holds | Reuse |
|---|---|---|
| `shots.ts` | Camera keys per place (`K(frame, position, look-at, fov)`), eased splines, moving dissolves, the helpers every file imports (`hash`, `prog`, `smooth`, `clamp`, `lerp`, `curve`) | The helpers as they are; the keys are the story's |
| `places.ts` | Each place in code: faceted terrain, canyon walls with painted strata and cracks, deck, arch bridge, gorge, platform, sky and clouds, far mesas, haze, sun; textures painted on canvases at 2048 with mipmaps and anisotropy | The painters (wood, rock, ballast, strata) and the pattern; the places are the story's |
| `track.ts` | Rails with a real profile, tie plates, spikes, bolted joints, sleepers and ballast as instanced meshes along a curve; the S-bend snap (`sBend`, `SNAP_F`) | Any track, fence or row of repeated parts that must bend |
| `mechanics.ts` | Changes shown happening: rails pushing at a joint, a bow, spikes drawn up, sleepers shoved, a gap closing with a coin popping out | The pattern for any "show the change" beat |
| `train.ts` | A locomotive and cars built in code (brass, rivets, spoked wheels with rods) that ride a curve, follow a bend and fall as a hinged chain | Any vehicle on a path |
| `fx.ts` | The effects kit: heat ramp material in travelling hard bands, sparks, flying spikes, heat wisps, god rays, dust, and the raymarched `Volume` for smoke, fireball and mushroom cloud | Directly |
| `people.ts` | Flat bean-head cards with flat white unlit faces, card-shaped shadows, front, three-quarter and side drawings, blinks on ones, a startle, a walk, a 3D hat that flies off | The rig; the cast is the story's |
| `grade.ts` | The per-place grade: an S-curve, deep violet shadows, almost no black lift, a light contrast-limited sharpen | Directly, with new per-place values |
| `worlds.ts` | Wires each place to its track, train, effects and people, with per-place bloom and effect timing; the only file that imports the others together | The pattern |
| `PracticeRailroads.tsx` | The Remotion composition: one canvas per place layered for dissolves, the post stack, captions, audio | The pattern; it imports the project's `story/StoryCaptions` and `story/timeline` and a `full.json` of word timings |

Gotchas found building it:
- Leave `glslVersion` unset on the volume's `ShaderMaterial`; `THREE.GLSL3` makes it draw nothing, silently.
- Motion blur (`@remotion/motion-blur` at the exact Remotion version) on the camera only and the fastest move only;
  on cards it doubles arms. 10 samples timed out a frame in a heavy place; 6 is enough.
- A hot rail that also reflects the sky turns into a white smear; switch the reflection off while it glows.
- Keep the camera at least 1.5 ball radii outside a fireball volume; from inside it reads as a flat face.
- Render at concurrency 2 when other agents render too. Most frames take 0.25 to 1.2 s.
