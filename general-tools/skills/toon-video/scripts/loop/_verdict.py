#!/usr/bin/env python3
"""_verdict.py <outdir> <best.mp4> <new.mp4> [<reference.mp4>] [--protect <protect.md>]

Reads each judge's reply (<outdir>/judge-<j>/reply.md, ending in judge-brief.md's JSON block) and its key
(<outdir>/keys/judge-<j>.key: "A=best B=new" or "A=new B=best"), and writes <outdir>/verdict.json:
  judges[]:  each judge's order, scores per area for best and new, means, likeness, world rows, what it could not
             name, its pick, its protected-beat picks, and its credit and blame per clip
  mean:      per area and overall, for best and new, averaged over the judges; "likeness" (1 to 10, null without a
             reference frame) and "rows_failed" (the world rows a judge failed, with how many judges failed each)
  winner:    win (new mean higher by 0.1 or more), loss (lower by 0.1 or more), or tie; a loss whatever the means when
             a protected beat got weaker (X-20)
  prefer:    new, best or same: the judges' picks by majority (after a tie the next round carries what they credited)
  keep:      new or best: the clip that is best after this round (new only on a clear win, S5-133; a tie keeps best)
  second:    true when one judge scored new 0.1 to 0.3 higher and preferred it: abjudge.sh brings in a second judge
  protected: with --protect: per beat, the judges' votes (new, best, same) and "weaker": true when more judges
             picked best than new on it
  ref:       with a reference clip (S5-112): its mean scores, and best and new against it: diff and status (beats when 0.1
             or more above it, ties within 0.1, below when 0.1 or more under it), and what the judges said it does better
Replies in the older form (no likeness, rows, unnamed or protected) read as before: those fields stay empty.
"""
import glob, json, os, re, subprocess, sys

AREAS = ["world", "people", "light", "story", "motion"]
args = sys.argv[1:]
protect_p = None
narrow = None  # the first judge's margin, when it was 0.1 to 0.3 and a second judge was brought in with the order swapped (S5-133)
if "--narrow" in args:
    i = args.index("--narrow"); narrow = float(args[i + 1]); del args[i:i + 2]
if "--protect" in args:
    i = args.index("--protect"); protect_p = args[i + 1]; del args[i:i + 2]
out, best_p, new_p = args[0], args[1], args[2]
ref_p = args[3] if len(args) > 3 else None
here = os.path.dirname(os.path.abspath(__file__))
beats = json.loads(subprocess.run([sys.executable, os.path.join(here, "_beats.py"), protect_p, "-", "json"],
                                  capture_output=True, text=True, check=True).stdout) if protect_p else []


def block(text):
    m = re.findall(r"```json\s*(\{.*?\})\s*```", text, re.S)
    cands = m or re.findall(r"(\{\s*\"A\".*\})", text, re.S)
    for c in reversed(cands):
        try:
            return json.loads(c)
        except json.JSONDecodeError:
            continue
    return None


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


judges, problems = [], []
for d in sorted(glob.glob(os.path.join(out, "judge-*"))):
    j = os.path.basename(d).split("-", 1)[1]
    key = open(os.path.join(out, "keys", f"judge-{j}.key")).read()
    order = {"A": "best", "B": "new"} if "A=best" in key else {"A": "new", "B": "best"}
    reply = open(os.path.join(d, "reply.md")).read() if os.path.exists(os.path.join(d, "reply.md")) else ""
    b = block(reply)
    if not b or "A" not in b or "B" not in b:
        problems.append(f"judge {j}: no JSON block in reply.md")
        continue
    row = {"judge": j, "order": f"A={order['A']} B={order['B']}"}
    for x in ("A", "B"):
        c = order[x]
        sc = {a: float(b[x][a]) for a in AREAS if a in b[x]}
        lk = num(b[x].get("likeness"))
        rows = b[x].get("rows") if isinstance(b[x].get("rows"), dict) else {}
        row[c] = {"scores": sc, "mean": round(sum(sc.values()) / max(1, len(sc)), 2),
                  "likeness": None if lk is None else min(10.0, max(1.0, lk)),
                  "rows_failed": sorted(k.upper() for k, v in rows.items() if str(v).lower() in ("fail", "no", "false")),
                  "unnamed": b[x].get("unnamed", []) or [],
                  "credit": b[x].get("credit", []), "blame": b[x].get("blame", [])}
    if isinstance(b.get("R"), dict):
        rs = {a: float(b["R"][a]) for a in AREAS if a in b["R"]}
        row["ref"] = {"scores": rs, "mean": round(sum(rs.values()) / max(1, len(rs)), 2),
                      "better_than": {order["A"]: b["R"].get("better_than_A", []), order["B"]: b["R"].get("better_than_B", [])}}
    if beats:
        picks = {}
        for p in b.get("protected", []) or []:
            if isinstance(p, dict) and str(p.get("beat", "")).strip().isdigit():
                picks[int(str(p["beat"]).strip())] = order.get(str(p.get("better", "same")).strip()[:1].upper(), "same")
        row["protected"] = picks
        missing = [x["beat"] for x in beats if x["beat"] not in picks]
        if missing:
            problems.append(f"judge {j}: no pick for protected beat(s) {', '.join(map(str, missing))}")
    pick = str(b.get("better", "same")).strip()
    row["prefer"] = order.get(pick, "same")
    row["by"] = b.get("by", "")
    judges.append(row)

