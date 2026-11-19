#!/usr/bin/env python3
"""The machine half of the bar (toon-video references/bar.md, checks 4, 5 and 6) for one clip, the calm number, and a
gate that fails a round on them.

Usage: python3 -I <toon-video>/scripts/bar-check.py <clip.mp4> [--json [out.json]] [--gate] [--night] [--no-colour]
       (any python 3; numpy is used when it is there and is not needed; ffmpeg and ffprobe on the PATH)

  (no flag)        the report on stdout, exit 0, as before
  --json out.json  also writes the numbers to out.json
  --json           the numbers as JSON on stdout (the report and any gate lines go to stderr)
  --gate           exit 0 on a pass and 1 on a fail; one line per failed measure on stdout, the report on stderr.
                   The scene loop calls exactly `python3 -I bar-check.py <clip> --gate [--night]`: keep that contract.
                   It fails when
                     - the median change per frame is over 8 (S3-173: the picture never settles),
                     - the picture is still for 0.7 s or more (bar check 4), or
                     - the colour is dull (S3-250): the lit pixels' mean saturation is under 0.33. By day and by
                       night alike (S3-205: a night keeps the day's saturation). A clip with under 5% of its pixels
                       lit is not judged on colour: the night levels catch it.
  --no-colour      leave the colour measure out of the gate, for a scene whose subject has no colour by design (a
                   snowfield, a document insert). Say why in the round's log.
  --night          the clip is a declared night scene: --gate also fails when
                     - the mean brightness is outside 75 to 95 (S3-205: mean near 85),
                     - the darkest 5% is under 25 (S3-205: no pure black), or
                     - the brightest 5% is over 190 (S3-220: near 175; ours at 229 read as lit day).
                   A night film is gated one scene at a time: pass each night scene's clip, not the whole film.

Why the colour measure (19 November 2026): the owner found the first film built to the rendered-world look dull beside
the reference and beside our older films. Its day scenes measured a mean saturation of 0.27 with 4% strongly saturated;
the reference night Short 0.39 and 13%; our three older films 0.36 to 0.56 and 19% to 50%. S3-242 and S3-206 already
asked for saturated colour and named a check that was never built, so nothing failed. Scene by scene the reference
never drops under 0.35 (0.35 to 0.46 over six scenes), and that film's four dull day scenes sat at 0.26 to 0.30 while
its night scenes sat at 0.36 to 0.41: the floor of 0.33 separates them. The strongly saturated share is printed and
not gated: the reference's own scenes run from 1% to 25%.

Why the gate (audit 18 November 2026, finding A9): S3-173, S3-205 and S3-220 named this script as their proof, but it
only printed and always exited 0, and no stage ran it on a film: a film could churn at 20 or light a night at mean 120
with every check green.

The reference numbers in the printout are from the newest Short of the reference channel the spikes of 18 November 2026
were measured against (references/spikes.md): a median change per frame of about 4, and at night a mean of about 77
with the darkest 5% at about 33. Our first film measured 20. Compare your clip with your own reference the same way.

It reads every frame small and grey and measures how much the picture changes from one frame to the next:
- hard cuts: one frame where the change jumps far above the frames around it;
- soft joins: a short run (3 to 14 frames) of raised change, which is a dissolve or a wipe (the reviewer says which);
- big jumps: peaks of change that are not clean cuts, such as a wipe or a whip inside fast motion (the reviewer names them);
- still stretches: 0.7 s or more with almost no change (check 4 fails if there is one);
- brightness: the mean, the darkest 5% and the brightest 5% of the picture (a night scene wants a low mean, a bright
  pool and no pure black);
- colour: two frames a second, small, the caption band left out. Saturation is (max - min) / max of a pixel's red,
  green and blue; only lit pixels count (max over 20% of white). The mean, and the share over 0.6 ("strongly saturated");
- the longest run with no hard cut and no soft join (check 6 wants more than 10 s in a full film).

Known limits (spikes of 18 November 2026): with a calm camera a one-frame pose pop can show as a hard cut, and a
dissolve inside fast motion shows as a big jump, not a soft join; a reviewer names each join.
"""
import argparse
import json
import statistics
import subprocess
import sys

try:
    import numpy as np
except ImportError:  # python3 -I on a python without numpy (homebrew's): the pure-python path gives the same numbers
    np = None

