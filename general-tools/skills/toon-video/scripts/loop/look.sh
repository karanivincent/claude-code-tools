#!/bin/bash
# look.sh <clip.mp4> <outdir> --focus <world|shots|people|light|story|motion|sound>
#         [--meaning <file>] [--prior <file>] [--words <words.json>] [--actions w1,w2,...]
#         [--facts <file>]... [--no-jumps] [--brief <file>] [--models "sonnet sonnet opus"]
#
# Three reviewers on one scene clip, run in the FOREGROUND with `claude -p` (two Sonnet on the 6 fps sheets and the
# half-size frames, one Opus on full-size stills at the action words), all three at once; waits for all of them.
# (In the spikes, reviewers started as background agents died when the turn ended: that is why they run here.)
#
# Writes, in <outdir> (a round folder, <pass>-r<n>/):
#   looks/frames/        sheets and frames (frames.sh)       looks/words/   full-size stills for reviewer 3
#   looks/brief<n>.md    each reviewer's filled brief        looks/<n>.md   each reviewer's reply
#   looks/scores.json    scores per reviewer and the mean    faults.md      the union of the faults, ranked
#   jumps.md             one-frame jumps (jumps.sh), unless --no-jumps or it is there already
#
# --meaning   the scene's meaning sheet (what it must say, the words and their times); pasted into the brief
# --prior     the last kept round's faults.md: each reviewer says what is fixed, better, same or worse
# --words     a words.json ([{"w":"jumped","s":2.53,"e":2.88}], or {"words":[...]}; words.mjs writes it from full.json
#             with the scene's own times): reviewer 3's stills are taken
#             on the action words (--actions picks them; else every word of four letters or more, at most 10)
#             Without it, reviewer 3 gets a full-size still every second.
# --facts     another fact file to paste in (audible.py's audible.md in the sound pass); repeatable
set -eu
usage() { echo "usage: look.sh <clip.mp4> <outdir> --focus <world|shots|people|light|story|motion|sound> [--meaning f] [--prior f] [--words f] [--actions a,b] [--facts f]... [--no-jumps] [--brief f] [--models \"sonnet sonnet opus\"]" >&2; exit 2; }
[ $# -ge 2 ] || usage
clip=$1; out=$2; shift 2
here=$(cd "$(dirname "$0")" && pwd)
focus=""; meaning=""; prior=""; words=""; actions=""; facts=""; jumps=1; brief=$here/../../references/reviewer-brief.md
models="sonnet sonnet opus"
while [ $# -gt 0 ]; do case $1 in
  --focus) focus=$2; shift 2;; --meaning) meaning=$2; shift 2;; --prior) prior=$2; shift 2;;
  --words) words=$2; shift 2;; --actions) actions=$2; shift 2;; --facts) facts="$facts $2"; shift 2;;
  --no-jumps) jumps=0; shift;; --brief) brief=$2; shift 2;; --models) models=$2; shift 2;; *) usage;; esac; done
case $focus in world|shots|people|light|story|motion|sound) ;; *) echo "look.sh: --focus must be world, shots, people, light, story, motion or sound" >&2; exit 2;; esac
for f in "$clip" "$brief" $meaning $prior $words $facts; do [ -f "$f" ] || { echo "look.sh: missing file $f" >&2; exit 1; }; done
command -v claude >/dev/null || { echo "look.sh: the claude CLI is not on PATH" >&2; exit 1; }
mkdir -p "$out/looks"
out=$(cd "$out" && pwd); clip=$(cd "$(dirname "$clip")" && pwd)/$(basename "$clip")
L=$out/looks; T0=$(date +%s)

# 1. frames for reviewers 1-2, full-size stills for reviewer 3
"$here/frames.sh" "$clip" "$L/frames" >/dev/null
rm -rf "$L/words"; mkdir -p "$L/words"
dur=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$clip")
if [ -n "$words" ]; then
  picks=$(python3 - "$words" "$actions" "$dur" <<'EOF'
import json, re, sys
w = json.load(open(sys.argv[1])); w = w.get("words", w) if isinstance(w, dict) else w
want = [a.strip().lower() for a in sys.argv[2].split(",") if a.strip()]
dur = float(sys.argv[3])
clean = lambda s: re.sub(r"[^a-z']", "", s.lower())
rows = [(clean(x.get("w", x.get("word", ""))), float(x.get("s", x.get("start", 0))), float(x.get("e", x.get("end", x.get("s", 0))))) for x in w]
rows = [r for r in rows if r[1] < dur]
if want:
    rows = [r for r in rows if r[0] in want]
else:
    rows = [r for r in rows if len(r[0]) >= 4]
    if len(rows) > 10:
        rows = [rows[round(i * (len(rows) - 1) / 9)] for i in range(10)]
for name, s, e in rows:
    print(f"{name}:{min((s + e) / 2, dur - 0.05):.2f}")
EOF
)
else
  picks=$(awk -v d="$dur" 'BEGIN{for(t=0;t<d-0.05;t+=1) printf "t:%.2f\n", t}')
