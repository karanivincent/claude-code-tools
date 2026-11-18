#!/usr/bin/env python3
"""_merge_looks.py <outdir> <focus>

Reads <outdir>/looks/<n>.md (the reviewers' replies, in reviewer-brief.md's form) and writes:
  <outdir>/faults.md          the reviewers' scores, likeness, world rows, cold read, claims checked, protected beats,
                              the focus area's paths to 5, and the union of their faults, ranked
  <outdir>/looks/scores.json  {"reviewers": {"1": {...}}, "mean": {...}, "focus": [...],
                               "likeness": {"reviewers": {"1": 6}, "mean": 6.0 or null},
                               "rows": {"W1": {"pass": ["1"], "fail": ["2"]}, ...},
                               "cold": [{"by", "at", "what", "sure"}], "claims": {"closed": n, "partly": n, "not closed": n},
                               "protect": {"1": {"holds": [...], "weaker": [...], "stronger": [...]}}}
  <outdir>/faults.json        the ranked faults, for step.mjs (the restage check)
Faults from different reviewers on the same area whose middles are within 0.5 s of each other are one fault. Rank: the
focus area first, then how many reviewers named it, then its severity. A failed world row or a thing the cold reader
could not name becomes a fault when the reviewer did not list it in Faults itself. Replies in the older form (no
Likeness, World rows, Cold read, Claims or Protected beats section) merge as before: those fields stay empty.
"""
import glob, json, os, re, sys

AREAS = ["world", "people", "light", "story", "motion", "sound"]
FOCUS = {"world": ["world", "light"], "shots": ["story", "people"], "light": ["light", "world"], "people": ["people", "story"],
         "story": ["story", "people"], "motion": ["motion"], "sound": ["sound"]}
ROW_AREA = {"W1": "world", "W2": "world", "W3": "light", "W4": "light", "W5": "people", "W6": "world", "W7": "story"}
ROWS = list(ROW_AREA)

out, focus = sys.argv[1], sys.argv[2]
fa = FOCUS.get(focus, [focus])


def section(text, name):
    m = re.search(r"^##\s*" + name + r"[^\n]*\n(.*?)(?=^##\s|\Z)", text, re.S | re.M)
    return m.group(1) if m else ""


def times(s):
    nums = [float(x) for x in re.findall(r"(?<![fW])\b\d+(?:\.\d+)?", s)]
    return (min(nums), max(nums)) if nums else (None, None)


reviewers, faults, paths = {}, [], {}
likeness, rows, cold, claims, protect = {}, {r: {"pass": [], "fail": []} for r in ROWS}, [], {"closed": 0, "partly": 0, "not closed": 0}, {}
claim_lines, extra = [], []
files = sorted(glob.glob(os.path.join(out, "looks", "[0-9]*.md")), key=lambda p: int(re.sub(r"\D", "", os.path.basename(p)) or 0))
for f in files:
    n = re.sub(r"\D", "", os.path.basename(f))
    t = open(f).read()
    sc = section(t, "Scores")
    s = {a: float(v) for a, v in re.findall(r"\b(" + "|".join(AREAS) + r")\s*[:=]?\s*(\d(?:\.\d+)?)", sc)}
    if not s:
        continue
    reviewers[n] = s
    m = re.search(r"^\s*-?\s*likeness\s*[:=]?\s*(\d+(?:\.\d+)?|-)", t, re.M | re.I)
    if m and m.group(1) != "-":
        likeness[n] = min(10.0, max(1.0, float(m.group(1))))
    for line in section(t, "Areas").splitlines():
        m = re.match(r"\s*-\s*(\w+)\s*[\d.]*\s*\|(.*)", line)
        if m and m.group(1) in fa:
            paths.setdefault(m.group(1), []).append((n, m.group(2).strip()))
    mine = []
    for line in section(t, "Faults").splitlines():
        p = [x.strip() for x in line.strip().lstrip("-").split("|")]
        if len(p) < 4 or p[0].lower() not in AREAS:
            continue
        sev = re.findall(r"\d", p[2])
        t0, t1 = times(p[1])
        fl = {"area": p[0].lower(), "at": p[1], "t0": t0, "t1": t1, "sev": int(sev[0]) if sev else 2,
              "what": p[3], "fix": p[4] if len(p) > 4 else "", "by": n}
        faults.append(fl); mine.append(fl)

    def listed(area, t0, t1):
        if t0 is None:
            return any(x["area"] == area for x in mine)
        return any(x["area"] == area and x["t0"] is not None and x["t0"] - 0.5 <= t1 and t0 <= x["t1"] + 0.5 for x in mine)

    for line in section(t, "World rows").splitlines():
        m = re.match(r"\s*-\s*(W[1-7])\b\s*:?\s*(pass|fail|yes|no)\b\s*\|?\s*([^|]*)\|?\s*(.*)", line, re.I)
        if not m:
            continue
        row, ok = m.group(1).upper(), m.group(2).lower() in ("pass", "yes")
        rows[row]["pass" if ok else "fail"].append(n)
        if not ok:
            t0, t1 = times(m.group(3))
            what = f"{row} fails: {m.group(4).strip() or m.group(3).strip()}"
            extra.append(f"- reviewer {n}: {what} ({m.group(3).strip() or 'no time given'})")
            if not listed(ROW_AREA[row], t0, t1):
                faults.append({"area": ROW_AREA[row], "at": m.group(3).strip() or "-", "t0": t0, "t1": t1, "sev": 2,
                               "what": what, "fix": "", "by": n})
    for line in section(t, "Cold read").splitlines():
        p = [x.strip() for x in line.strip().lstrip("-").split("|")]
        if len(p) < 3 or p[0].lower().startswith("none"):
            continue
        sure = p[2].lower()
        t0, t1 = times(p[0])
        cold.append({"by": n, "at": p[0], "what": p[1], "sure": p[2]})
        if "cannot" in sure and not listed("story", t0, t1):
            faults.append({"area": "story", "at": p[0], "t0": t0, "t1": t1, "sev": 3,
                           "what": f"the cold reader cannot tell what this is: {p[1]}", "fix": "make it read (shape, size, a detail that says what it is); S4-15", "by": n})
    for line in section(t, "Claims").splitlines():
        m = re.match(r"\s*-\s*(.+?):\s*(closed|partly|not closed)\b(.*)", line, re.I)
        if m:
            st = m.group(2).lower()
            claims[st] += 1
            claim_lines.append(f"- reviewer {n}: {m.group(1).strip()}: {st}{m.group(3).rstrip()}")
    for line in section(t, "Protected beats").splitlines():
        m = re.match(r"\s*-\s*(\d+)\s*:\s*(holds|weaker|stronger)\b(.*)", line, re.I)
        if m:
            protect.setdefault(m.group(1), {"holds": [], "weaker": [], "stronger": []})[m.group(2).lower()].append(
                f"{n}{(': ' + m.group(3).strip(' ()')) if m.group(3).strip(' ()') else ''}")

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
lk_mean = round(sum(likeness.values()) / len(likeness), 2) if likeness else None
answered_rows = {r: v for r, v in rows.items() if v["pass"] or v["fail"]}
json.dump({"reviewers": reviewers, "mean": mean, "focus": fa,
           "likeness": {"reviewers": likeness, "mean": lk_mean},
           "rows": answered_rows, "cold": cold, "claims": claims, "protect": protect},
          open(os.path.join(out, "looks", "scores.json"), "w"), indent=1)