W, H = 96, 170
STILL = 0.35      # mean grey-level change per frame under which the picture counts as still
CUT = 14.0        # a hard cut changes the mean grey level by at least this much in one frame
CUT_RATIO = 4.0   # ... and by this many times the median change of the 6 frames around it

# the gate (S3-173, bar check 4, S3-205, S3-220)
CALM_MAX = 8.0
STILL_MAX_S = 0.7
NIGHT_MEAN = (75.0, 95.0)
NIGHT_P5_MIN = 25.0
NIGHT_P95_MAX = 190.0
# the colour floor (S3-250)
CW, CH = 54, 96          # the colour pass's frame size
LIT = 0.2                # a pixel counts when its brightest channel is over this share of white
STRONG = 0.6             # "strongly saturated"
SAT_MIN = 0.33           # the reference's scenes: 0.35 to 0.46; our dull day scenes: 0.26 to 0.30
LIT_SHARE_MIN = 0.05     # with fewer lit pixels than this the clip is not judged on colour


def raw_frames(path):
    p = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', f'scale={W}:{H},format=gray', '-f', 'rawvideo', '-'],
                       capture_output=True, check=True)
    return p.stdout


def fps_of(path):
    r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate',
                        '-of', 'csv=p=0', path], capture_output=True, text=True, check=True).stdout.strip().strip(',').splitlines()[0].strip(',')
    a, b = r.split('/')
    return float(a) / float(b)


def changes_and_levels(buf):
    """d[i] = mean absolute grey change from frame i to i+1; and the mean, 5th and 95th percentile of every pixel"""
    size = W * H
    n = len(buf) // size
    if np is not None:
        f = np.frombuffer(buf[:n * size], dtype=np.uint8).reshape(-1, H, W).astype(np.float32)
        d = [float(x) for x in np.abs(f[1:] - f[:-1]).mean(axis=(1, 2))]
        luma = f.reshape(n, -1)
        return n, d, float(luma.mean()), float(np.percentile(luma, 5)), float(np.percentile(luma, 95))
    frames = [buf[i * size:(i + 1) * size] for i in range(n)]
    d = [sum(map(abs, map(int.__sub__, a, b))) / size for a, b in zip(frames[1:], frames[:-1])]
    data = buf[:n * size]
    hist = [data.count(v) for v in range(256)]
    total = n * size
    mean = sum(v * c for v, c in enumerate(hist)) / total

    def at(idx):  # the value at a sorted index, from the histogram
        acc = 0
        for v, c in enumerate(hist):
            acc += c
            if idx < acc:
                return v
        return 255

    def pct(p):  # numpy's default (linear) percentile
        k = p / 100 * (total - 1)
        lo = int(k)
        a, b = at(lo), at(min(lo + 1, total - 1))
        return a + (b - a) * (k - lo)
    return n, d, mean, pct(5), pct(95)


def colour_levels(path):
    """the lit pixels' mean saturation (0 to 1), the share of them that is strongly saturated (per cent), and the
    share of all pixels that is lit (0 to 1)"""
    p = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', f'fps=2,scale={CW}:{CH}', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'],
                       capture_output=True, check=True)
    buf, size = p.stdout, CW * CH * 3
    n = len(buf) // size
    if not n:
        return 0.0, 0.0, 0.0
    y0, y1, x0, x1 = int(CH * 0.64), int(CH * 0.79), int(CW * 0.12), int(CW * 0.88)   # the caption band
    if np is not None:
        f = np.frombuffer(buf[:n * size], dtype=np.uint8).reshape(n, CH, CW, 3).astype(np.float32)
        keep = np.ones((CH, CW), bool)
        keep[y0:y1, x0:x1] = False
        px = f[:, keep, :].reshape(-1, 3)
        mx, mn = px.max(axis=1), px.min(axis=1)
        lit = mx > LIT * 255
        if not lit.any():
            return 0.0, 0.0, 0.0
        sat = (mx[lit] - mn[lit]) / mx[lit]
        return float(sat.mean()), float((sat > STRONG).mean() * 100), float(lit.mean())
    lit_n = strong = seen = 0
    total = 0.0
    floor = LIT * 255
    for k in range(n):
        fr = buf[k * size:(k + 1) * size]
        for y in range(CH):
            row = fr[y * CW * 3:(y + 1) * CW * 3]
            band = y0 <= y < y1
            for x in range(CW):
                if band and x0 <= x < x1:
                    continue
                seen += 1
                r, g, b = row[x * 3], row[x * 3 + 1], row[x * 3 + 2]
                mx = r if r > g else g
                if b > mx:
                    mx = b
                if mx <= floor:
                    continue
                mn = r if r < g else g
                if b < mn:
                    mn = b
                sv = (mx - mn) / mx
                lit_n += 1
                total += sv
                if sv > STRONG:
                    strong += 1
    return (total / lit_n, strong / lit_n * 100, lit_n / seen) if lit_n else (0.0, 0.0, 0.0)


