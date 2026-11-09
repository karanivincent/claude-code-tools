#!/usr/bin/env python3
"""Measure a prepared study second by second: plain numbers, no judgement.

    python3 observe_seconds.py <study-dir> [out.jsonl]

<study-dir> is what prepare.py made (ref.mp4, audio.wav, transcript.txt, measures.json). Writes one JSON line per
second (default <study-dir>/observe/seconds.jsonl):

  t            the second (0, 1, 2 ...), measured over [t, t+1)
  bright       mean brightness, 0-255
  sat          mean saturation, (max-min)/max, 0-1
  colours      the five main colours of the frame at t+0.5, each [hex, share of the frame]
  sharp        Laplacian variance of the middle 80% of that frame at full size (as measures.json)
  edges        share of that frame with a strong edge (Sobel over 60)
  motion       mean absolute change between neighbouring frames in the second, 0-255
  cuts         times in the second where the picture changes completely (scene score over 0.3)
  changes      times where it changes a lot (scene score over 0.1): dissolves, whips, flashes
  loud_db      sound level of the second, dBFS (RMS)
  line         the narration line being spoken at t+0.5, from transcript.txt ("" if none)

Needs numpy, scipy and Pillow (run with -I when the study folder holds downloaded files).
"""
import json, re, subprocess, sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.io import wavfile


def probe(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                          'stream=width,height,r_frame_rate:format=duration', '-of', 'json', str(path)],
                         capture_output=True, text=True, check=True).stdout
    j = json.loads(out); s = j['streams'][0]
    num, den = s['r_frame_rate'].split('/')
    return int(s['width']), int(s['height']), float(num) / float(den), float(j['format']['duration'])


def scene_times(ref, thr):
    log = subprocess.run(['ffmpeg', '-i', str(ref), '-vf', f"select='gt(scene,{thr})',showinfo", '-an', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    return [float(x) for x in re.findall(r'pts_time:([0-9.]+)', log)]


def lines(transcript):
    out = []
    if not transcript.exists():
        return out
    for m in re.finditer(r'\[(\d+):(\d+):([\d.]+) --> (\d+):(\d+):([\d.]+)\]\s*(.*)', transcript.read_text()):
        a = int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])
        b = int(m[4]) * 3600 + int(m[5]) * 60 + float(m[6])
        out.append((a, b, m[7].strip()))
    return out


def main():
    study = Path(sys.argv[1])
    ref = study / 'ref.mp4'
    dest = Path(sys.argv[2]) if len(sys.argv) > 2 else study / 'observe' / 'seconds.jsonl'
    dest.parent.mkdir(parents=True, exist_ok=True)
    w, h, fps, dur = probe(ref)

    # every frame small, for brightness, saturation and motion
    sw, sh = 108, 192
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(ref), '-vf', f'scale={sw}:{sh}', '-f', 'rawvideo',
                          '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True).stdout
    small = np.frombuffer(raw, np.uint8).reshape(-1, sh, sw, 3).astype(np.float32)

    cuts, changes = scene_times(ref, 0.3), scene_times(ref, 0.1)
    said = lines(study / 'transcript.txt')
    rate, audio = (wavfile.read(study / 'audio.wav') if (study / 'audio.wav').exists() else (None, None))
    if audio is not None:
        peak = {np.dtype('int16'): 32768.0, np.dtype('int32'): 2147483648.0}.get(audio.dtype, 1.0)
        audio = audio.astype(np.float64) / peak
        if audio.ndim > 1:
            audio = audio.mean(1)

    rows = []
    for t in range(int(np.ceil(dur))):
        a, b = int(t * fps), min(len(small), int((t + 1) * fps))
        if a >= len(small):
            break
        seg = small[a:b]
        mx, mn = seg.max(3), seg.min(3)
        row = {'t': t,
               'bright': round(float(seg.mean()), 1),
               'sat': round(float(((mx - mn) / (mx + 1e-3)).mean()), 3),
               'motion': round(float(np.abs(np.diff(seg, axis=0)).mean()) if len(seg) > 1 else 0.0, 2)}
        mid = min(dur - 0.05, t + 0.5)
        frame = b''
        for at in (mid, mid - 0.25, t + 0.05):   # a seek too near the end returns nothing: step back
            frame = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{max(0, at):.3f}', '-i', str(ref), '-frames:v', '1',
                                    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True).stdout
            if len(frame) >= w * h * 3:
                break
        if len(frame) < w * h * 3:
            break
        F = np.frombuffer(frame, np.uint8)[: w * h * 3].reshape(h, w, 3)
        img = Image.fromarray(F).resize((270, 480))
        q = img.quantize(colors=5, method=Image.Quantize.MEDIANCUT)
        pal, counts = q.getpalette(), q.getcolors()
        total = sum(c for c, _ in counts)
        row['colours'] = [['#%02x%02x%02x' % tuple(pal[i * 3:i * 3 + 3]), round(c / total, 3)]
                          for c, i in sorted(counts, reverse=True)]
        g = F.astype(np.float32).mean(2)
        c = g[int(h * .10):int(h * .89), int(w * .09):int(w * .91)]
        row['sharp'] = round(float(ndimage.laplace(c).var()))
        row['edges'] = round(float((np.hypot(ndimage.sobel(c, 0), ndimage.sobel(c, 1)) > 60).mean()), 3)
        row['cuts'] = [round(x, 2) for x in cuts if t <= x < t + 1]
        row['changes'] = [round(x, 2) for x in changes if t <= x < t + 1]
        if audio is not None:
            s = audio[int(t * rate):int((t + 1) * rate)]
            row['loud_db'] = round(float(20 * np.log10(np.sqrt((s ** 2).mean()) + 1e-9)), 1) if len(s) else None
        row['line'] = next((txt for a0, b0, txt in said if a0 <= mid < b0), '')
        rows.append(row)

    dest.write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in rows))
    print(f'{dest}: {len(rows)} seconds')


if __name__ == '__main__':
    main()
