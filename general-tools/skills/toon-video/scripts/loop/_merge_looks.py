#!/usr/bin/env python3
"""_merge_looks.py <outdir> <focus>

Reads <outdir>/looks/<n>.md (the reviewers' replies, in reviewer-brief.md's form) and writes:
  <outdir>/faults.md          the reviewers' scores, the focus area's paths to 5, and the union of their faults, ranked
  <outdir>/looks/scores.json  {"reviewers": {"1": {...}}, "mean": {...}, "focus": [...]}
  <outdir>/faults.json        the ranked faults, for step.mjs (the restage check)
Faults from different reviewers on the same area whose middles are within 0.5 s of each other are one fault. Rank: the focus area first,
then how many reviewers named it, then its severity.
"""
import glob, json, os, re, sys

AREAS = ["world", "people", "light", "story", "motion", "sound"]
FOCUS = {"world": ["world", "light"], "shots": ["story", "people"], "light": ["light", "world"], "people": ["people", "story"],
         "story": ["story", "people"], "motion": ["motion"], "sound": ["sound"]}

out, focus = sys.argv[1], sys.argv[2]
fa = FOCUS.get(focus, [focus])


def section(text, name):
    m = re.search(r"^##\s*" + name + r"[^\n]*\n(.*?)(?=^##\s|\Z)", text, re.S | re.M)
    return m.group(1) if m else ""


def times(s):
    nums = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", s)]
    return (min(nums), max(nums)) if nums else (None, None)


reviewers, faults, paths = {}, [], {}
files = sorted(glob.glob(os.path.join(out, "looks", "[0-9]*.md")), key=lambda p: int(re.sub(r"\D", "", os.path.basename(p)) or 0))
for f in files:
    n = re.sub(r"\D", "", os.path.basename(f))
    t = open(f).read()
    sc = section(t, "Scores")
    s = {a: float(v) for a, v in re.findall(r"\b(" + "|".join(AREAS) + r")\s*[:=]?\s*(\d(?:\.\d+)?)", sc)}
    if not s:
        continue
    reviewers[n] = s
    for line in section(t, "Areas").splitlines():
        m = re.match(r"\s*-\s*(\w+)\s*[\d.]*\s*\|(.*)", line)
        if m and m.group(1) in fa:
            paths.setdefault(m.group(1), []).append((n, m.group(2).strip()))
    for line in section(t, "Faults").splitlines():
        p = [x.strip() for x in line.strip().lstrip("-").split("|")]
        if len(p) < 4 or p[0].lower() not in AREAS:
            continue
        sev = re.findall(r"\d", p[2])
        t0, t1 = times(p[1])
        faults.append({"area": p[0].lower(), "at": p[1], "t0": t0, "t1": t1, "sev": int(sev[0]) if sev else 2,
                       "what": p[3], "fix": p[4] if len(p) > 4 else "", "by": n})

groups = []
for f in faults:
    mid = lambda x: (x["t0"] + x["t1"]) / 2
    g = next((g for g in groups if g["area"] == f["area"] and f["t0"] is not None and g["t0"] is not None
              and abs(mid(f) - mid(g["items"][0])) <= 0.5 and f["by"] not in g["by"]), None)
    if g is None:
        groups.append({"area": f["area"], "t0": f["t0"], "t1": f["t1"], "sev": f["sev"], "by": [f["by"]], "items": [f]})
    else:
        g["by"].append(f["by"]); g["items"].append(f); g["sev"] = max(g["sev"], f["sev"])
        g["t0"], g["t1"] = min(g["t0"], f["t0"]), max(g["t1"], f["t1"])
groups.sort(key=lambda g: (g["area"] not in fa, -len(g["by"]), -g["sev"], g["t0"] if g["t0"] is not None else 99))

areas = [a for a in AREAS if any(a in s for s in reviewers.values())]
mean = {a: round(sum(s[a] for s in reviewers.values() if a in s) / sum(1 for s in reviewers.values() if a in s), 2) for a in areas}
json.dump({"reviewers": reviewers, "mean": mean, "focus": fa}, open(os.path.join(out, "looks", "scores.json"), "w"), indent=1)
json.dump([{k: g[k] for k in ("area", "t0", "t1", "sev", "by")} | {"what": g["items"][0]["what"]} for g in groups],
          open(os.path.join(out, "faults.json"), "w"), indent=1)

L = [f"# Faults ({len(reviewers)} reviewers, focus {' and '.join(fa)})", "", "## Scores", "",
     "| reviewer | " + " | ".join(areas) + " | mean |", "|---" * (len(areas) + 2) + "|"]
for n, s in reviewers.items():
    vals = [s.get(a) for a in areas]
    m = s.get("mean") or sum(v for v in vals if v is not None) / max(1, sum(v is not None for v in vals))
    L.append(f"| {n} | " + " | ".join("-" if v is None else f"{v:g}" for v in vals) + f" | {m:.2f} |")
L.append("| mean | " + " | ".join(f"{mean[a]:.2f}" for a in areas) + f" | {sum(mean.values()) / max(1, len(mean)):.2f} |")
L += ["", "## Paths to 5 (focus)", ""]
for a in fa:
    for n, p in paths.get(a, []):
        L.append(f"- {a}, reviewer {n}: {p}")
L += ["", "## Faults, ranked (the union; one fault per area and moment)", ""]
for i, g in enumerate(groups, 1):
    at = g["items"][0]["at"] if len(g["items"]) == 1 else (f"{g['t0']:g}-{g['t1']:g} s" if g["t0"] is not None else g["items"][0]["at"])
    L.append(f"{i}. {g['area']} | {at} | severity {g['sev']} | named by {len(g['by'])} ({', '.join(g['by'])})")
    for f in g["items"]:
        L.append(f"   - {f['by']}: {f['what']}" + (f" | fix: {f['fix']}" if f["fix"] else ""))
open(os.path.join(out, "faults.md"), "w").write("\n".join(L) + "\n")
print(f"faults: {len(groups)} from {len(faults)} named by {len(reviewers)} reviewers; mean " +
      ", ".join(f"{a} {mean[a]:.2f}" for a in areas))
