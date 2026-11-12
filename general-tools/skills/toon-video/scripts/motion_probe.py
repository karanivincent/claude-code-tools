#!/usr/bin/env python3
"""The motion probe: frame-to-frame difference over a video or a stretch of it, with the one-frame spikes (pops, snaps,
jumps), the hard cuts, the fast runs (swings) and the still stretches it finds (rule S5-39).

Usage: python3 motion_probe.py video.mp4 [--from S] [--to S] [--offset S] [--json out.json] [--table]
--offset adds S to every time printed: a clip cut from the film at S (ranges.mjs's stretches) reads in film time.
Needs ffmpeg and numpy (the shared venv: ~/.cache/toon-tools/venv/bin/python). Every frame is read at 108 px wide in
grey; d is each frame's mean absolute difference from the one before (0-255), med the median of d over the 11 frames
around it.

  SPIKE  d over 4 and over 2.5 x med: one frame jumps against its neighbours (a pop, a snap, a card that jumps, a
         swing that starts with a jerk). The shift is the picture's whole-frame move (phase correlation): a shift
         with a high peak is the camera jumping; no shift with a low peak is something inside the frame popping.
  CUT    d over 18 and over 3 x med with a low correlation peak (under 0.25): the picture changed outright.
  FAST   runs of d over 6: swings and fast moves, each with its peak.
  STILL  runs of d under 0.4 for 1.5 s or more: a frozen stretch.
The numbers come from the Elijah and the widow critics' probes (cycles 1 and 2), which found the swings and pops the
owner then saw. Builders run it on every join and acting change they render (ranges.mjs); critic_prep.py runs it on
every render. Exit 0 when nothing is flagged, 3 when a spike is (cuts alone do not count).
"""
import argparse, json, subprocess, sys

import numpy as np

W = 108


def frames(path, start=None, end=None):
    """the video's frames as grey arrays, and its frame rate"""
    probe = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate',
                            '-of', 'csv=p=0', path], capture_output=True, text=True, check=True).stdout.strip().split(',')
    w, h = int(probe[0]), int(probe[1])
    num, den = (probe[2].split('/') + ['1'])[:2]
    fps = float(num) / float(den)
    H = max(2, round(W * h / w / 2) * 2)
    cmd = ['ffmpeg', '-v', 'error']
    if start is not None:
        cmd += ['-ss', str(start)]
    cmd += ['-i', path]
    if end is not None:
        cmd += ['-t', str(end - (start or 0))]
    cmd += ['-vf', f'scale={W}:{H}:flags=area,format=gray', '-f', 'rawvideo', '-']
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    a = np.frombuffer(raw, dtype=np.uint8).reshape(-1, H, W).astype(np.float32)
    return a, fps


def shift(x, y):
    """the whole-picture move from x to y in pixels at 108 wide, and the correlation peak (1 = a pure move)"""
    F = np.fft.fft2(x - x.mean()); G = np.fft.fft2(y - y.mean())
    R = F * np.conj(G); R /= np.abs(R) + 1e-6
    r = np.real(np.fft.ifft2(R)); i = np.unravel_index(r.argmax(), r.shape)
    dy, dx = int(i[0]), int(i[1])
    h, w = x.shape
    dy = dy - h if dy > h // 2 else dy
    dx = dx - w if dx > w // 2 else dx
    return dx, dy, float(r.max())


def runs(mask, min_len=1):
    out, i = [], 0
    while i < len(mask):
        if mask[i]:
            j = i
            while j + 1 < len(mask) and mask[j + 1]:
                j += 1
            if j - i + 1 >= min_len:
                out.append((i, j))
            i = j + 1
        else:
            i += 1
    return out


