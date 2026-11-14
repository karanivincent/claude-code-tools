#!/usr/bin/env python3
"""Measure each hero object and effect of a clip on its own, against its own reference stills (S5-99).

Usage: python3 -I measure_heroes.py <clip.mp4> <heroes.json> <out.json> [--share 0.8]

heroes.json lists the things the story turns on, each where it is on screen:
  {"heroes": [
    {"name": "tail lock", "from": 0.0, "to": 2.4, "box": [0.15, 0.35, 0.85, 0.75], "stills": "out/proof/refs/cockpit"},
    {"name": "fire",      "from": 14.0, "to": 17.0, "box": [0.3, 0.2, 1.0, 0.7],   "stills": "out/proof/refs/fire"}
  ]}
from and to are seconds in the clip; box is the region as fractions of width and height (x0, y0, x1, y1); stills is a
folder of the reference stills for that thing (their whole frames are measured, scaled to 1080x1920). Catalog stills
are kept at 720 wide, which measures softer than the full frame: give "targets": [sharpness, fine_edges] from the
catalog's index.json measures (taken on the full frames) to use those instead.

Each hero gets the sharpness (variance of the Laplacian of grey) and fine edges (share of Sobel magnitude over 60) of
its box, one frame in three, beside its stills' medians. A hero under `share` (default 0.8) of its stills on either
measure FAILS: the next round works on it first. Exit 1 when any hero fails, so a loop cannot call the clip done
while one object the story turns on is still flat (the B-17 lock, panel and fire were each found by the owner, one
round at a time, while the whole-frame average looked fine). Needs ffmpeg, numpy, scipy and Pillow.
"""
import json, subprocess, sys, tempfile
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage


def measure(a):
    g = a.mean(axis=2)
    sx, sy = ndimage.sobel(g, 1), ndimage.sobel(g, 0)
    return float(ndimage.laplace(g).var()), float((np.hypot(sx, sy) > 60).mean())


def frames(clip, t0, t1, tmp):
    out = Path(tmp) / f'{t0:.2f}'
    out.mkdir()
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-ss', str(t0), '-to', str(t1), '-i', clip, '-vf', 'fps=10',
                    str(out / 'f%04d.png')], check=True)
    return sorted(out.glob('*.png'))[::3]


def main():
    a = sys.argv[1:]
    if len(a) < 3:
        print(__doc__); sys.exit(2)
    clip, spec, out = a[0], a[1], a[2]
    share = float(a[a.index('--share') + 1]) if '--share' in a else 0.8
    heroes = json.load(open(spec))['heroes']
    rows, fail = [], 0
    with tempfile.TemporaryDirectory() as tmp:
        for h in heroes:
            ms = []
            for f in frames(clip, h['from'], h['to'], tmp):
                im = np.asarray(Image.open(f).convert('RGB'), dtype=np.float32)
                H, W = im.shape[:2]; x0, y0, x1, y1 = h['box']
                ms.append(measure(im[int(y0 * H):int(y1 * H), int(x0 * W):int(x1 * W)]))
            if 'targets' in h:
                st = [tuple(h['targets'])]
            else:
              st = [measure(np.asarray(Image.open(p).convert('RGB').resize((1080, 1920)), dtype=np.float32))
                    for p in sorted(Path(h['stills']).glob('*.jpg'))]
            if not ms or not st:
                print(f"{h['name']}: no frames or no stills"); fail += 1; continue
            sh, fe = np.median([m[0] for m in ms]), np.median([m[1] for m in ms])
            ssh, sfe = np.median([s[0] for s in st]), np.median([s[1] for s in st])
            ok = sh >= share * ssh and fe >= share * sfe
            fail += not ok
            rows.append({'name': h['name'], 'sharpness': round(sh), 'fine_edges': round(fe, 3),
                         'stills_sharpness': round(ssh), 'stills_fine_edges': round(sfe, 3),
                         'share': [round(sh / ssh, 2), round(fe / sfe, 2)], 'pass': bool(ok)})
            print(f"{'PASS' if ok else 'FAIL'}  {h['name']}: sharpness {sh:.0f} of {ssh:.0f}, fine edges "
                  f"{fe * 100:.1f} % of {sfe * 100:.1f} %")
    json.dump({'clip': clip, 'share': share, 'heroes': rows}, open(out, 'w'), indent=1)
    sys.exit(1 if fail else 0)


if __name__ == '__main__':
    main()
