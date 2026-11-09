# Observe a video shot by shot: the form

You fill a form, you do not review. Write down what is on the frames, so that later anyone can search many videos for a
pattern without watching them again. No opinions: never "good", "clever", "works", "effective", "nice", "should",
"we" or "our". If a frame does not settle something, write null.

## Inputs (the coordinator fills these)

- Video: {name} ({id}), {duration} s, {fps} fps.
- Study folder: {study} (prepared by `prepare.py` and `survey_sheets.py`):
  - `survey/NNN_SS.SSs.jpg`: every frame, 60 to a sheet (two seconds), labelled with frame numbers.
  - `full/`: full-size frames twice a second, for reading words and faces.
  - `transcript.txt`: the narration with times.
  - `observe/seconds.jsonl`: measured numbers per second (brightness, colours, motion, cuts). Use its `cuts` and
    `changes` times to find where shots start and end.
- Write: {study}/observe/shots.json. Check it with
  `python3 <video-study>/scripts/check_shots.py {study}/observe/shots.json {duration}` until it prints `ok`.

Join sheets in pairs at half size before you look (`ffmpeg -i a.jpg -i b.jpg -filter_complex
"[0][1]hstack,scale=iw/2:-1" pair.jpg`, into /private/tmp, never into the study folder). Opening every sheet and frame
one by one runs into the image limit. Look at every sheet; open single full frames only to read words or faces.

## What a shot is

A stretch where one camera films one continuous piece of action. A new shot starts at a cut, at the middle of a
dissolve or wipe, or where the camera arrives at a new place by a whip. A long camera journey through one place is
one shot, even when it passes several things; list what it passes in `passes`.

## The form

```json
{
  "video": "pink prison",
  "id": "HxqtHI62otM",
  "duration": 65.3,
  "shots": [
    {
      "n": 1,
      "start": 0.0,
      "end": 3.6,
      "place": "prison cell",
      "inside": true,
      "time_of_day": "day",
      "camera": {
        "lens": "wide",
        "height": "eye",
        "looks": "level",
        "moves": ["track"],
        "speed": "slow",
        "follows": null,
        "passes": []
      },
      "join_out": { "kind": "moving dissolve", "frames": 8, "via": null },
      "people": [
        { "who": "prisoner", "count": 1, "pose": "standing", "facing": "camera", "expression": "neutral", "action": "watches the stripe" }
      ],
      "animals": [],
      "objects": ["caged lamp", "cell bars", "pink paint stripe"],
      "words_on_screen": [{ "text": "C-4", "on": "door plate", "when": 2.1 }],
      "light": { "key": "left", "source": "window", "light_colour": "warm", "shadow_colour": "teal" },
      "effects": ["god rays"],
      "sound": [],
      "spoken": "They painted the jail cell pink, and not just any pink.",
      "change": "a pink stripe grows across the grey wall",
      "frames": ["f0012", "f0090"]
    }
  ]
}
```

Fields:

| Field | Values |
|---|---|
| `start`, `end` | seconds, two decimals; shots touch end to start and cover 0 to the duration |
| `place` | a few plain words; the same words every time the video returns there |
| `time_of_day` | `day`, `dawn`, `dusk`, `night`, `none` (no sky or clock, or abstract) |
| `camera.lens` | `extreme wide`, `wide`, `medium`, `close`, `extreme close` |
| `camera.height` | `ground`, `low`, `eye`, `high`, `overhead` |
| `camera.looks` | `up`, `level`, `down`, `straight down` |
| `camera.moves` | any of `still`, `push`, `pull`, `pan`, `tilt`, `orbit`, `track`, `crane up`, `crane down`, `follow`, `zoom`, `shake`, `roll` |
| `camera.speed` | `still`, `slow`, `medium`, `fast` |
| `camera.follows` | what the camera stays on while it moves, or null |
| `join_out.kind` | one of the names below; `via` names the thing that makes the join (the door, the smoke, the pupil) |
| `people[].pose` | `standing`, `walking`, `running`, `sitting`, `lying`, `crouching`, `carrying`, `climbing`, `falling`, `other: <word>` |
| `people[].facing` | `camera`, `three-quarter`, `side`, `away` |
| `people[].expression` | `neutral`, `smile`, `laugh`, `angry`, `afraid`, `surprised`, `sad`, `disgusted`, `thinking`, `smug`, `tired`, `pain`, `other: <word>`, or null when no face shows |
| `words_on_screen` | every readable word, with the thing it is written on (a sign, a screen, a caption bar) and the second it shows |
| `light.key` | where the main light comes from in the frame: `left`, `right`, `front`, `back`, `top`, `none` |
| `light.light_colour`, `light.shadow_colour` | a plain colour word (`warm`, `cool`, `neutral`, `teal`, `pink` ...) |
| `effects` | smoke, fire, sparks, god rays, rain, dust, flash, motion lines, glow, shards ... |
| `sound` | sounds you can infer from the picture's events with their second (a slam, a crash); leave empty when unsure |
| `spoken` | the narration during the shot, from the transcript |
| `change` | what changes during the shot, as a fact; null when nothing does |
| `frames` | two or three frame labels where the shot can be checked |
| `unsure` | optional: the fields read with doubt in this shot, e.g. `["start", "people"]` (a possible hidden cut, faces too small to read). Recording doubt keeps the data honest; never guess to fill it |

Join kinds (use these exact names; add `other: <name>` only when none fits):
`hard cut`, `moving dissolve`, `shape-matched dissolve`, `horizon approach`, `map zoom`, `crane to an aerial and dive`,
`into a screen, lens, eye, mirror, icon or page`, `through a door, window, porthole or gap`, `follow what travels`,
`smoke, flash, light wash or iris`, `shrinks into an object or freezes into a photo`, `near object crosses the lens`,
`whip pan`, `world-made wipe`, `split screen`, `loop to frame 0`, `none` (the last shot, when it does not loop).

Work in the foreground, write only `observe/shots.json`, never post anything. Final message: the path, the number of
shots, and any stretch you could not settle.
