"""A caption file (SRT) for YouTube from a story's voice timeline: short phrases of the narration at their spoken times.
  python3 tools/srt.py src/stories/<slug>/full.json ready/<slug>/captions-en.srt [max chars, default 32]
full.json: {"lines": [{"words": [{"w": "In", "s": 0.35, "e": 0.407}, ...]}, ...]} in film time (seconds).
A phrase ends at a sentence or comma break, at the character limit, or at a pause over 0.35 s; it stays up until the
next phrase starts (gaps under 0.6 s) so the text never flickers."""
import json, sys
src, out = sys.argv[1], sys.argv[2]
LIM = int(sys.argv[3]) if len(sys.argv) > 3 else 32
words = [w for l in json.load(open(src))['lines'] for w in l['words']]
cues, cur = [], []
for i, w in enumerate(words):
    cur.append(w)
    nxt = words[i + 1] if i + 1 < len(words) else None
    text = ' '.join(x['w'] for x in cur)
    brk = (nxt is None or w['w'][-1] in '.!?' or (w['w'][-1] in ',;:' and len(text) > 12)
           or (len(text) + 1 + len(nxt['w']) > LIM and not (nxt['w'][-1] in '.!?' and len(text) + 1 + len(nxt['w']) <= LIM + 10)) or nxt['s'] - w['e'] > 0.35)
    if brk: cues.append([cur[0]['s'], cur[-1]['e'], text]); cur = []
for a, b in zip(cues, cues[1:]):
    a[1] = b[0] - 0.02 if b[0] - a[1] < 0.6 else a[1] + 0.3
cues[-1][1] += 0.5
ts = lambda t: f"{int(t // 3600):02}:{int(t % 3600 // 60):02}:{int(t % 60):02},{int(round(t % 1 * 1000)) % 1000:03}"
with open(out, 'w') as f:
    for n, (s, e, t) in enumerate(cues, 1): f.write(f"{n}\n{ts(s)} --> {ts(e)}\n{t}\n\n")
print(len(cues), 'captions ->', out)
