# Voice and sound

The narrator and voicing at stage 1; music and the mix at stage 3. Rule ids point into `rules.md`. Scripts named
`<toon-video>/scripts/...` run from the plugin cache (SKILL.md, "Where the scripts are").

## Contents

- [The narrator](#the-narrator)
- [Picking another narrator by pitch](#picking-another-narrator-by-pitch)
- [Voicing and cutting lines](#voicing-and-cutting-lines)
- [The order of the sound](#the-order-of-the-sound)
- [Music](#music)
- [The mix: voice over the bed](#the-mix-voice-over-the-bed)
- [The bed hold, in numbers](#the-bed-hold-in-numbers)
- [Effects and loudness](#effects-and-loudness)

## The narrator

Laura by default: ElevenLabs `FGY2WhTYpPnrIDTdsKH5`, eleven_v3, stability 0.3, played at about 1.2x with `atempo`
(S1-9). Another voice comes in when the story needs it, picked by pitch and shown to the owner (S1-10).

## Picking another narrator by pitch

"Higher, excited, still a normal person" is a pitch band, not a search word.

1. Search the voice library by energy and use case.
2. Voice the same opening lines (about 30 words, the hook included) with each candidate at the same settings and tempo.
3. Run `node <toon-video>/scripts/pitch.mjs takes/*.mp3 --band <lo>-<hi>` and show the owner the takes ordered with
   their numbers (S1-10). A take liked for its voice but sitting low can be lifted with a formant-preserving shift:
   ffmpeg `rubberband=pitch=1.26:formant=preserved` (four semitones); offer it beside the voices already in the band.
4. Before choosing a slower voice, work out each finalist's length for the whole script at the tempo cap (the fastest
   `atempo` its lines stay clear at) against the form (S1-11).
5. Record the pick in `stories/<slug>/voices.md`: voice, id, settings, pitch, how many were tried, why (S1-12).

A new narrator re-runs the mix check: a quieter or more dynamic voice changes each line's margin over the same bed
(S4-4).

## Voicing and cutting lines

- One voice per speaker, eleven_v3 tags, each line cached by a hash of its text and voice (S1-13). Lines reused from an
  earlier version copy their mp3 and align files and cost nothing (S1-14).
- Cut each line from at least 0.10 s before the alignment's first letter and about 0.12 s after its last: the
  alignment marks a plosive's vowel, not its burst (S1-15).
- Check the cut lines with whisper, not the raw take (S1-16).
- No `[whispers]` or `[hushed]` tags; mark a reveal with a pause before it and a slower, lower read in full voice
  (S1-17). If a quiet line is kept, level it with a gain clamp wide enough (up to +16 dB).
- Read the total voice length now and cut lines here, not after the music (S1-18).

## The order of the sound

Settle each pause first, then music in sections with a coda, then the mix (S3-152). The template's
`scripts/<slug>-sound.mjs` follows this order; the narrator folder comes from `story.ts` (S3-160).

## Music

- Sections of 3 s or longer: ElevenLabs refuses shorter ones (HTTP 422). Merge a short beat into its neighbour and
  mark the change with an effect (S3-153).
- Sections cut at the story's turns from word times.
- Music and effect requests are cached by their prompt (S3-165).
- The music stays audible: no more than 20 dB under the voice, aiming at 15 to 20 dB (S3-158).
- No silent tail: the film ends 0.5 s after the last word, or the music runs to the end (S3-159).

## The mix: voice over the bed

The mix writes two stems on the film's clock before the final loudness gain (S3-154): `voice.wav` (the voice as it
goes into the mix) and `bed.wav` (music, ambience and effects as they sit under the voice after the hold). Then run:

```
node <toon-video>/scripts/levels.mjs out/<slug>/voice.wav out/<slug>/bed.wav src/stories/<slug>/full.json
```

Under each spoken line the bed's loudest 400 ms stays at least 10 dB below the line, the last 30 s included (S3-157).
Exit 3 names each line that falls short. The gate runs it (S4-4); run it again yourself when the narrator, the music or
an effect's level changes.

- Ambience made of voices (a crowd murmur, a room of chatter) goes on the bed and is held with it, its speech band cut
  about 10 dB: ffmpeg `equalizer=f=950:t=o:w=3.3:g=-10` (S3-161).
- Action sounds the story turns on (gunshots, a scream) go on top, not under the voice (S3-162), with their times read
  from the place files that animate them (S3-145).

## The bed hold, in numbers

Hold the whole bed down for each run of words; a compressor alone reacts after a hit starts (S3-155, S3-156).

| Setting | Value |
|---|---|
| Words joined into a run | gap under 0.25 s |
| Bed gain in a run | 0.2 (-14 dB), from 0.15 s before the run to 0.12 s after |
| Bed gain in a pause under 0.9 s | 0.4 (-8 dB) |
| Bed gain in a longer pause | full |
| Smoothing | 0.16 s |
| Gain track | 1 kHz raw 32-bit floats, read with `-f f32le -ar 1000 -ac 1 -i gain.f32`, resampled, `amultiply`d into the bed |
| Then | `sidechaincompress` keyed on the voice: threshold 0.02, ratio 6, attack 15 ms, release 150 ms |

Runs, not whole lines: a fast read has many short pauses, and a bed held through them reads as holes. A hold per line
also passes when the read is slower.

## Effects and loudness

- Effects land on their words. Level each to a loudness (LUFS of the file alone), not a raw gain (S3-163).
- Limiter, then two-pass `loudnorm` to about -14 LUFS for the whole mix (S3-164).
