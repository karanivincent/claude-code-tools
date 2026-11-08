#!/usr/bin/env python3
"""Sharpness, fine detail, saturation and brightness of a video, beside a reference if given.

Usage: python3 measure_sharp.py ours.mp4 [reference.mp4] [--fps 2]
Needs numpy, scipy and ffmpeg. Frames are sampled at 2 a second and read at the video's own size; the edge measures
use the central region (rows 10%-89%, columns 9%-91%) so captions at the frame's edges count less.

  sharpness   mean variance of the Laplacian of grey: higher is crisper (railroads original: 1302)
  fine edges  share of pixels whose Sobel magnitude is over 60: how much fine detail (original: 16.9%)
  saturation  mean of (max - min) / max over RGB (original: 0.43)
  brightness  mean grey 0-255 (original: 133); higher than the reference usually means a washed, lifted grade
"""
import json, subprocess, sys
import numpy as np
from scipy import ndimage


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


def main():
    import argparse
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('videos', nargs='+')
    ap.add_argument('--fps', type=float, default=2.0)
    a = ap.parse_args()
    rows = [(p, measure(p, a.fps)) for p in a.videos]
    print(f"{'video':40} {'sharpness':>10} {'fine edges':>11} {'saturation':>11} {'brightness':>11}")
    for p, m in rows:
        print(f"{p[-40:]:40} {m['sharpness']:10.0f} {m['fine_edges']*100:10.1f}% {m['saturation']:11.2f} {m['brightness']:11.0f}")


if __name__ == '__main__':
    main()
