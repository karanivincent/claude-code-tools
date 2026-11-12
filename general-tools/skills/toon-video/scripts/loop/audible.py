#!/usr/bin/env python3
"""audible.py <mix.wav> <cues.json> [--voice voice.wav] [--window 0.4] [--out audible.md]

The second fact from code: is each sound effect heard at its cue, against the mix at that moment? Plain Python and
ffmpeg, no numpy. Every file is decoded to mono 16 kHz; levels are 50 ms RMS frames in dBFS.

cues.json: a list (or {"cues": [...]}) of
  {"name": "splash", "t": 3.2}                                   the mix's rise at t against the 0.4 s before it
  {"name": "splash", "t": 3.2, "file": "splash.mp3", "gain_db": -4, "offset": 0}
                                                                 the effect's own file as placed in the mix (gain_db
                                                                 is the gain the mix gives it): effect against the rest
  {"name": "splash", "t": 3.2, "stem": "fx.wav"}                 a stem on the mix's timeline: effect against the rest
Paths in cues.json are relative to the cues file. Optional per cue: "window" (s).

Verdict per cue:
  with the effect known:  effect peak minus the rest of the mix in that frame:  heard >= -6 dB, just -12..-6, masked
  with the mix alone:     the mix's peak in the window minus its level before:   heard >= 3 dB, just 1..3, masked
--voice adds the voice's level in the window, for the reader. Prints a table and writes --out (default: next to the
cues file, audible.md). Exit 0; a masked cue is a fact for the sound pass, not a crash.
"""
import array, json, math, os, subprocess, sys

SR, HOP = 16000, 800  # 50 ms frames


def die(m):
    print(f"audible.py: {m}", file=sys.stderr)
    sys.exit(2)


def load(path):
    if not os.path.exists(path):
        die(f"no file {path}")
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True).stdout
    a = array.array("f")
    a.frombytes(raw[: len(raw) // 4 * 4])
    return a


def power(a, s0, s1):
    s0, s1 = max(0, s0), min(len(a), s1)
    if s1 <= s0:
        return 1e-12
    return max(sum(x * x for x in a[s0:s1]) / (s1 - s0), 1e-12)


db = lambda p: 10 * math.log10(max(p, 1e-12))


def frames(t, win):
    s = int(t * SR)
    return [(s + k * HOP, s + (k + 1) * HOP) for k in range(max(1, int(round(win * SR / HOP))))]


def main():
    args = sys.argv[1:]
    if len(args) < 2:
        die("usage: audible.py <mix.wav> <cues.json> [--voice voice.wav] [--window 0.4] [--out audible.md]")
    mix_p, cues_p = args[0], args[1]
    opt = {"--voice": None, "--window": "0.4", "--out": None}
    i = 2
    while i < len(args):
        if args[i] not in opt or i + 1 >= len(args):
            die(f"unknown or empty option {args[i]}")
        opt[args[i]] = args[i + 1]
        i += 2
    win = float(opt["--window"])
    base = os.path.dirname(os.path.abspath(cues_p))
    cues = json.load(open(cues_p))
    cues = cues.get("cues", []) if isinstance(cues, dict) else cues
    if not cues:
        die(f"no cues in {cues_p}")
    mix = load(mix_p)
    voice = load(opt["--voice"]) if opt["--voice"] else None
    rows = []
    for c in cues:
        name, t = c.get("name", "?"), float(c.get("t", c.get("at", 0)))
        w = float(c.get("window", win))
        fr = frames(t, w)
        mixdb = [db(power(mix, a, b)) for a, b in fr]
        vdb = max(db(power(voice, a, b)) for a, b in fr) if voice is not None else None
        eff = None
        if c.get("stem"):
            st = load(os.path.join(base, c["stem"]))
            eff = [power(st, a, b) for a, b in fr]
        elif c.get("file"):
            fx = load(os.path.join(base, c["file"]))
            g = 10 ** (float(c.get("gain_db", 0)) / 10)
            off = int(float(c.get("offset", 0)) * SR) - int(t * SR)
            eff = [power(fx, a + off, b + off) * g for a, b in fr]
        if eff is not None:
            k = max(range(len(fr)), key=lambda j: eff[j])
            mp = power(mix, *fr[k])
            e = min(eff[k], mp * 0.98)  # an effect louder than the whole mix means gain_db or t is off
            rest = mp - e
            margin = db(e) - db(rest)
            verdict = "heard" if margin >= -6 else "just" if margin >= -12 else "masked"
            how = f"effect {db(e):.1f} dBFS vs rest of mix {db(rest):.1f} dBFS at {fr[k][0] / SR:.2f} s"
            if eff[k] > mp:
                how += " (the file is louder than the mix here: check gain_db and t)"
        else:
            before = db(power(mix, int((t - w - 0.05) * SR), int((t - 0.05) * SR)))
            margin = max(mixdb) - before
            verdict = "heard" if margin >= 3 else "just" if margin >= 1 else "masked"
            how = f"mix peak {max(mixdb):.1f} dBFS vs {before:.1f} dBFS in the {w:g} s before"
        rows.append((name, t, verdict, margin, how, vdb))
    lines = ["## Fact from code: is each effect heard at its cue", "",
             "| cue | at | verdict | margin | measured | voice |", "|---|---|---|---|---|---|"]
    for name, t, verdict, margin, how, vdb in rows:
        lines.append(f"| {name} | {t:.2f} s | {verdict} | {margin:+.1f} dB | {how} | "
                     + (f"{vdb:.1f} dBFS" if vdb is not None else "-") + " |")
    text = "\n".join(lines) + "\n"
    out = opt["--out"] or os.path.join(base, "audible.md")
    open(out, "w").write(text)
    print(text, end="")
    print(f"-> {out}")


if __name__ == "__main__":
    main()
