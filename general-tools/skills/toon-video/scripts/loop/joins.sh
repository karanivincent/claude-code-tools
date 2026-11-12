#!/bin/bash
# joins.sh <film.mp4> <joins.json> <outdir> [--no-review]
#
# Checks every join between two scenes of the joined film:
#   1. one-frame jumps (jumps.sh, run once on the whole film) within 0.5 s of the join. At a hard cut the cut frame
#      itself is expected; any other jump there, or any jump at a swing, dissolve or journey, is a fault;
#   2. a 2 s clip around the join (outdir/join-<i>/clip.mp4) with 12 fps sheets, for one Sonnet reviewer, run in the
#      FOREGROUND (all joins at once, then waits). --no-review stops after cutting the clips.
# Writes <outdir>/joins.md: one row per join with the jumps, the reviewer's verdict, the scene that owns the fix and why.
#
# joins.json: a list (or {"joins": [...]}) of
#   {"at": 7.20, "from": "edge", "to": "fall", "kind": "cut", "why": "a new place"}
# "at" (or "t") is the film second of the join; kind is cut, dissolve, swing or journey (default cut).
set -eu
usage() { echo "usage: joins.sh <film.mp4> <joins.json> <outdir> [--no-review]" >&2; exit 2; }
[ $# -ge 3 ] || usage
film=$1; joins=$2; out=$3; review=1
[ "${4:-}" = "--no-review" ] && review=0
here=$(cd "$(dirname "$0")" && pwd)
for f in "$film" "$joins"; do [ -f "$f" ] || { echo "joins.sh: missing file $f" >&2; exit 1; }; done
mkdir -p "$out"; out=$(cd "$out" && pwd); T0=$(date +%s)

"$here/jumps.sh" "$film" "$out/film" >/dev/null
dur=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$film")
# one line per join: i|at|from|to|kind|why
python3 - "$joins" > "$out/joins.txt" <<'EOF'
import json, sys
j = json.load(open(sys.argv[1])); j = j.get("joins", j) if isinstance(j, dict) else j
for i, x in enumerate(j, 1):
    at = float(x.get("at", x.get("t", 0)))
    clean = lambda s: str(s).replace("|", "/").replace("\n", " ")
    print(f"{i}|{at:.3f}|{clean(x.get('from', '?'))}|{clean(x.get('to', '?'))}|{clean(x.get('kind', 'cut'))}|{clean(x.get('why', ''))}")
EOF
[ -s "$out/joins.txt" ] || { echo "joins.sh: no joins in $joins" >&2; exit 1; }

pids=""
while IFS='|' read -r i at from to kind why; do
  d=$out/join-$i; mkdir -p "$d"
  ss=$(awk -v a="$at" 'BEGIN{s=a-1; if(s<0)s=0; printf "%.3f", s}')
  ffmpeg -nostdin -v error -y -ss "$ss" -i "$film" -t 2 -c:v libx264 -crf 18 -preset fast -c:a aac -b:a 160k "$d/clip.mp4"
  "$here/frames.sh" "$d/clip.mp4" "$d/frames" 12 >/dev/null
  rel=$(awk -v a="$at" -v s="$ss" 'BEGIN{printf "%.2f", a-s}')
  cat > "$d/brief.md" <<EOF
You check one join between two scenes of a cartoon video (a phone video in a drawn 2D toon look: flat round cartoon
people as cards in a 3D world). Read only files in $d. Reply with text; do not write any file.

The join: scene "$from" into scene "$to", at $rel s in this 2 s clip. Planned as: $kind. ${why:+Its reason: $why.}
A cut is a hard cut to a new shot; a dissolve blends two moving shots over about half a second; a swing or a journey
is one camera move that carries across with no cut.

Open $d/frames/sheet-01.jpg (12 frames a second, clip time and frame number at each tile's top left), then every file
in $d/frames/full/ (ls it first). You may open single tiles in $d/frames/f6/.

Does the join play as planned? Look for: a jump between two neighbouring tiles where there should be none; a figure,
prop or light that pops, moves or changes colour across the join; the camera crossing the line so screen direction
flips; a light or grade change with no reason; a held frame or a stutter; a cut that reads as a mistake.

Reply in exactly these lines, nothing else:
verdict: good | fault
owner: $from | $to | both
why: one or two sentences with the seconds and what you see, and the fix
EOF
  if [ $review = 1 ]; then
    (cd "$d" && claude -p "Follow the brief in $d/brief.md exactly. Read it first. Reply with text only." \
       --model sonnet --allowedTools "Read,Glob" < /dev/null > "$d/review.md" 2> "$d/review.err") &
    pids="$pids $!"
  fi
done < "$out/joins.txt"
for p in $pids; do wait $p || true; done

python3 - "$out" "$review" <<'EOF'
import json, os, re, sys
out, review = sys.argv[1], sys.argv[2] == "1"
J = json.load(open(f"{out}/film/jumps.json")); fps = J["fps"]
L = ["# Joins", "", f"Film jumps (code): {', '.join(f'f{f} ({t:.2f} s)' for f, t in zip(J['frames'], J['times'])) or 'none'}", "",
     "| join | at | kind | jumps within 0.5 s (code) | reviewer | owner | why |", "|---|---|---|---|---|---|---|"]
bad = 0
for line in open(f"{out}/joins.txt"):
    i, at, frm, to, kind, why = line.rstrip("\n").split("|")
    at = float(at); cut = round(at * fps)
    near = [f for f, t in zip(J["frames"], J["times"]) if abs(t - at) <= 0.5]
    faults = [f for f in near if not (kind == "cut" and abs(f - cut) <= 1)]
    jt = ", ".join(f"f{f}" + ("" if f in faults else " (the cut)") for f in near) or "none"
    v = o = w = "-"
    if review:
        r = open(f"{out}/join-{i}/review.md").read() if os.path.exists(f"{out}/join-{i}/review.md") else ""
        g = lambda k: (re.search(rf"^\s*{k}:\s*(.+)$", r, re.M | re.I) or [None, "?"])[1].strip()
        v, o, w = g("verdict"), g("owner"), g("why")
    if faults or v.lower().startswith("fault"):
        bad += 1
    L.append(f"| {i} {frm} > {to} | {at:.2f} s | {kind} | {jt}{' FAULT' if faults else ''} | {v} | {o} | {w} |")
L += ["", f"{bad} join(s) to fix. A bad join goes back to the scene that owns it, as a round there."]
open(f"{out}/joins.md", "w").write("\n".join(L) + "\n")
print("\n".join(L[-1:]))
EOF
echo "joins: $(( ($(date +%s) - T0) / 60 )) min $(( ($(date +%s) - T0) % 60 )) s -> $out/joins.md"
