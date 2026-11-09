#!/usr/bin/env python3
"""How much the picture moves each second: the mean grey difference between frames of a small strip, and the runs of
still seconds against the video's dynamics profile.

Usage: python3 frame_motion.py video.mp4 [--from S] [--to S] [--floor 8] [--longest 1] [--hold 54-55 ...] [--json]
Needs only ffmpeg. The video is read at 10 frames a second, 270 pixels wide, in grey; each frame's mean absolute
difference from the one before (0-255) is averaged over each second. A whole film takes a few seconds.

Why this and not the camera: how the camera moves through the world is not how the picture moves. A camera running
with a rout over a flat plain scored among the film's liveliest seconds on the camera paths while the picture was
nearly still (Gibeon r4 and r5, 51-52 s), and a card that pops moves the picture with the camera still. This is the
critic's own measure: on Gibeon r5 it gives his numbers (6.4 and 6.9 at 51-52 s, 1.8 at 59 s), and with the floor at 8
and the longest hold at 1 s it flags exactly his two stillest findings (51-52 s and 59-60 s).

A render at quarter size is enough; run it on a clip or a stretch (--from, --to) as soon as it is rendered, before a
critic, and on every fix round's moving check. Planned holds from the profile go in --hold (seconds from-to).
Exit 0 when no run is flagged, 3 when one is.
"""
import argparse, json, subprocess, sys


def per_second(path, fps=10, width=270, start=None, end=None):
    vf = f'fps={fps},scale={width}:-2,format=gray,tblend=all_mode=difference,signalstats,' \
         'metadata=print:key=lavfi.signalstats.YAVG:file=-'
    cmd = ['ffmpeg', '-v', 'error']
    if start is not None:
        cmd += ['-ss', str(start)]
    cmd += ['-i', path]
    if end is not None:
        cmd += ['-t', str(end - (start or 0))]
    cmd += ['-vf', vf, '-f', 'null', '-']
    out = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout
    diffs = [float(l.split('=', 1)[1]) for l in out.splitlines() if 'YAVG=' in l]
    secs = []
    for k in range(0, len(diffs), fps):
        chunk = diffs[k:k + fps]
        secs.append(sum(chunk) / len(chunk))
    return secs


def still_runs(secs, floor=8.0, longest=1, holds=(), offset=0.0):
    held = lambda t: any(a <= t < b for a, b in holds)
    runs, run = [], []
    for k, v in enumerate(secs + [float('inf')]):
        if v < floor and not held(offset + k):
            run.append(k)
            continue
        if len(run) > longest:
            runs.append({'from': offset + run[0], 'seconds': len(run), 'values': [round(secs[i], 1) for i in run]})
        run = []
    return runs


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('video')
    ap.add_argument('--from', dest='start', type=float)
    ap.add_argument('--to', dest='end', type=float)
    ap.add_argument('--floor', type=float, default=8.0)
    ap.add_argument('--longest', type=int, default=1, help="the profile's longest hold, whole seconds")
    ap.add_argument('--hold', action='append', default=[], help='a planned hold, seconds from-to (e.g. 54-55)')
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    holds = [tuple(float(x) for x in h.split('-')) for h in a.hold]
    secs = per_second(a.video, start=a.start, end=a.end)
    off = a.start or 0.0
    runs = still_runs(secs, a.floor, a.longest, holds, off)
    if a.json:
        print(json.dumps({'perSecond': [round(v, 2) for v in secs], 'from': off, 'still': runs}))
    else:
        print(' '.join(f'{off + k:g}:{v:.1f}' for k, v in enumerate(secs)))
        for r in runs:
            print(f"still: {r['seconds']} s from {r['from']:g} s under {a.floor:g} ({', '.join(map(str, r['values']))})")
        print('clean' if not runs else f'{len(runs)} still run(s) longer than {a.longest} s')
    sys.exit(3 if runs else 0)


if __name__ == '__main__':
    main()
