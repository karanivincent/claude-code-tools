---
name: clay-story-video
description: Use when making a Bible in Clay story video, the clay-toy Bible Shorts drawn in code with Three.js through Remotion in the bible-shorts project, voiced and scored on ElevenLabs and posted through Publer. Covers a new story, a part two, re-voicing or re-cutting a story, and putting one into Publer. Triggers - "the next Bible in Clay story", "make the David one", "clay story video", "Bible Short", "voice the story", "contact sheet", "Publer drafts for the story". For AI-generated video (Higgsfield), use ai-story-video instead.
---

# Clay story video

A Bible in Clay story is two videos cut from one set of recorded lines: a 9:16 Short of about
55 seconds and a 16:9 long video. Everything is drawn in code, so pictures are free to redo; only
voices, music and effects spend ElevenLabs credits. The project holds the how. This skill holds the
order and the rules.

## First

1. Read `docs/MAKING-A-STORY.md` in `/Users/vince/Projects/bible-shorts`, all of it. Its rules win over
   this skill where they differ. Then the README for commands, and `TASKS.md`.
2. Another session may be live in the folder even when `git status` is clean: a recent commit, a
   linked session, or `remotion` in `ps` all mean one is. Never switch its branch. Work in a worktree
   off the newest story branch (`git worktree add ../bible-shorts-<story> -b story/<story>
   <newest>`, then `npm ci`). There is no remote; commit there. `TASKS.md` is gitignored, so the one
   to keep is the main folder's.
3. Read the ElevenLabs balance and write the number down (command under Cost).

The newest story is the pattern (`gideon-battle` when this was written). Copy its shape, not Abraham's:
words in `stories/<story>/`, code in `src/stories/<story>/`, sound in `public/<story>/`. Never
overwrite another story's files, and every earlier story must still render the same.

## The steps

1. **Passage and script.** Fetch the chapter from `https://ebible.org/engbsb/<BOOK><CH>.htm`
   (`JDG07.htm`, `1SA17.htm`) and copy quotes exactly. Check each quoted line is found word for word
   in the fetched page. Shape: a hook on frame 0, the story, one detail from the text most people
   miss (with its verse on a chip), a question to the viewer. Only exact BSB words go in quotation
   marks. Never invent an event; an imagined feeling is said as imagined. God and the angel of the
   LORD are a voice and a light, never a person. Write `stories/<story>/script.json` (voices, then
   lines of `id`, `who`, `text`, `say` with eleven_v3 tags, `gap`) and `cuts/short.json` (line ids and
   their own gaps). Too big for one video: make parts (Gideon's were about two minutes each), and
   open part two with a short recap.
2. **Voice it.** Add the story's npm scripts in the same shape as the last story's. Every one that
   calls an API passes both `--env-file`s, the channel's last. Reuse the cast's voices; a new
   character gets one from the account's library (`GET /v1/voices` is free), tried on one line first. Run `<story>:voice`, then
   `<story>:short:layout` (no credits). Check every line with whisper (below). On a miss, cut the
   line short and check again: that tells whisper's mistake from the voice's. Re-voice only the
   voice's mistakes, with `--redo <id>`. The Short's timeline `duration` should be 50–58 s.
3. **Music in sections.** Copy the last story's sound script to `scripts/<story>-sound.mjs`, and change
   every path in it: the sound and mix scripts name their story's folders and reused effects. Cut one
   section on each turn of the story (3–120 s each), for both cuts. Add a coda, since music fades
   early. Reuse effects from earlier stories before making new ones. After every generation, read
   the loudness in 2-second windows (below) and look for an early fade or a hole.
4. **Cast.** One `Character` per person in `src/cast/characters.ts`, with an entry per age and a
   verse comment on each. Keep a person's signature colours the same at every age. A person who is
   already there gets a new age, not a new character. Add the new people to `src/cast/CastSheet.tsx`,
   run `npm run cast`, then look at the sheet.
5. **Shots.** Build world, places, props and `shots.ts` (every shot timed on the voice with `L`, `W`
   and `before`; `FULL_EDIT` and `SHORT_EDIT`) and the composition. Register two compositions in
   `src/Root.tsx`: full at 1920x1080 and short at 1080x1920. Add the story to the `COMP` map in
   `scripts/contact-sheet.mjs`. Look at the contact sheet for both cuts after every round of changes,
   and re-sheet only what changed (`--only`). Touched shared code (`src/clay/`, `src/story/`,
   `src/cast/`)? Render frames of earlier stories and compare them byte for byte with frames from
   before the change.
6. **Mix.** Copy the last story's mix script: voices on top, music ducked under speech, effects on
   their words, `loudnorm` to −14 LUFS. Check the result reads about −14 (below). The render embeds
   the mix, so mix before the final render, or re-mux after a new mix.
7. **Render both.** The Short is about 55 s. Three.js `fov` is vertical, so the 16:9 video keeps the
   Short's framing in its centre column and adds picture at the sides. Everything that matters
   stays in that column. Check the sides on the landscape contact sheet before rendering. Render the
   full video last. Then `ffprobe` each file for its size, 30 fps, duration and an audio stream, and
   look at frames from the start, the middle and the last second.
8. **Ready and drafts.** Write `stories/<story>/upload.json` (title, description ending with the
   references and "Berean Standard Bible (public domain). Animated in code; voices are AI.", pinned
   comment, `format` short or video, when). Run `<story>:ready`, then `<story>:drafts`. That makes
   Publer drafts only, on Bible in Clay, logged in `stories/<story>/publer.json`.

## Stop: Vincent's yes

Send Vincent both videos with `SendUserFile`, the draft ids and the cost. Send a phone copy of any
file over 30 MB (`ffmpeg -i <in>.mp4 -c:v libx264 -crf 22 -c:a aac -b:a 128k -movflags +faststart
<in>-phone.mp4`, kept in `out/<story>/`). The Publer drafts also play on his phone. Then stop. Schedule only on his explicit yes, given after he has seen these exact videos. A yes given
before they existed ("get it up at 8, don't wait on me") does not cover them, and neither does every
check passing: the checks are yours, the yes is his. A missed slot costs a day. Make the drafts, send
them, and end with one question naming the exact times ("Short at 08:00 and the full video at 08:01
on 26 October, Nairobi time?"). On his yes, run `publer-schedule.mjs --story <story> --only <file>
--at <iso with +03:00>` once per video. Without `--only` it puts every draft in the same minute, and
it refuses a time under two minutes away. Check the other stories' `publer.json` files first so no
two posts on the channel fall within a minute of each other. Never publish now. The YouTube Studio steps (playlist, pinned
comment, related video, end screen) are his: list them as `@me` in `TASKS.md`.

## Cost

Read the balance before the first credit is spent and after the last. Report the difference, and
what it is out of the month's 40,000 (Starter, no overage). TeliTask's daily videos draw on the same
account, so a long session's difference can include theirs; ElevenLabs' usage page splits it by key.
The scripts cache each request by hash, so a rerun spends nothing unless something changed. Never
delete the caches to "start clean".

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

Add what this story taught to `docs/MAKING-A-STORY.md`, newest at the top of each section: the cast
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
