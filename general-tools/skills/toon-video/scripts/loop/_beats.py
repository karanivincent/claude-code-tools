#!/usr/bin/env python3
"""_beats.py <protect.md or -> <hits or -> strips|text|json

The scene's protected beats and hits, for look.sh, abjudge.sh and _verdict.py.

protect.md (in the scene's loop folder, written by the lead from the meaning sheet; X-20): one or two beats that must
not get worse, one a line:
    - 2.4-3.1 | the NO stamp lands on the letter, big and square
    - 5.0 | the too-late face turns to the window
Times are the scene clip's own seconds. Lines that do not start with "- <time>" are notes and are skipped. More than
two beats is allowed but warned: a beat list that long protects nothing.

hits: a comma list of seconds ("1.2,3.4"), or a JSON file: [1.2, 3.4], [{"t": 1.2}], [{"name": "splash", "t": 3.2}]
(audible.py's cues.json shape), or {"hits": [...]}. Each hit gets an every-frame strip from t-0.4 to t+0.4 (X-23).

Prints:
  strips  the --strips argument for frames.sh: each hit "t", each protected beat "a-b" widened by 0.2 s each side
  text    the protected beats as a numbered list for a brief, or "None named for this scene."
  json    [{"beat": 1, "t0": 2.4, "t1": 3.1, "what": "..."}]
"""
import json
import os
import re
import sys

protect_p, hits_a, mode = sys.argv[1], sys.argv[2], sys.argv[3]


def beats():
    if protect_p in ("-", "") or not os.path.exists(protect_p):
        return []
    out = []
    for line in open(protect_p, encoding="utf-8"):
        m = re.match(r"\s*[-*]\s*(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?\s*s?\s*\|\s*(.+?)\s*$", line)
        if m:
            t0 = float(m.group(1)); t1 = float(m.group(2)) if m.group(2) else t0
            out.append({"beat": len(out) + 1, "t0": t0, "t1": max(t0, t1), "what": m.group(3)})
    if len(out) > 2:
        print(f"_beats.py: {protect_p} names {len(out)} beats; X-20 asks for one or two", file=sys.stderr)
    return out


def hits():
    if hits_a in ("-", ""):
        return []
    if os.path.exists(hits_a):
        j = json.load(open(hits_a))
        if isinstance(j, dict):
            j = j.get("hits", j.get("cues", []))
        ts = []
        for x in j:
            if isinstance(x, (int, float)):
                ts.append(float(x))
            elif isinstance(x, dict):
                v = x.get("t", x.get("s", x.get("at")))
                if isinstance(v, (int, float)):
                    ts.append(float(v))
        return ts
    return [float(x) for x in hits_a.split(",") if x.strip()]


if mode == "strips":
    w = [f"{t:.2f}" for t in hits()] + [f"{max(0, b['t0'] - 0.2):.2f}-{b['t1'] + 0.2:.2f}" for b in beats()]
    print(",".join(w))
elif mode == "text":
    b = beats()
    print("\n".join(f"{x['beat']}. {x['t0']:g}" + (f"-{x['t1']:g}" if x['t1'] != x['t0'] else "") + f" s: {x['what']}" for x in b)
          if b else "None named for this scene.")
elif mode == "json":
    print(json.dumps(beats()))
else:
    sys.exit("usage: _beats.py <protect.md|-> <hits|-> strips|text|json")
