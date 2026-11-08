#!/usr/bin/env python3
"""Prepare a reference video for a frame-by-frame study.

Usage: python3 prepare.py <youtube-url-or-mp4> <out-dir> [--parts 4]

Makes, inside <out-dir>:
  ref.mp4           the video (downloaded with yt-dlp, best 1080p or higher)
  frames/fNNNN.jpg  every frame at 360x640 (fNNNN = frame N, 0-based)
  full/sNNN.jpg     full-size frames, 2 a second (s001 = 0.0 s)
  sheets/NNN_T.TTs.jpg  every frame, 15 to a sheet (half a second), each labelled with frame number and time
  transcript.txt    the narration with times (whisper.cpp; for timing only, never quoted)
  measures.json     duration, fps, frames, hard cuts, scene changes, pace, stillness, loudness,
                    sharpness, fine-edge share, saturation, brightness
  parts.json        the sheet ranges for each analysis agent (--parts, default 4)

Needs ffmpeg, numpy, scipy, Pillow; yt-dlp (installed into the running Python with pip if missing) for a URL;
whisper-cli and a ggml model for the transcript (skipped with a note if missing).
"""
import argparse, glob, json, os, re, shutil, subprocess, sys
import numpy as np
from scipy import ndimage
from PIL import Image, ImageDraw

WHISPER_MODELS = [os.path.expanduser('~/.cache/telitask-x/whisper/ggml-large-v3-turbo-q5_0.bin'),
                  os.path.expanduser('~/Library/Application Support/superwhisper/ggml-medium.bin')]


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, **kw)


def download(src, out):
    dst = os.path.join(out, 'ref.mp4')
    if os.path.exists(dst):
        return dst
    if os.path.exists(src):
        shutil.copy(src, dst)
        return dst
    try:
        import yt_dlp  # noqa: F401
    except ImportError:
        run([sys.executable, '-m', 'pip', 'install', '-q', 'yt-dlp'])
    run([sys.executable, '-m', 'yt_dlp', '-q', '-f', 'bv*[height>=1080]+ba/b', '--merge-output-format', 'mp4',
         '-o', dst, src])
    return dst


def probe(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                          'stream=width,height,r_frame_rate,nb_frames:format=duration', '-of', 'json', path],
                         capture_output=True, text=True, check=True).stdout
    j = json.loads(out); s = j['streams'][0]
    num, den = s['r_frame_rate'].split('/')
    return int(s['width']), int(s['height']), float(num) / float(den), float(j['format']['duration'])


