#!/usr/bin/env python3
"""Sharpness, fine detail, saturation and brightness of a video, beside a reference if given.

Usage: python3 measure_sharp.py ours.mp4 [reference.mp4] [--fps 2]

Exits 1 when ours (the first video) is outside the targets, 2 when it cannot run. With a reference, ours must reach
0.6 of its sharpness and fine edges and 0.9 of its saturation, and sit within 30 of its brightness; without one, the
absolute targets below. 0.6 is a working floor set on 11 November 2026 (a copy can be softer than its reference,
not half as sharp); move it once a render the owner accepted is measured. 0.9 saturation: decision 9 (bright and
saturated).
Needs numpy, scipy and ffmpeg. Frames are sampled at 2 a second and read at the video's own size; the edge measures
use the central region (rows 10%-89%, columns 9%-91%) so captions at the frame's edges count less.

  sharpness   mean variance of the Laplacian of grey: higher is crisper (railroads original: 1302)
  fine edges  share of pixels whose Sobel magnitude is over 60: how much fine detail (original: 16.9%)
  saturation  mean of (max - min) / max over RGB (original: 0.43)
  brightness  mean grey 0-255 (original: 133); higher than the reference usually means a washed, lifted grade
"""
import json, subprocess, sys
try:
    import numpy as np
    from scipy import ndimage
except ImportError as e:
    print(f'measure_sharp: {e}: python3 -m pip install numpy scipy', file=sys.stderr); sys.exit(2)


def size(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
                          '-of', 'json', path], capture_output=True, text=True, check=True).stdout
    s = json.loads(out)['streams'][0]
    return s['width'], s['height']


def measure(path, fps=2.0):
    w, h = size(path)
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', f'fps={fps}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                         capture_output=True, check=True).stdout
    frames = np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3).astype(np.float32)
    r0, r1, c0, c1 = int(h * .10), int(h * .89), int(w * .09), int(w * .91)
    sat, sharp, edges, bright = [], [], [], []
    for f in frames:
        mx, mn = f.max(2), f.min(2)
        sat.append(((mx - mn) / (mx + 1e-3)).mean())
        g = f.mean(2)
        bright.append(g.mean())
        c = g[r0:r1, c0:c1]
        sharp.append(ndimage.laplace(c).var())
        edges.append((np.hypot(ndimage.sobel(c, 0), ndimage.sobel(c, 1)) > 60).mean())
    return dict(sharpness=float(np.mean(sharp)), fine_edges=float(np.mean(edges)), saturation=float(np.mean(sat)),
                brightness=float(np.mean(bright)))


# Absolute targets when there is no reference, from the railroads original (sharpness 1302, fine edges 16.9%,
# saturation 0.43, brightness 133): half its sharpness and fine edges (blurred mediums pull the mean down), 0.9 of its
# saturation (decision 9: bright and saturated), and its brightness give or take 30 (the toon look's day grade).
TARGETS = dict(sharpness=650.0, fine_edges=0.08, saturation=0.38, bright_lo=103.0, bright_hi=163.0)


def misses(m, ref=None):
    t = dict(TARGETS)
    if ref:
        t = dict(sharpness=0.6 * ref['sharpness'], fine_edges=0.6 * ref['fine_edges'], saturation=0.9 * ref['saturation'],
                 bright_lo=ref['brightness'] - 30, bright_hi=ref['brightness'] + 30)
    out = []
    if m['sharpness'] < t['sharpness']: out.append(f"sharpness {m['sharpness']:.0f} under {t['sharpness']:.0f}")
    if m['fine_edges'] < t['fine_edges']: out.append(f"fine edges {m['fine_edges']*100:.1f}% under {t['fine_edges']*100:.1f}%")
    if m['saturation'] < t['saturation']: out.append(f"saturation {m['saturation']:.2f} under {t['saturation']:.2f}")
    if not t['bright_lo'] <= m['brightness'] <= t['bright_hi']: out.append(f"brightness {m['brightness']:.0f} outside {t['bright_lo']:.0f}-{t['bright_hi']:.0f}")
    return out


def main():
    import argparse
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('videos', nargs='+')
    ap.add_argument('--fps', type=float, default=2.0)
    a = ap.parse_args()
    try:
        rows = [(p, measure(p, a.fps)) for p in a.videos]
    except Exception as e:  # ffmpeg missing, an unreadable video
        print(f'measure_sharp: could not measure: {e}', file=sys.stderr)
        sys.exit(2)
    print(f"{'video':40} {'sharpness':>10} {'fine edges':>11} {'saturation':>11} {'brightness':>11}")
    for p, m in rows:
        print(f"{p[-40:]:40} {m['sharpness']:10.0f} {m['fine_edges']*100:10.1f}% {m['saturation']:11.2f} {m['brightness']:11.0f}")
    bad = misses(rows[0][1], rows[1][1] if len(rows) > 1 else None)
    for b in bad:
        print(f'MISS {b}')
    print('ok: inside the targets' if not bad else f'{len(bad)} target(s) missed')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
