#!/usr/bin/env python3
"""_verdict.py <outdir> <best.mp4> <new.mp4> [<reference.mp4>]

Reads each judge's reply (<outdir>/judge-<j>/reply.md, ending in judge-brief.md's JSON block) and its key
(<outdir>/keys/judge-<j>.key: "A=best B=new" or "A=new B=best"), and writes <outdir>/verdict.json:
  judges[]: each judge's order, scores per area for best and new, means, its pick, and its credit and blame per clip
  mean:     per area and overall, for best and new, averaged over the judges
  winner:   win (new mean higher by 0.1 or more), loss (lower by 0.1 or more), or tie
  prefer:   new, best or same: the judges' picks by majority (a tie keeps the preferred clip's credited parts)
  keep:     new or best: the clip that is best after this round (win: new; loss: best; tie: the preferred one)
  ref:      with a reference (S5-77): its mean scores, and best and new against it: diff and status (beats when 0.1 or
            more above it, ties within 0.1, below when 0.1 or more under it), and what the judges said it does better
"""
import glob, json, os, re, sys

AREAS = ["world", "people", "light", "story", "motion"]
out, best_p, new_p = sys.argv[1], sys.argv[2], sys.argv[3]
ref_p = sys.argv[4] if len(sys.argv) > 4 else None


def block(text):
    m = re.findall(r"```json\s*(\{.*?\})\s*```", text, re.S)
    cands = m or re.findall(r"(\{\s*\"A\".*\})", text, re.S)
    for c in reversed(cands):
        try:
            return json.loads(c)
        except json.JSONDecodeError:
            continue
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
        row[c] = {"scores": sc, "mean": round(sum(sc.values()) / max(1, len(sc)), 2),
                  "credit": b[x].get("credit", []), "blame": b[x].get("blame", [])}
    if isinstance(b.get("R"), dict):
        rs = {a: float(b["R"][a]) for a in AREAS if a in b["R"]}
        row["ref"] = {"scores": rs, "mean": round(sum(rs.values()) / max(1, len(rs)), 2),
                      "better_than": {order["A"]: b["R"].get("better_than_A", []), order["B"]: b["R"].get("better_than_B", [])}}
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


mean = {c: {**{a: avg(c, a) for a in AREAS}, "mean": avg(c)} for c in ("best", "new")}
diff = round(mean["new"]["mean"] - mean["best"]["mean"], 2)
winner = "win" if diff >= 0.1 else "loss" if diff <= -0.1 else "tie"
votes = [r["prefer"] for r in judges]
prefer = "new" if votes.count("new") > votes.count("best") else "best" if votes.count("best") > votes.count("new") else "same"
keep = "new" if winner == "win" or (winner == "tie" and prefer == "new") else "best"
v = {"best": os.path.abspath(best_p), "new": os.path.abspath(new_p), "judges": judges, "mean": mean, "diff": diff,
     "winner": winner, "prefer": prefer, "keep": keep, "problems": problems}
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
print(f"verdict: new {mean['new']['mean']} vs best {mean['best']['mean']} ({len(judges)} judge(s)): {winner.upper()}, "
      f"prefer {prefer}, keep {keep}" + (f"; reference {v['ref']['mean']['mean']}: new {v['ref']['new']['status']}, best {v['ref']['best']['status']}" if "ref" in v else "")
      + (f"; {'; '.join(problems)}" if problems else ""))