def frames_and_sheets(ref, out, fps):
    fd, full, sd = (os.path.join(out, d) for d in ('frames', 'full', 'sheets'))
    for d in (fd, full, sd):
        os.makedirs(d, exist_ok=True)
    if not os.listdir(fd):
        run(['ffmpeg', '-v', 'error', '-i', ref, '-vf', 'scale=360:640', '-q:v', '3', '-start_number', '0',
             os.path.join(fd, 'f%04d.jpg')])
    if not os.listdir(full):
        # every 15th frame exactly (s001 = frame 0); ffmpeg's fps=2 picks frames about 7 late
        step = max(1, int(round(fps / 2)))
        run(['ffmpeg', '-v', 'error', '-i', ref, '-vf', f"select='not(mod(n\\,{step}))'", '-vsync', 'vfr', '-q:v', '2',
             os.path.join(full, 's%03d.jpg')])
    names = sorted(os.listdir(fd))
    W, H, per = 240, 427, 15
    if not os.listdir(sd):
        for s in range(0, len(names), per):
            im = Image.new('RGB', (W * 5, H * 3), 'black'); dr = ImageDraw.Draw(im)
            for i, f in enumerate(names[s:s + per]):
                x, y = (i % 5) * W, (i // 5) * H
                im.paste(Image.open(os.path.join(fd, f)).resize((W, H)), (x, y))
                n = s + i
                dr.rectangle([x, y, x + 96, y + 16], fill='black')
                dr.text((x + 3, y + 2), f'f{n} {n / fps:.2f}s', fill='yellow')
            im.save(os.path.join(sd, f'{s // per:03d}_{s / fps:05.2f}s.jpg'), quality=85)
    return len(names), len(os.listdir(sd))


def transcript(ref, out):
    dst = os.path.join(out, 'transcript.txt')
    if os.path.exists(dst):
        return True
    model = next((m for m in WHISPER_MODELS if os.path.exists(m)), None)
    if not model or not shutil.which('whisper-cli'):
        open(dst, 'w').write('(no transcript: whisper-cli or a ggml model is missing)\n')
        return False
    wav = os.path.join(out, 'audio.wav')
    run(['ffmpeg', '-v', 'error', '-y', '-i', ref, '-ar', '16000', '-ac', '1', wav])
    txt = subprocess.run(['whisper-cli', '-m', model, '-f', wav, '-np'], capture_output=True, text=True).stdout
    open(dst, 'w').write(txt)
    return True


def measures(ref, fps, dur):
    w, h, _, _ = probe(ref)
    m = {'duration_s': round(dur, 2), 'fps': round(fps, 3), 'width': w, 'height': h}
    log = subprocess.run(['ffmpeg', '-i', ref, '-vf', "select='gt(scene,0.1)',showinfo", '-an', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    scenes = [float(x) for x in re.findall(r'pts_time:([0-9.]+)', log)]
    log3 = subprocess.run(['ffmpeg', '-i', ref, '-vf', "select='gt(scene,0.3)',showinfo", '-an', '-f', 'null', '-'],
                          capture_output=True, text=True).stderr
    m['hard_cuts_scene_over_0.3'] = len(re.findall(r'pts_time:', log3))
    m['scene_changes_over_0.1_s'] = [round(x, 2) for x in scenes]
    # pace: big picture changes a minute at 2 fps on a 32x56 thumbnail (as bible-shorts scripts/pace.py)
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', ref, '-vf', 'fps=2,scale=32:56', '-f', 'rawvideo',
                          '-pix_fmt', 'rgb24', '-'], capture_output=True).stdout
    a = np.frombuffer(raw, np.uint8).reshape(-1, 56 * 32 * 3).astype(np.float32)
    d = np.abs(np.diff(a, axis=0)).mean(1)
    m['pace_big_changes_a_minute'] = int(round((d > 40).sum() / (len(a) / 2) * 60))
    m['share_still'] = round(float((d < 4).mean()), 3)
    # look: sharpness, fine edges, saturation, brightness (as toon-world scripts/measure_sharp.py)
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', ref, '-vf', 'fps=2', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                         capture_output=True).stdout
    F = np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3).astype(np.float32)
    r0, r1, c0, c1 = int(h * .10), int(h * .89), int(w * .09), int(w * .91)
    sat, sharp, edges, bright = [], [], [], []
    for f in F:
        mx, mn = f.max(2), f.min(2); sat.append(((mx - mn) / (mx + 1e-3)).mean())
        g = f.mean(2); bright.append(g.mean()); c = g[r0:r1, c0:c1]
        sharp.append(ndimage.laplace(c).var())
        edges.append((np.hypot(ndimage.sobel(c, 0), ndimage.sobel(c, 1)) > 60).mean())
    m.update(sharpness=round(float(np.mean(sharp))), fine_edge_share=round(float(np.mean(edges)), 3),
             saturation=round(float(np.mean(sat)), 3), brightness=round(float(np.mean(bright))))
    eb = subprocess.run(['ffmpeg', '-i', ref, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
    lu = re.findall(r'I:\s+(-?[0-9.]+) LUFS', eb)
    m['loudness_lufs'] = float(lu[-1]) if lu else None
    return m


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('src'); ap.add_argument('out'); ap.add_argument('--parts', type=int, default=4)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    ref = download(a.src, a.out)
    w, h, fps, dur = probe(ref)
    nframes, nsheets = frames_and_sheets(ref, a.out, fps)
    has_t = transcript(ref, a.out)
    m = measures(ref, fps, dur); m['frames'] = nframes; m['sheets'] = nsheets
    json.dump(m, open(os.path.join(a.out, 'measures.json'), 'w'), indent=1)
    k = -(-nsheets // a.parts)
    parts = []
    for i in range(a.parts):
        s0, s1 = i * k, min(nsheets, (i + 1) * k) - 1
        if s0 > s1:
            break
        parts.append({'part': i + 1, 'sheets': [s0, s1], 'frames': [s0 * 15, min(nframes, (s1 + 1) * 15) - 1],
                      'seconds': [round(s0 * 15 / fps, 2), round(min(nframes, (s1 + 1) * 15) / fps, 2)]})
    json.dump(parts, open(os.path.join(a.out, 'parts.json'), 'w'), indent=1)
    # glance.jpg: seven full-size frames spread over the video, for a first look
    fulls = sorted(glob.glob(os.path.join(a.out, 'full', 's*.jpg')))
    if fulls:
        pick = [fulls[int(i * (len(fulls) - 1) / 6)] for i in range(7)]
        g = Image.new('RGB', (7 * 300, 533))
        for i, f in enumerate(pick):
            g.paste(Image.open(f).resize((300, 533)), (i * 300, 0))
        g.save(os.path.join(a.out, 'glance.jpg'), quality=82)
    print(json.dumps({k: v for k, v in m.items() if k != 'scene_changes_over_0.1_s'}, indent=1))
    print('transcript:', 'yes' if has_t else 'missing'); print('parts:', json.dumps(parts))


if __name__ == '__main__':
    main()