def runs(mask):
    out, start = [], None
    for i, m in enumerate(mask):
        if m and start is None:
            start = i
        if not m and start is not None:
            out.append((start, i - 1)); start = None
    if start is not None:
        out.append((start, len(mask) - 1))
    return out


def measure(path):
    fps = fps_of(path)
    n, d, mean_luma, p5, p95 = changes_and_levels(raw_frames(path))
    cuts = []
    for i, v in enumerate(d):
        around = d[max(0, i - 3):i] + d[i + 1:i + 4]
        if v >= CUT and v >= CUT_RATIO * (statistics.median(around) + 0.5):
            cuts.append(i + 1)
    # soft joins: short runs where the change sits well above the clip's usual motion, without a single-frame spike
    base = float(statistics.median(d)) if d else 0.0
    high = [x > max(6.0, 3.0 * base) for x in d]
    soft = [(a + 1, b + 1) for a, b in runs(high) if 3 <= b - a + 1 <= 14 and not any(a < c <= b + 1 for c in cuts)]
    # big jumps: peaks of change that are not clean cuts (a wipe or a whip inside fast motion); the reviewer names them
    jumps = [i + 1 for i in range(1, len(d) - 1) if d[i] >= 45 and d[i] >= d[i - 1] and d[i] > d[i + 1] and (i + 1) not in cuts]
    jumps = [j for k, j in enumerate(jumps) if k == 0 or j - jumps[k - 1] > 8]
    stills = [(a, b + 1) for a, b in runs([x < STILL for x in d]) if (b - a + 1) / fps >= STILL_MAX_S]
    marks = sorted([0] + cuts + [a for a, _ in soft] + [n])
    longest = max((b - a, a, b) for a, b in zip(marks, marks[1:]))
    sat_mean, sat_strong, lit_share = colour_levels(path)
    return {
        'sat_mean': round(sat_mean, 3), 'sat_strong': round(sat_strong, 1), 'lit_share': round(lit_share, 3),
        'mean_luma': round(mean_luma, 1), 'luma_p5': round(p5, 1), 'luma_p95': round(p95, 1),
        'clip': path, 'fps': fps, 'frames': n, 'seconds': round(n / fps, 2),
        'hard_cuts': [{'frame': c, 's': round(c / fps, 2)} for c in cuts],
        'soft_joins': [{'frames': [a, b], 's': round(a / fps, 2), 'length': b - a + 1} for a, b in soft],
        'big_jumps': [{'frame': j, 's': round(j / fps, 2)} for j in jumps],
        'still_stretches': [{'frames': [a, b], 's': round(a / fps, 2), 'seconds': round((b - a) / fps, 2)} for a, b in stills],
        'share_still': round(sum(1 for x in d if x < STILL) / max(1, len(d)), 3),
        'longest_unbroken_run_s': round(longest[0] / fps, 2), 'longest_run_from_s': round(longest[1] / fps, 2),
        'median_change': round(base, 2),
        'check_4_never_still': len(stills) == 0,
        'check_6_run_over_10s': longest[0] / fps > 10,
    }


