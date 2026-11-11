"""Stills on the voice (toon-video stage d2): the approved still board played over the recorded voice, so the owner
watches the whole story before anything is animated.

Each line's stills share the line's time, split at its words (a line with three stills shows each for a third of its
words); the first line starts at 0 and each line runs until the next one starts. Every still carries its name in the
top-left corner, so a note can say which, and the line's words under it (a speaker's name before their quoted words).

  python3 animatic.py <board.json> <timeline.json> <stills-dir> <voice.wav> <out.mp4> [--who N=,E=ELIJAH,M=WIDOW]

  board.json     [{ "line": 1, "stills": ["00-L1-hookJar", ...] }, ...] in line order, one entry per voiced line
  timeline.json  the voice script's timeline ({ "duration", "lines": [{ "id", "who", "text", "start", "words": [{ "s" }] }] })
  stills-dir     <name>.png for every still (any size; scaled to 1080 x 1920)
Needs Pillow and ffmpeg. Writes the frames beside the video in <out>-frames/.
"""
import json
import os
import subprocess
import sys
import textwrap

from PIL import Image, ImageDraw, ImageFont

args = [a for a in sys.argv[1:] if not a.startswith('--')]
board_f, tl_f, stills, voice, out = args[:5]
who = {'N': ''}
if '--who' in sys.argv:
    for kv in sys.argv[sys.argv.index('--who') + 1].split(','):
        k, _, v = kv.partition('='); who[k] = f'{v}: ' if v else ''

board, tl = json.load(open(board_f)), json.load(open(tl_f))
lines = tl['lines']
if len(board) != len(lines):
    sys.exit(f'{len(board)} board lines but {len(lines)} voiced lines: they must match one to one')
font_path = next((p for p in ['/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'] if os.path.exists(p)), None)
big = ImageFont.truetype(font_path, 46) if font_path else ImageFont.load_default()
small = ImageFont.truetype(font_path, 30) if font_path else ImageFont.load_default()
frames = out.rsplit('.', 1)[0] + '-frames'; os.makedirs(frames, exist_ok=True)
total = tl['duration'] + 0.8
seq = []
for i, (b, l) in enumerate(zip(board, lines)):
    t0 = 0 if i == 0 else l['start']
    t1 = lines[i + 1]['start'] if i + 1 < len(lines) else total
    n, ws = len(b['stills']), [w for w in l['words'] if w.get('s') is not None]
    cuts = [t0] + [ws[round(k * len(ws) / n)]['s'] for k in range(1, n)] + [t1]
    for k, name in enumerate(b['stills']):
        im = Image.open(os.path.join(stills, f'{name}.png')).convert('RGB').resize((1080, 1920), Image.LANCZOS)
        d = ImageDraw.Draw(im)
        d.rounded_rectangle((24, 24, 24 + d.textlength(name, font=small) + 28, 76), 12, fill=(0, 0, 0))
        d.text((38, 30), name, font=small, fill=(255, 255, 255))
        tag = who.get(l['who'], f"{l['who']}: ")
        rows = textwrap.wrap(tag + l['text'], 34); y = 1920 - 120 - len(rows) * 58
        d.rounded_rectangle((40, y - 24, 1040, 1920 - 90), 20, fill=(0, 0, 0))
        for j, row in enumerate(rows):
            d.text((540, y + j * 58), row, font=big, fill=(255, 236, 150) if tag else (255, 255, 255), anchor='ma')
        p = os.path.abspath(os.path.join(frames, f'{len(seq):03d}-{name}.png')); im.save(p)
        seq.append((p, max(0.04, cuts[k + 1] - cuts[k])))
lst = os.path.join(frames, 'list.txt')
with open(lst, 'w') as fh:
    for p, dur in seq: fh.write(f"file '{p}'\nduration {dur:.3f}\n")
    fh.write(f"file '{seq[-1][0]}'\n")
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-i', voice, '-vf', 'fps=30,format=yuv420p',
                '-c:v', 'libx264', '-crf', '22', '-preset', 'fast', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out], check=True)
print(f'{len(seq)} stills, {sum(d for _, d in seq):.1f} s; shortest {min(d for _, d in seq):.2f} s -> {out}')
