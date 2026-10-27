---
name: clay-story-video
description: Use when making a Bible in Clay story video, the clay-toy Bible Shorts drawn in code with Three.js through Remotion in the bible-shorts project, voiced and scored on ElevenLabs and posted through Publer. Covers a new story, a part two, re-voicing or re-cutting a story, and putting one into Publer. Triggers - "the next Bible in Clay story", "make the David one", "clay story video", "Bible Short", "voice the story", "contact sheet", "Publer drafts for the story". For AI-generated video (Higgsfield), use ai-story-video instead.
---

# Clay story video

A Bible in Clay story is one video: the whole story, under three minutes, either as a 9:16 Short or
as a 16:9 video, never both and never a 55-second cut (Vincent, 26 October 2026). Two stories go out
a day, one in each form, and `docs/FORMAT-TEST.md` compares them. Everything is drawn in code, so pictures are free to redo; only
voices, music and effects spend ElevenLabs credits. The project holds the how. This skill holds the
order and the rules.

## First

1. Read `docs/MAKING-A-STORY.md` in `/Users/vince/Projects/bible-shorts`, all of it. Its rules win over
   this skill where they differ. Then the README for commands, and `TASKS.md`.
2. Another session may be live in the folder even when `git status` is clean: a recent commit, a
   linked session, or `remotion` in `ps` all mean one is. Never switch its branch. Work in a worktree
   off `main` (`git worktree add ../bible-shorts-<story> -b story/<story> main`, then `npm ci`, then
   `cp -R ../bible-shorts/node_modules/.remotion/chrome-headless-shell node_modules/.remotion/`, or the
   first sheet stalls downloading Chrome) and commit there. When the story ships, merge it into `main` and push: `origin` is the private GitHub
   backup. `TASKS.md` is gitignored, so the one to keep is the main folder's.
3. Read the ElevenLabs balance and write the number down (command under Cost).
4. Know the story's form before step 5. The session's brief names it; if not, read
   `docs/FORMAT-TEST.md`: the day's other story takes the other form.

The newest story in the same form is the pattern (on 27 October 2026: Moses or Jonah for a Short,
Jericho or the furnace for a 16:9 video; Jonah for anything that moves, like a ship). Copy its shape, not Abraham's:
words in `stories/<story>/`, code in `src/stories/<story>/`, sound in `public/<story>/`. Never
overwrite another story's files, and every earlier story must still render the same.

## The steps

1. **Passage and script.** Fetch the chapter from `https://ebible.org/engbsb/<BOOK><CH>.htm`
   (`JDG07.htm`, `1SA17.htm`) and copy quotes exactly. Check each quoted line is found word for word
   in the fetched page: strip the page's verse numbers and footnote marks, split each quote on its
   ellipses, and look for every piece (a few lines of script; a remembered wording fails it). Shape: frame 0 is a person facing the camera and the first line is a
   contradiction the story answers later, said within three seconds ("God told this man his army
   was too big"); then the story, one detail from the text most people miss (with its verse on a
   chip), a question to the viewer. Only exact BSB words go in quotation
   marks. Never invent an event; an imagined feeling is said as imagined. God and the angel of the
   LORD are a voice and a light, never a person. Write `stories/<story>/script.json` (voices, then
   lines of `id`, `who`, `text`, `say` with eleven_v3 tags, `gap`). No `cuts/short.json`: there is
   no 55-second cut. Count words as you write: about 2.6 a second with the pauses, so 400 words run
   about 2:35. Write for under three minutes; too big for that, make parts (Gideon's were
   about two minutes each), and open part two with a short recap.