def probe(path, start=None, end=None, offset=0.0):
    a, fps = frames(path, start, end)
    t0 = (start or 0.0) + offset
    if len(a) < 2:
        return {'video': path, 'fps': fps, 'frames': len(a), 'spikes': [], 'cuts': [], 'fast': [], 'still': [], 'seconds': [], 'd': []}
    d = np.abs(np.diff(a, axis=0)).mean(axis=(1, 2))
    med = np.array([np.median(d[max(0, i - 5):i + 6]) for i in range(len(d))])
    T = lambda i: round(t0 + (i + 1) / fps, 3)   # d[i] is the change into frame i+1
    spikes, cuts = [], []
    for i in range(len(d)):
        ratio = float(d[i] / max(med[i], 0.01))
        if d[i] > 4 and ratio > 2.5 or d[i] > 18 and ratio > 3:
            dx, dy, pk = shift(a[i], a[i + 1])
            row = {'t': T(i), 'frame': int(round(T(i) * fps)), 'd': round(float(d[i]), 2), 'med': round(float(med[i]), 2), 'ratio': round(ratio, 1),
                   'shift': [dx, dy], 'peak': round(pk, 2)}
            if d[i] > 18 and ratio > 3 and pk < 0.25:
                cuts.append(row)
            else:
                row['kind'] = 'camera jump' if pk >= 0.25 and (dx or dy) else 'pop inside the frame'
                spikes.append(row)
    fast = [{'from': T(i - 1), 'to': T(j), 'frames': j - i + 1, 'peak': round(float(d[i:j + 1].max()), 1), 'at': T(i + int(d[i:j + 1].argmax()))}
            for i, j in runs(d > 6)]
    still = [{'from': T(i - 1), 'to': T(j)} for i, j in runs(d < 0.4, int(round(1.5 * fps)) - 1)]
    n = int(round(fps))
    seconds = [round(float(d[k:k + n].mean()), 1) for k in range(0, len(d), n)]
    return {'video': path, 'fps': fps, 'from': t0, 'frames': len(a), 'spikes': spikes, 'cuts': cuts, 'fast': fast, 'still': still,
            'seconds': seconds, 'd': [round(float(x), 2) for x in d]}


def text(r, table=False):
    L = [f"motion probe: {r['video']}, {r['frames']} frames at {r['fps']:g} fps from {r.get('from', 0):g} s; "
         f"{len(r['spikes'])} spike(s), {len(r['cuts'])} cut(s), {len(r['fast'])} fast run(s), {len(r['still'])} still stretch(es)"]
    L.append('SPIKES (d over 4 and 2.5 x the local median): t, frame, d, median, ratio, shift dx,dy at 108 px, peak, kind')
    L += [f"  SPIKE {s['t']:7.2f} f{s['frame']:5d}  d {s['d']:6.2f}  med {s['med']:5.2f}  x{s['ratio']:4.1f}  shift {s['shift'][0]},{s['shift'][1]}  pk {s['peak']:.2f}  {s['kind']}" for s in r['spikes']] or ['  none']
    L.append('CUTS (the picture changes outright)')
    L += [f"  CUT   {c['t']:7.2f} f{c['frame']:5d}  d {c['d']:6.2f}  pk {c['peak']:.2f}" for c in r['cuts']] or ['  none']
    L.append('FAST RUNS (d over 6): from-to s, frames, peak d at s')
    L += [f"  FAST  {f['from']:7.2f}-{f['to']:7.2f}  n{f['frames']:3d}  peak {f['peak']:5.1f} at {f['at']:.2f}" for f in r['fast']] or ['  none']
    L.append('STILL STRETCHES (d under 0.4 for 1.5 s or more)')
    L += [f"  STILL {s['from']:7.2f}-{s['to']:7.2f}" for s in r['still']] or ['  none']
    L.append('MEAN d PER SECOND: ' + ' '.join(f"{int(r.get('from', 0)) + k}:{v}" for k, v in enumerate(r['seconds'])))
    if table:
        L.append('EVERY FRAME: t d')
        L += [f"  {r.get('from', 0) + (i + 1) / r['fps']:7.3f} {x:6.2f}" for i, x in enumerate(r['d'])]
    return '\n'.join(L)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('video')
    ap.add_argument('--from', dest='start', type=float)
    ap.add_argument('--to', dest='end', type=float)
    ap.add_argument('--offset', type=float, default=0.0, help='add this to every time (the clip starts here in the film)')
    ap.add_argument('--json', help='write the whole result here')
    ap.add_argument('--table', action='store_true', help='also print d for every frame')
    a = ap.parse_args()
    r = probe(a.video, a.start, a.end, a.offset)
    if a.json:
        with open(a.json, 'w') as f:
            json.dump(r, f, indent=1)
    print(text(r, a.table))
    sys.exit(3 if r['spikes'] else 0)


if __name__ == '__main__':
    main()
