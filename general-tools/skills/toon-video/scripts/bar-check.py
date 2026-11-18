#!/usr/bin/env python3
"""The machine half of the bar (toon-video references/bar.md, checks 4, 5 and 6) for one clip, and the calm number.

Usage: python3 -I <toon-video>/scripts/bar-check.py <clip.mp4> [--json out.json]
       (any python with numpy; ffmpeg and ffprobe on the PATH)

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
- the longest run with no hard cut and no soft join (check 6 wants more than 10 s in a full film).
Needs ffmpeg and numpy.

Known limits (spikes of 18 November 2026): with a calm camera a one-frame pose pop can show as a hard cut, and a
dissolve inside fast motion shows as a big jump, not a soft join; a reviewer names each join.
"""
import json
import subprocess
import sys

import numpy as np

W, H = 96, 170
STILL = 0.35      # mean grey-level change per frame under which the picture counts as still
CUT = 14.0        # a hard cut changes the mean grey level by at least this much in one frame
CUT_RATIO = 4.0   # ... and by this many times the median change of the 6 frames around it


def frames(path):
    p = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', f'scale={W}:{H},format=gray', '-f', 'rawvideo', '-'],
                       capture_output=True, check=True)
    return np.frombuffer(p.stdout, dtype=np.uint8).reshape(-1, H, W).astype(np.float32)


def fps_of(path):
    r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate',
                        '-of', 'csv=p=0', path], capture_output=True, text=True, check=True).stdout.strip().strip(',').splitlines()[0].strip(',')
    a, b = r.split('/')
    return float(a) / float(b)


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


def main():
    path = sys.argv[1]
    fps = fps_of(path)
    f = frames(path)
    d = np.abs(f[1:] - f[:-1]).mean(axis=(1, 2))          # d[i] = change from frame i to i+1
    n = len(f)
    cuts = []
    for i, v in enumerate(d):
        around = np.concatenate([d[max(0, i - 3):i], d[i + 1:i + 4]])
        if v >= CUT and v >= CUT_RATIO * (np.median(around) + 0.5):
            cuts.append(i + 1)
    # soft joins: short runs where the change sits well above the clip's usual motion, without a single-frame spike
    base = float(np.median(d))
    high = d > max(6.0, 3.0 * base)
    soft = [(a + 1, b + 1) for a, b in runs(high) if 3 <= b - a + 1 <= 14 and not any(a < c <= b + 1 for c in cuts)]
    # big jumps: peaks of change that are not clean cuts (a wipe or a whip inside fast motion); the reviewer names them
    jumps = [i + 1 for i in range(1, len(d) - 1) if d[i] >= 45 and d[i] >= d[i - 1] and d[i] > d[i + 1] and (i + 1) not in cuts]
    jumps = [j for k, j in enumerate(jumps) if k == 0 or j - jumps[k - 1] > 8]
    stills = [(a, b + 1) for a, b in runs(d < STILL) if (b - a + 1) / fps >= 0.7]
    marks = sorted([0] + cuts + [a for a, _ in soft] + [n])
    longest = max((b - a, a, b) for a, b in zip(marks, marks[1:]))
    luma = f.reshape(len(f), -1)
    mean_luma = float(luma.mean()); p5 = float(np.percentile(luma, 5)); p95 = float(np.percentile(luma, 95))
    res = {
        'mean_luma': round(mean_luma, 1), 'luma_p5': round(p5, 1), 'luma_p95': round(p95, 1),
        'clip': path, 'fps': fps, 'frames': n, 'seconds': round(n / fps, 2),
        'hard_cuts': [{'frame': c, 's': round(c / fps, 2)} for c in cuts],
        'soft_joins': [{'frames': [a, b], 's': round(a / fps, 2), 'length': b - a + 1} for a, b in soft],
        'big_jumps': [{'frame': j, 's': round(j / fps, 2)} for j in jumps],
        'still_stretches': [{'frames': [a, b], 's': round(a / fps, 2), 'seconds': round((b - a) / fps, 2)} for a, b in stills],
        'share_still': round(float((d < STILL).mean()), 3),
        'longest_unbroken_run_s': round(longest[0] / fps, 2), 'longest_run_from_s': round(longest[1] / fps, 2),
        'median_change': round(base, 2),
        'check_4_never_still': len(stills) == 0,
        'check_6_run_over_10s': longest[0] / fps > 10,
    }
    if '--json' in sys.argv:
        with open(sys.argv[sys.argv.index('--json') + 1], 'w') as fh:
            json.dump(res, fh, indent=1)
    print(f"{path}: {res['seconds']} s")
    print(f"  hard cuts ({len(cuts)}): " + ', '.join(f"{c['s']} s" for c in res['hard_cuts']))
    print(f"  soft joins ({len(soft)}): " + ', '.join(f"{j['s']} s ({j['length']} frames)" for j in res['soft_joins']))
    print(f"  big jumps that are not clean cuts ({len(jumps)}): " + ', '.join(f"{j['s']} s" for j in res['big_jumps']))
    print(f"  median change per frame {res['median_change']} (the reference Short: about 4; a high number means the picture never settles)")
    print(f"  still stretches of 0.7 s or more ({len(stills)}): " + ', '.join(f"{x['s']} s for {x['seconds']} s" for x in res['still_stretches']))
    print(f"  still share {res['share_still']:.1%}; longest unbroken run {res['longest_unbroken_run_s']} s from {res['longest_run_from_s']} s")
    print(f"  brightness: mean {res['mean_luma']}, darkest 5% under {res['luma_p5']}, brightest 5% over {res['luma_p95']} "
          f"(0 to 255; the reference night Short: mean about 77, with bright pools and no pure black)")
    print(f"  check 4 (never still 0.7 s): {'pass' if res['check_4_never_still'] else 'FAIL'}; "
          f"check 6 (a run over 10 s): {'pass' if res['check_6_run_over_10s'] else 'no'}")


if __name__ == '__main__':
    main()