fi
i=0; names=""
for p in $picks; do
  i=$((i + 1)); nm=${p%%:*}; t=${p#*:}
  ffmpeg -nostdin -v error -y -ss "$t" -i "$clip" -frames:v 1 -q:v 2 "$L/words/$(printf %02d $i)-${nm}-${t}s.jpg"
  names="$names $nm"
done
[ $i -gt 0 ] || { echo "look.sh: no action-word stills (check --words and --actions)" >&2; exit 1; }

# 2. the facts
if [ $jumps = 1 ] && [ ! -f "$out/jumps.md" ]; then "$here/jumps.sh" "$clip" "$out" >/dev/null; fi
: > "$L/facts.txt"
[ $jumps = 1 ] && [ -f "$out/jumps.md" ] && { cat "$out/jumps.md"; echo; } >> "$L/facts.txt"
for f in $facts; do { cat "$f"; echo; } >> "$L/facts.txt"; done
[ -s "$L/facts.txt" ] || echo "None given this round." > "$L/facts.txt"
if [ -n "$meaning" ]; then cp "$meaning" "$L/meaning.txt"; else echo "(No meaning sheet given: judge what the scene seems to say.)" > "$L/meaning.txt"; fi
if [ -n "$prior" ]; then cp "$prior" "$L/prior.txt"; else echo "None: this is the first look at this scene." > "$L/prior.txt"; fi
case $focus in
  world) ftxt="world and light (answer the World and Light questions)";;
  shots) ftxt="shot sizes and framing: faces readable on a phone, the hero big enough on each beat, the far picture in frame (answer the Story and People questions)";;
  light) ftxt="light (answer the Light questions)";;
  people) ftxt="people and acting (answer the People and Story questions)";;
  story) ftxt="story (answer the Story questions)";;
  motion) ftxt="motion and staging (answer the Motion questions)";;
  sound) ftxt="sound (answer the Sound questions)";;
esac
sheets="- every sheet in $L/frames/ named sheet-*.jpg (ls it first): 6 frames a second, 30 tiles a sheet, the clip time and frame number at each tile's top left. Judge motion here: a move is a snap only if it jumps between two neighbouring tiles."
A12="$sheets
- every file in $L/frames/full/ (ls it first): one frame every 0.5 s and the last frame, 540 px wide, time in the name. Judge look, faces, hands, contact and framing here. You may open single tiles in $L/frames/f6/."
A3="- every file in $L/words/ (ls it first): full-size stills on the action words (the word and the time are in the name:$names). Judge faces, hands, contact and whether each action reads as its word, here.
$sheets"
durtxt=$(awk -v d="$dur" 'BEGIN{printf "%.1f seconds", d}')

# 3. three reviewers in the foreground, in parallel
n=0; pids=""
for m in $models; do
  n=$((n + 1)); imgs=$A12; [ "$m" = opus ] && imgs=$A3
  printf '%s\n' "$imgs" > "$L/images$n.txt"
  python3 "$here/_brief.py" "$brief" "$L/brief$n.md" "N=$n" "FOCUS=$ftxt" "DURATION=$durtxt" \
    "IMAGES=@$L/images$n.txt" "MEANING=@$L/meaning.txt" "FACTS=@$L/facts.txt" "PRIOR=@$L/prior.txt"
done
run() { # run <n> <model>
  (cd "$L" && claude -p "Follow the brief in $L/brief$1.md exactly. Read it first. Reply with text only." \
     --model "$2" --allowedTools "Read,Glob,Bash(ls:*)" < /dev/null > "$L/$1.md" 2> "$L/$1.err") || true
}
n=0
for m in $models; do n=$((n + 1)); run $n $m & pids="$pids $!"; done
for p in $pids; do wait $p; done
n=0; again=""
for m in $models; do n=$((n + 1)); grep -q "^## Scores" "$L/$n.md" 2>/dev/null || again="$again $n:$m"; done
if [ -n "$again" ]; then  # one retry, in parallel, for any reply without scores
  echo "look.sh: retrying reviewer(s)$again" >&2; pids=""
  for x in $again; do run ${x%%:*} ${x#*:} & pids="$pids $!"; done
  for p in $pids; do wait $p; done
fi
n=0
for m in $models; do n=$((n + 1)); echo "reviewer $n ($m): $(grep -E '^done' "$L/$n.md" | tail -1 || true)"; done

# 4. merge
python3 "$here/_merge_looks.py" "$out" "$focus"
echo "look: $(( ($(date +%s) - T0) / 60 )) min $(( ($(date +%s) - T0) % 60 )) s -> $out/faults.md"