json.dump([{k: g[k] for k in ("area", "t0", "t1", "sev", "by")} | {"what": g["items"][0]["what"]} for g in groups],
          open(os.path.join(out, "faults.json"), "w"), indent=1)

L = [f"# Faults ({len(reviewers)} reviewers, focus {' and '.join(fa)})", "", "## Scores", "",
     "| reviewer | " + " | ".join(areas) + " | mean | likeness |", "|---" * (len(areas) + 3) + "|"]
for n, s in reviewers.items():
    vals = [s.get(a) for a in areas]
    m = s.get("mean") or sum(v for v in vals if v is not None) / max(1, sum(v is not None for v in vals))
    L.append(f"| {n} | " + " | ".join("-" if v is None else f"{v:g}" for v in vals) + f" | {m:.2f} | {likeness.get(n, '-')} |")
L.append("| mean | " + " | ".join(f"{mean[a]:.2f}" for a in areas) + f" | {sum(mean.values()) / max(1, len(mean)):.2f} | {lk_mean if lk_mean is not None else '-'} |")
weaker = {b: v["weaker"] for b, v in protect.items() if v["weaker"]}
if weaker:
    L += ["", "## A protected beat got weaker (X-20)", ""] + [f"- beat {b}: weaker by reviewer {', '.join(v)}" for b, v in weaker.items()]
if answered_rows:
    L += ["", "## World rows (bar.md)", "", "| row | pass | fail |", "|---|---|---|"]
    L += [f"| {r} | {', '.join(v['pass']) or '-'} | {', '.join(v['fail']) or '-'} |" for r, v in answered_rows.items()]
    L += extra
if cold:
    L += ["", "## Cold read (a reviewer not shown the script; compare each name with the meaning sheet)", ""]
    L += [f"- {c['at']} | {c['what']} | {c['sure']}" for c in cold]
if claim_lines:
    L += ["", f"## The builder's claims, checked (X-31): {claims['closed']} closed, {claims['partly']} partly, {claims['not closed']} not closed", ""] + claim_lines
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
      ", ".join(f"{a} {mean[a]:.2f}" for a in areas) + f"; likeness {lk_mean if lk_mean is not None else '-'}"
      + (f"; rows failing: {', '.join(r for r, v in answered_rows.items() if v['fail'])}" if any(v['fail'] for v in answered_rows.values()) else "")
      + (f"; PROTECTED BEAT WEAKER: {', '.join(weaker)}" if weaker else ""))