def gate(res, night, colour=True):
    """one line per failed measure (empty: pass)"""
    out = []
    if colour and res['lit_share'] >= LIT_SHARE_MIN and res['sat_mean'] < SAT_MIN:
        out.append(f"S3-250 colour: the lit pixels' mean saturation {res['sat_mean']:.2f} is under {SAT_MIN:g} (the reference's scenes: 0.35 to 0.46)")
    if res['median_change'] > CALM_MAX:
        out.append(f"S3-173 calm: median change per frame {res['median_change']} is over {CALM_MAX:g} (aim at about 4)")
    for x in res['still_stretches']:
        out.append(f"bar-4 still: the picture is still for {x['seconds']} s from {x['s']} s (frames {x['frames'][0]}-{x['frames'][1]}; 0.7 s or more fails)")
    if night:
        lo, hi = NIGHT_MEAN
        if not lo <= res['mean_luma'] <= hi:
            out.append(f"S3-205 night mean: {res['mean_luma']} is outside {lo:g} to {hi:g} (near 85)")
        if res['luma_p5'] < NIGHT_P5_MIN:
            out.append(f"S3-205 night darkest 5%: {res['luma_p5']} is under {NIGHT_P5_MIN:g} (no pure black)")
        if res['luma_p95'] > NIGHT_P95_MAX:
            out.append(f"S3-220 night brightest 5%: {res['luma_p95']} is over {NIGHT_P95_MAX:g} (near 175)")
    return [f"{res['clip']}: FAIL {x}" for x in out]


def report(res, out):
    p = lambda s: print(s, file=out)
    p(f"{res['clip']}: {res['seconds']} s")
    p(f"  hard cuts ({len(res['hard_cuts'])}): " + ', '.join(f"{c['s']} s" for c in res['hard_cuts']))
    p(f"  soft joins ({len(res['soft_joins'])}): " + ', '.join(f"{j['s']} s ({j['length']} frames)" for j in res['soft_joins']))
    p(f"  big jumps that are not clean cuts ({len(res['big_jumps'])}): " + ', '.join(f"{j['s']} s" for j in res['big_jumps']))
    p(f"  median change per frame {res['median_change']} (the reference Short: about 4; a high number means the picture never settles)")
    p(f"  still stretches of 0.7 s or more ({len(res['still_stretches'])}): " + ', '.join(f"{x['s']} s for {x['seconds']} s" for x in res['still_stretches']))
    p(f"  still share {res['share_still']:.1%}; longest unbroken run {res['longest_unbroken_run_s']} s from {res['longest_run_from_s']} s")
    p(f"  brightness: mean {res['mean_luma']}, darkest 5% under {res['luma_p5']}, brightest 5% over {res['luma_p95']} "
      f"(0 to 255; the reference night Short: mean about 77, with bright pools and no pure black)")
    p(f"  colour: mean saturation {res['sat_mean']:.2f}, strongly saturated {res['sat_strong']:g}% of the lit pixels "
      f"(the reference night Short: 0.39 and 13%; a mean under {SAT_MIN:g} reads dull)")
    p(f"  check 4 (never still 0.7 s): {'pass' if res['check_4_never_still'] else 'FAIL'}; "
      f"check 6 (a run over 10 s): {'pass' if res['check_6_run_over_10s'] else 'no'}")


def main(argv=None):
    ap = argparse.ArgumentParser(description='The machine half of the bar for one clip, and its gate.')
    ap.add_argument('clip')
    ap.add_argument('--json', nargs='?', const='-', default=None, help='write the numbers to a file, or to stdout with no file')
    ap.add_argument('--gate', action='store_true', help='exit 1 when a measure fails; one line per failed measure on stdout')
    ap.add_argument('--night', action='store_true', help='a declared night scene: also gate the night brightness')
    ap.add_argument('--no-colour', action='store_true', help='leave the colour floor out of the gate (a scene with no colour by design)')
    a = ap.parse_args(argv)
    res = measure(a.clip)
    fails = gate(res, a.night, not a.no_colour) if a.gate else []
    if a.gate:
        res['gate'] = {'night': a.night, 'colour': not a.no_colour, 'pass': not fails, 'fails': fails}
    json_out = a.json == '-'
    if a.json and not json_out:
        with open(a.json, 'w') as fh:
            json.dump(res, fh, indent=1)
    # stdout carries one thing: the JSON, or the gate's fail lines, or (with neither) the report
    report(res, sys.stderr if (a.gate or json_out) else sys.stdout)
    if a.gate:
        print(f"gate: {'pass' if not fails else 'FAIL'} ({len(fails)} failed measure(s){', night' if a.night else ''})", file=sys.stderr)
        for x in fails:
            print(x, file=sys.stderr if json_out else sys.stdout)
    if json_out:
        print(json.dumps(res, indent=1))
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())