2. **Voice it.** Add the story's npm scripts in the same shape as the last story's. Every one that
   calls an API passes both `--env-file`s, the channel's last. Reuse the cast's voices; a new
   character gets one from the account's library (`GET /v1/voices` is free), tried on one line first. Run `<story>:voice`.
   Check every line with whisper (below). On a miss, cut the
   line short and check again: that tells whisper's mistake from the voice's. Re-voice only the
   voice's mistakes, with `--redo <id>`. A delivery tag at the very start of a line can swallow
   its first word (Jonah's "[hushed] But…" gave "But" 15 ms): when whisper misses a first word, look
   at its time in `stories/<story>/align/<id>.json` and move the tag into the line. Read the timeline's `duration` now: it must stay under
   180 s, so cut lines here if it runs over (Elijah's first ran 182 s).
3. **Music in sections.** Settle the pauses first: widen the gaps where the picture needs a beat (a
   splash, a swallow, a landing) and run `<story>:voice` again (cached, no credits); a pause changed
   after the music shifts every later section and the music is made twice. Copy the last story's sound script to `scripts/<story>-sound.mjs`, and change
   every path in it: the sound and mix scripts name their story's folders and reused effects. Cut one
   section on each turn of the story (3–120 s each). Add a coda, since music fades
   early. Reuse effects from earlier stories before making new ones. After every generation, read
   the loudness in 2-second windows (below) and look for an early fade or a hole.
4. **Cast.** One `Character` per person in `src/cast/characters.ts`, with an entry per age and a
   verse comment on each. Keep a person's signature colours the same at every age. A person who is
   already there gets a new age, not a new character. Add the new people to `src/cast/CastSheet.tsx`,
   run `npm run cast`, then look at the sheet.
5. **Shots.** Build world, places, props and `shots.ts` (every shot timed on the voice with `L`, `W`
   and `before`; `FULL_EDIT` only) and the composition. Register one composition in `src/Root.tsx`,
   in the story's form: 1080x1920 with the portrait captions for a Short, 1920x1080 with the `wide`
   captions for a video. Add the story to the `COMP` map in `scripts/contact-sheet.mjs`. Look at
   the contact sheet after every round of changes,
   and re-sheet only what changed (`--only`). A new world takes three or four rounds; the usual
   first-sheet faults are a prop on the line from the camera to a face (a mast, a ladder, a pillar), a
   camera inside a prop or among the dressing, a person standing in a light beam and washed white, and
   a crowd member at the lens. People aboard anything that moves stand on a group parented to it, and
   its cameras take points in its frame, so nobody slides. Frame close-ups with a camera that reads
   where its person was placed this frame (`front(who, dist, yaw, pitch)` in
   `src/stories/furnace/shots.ts`), so a face stays framed as people walk, sit or turn. Where the
   words state a count ("the king saw four"), sheet that shot's first and last frames too
   (`--at 0.1`, `--at 0.9`): people walking abreast, seen from the side, hide each other, and the
   furnace's door shots showed two of four until they walked in single file. Touched shared code (`src/clay/`, `src/story/`,
   `src/cast/`)? Render frames of earlier stories and compare them byte for byte with frames from
   before the change (the softer face became the rig's default on 26 October 2026, so compare
   against renders made after that). Keep every scene bright, night included: torches and moonlight,
   faces lit.
   **Wear the simple look** (Vincent's choice, 26 October 2026): in the composition's Scene, load
   the sky with `useLoader(HDRLoader, staticFile(SKY_FILE))` and pass the built world through
   `simpleLook` from `src/story/look.ts` (handmade clay, sky light, pebbles and grass, clay clouds;
   the soft face comes from the rig). Its `clear` must cover everywhere people stand, kneel or walk;
   `wet` is water. Night: `clouds: false`. The motion stays as simple as the story's poses make it:
   no skeleton rig, 60 fps or motion blur (tried and rejected: the motion read worse and 10 s took
   7 minutes).
   **Colour.** Vincent is testing a vivid grade (27 October 2026, chosen for Jonah and the furnace):
   `THREE.NeutralToneMapping` in place of R3F's ACES, and a CSS `saturate(1.2)` on the 3D canvas only,
   never the captions, in the story's own composition (`VIVID` in `src/stories/jonah/JonahStory.tsx`),
   so no earlier story moves. Use the look the brief names. A change of look goes to Vincent as the
   same frames side by side (`node scripts/look-compare.mjs`) before the full render, and no final
   render is queued while that question is open. Either look keeps the opening at 120 or more.
6. **Mix.** Copy the last story's mix script: voices on top, music ducked under speech, effects on
   their words, `loudnorm` to −14 LUFS. Check the result reads about −14 (below). The render embeds
   the mix, so mix before the final render, or re-mux after a new mix.
7. **Render the one video.** Only the story's form: rendering the other one costs time for a video
   that never goes out. Run `node scripts/brightness.mjs <file>`: exit 3 means relight and
   re-render, not ship. For a 16:9 video: Three.js `fov` is vertical, so it keeps the portrait
   framing in its centre column and adds picture at the sides. Everything that matters stays in that
   column; check the sides on the landscape contact sheet before rendering. Another session's render
   running: queue yours behind it (`while pgrep -f "node_modules/.bin/[r]emotion render" …`), one at a
   time, concurrency 2. Then `ffprobe` the file
   for its size, 30 fps, a duration under 3:00 and an audio stream, and look at frames from the
   start, the middle and the last second, and at every shot whose words state a count. A fault in a few shots after the full render: render only
   their frames (`--frames=<a>-<b> --muted`) and lay them over the video while re-encoding it, as the
   furnace did (`docs/MAKING-A-STORY.md`, The pipeline), not a second full render.
   A 16:9 video gets its thumbnail and title from the `clay-thumbnails` skill: ten ideas, three
   critics, a shortlist for Vincent, then YouTube's A/B test. Leave time for it before the yes.
8. **Ready and drafts.** Write `stories/<story>/upload.json` (title, description ending with the
   references and "Berean Standard Bible (public domain). Animated in code; voices are AI.", a title
   that names God or the person, pinned
   comment, `format` short or video, when): one entry, the story's form. Run `<story>:ready`, then `<story>:drafts`. That makes
   Publer drafts only, on Bible in Clay, logged in `stories/<story>/publer.json`.

## Stop: Vincent's yes

Send Vincent the video with `SendUserFile`, the draft id and the cost. Send a phone copy of any
file over 30 MB, kept in `out/<story>/` (`ffmpeg -i <in>.mp4 -vf scale=720:1280 -c:v libx264 -b:v 1150k
-maxrate 1500k -bufsize 3000k -preset slow -c:a aac -b:a 128k -movflags +faststart <in>-phone.mp4`:
about 25 MB for 2:40; `-crf 22` at full size made 57 MB, too big for his phone). The Publer drafts also play on his phone. Then stop. Schedule only on his explicit yes, given after he has seen these exact videos. A yes given
before they existed ("get it up at 8, don't wait on me") does not cover them, and neither does every
check passing: the checks are yours, the yes is his. A missed slot costs a day. Make the drafts, send
them, and end with one question naming the exact time ("David's Short at 08:00 on 27 October,
Nairobi time?"). The test keeps the same two times every day, one for the Short and one for the
video; use the times in `docs/FORMAT-TEST.md`'s last rows unless he names others. Shorts go out at least three hours apart, as many a day as are
ready; a part two waits until part one's first test is over (about four hours). On his yes, run `publer-schedule.mjs --story <story> --only <file>
--at <iso with +03:00>`. Without `--only` it puts every draft in the same minute, and
it refuses a time under two minutes away. Check the other stories' `publer.json` files first so no
two Shorts on the channel fall within three hours of each other and no two posts within a minute.
His yes can come in the story's own session (Jonah's did, after the phone copy): schedule there, write
the time into `publer.json` and `upload.json`'s `when`, and the session's report tells the coordinating
session. A Publer or ElevenLabs call that fails with `fetch failed` (`ETIMEDOUT`) while curl gets
through is Node's 250 ms connect window: the Publer scripts set 3 s since 27 October 2026; elsewhere
run node with `--network-family-autoselection-attempt-timeout=3000`. A failed connect writes nothing:
check `publer.json` still says draft, then run it again. Never publish now. The YouTube Studio steps (playlist, pinned
comment, related video, end screen) are his: list them as `@me` in `TASKS.md`.

## Cost

Read the balance before the first credit is spent and after the last. Report the difference, and
what it is out of the month's 600,000 (Pro since 25 October 2026, no overage). TeliTask's daily videos draw on the same
account, so a long session's difference can include theirs; ElevenLabs' usage page splits it by key.
Another session on the same key in the same hour (parallel stories): read
`/v1/usage/character-stats?start_unix=…&end_unix=…&breakdown_type=product_type` (and `voice`), in hour
buckets, and split what each session sent: voices by characters at a rate read from a voice only yours
used (about 0.48 a character), music by seconds (about 15 a second), effects by seconds. Report your
share and the hour's total. The scripts cache each request by hash, so a rerun spends nothing unless something changed. Never
delete the caches to "start clean".

Render time counts too: Vincent wants a video cheap to make. The simple look makes a render about
half again as long (10 s of video in 22 s against 15); anything heavier needs his say first.

```bash
node --env-file=$HOME/.config/telitask-marketing/secrets.env --env-file=$HOME/.config/udongo-studios/secrets.env --input-type=module -e 'const r = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY } }); const j = await r.json(); console.log(`${j.character_count} of ${j.character_limit} used`)'
```

## Keys

The channel's ElevenLabs key is in `~/.config/udongo-studios/secrets.env`. Publer's key is in
`~/.config/telitask-marketing/secrets.env`. Never print a key: never `cat`, `grep` or `source` those
files, never echo `process.env` or run `env`. Hand both files to node with `--env-file`, the channel's
last, so its ElevenLabs key wins.

## Checks

```bash
# one line through whisper (punctuation and the spelling of a name are not misses)
ffmpeg -y -v error -i public/<story>/lines/<id>.mp3 -ar 16000 -ac 1 /tmp/<id>.wav
whisper-cli -m ~/.cache/telitask-x/whisper/ggml-large-v3-turbo-q5_0.bin -f /tmp/<id>.wav -nt -np
# music loudness every 2 s (dB): look for a fade before the end or a hole mid-section
ffmpeg -v error -i <music>.mp3 -af "aresample=48000,asetnsamples=n=96000,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-" -f null - | grep -o "RMS_level=[-0-9.inf]*"
# the mix's integrated loudness: the first I: line should read about -14 LUFS
ffmpeg -v info -nostats -i public/<story>/<cut>/mix.wav -af ebur128=framelog=quiet -f null - 2>&1 | grep -m1 " I:"
```

## At the end

Once it is live, add its row to `docs/FORMAT-TEST.md` (day, story, form, time, link), and fill the
48-hour columns from Studio when they come due. Add what this story taught to
`docs/MAKING-A-STORY.md`, newest at the top of each section: the cast
and voice ids, what broke and the fix, and the story's cost in credits. Add the story's section to
the README, tick the main folder's `TASKS.md`, and commit on the story branch. If what Vincent
actually scheduled differs from the `when` notes or the doc's Publishing section, fix those too.

## Common mistakes

| Mistake | Instead |
|---|---|
| Scheduling because he said "put it up" before seeing it | Drafts, send the videos, wait for his yes |
| "Every check passed, so it can go out while he travels" | Still drafts; the checks do not stand in for him |
| Building shots on lines whisper never heard | Whisper every line first; shots time themselves to the voice |
| Rendering the full video to find a framing fault | The contact sheet, after every round |
| A shared-code change that moves an earlier story | Byte-compare its frames before and after |
| Something important at the edge of the 16:9 frame | Keep it in the centre column |
| Music that dies 4–8 s before the end | A coda in the plan, and the 2-second loudness check |
| A cost reported as "small" | The two balance readings and their difference |
| Opening on someone's back | A face toward the camera on frame 0 |
| A night scene that looks right on a laptop | `brightness.mjs`: it is too dark on a phone |
| A story without the simple look | `simpleLook` in the Scene, from the first contact sheet |
| Shrubs and pebbles under the people | `clear` covers everywhere people stand, kneel or walk |
| Making the motion fancier (skeleton rig, 60 fps, motion blur) | Keep the simple motion; improve the look |
| Judging motion from still frames | Watch it, or measure it (feet sliding, frame to frame) |
| Two Shorts posted minutes apart | Three hours apart, so each gets its own test |
| A 55-second cut, or the same story as a Short and a video | The whole story, once, in one form |
| A full story over 3:00 | Count the timeline after voicing; cut lines then, or make parts |
| Rendering both forms "to have them" | Render only the story's form |
| A count in the words that the picture does not show | Sheet the shot's first and last frames; walk them in single file across the view |
| Queuing the final render while a look question is open | Side-by-side to Vincent, his pick, then render |
| A second full render to fix two shots | Render those frames and patch them in |
| A phone copy at full size (57 MB) | 720x1280 at 1150 kb/s, about 25 MB |
| Running a failed schedule again without looking | Check `publer.json` says draft; a failed connect wrote nothing |
| Changing a pause after the music is made | Settle every pause before the first music request |
