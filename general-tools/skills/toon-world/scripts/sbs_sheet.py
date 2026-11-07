# Side-by-side review sheet: row 1 = our frames, row 2 = reference frames, all scaled to the same height.
# Usage: python scripts/sbs_sheet.py out.jpg --ours a.jpg b.jpg ... --ref r1.jpg r2.jpg ... [--h 640]
import sys
from PIL import Image

args = sys.argv[1:]
out, rows, cur, h = args[0], {"--ours": [], "--ref": []}, None, 640
i = 1
while i < len(args):
    a = args[i]
    if a in rows: cur = a
    elif a == "--h": h = int(args[i + 1]); i += 1
    else: rows[cur].append(a)
    i += 1

def row(paths):
    ims = [Image.open(p).convert("RGB") for p in paths]
    ims = [im.resize((round(im.width * h / im.height), h), Image.LANCZOS) for im in ims]
    r = Image.new("RGB", (sum(im.width for im in ims) + 8 * (len(ims) - 1), h), "white")
    x = 0
    for im in ims:
        r.paste(im, (x, 0)); x += im.width + 8
    return r

rs = [row(rows[k]) for k in ("--ours", "--ref") if rows[k]]
W = max(r.width for r in rs)
S = Image.new("RGB", (W, sum(r.height for r in rs) + 16 * (len(rs) - 1)), "white")
y = 0
for r in rs:
    S.paste(r, (0, y)); y += r.height + 16
S.save(out, quality=88)
print(out, S.size)
