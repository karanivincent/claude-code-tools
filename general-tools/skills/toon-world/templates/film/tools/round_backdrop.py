"""One 360-degree far picture from two views, so a camera that turns round in a place sees different country on each
side. A far picture repeated round the camera puts the same view on every side (Elijah and the widow 2D, 11 November
2026: the sea on all four sides of a gate that faces inland). Use it for the far band of any place the camera turns
in; a place seen from one side only keeps its single picture.

The strip: the front picture fills half the circle; the middle of the back picture fills the other half, once
mirrored and once as it is, so the strip wraps with no seam where its two ends meet. The back's sky takes the front's
sky row by row above the horizon, fading into the back's own colour toward the horizon, so the two skies match; the two
joins are cross-faded. The strip is flipped left to right, since the cylinder is seen from inside. Wrap it once round
the camera (u from 0 to 1 over 360 degrees); the front's middle sits at u = 0.5 (with three.js's
CylinderGeometry, theta 0 at +z: turn the cylinder so the front faces the way it should).

  python -I round_backdrop.py <front.png> <back.png> <out.png> [--horizon 0.67] [--crop 0.27:0.78] [--shift 0]
                              [--feather 70] [--blend 220] [--width 4096]

  front     the view the story faces most (Elijah: the sea, its ships painted out)
  back      the view behind it (Elijah: the dry hills inland), any size; resized to the front's height
  --horizon the horizon's height in both pictures, a fraction from the top (default 0.67)
  --crop    the part of the back picture's width to use, a:b fractions (default 0.27:0.78, its middle)
  --shift   move the back down this many pixels to put its horizon on the front's (default 0)
  --feather pixels over which the borrowed sky fades into the back's own colour, above the horizon (default 70)
  --blend   pixels of each cross-faded join (default 220)
  --width   the written strip's width; the height keeps the ratio (default 4096)

Needs numpy and Pillow (the video-study venv: ~/.cache/video-study-venv/bin/python). Ported from the Elijah 2D story's
tools/round_backdrop.py, whose sky test was tuned to its one picture; this one matches the skies by row.
"""
import argparse
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('front'); ap.add_argument('back'); ap.add_argument('out')
ap.add_argument('--horizon', type=float, default=0.67)
ap.add_argument('--crop', default='0.27:0.78')
ap.add_argument('--shift', type=int, default=0)
ap.add_argument('--feather', type=int, default=70)
ap.add_argument('--blend', type=int, default=220)
ap.add_argument('--width', type=int, default=4096)
a = ap.parse_args()

front = np.asarray(Image.open(a.front).convert('RGB')).astype(float)
H, W = front.shape[:2]
c0, c1 = (float(x) for x in a.crop.split(':'))
back = Image.open(a.back).convert('RGB')
bw = back.size[0]
crop = back.crop((int(c0 * bw), 0, int(c1 * bw), back.size[1]))
half = W // 2
crop = crop.resize((half, int(crop.size[1] * half / crop.size[0])), Image.LANCZOS)
b = np.asarray(crop).astype(float)
# the back on the front's rows: shifted down, cut or padded with its own edge rows to the front's height
if a.shift > 0: b = np.concatenate([np.repeat(b[:1], a.shift, axis=0), b], axis=0)
elif a.shift < 0: b = b[-a.shift:]
b = b[:H]
if b.shape[0] < H: b = np.concatenate([b, np.repeat(b[-1:], H - b.shape[0], axis=0)], axis=0)

# the sky: each row above the horizon moves to the front's mean colour of that row, fully at the top and fading out
# over `feather` pixels down to the horizon
hz = int(a.horizon * H)
sky = front[:, :].mean(axis=1)                       # the front's colour per row
own = b.mean(axis=1)                                 # the back's colour per row
w = np.clip((hz - np.arange(H)) / max(1, a.feather), 0, 1)[:, None]
b = b + ((sky - own) * w)[:, None, :]

strip = np.concatenate([b[:, ::-1], front, b], axis=1)
L = min(a.blend, half // 2, W // 2)
for seam in (half, half + W):
    left = strip[:, seam - L:seam].copy(); right = strip[:, seam:seam + L].copy()
    for k in range(L):
        t = 0.5 * (k / L)
        strip[:, seam - L + k] = left[:, k] * (1 - t) + right[:, L - 1 - k] * t
        strip[:, seam + L - 1 - k] = right[:, L - 1 - k] * (1 - t) + left[:, k] * t
out = Image.fromarray(strip.clip(0, 255).astype(np.uint8)).transpose(Image.FLIP_LEFT_RIGHT)
out.resize((a.width, int(H * a.width / out.size[0])), Image.LANCZOS).save(a.out)
print(f'{a.out}: {a.width} x {int(H * a.width / out.size[0])}, front in the middle half, horizon at {a.horizon}')
