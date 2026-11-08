"""Survey sheets: every frame, 60 to a sheet (2 s), 10 x 6 tiles, each labelled. Usage: survey_sheets.py <study-dir>"""
import os, sys, json
from PIL import Image, ImageDraw
d = sys.argv[1]; fd = os.path.join(d, 'frames'); sd = os.path.join(d, 'survey'); os.makedirs(sd, exist_ok=True)
fps = json.load(open(os.path.join(d, 'measures.json'))).get('fps', 30)
names = sorted(os.listdir(fd)); W, H, per = 144, 256, 60
for s in range(0, len(names), per):
    out = os.path.join(sd, f'{s // per:03d}_{s / fps:05.2f}s.jpg')
    if os.path.exists(out): continue
    im = Image.new('RGB', (W * 10, H * 6), 'black'); dr = ImageDraw.Draw(im)
    for i, f in enumerate(names[s:s + per]):
        x, y = (i % 10) * W, (i // 10) * H; n = s + i
        im.paste(Image.open(os.path.join(fd, f)).resize((W, H)), (x, y))
        dr.rectangle([x, y, x + 70, y + 12], fill='black'); dr.text((x + 2, y + 1), f'f{n} {n / fps:.1f}s', fill='yellow')
    im.save(out, quality=82)
print(d, len(os.listdir(sd)), 'survey sheets')
