"""Thumbnail cards for a Short (story-thumbnails skill; frames from tools/render.mjs --stills with FILM_DEBUG=clean): words on a clean frame, kept inside the centre 3:2 band that
YouTube shows on home, the channel page and search; plus that crop and a 120 px copy for the glance test.
  python3 thumbs.py <cards.json> <frames dir> <out dir>
cards.json: [{"id": "...", "frame": "033.3.png", "words": ["STILL", "FIGHTING"], "y": 0.62, "colour": "#ffd23f"}]
y is the words' centre as a share of the frame height (kept inside the band); frames are 1080x1920 renders.
Bright cards (story-thumbnails rule): each card prints its average brightness (0-255), whole frame and 3:2 band, and is
flagged DARK under 115 / 100. A dark card is re-lit at render (Film's `relight` prop through tools/stills.mjs: key light,
lighter shade, pictures, fog, sky), never brightened afterwards: a curve on the image only greys the night and the ink.
"""
import json, sys, os
from PIL import Image, ImageDraw, ImageFont, ImageStat
FONT = '/System/Library/Fonts/Supplemental/Arial Black.ttf'
MIN_FRAME, MIN_BAND = 115, 100
cards, frames, out = json.load(open(sys.argv[1])), sys.argv[2], sys.argv[3]
os.makedirs(out, exist_ok=True)
for c in cards:
    im = Image.open(os.path.join(frames, c['frame'])).convert('RGB')
    if im.size != (1080, 1920): im = im.resize((1080, 1920), Image.LANCZOS)
    W, H = im.size
    band_top, band_h = (H - W * 2 // 3) // 2, W * 2 // 3          # the 3:2 crop: 1080 x 720 in the middle
    words = [w.upper() for w in c.get('words', [])]
    if words:
        d = ImageDraw.Draw(im)
        size = int(H * 0.075)                                     # cap height ~ 12-14% of the 3:2 crop's height
        font = ImageFont.truetype(FONT, size)
        while max(d.textlength(w, font=font) for w in words) > W * 0.9 and size > 40:
            size -= 4; font = ImageFont.truetype(FONT, size)
        lh = int(size * 1.08); total = lh * len(words)
        cy = int(H * c.get('y', 0.5)); top = min(max(cy - total // 2, band_top + 20), band_top + band_h - total - 20)
        for i, w in enumerate(words):
            x = (W - d.textlength(w, font=font)) / 2
            d.text((x, top + i * lh), w, font=font, fill=c.get('colour', '#ffd23f'), stroke_width=max(8, size // 7), stroke_fill='#241726')
    fm, bm = (ImageStat.Stat(x.convert('L')).mean[0] for x in (im, im.crop((0, band_top, W, band_top + band_h))))
    print(f"{c['id']}: brightness frame {fm:.0f}, band {bm:.0f}" + ('' if fm >= MIN_FRAME and bm >= MIN_BAND else f'  DARK: re-light it (rule {MIN_FRAME} / {MIN_BAND})'))
    im.save(os.path.join(out, f"{c['id']}.jpg"), quality=92)
    crop = im.crop((0, band_top, W, band_top + band_h)); crop.save(os.path.join(out, f"{c['id']}-3x2.jpg"), quality=90)
    crop.resize((120, 80), Image.LANCZOS).save(os.path.join(out, f"{c['id']}-120.png"))
print(len(cards), 'cards ->', out)