if not judges:
    print("verdict: " + "; ".join(problems), file=sys.stderr)
    sys.exit(1)


def avg(c, a=None):
    v = [r[c]["scores"][a] for r in judges if a in r[c]["scores"]] if a else [r[c]["mean"] for r in judges]
    return round(sum(v) / len(v), 2) if v else None


def lk_avg(c):
    v = [r[c]["likeness"] for r in judges if r[c].get("likeness") is not None]
    return round(sum(v) / len(v), 2) if v else None


def rows_failed(c):
    out_ = {}
    for r in judges:
        for w in r[c].get("rows_failed", []):
            out_[w] = out_.get(w, 0) + 1
    return out_


mean = {c: {**{a: avg(c, a) for a in AREAS}, "mean": avg(c), "likeness": lk_avg(c), "rows_failed": rows_failed(c)}
        for c in ("best", "new")}
diff = round(mean["new"]["mean"] - mean["best"]["mean"], 2)
votes = [r["prefer"] for r in judges]
prefer = "new" if votes.count("new") > votes.count("best") else "best" if votes.count("best") > votes.count("new") else "same"
# A clear win (S5-133): the same clip scored 3.1 to 3.6 with different judges, so a margin of 0.3 or less from one judge
# is not a win on its own. One judge: more than 0.3. Two (the second sees the clips in the other order): both prefer
# new and they average 0.1 or more. Three or more (a film): 0.1 or more and most prefer new. Anything else above a
# loss is a tie, and a tie keeps best.
CLEAR = 0.3
if diff <= -0.1:
    winner = "loss"
elif len(judges) == 1:
    winner = "win" if diff > CLEAR else "tie"
elif len(judges) == 2:
    winner = "win" if diff >= 0.1 and votes.count("new") == 2 else "tie"
else:
    winner = "win" if diff >= 0.1 and prefer == "new" else "tie"
protected, weaker = [], []
for x in beats:
    vs = [r.get("protected", {}).get(x["beat"]) for r in judges]
    tally = {k: vs.count(k) for k in ("new", "best", "same")}
    w = tally["best"] > tally["new"]
    protected.append({**x, "votes": tally, "weaker": w})
    if w:
        weaker.append(x["beat"])
if weaker:  # X-20: a round that weakens a protected beat loses, whatever its average
    winner = "loss"
keep = "new" if winner == "win" else "best"
second = len(judges) == 1 and winner == "tie" and 0.1 <= diff <= CLEAR and prefer == "new"
v = {"best": os.path.abspath(best_p), "new": os.path.abspath(new_p), "judges": judges, "mean": mean, "diff": diff,
     "winner": winner, "prefer": prefer, "keep": keep, "second": second, "problems": problems}
if narrow is not None:
    v["narrow"] = {"first_diff": narrow, "judges": len(judges), "rule": "S5-133: one judge's margin of 0.1 to 0.3 is judged again with A and B swapped; a win only when both prefer new and they average 0.1 or more"}
if beats:
    v["protected"] = protected
    if weaker:
        v["lost_on"] = f"protected beat {', '.join(map(str, weaker))} weaker in new (X-20)"
rj = [r for r in judges if "ref" in r]
if ref_p and rj:
    rmean = {**{a: (round(sum(r["ref"]["scores"][a] for r in rj if a in r["ref"]["scores"]) / max(1, sum(1 for r in rj if a in r["ref"]["scores"])), 2)) for a in AREAS},
             "mean": round(sum(r["ref"]["mean"] for r in rj) / len(rj), 2)}
    def against(c):
        d = round(mean[c]["mean"] - rmean["mean"], 2)
        return {"diff": d, "status": "beats" if d >= 0.1 else "below" if d <= -0.1 else "ties",
                "short": [x for r in rj for x in r["ref"]["better_than"].get(c, [])]}
    v["ref"] = {"clip": os.path.abspath(ref_p), "mean": rmean, "best": against("best"), "new": against("new"),
                "notes": [x for r in rj for x in r["ref"]["better_than"].get("new", [])]}
elif ref_p:
    problems.append("a reference was given but no judge scored R")
json.dump(v, open(os.path.join(out, "verdict.json"), "w"), indent=1)
lk = mean["new"]["likeness"]
print(f"verdict: new {mean['new']['mean']} vs best {mean['best']['mean']} ({len(judges)} judge(s)): {winner.upper()}, "
      f"prefer {prefer}, keep {keep}; likeness new {lk if lk is not None else '-'}, best {mean['best']['likeness'] if mean['best']['likeness'] is not None else '-'}"
      + (f"; {v['lost_on']}" if weaker else "")
      + (f"; reference {v['ref']['mean']['mean']}: new {v['ref']['new']['status']}, best {v['ref']['best']['status']}" if "ref" in v else "")
      + (f"; {'; '.join(problems)}" if problems else ""))
