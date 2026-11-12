#!/bin/bash
# jumps.sh <clip.mp4> <outdir> [--planned <shots.json>]
# One fact for the reviewers: the frames where the picture jumps in one frame (a pop, a snap), from toon-world's
# short_qa.py. Nothing else from that report is passed on: look and light are the reviewers' to judge.
#   <outdir>/jumps.md    "One-frame jumps: f44 (1.47 s), ..." or "none", for --facts in look.sh
#   <outdir>/jumps.json  {"fps":30,"frames":[44],"times":[1.467]}
#   <outdir>/qa/         short_qa.py's own output (report.md, 2 s sheets)
# --planned: short_qa's shots.json ({"shots":[{"id":1,"a":0,"b":130}], "xfade":[[a,b]], "planned":[[a,b]]}) so a
# planned cut is not listed. short_qa.py is found at $TOON_WORLD/scripts/short_qa.py, else next to this skill.
set -eu
[ $# -ge 2 ] || { echo "usage: jumps.sh <clip.mp4> <outdir> [--planned <shots.json>]" >&2; exit 2; }
clip=$1; out=$2; shift 2; planned=""
while [ $# -gt 0 ]; do case $1 in --planned) planned=$2; shift 2;; *) echo "jumps.sh: unknown $1" >&2; exit 2;; esac; done
[ -f "$clip" ] || { echo "jumps.sh: no clip $clip" >&2; exit 1; }
here=$(cd "$(dirname "$0")" && pwd)
qa=${TOON_WORLD:-$here/../../../toon-world}/scripts/short_qa.py
[ -f "$qa" ] || { echo "jumps.sh: short_qa.py not found at $qa (set TOON_WORLD to the toon-world skill folder)" >&2; exit 1; }
py=""
for p in ${PYTHON:-} python3 python3.12 python3.11 /usr/local/bin/python3 /opt/homebrew/bin/python3.12; do
  command -v "$p" >/dev/null 2>&1 && "$p" -c "import numpy, PIL" 2>/dev/null && { py=$p; break; }
done
[ -n "$py" ] || { echo "jumps.sh: no python3 with numpy and Pillow (pip install numpy pillow, or set PYTHON)" >&2; exit 1; }
mkdir -p "$out/qa"
if [ -n "$planned" ]; then "$py" "$qa" "$clip" "$out/qa" "$planned" >/dev/null; else "$py" "$qa" "$clip" "$out/qa" >/dev/null; fi
"$py" - "$out" "$clip" <<'EOF'
import json, re, subprocess, sys
out, clip = sys.argv[1], sys.argv[2]
rep = open(f"{out}/qa/report.md").read()
m = re.search(r"POPS[^:]*:\s*\[([^\]]*)\]", rep)
frames = [int(x) for x in m.group(1).split(",") if x.strip()] if m else []
r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate",
                    "-of", "default=nw=1:nk=1", clip], capture_output=True, text=True).stdout.strip().split("/")
fps = float(r[0]) / float(r[1] if len(r) > 1 else 1)
times = [round(f / fps, 3) for f in frames]
json.dump({"fps": fps, "frames": frames, "times": times}, open(f"{out}/jumps.json", "w"))
line = ", ".join(f"f{f} ({t:.2f} s)" for f, t in zip(frames, times)) or "none"
open(f"{out}/jumps.md", "w").write(
    "## Fact from code: one-frame jumps\n\n"
    f"One-frame jumps (frame number at {fps:g} fps, clip time): {line}.\n"
    "A listed frame is a picture that changes far more in one frame than the frames around it. Look at it on the sheet:"
    " a planned cut is fine, anything else is a snap.\n")
print(f"jumps: {line}")
EOF
