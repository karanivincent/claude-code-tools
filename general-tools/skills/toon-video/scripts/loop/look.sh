#!/bin/bash
# look.sh <clip.mp4> <outdir> --focus <world|shots|people|light|story|motion|sound>
#         [--ref-frame <image>] [--meaning <file>] [--prior <file>] [--claims <changes.md>] [--protect <protect.md>]
#         [--hits <cues.json|t1,t2>] [--words <words.json>] [--actions w1,w2,...] [--facts <file>]...
#         [--no-jumps] [--brief <file>] [--models "sonnet sonnet sonnet"] [--dry-run] [--force]
#
# Three reviewers on one scene clip, run in the FOREGROUND with `claude -p`, all at once; waits for all of them.
# (In the spikes, reviewers started as background agents died when the turn ended: that is why they run here.)
# Sonnet by default (S5-101). The three have different jobs:
#   reviewer 1  the cold reader: the 6 fps sheets and half-size frames, NOT shown the meaning sheet, the last round's
#               faults, the builder's claims or the protected beats. It names each main thing on screen; a thing it
#               cannot name is a fault (S4-13, S4-15, the owner's "can a viewer tell what this is" notes).
#   reviewer 2  the 6 fps sheets and the half-size frames, with the meaning sheet, the prior faults and the claims.
#   reviewer 3  full-size stills on the action words and the sheets, with the same text as reviewer 2.
# Every reviewer opens the scene's reference frame (S2-37) beside the clip, answers the world rows W1 to W7
# (references/bar.md) and gives one likeness number from 1 to 10 against that frame, and opens the every-frame strips
# round each hit and protected beat (X-23).
#
# Writes, in <outdir> (a round folder, <pass>-r<n>/):
#   looks/frames/        sheets, frames and strips (frames.sh)   looks/words/   full-size stills for reviewer 3
#   looks/brief<n>.md    each reviewer's filled brief           looks/<n>.md   each reviewer's reply (text)
#   looks/<n>.json       claude's raw JSON (usage and the reply) looks/usage.jsonl  tokens and seconds per call
#   looks/scores.json    scores, likeness, world rows, claims    faults.md      the union of the faults, ranked
#   jumps.md             one-frame jumps (jumps.sh), unless --no-jumps or it is there already
#
# --ref-frame the scene's reference frame (S2-37). Default: <outdir>/../ref-frame.jpg (or .jpeg, .png), that is the
#             scene's loop folder. Without one the round still runs, with a loud warning, and no likeness is given.
# --meaning   the scene's meaning sheet (what it must say, the words and their times); pasted into reviewers 2 and 3
# --prior     the last kept round's faults.md: reviewers 2 and 3 say what is fixed, better, same or worse
# --claims    the builder's changes.md: reviewers 2 and 3 check each claimed fix (X-31: the builder's count is a claim)
# --protect   the scene's protected beats (protect.md, X-20): reviewers 2 and 3 say whether each got weaker
# --hits      times of hits, landings and strikes: a cues.json, a hits.json or "1.2,3.4"; every-frame strips round each
# --words     a words.json ([{"w":"jumped","s":2.53,"e":2.88}], or {"words":[...]}; words.mjs writes it from full.json
#             with the scene's own times): reviewer 3's stills are taken on the action words (--actions picks them;
#             else every word of four letters or more, at most 10). Without it, reviewer 3 gets a still every second.
# --facts     another fact file to paste in (audible.py's audible.md in the sound pass); repeatable
# --dry-run   make the frames and the briefs, print each `claude -p` command it would run, and stop
# --force     run even when step.mjs says the judge goes first (S5-46: after a lost or tied round the reviewers wait)
set -eu
usage() { echo "usage: look.sh <clip.mp4> <outdir> --focus <world|shots|people|light|story|motion|sound> [--ref-frame img] [--meaning f] [--prior f] [--claims f] [--protect f] [--hits f|t,t] [--words f] [--actions a,b] [--facts f]... [--no-jumps] [--brief f] [--models \"sonnet sonnet sonnet\"] [--dry-run]" >&2; exit 2; }
[ $# -ge 2 ] || usage
clip=$1; out=$2; shift 2
here=$(cd "$(dirname "$0")" && pwd)
focus=""; meaning=""; prior=""; claims=""; protect=""; hits=""; words=""; actions=""; facts=""; jumps=1; dry=0; force=0
refframe=""; brief=$here/../../references/reviewer-brief.md
models="sonnet sonnet sonnet"  # S5-101
while [ $# -gt 0 ]; do case $1 in
  --focus) focus=$2; shift 2;; --meaning) meaning=$2; shift 2;; --prior) prior=$2; shift 2;;
  --claims) claims=$2; shift 2;; --protect) protect=$2; shift 2;; --hits) hits=$2; shift 2;;
  --ref-frame) refframe=$2; shift 2;;
  --words) words=$2; shift 2;; --actions) actions=$2; shift 2;; --facts) facts="$facts $2"; shift 2;;
  --no-jumps) jumps=0; shift;; --brief) brief=$2; shift 2;; --models) models=$2; shift 2;; --dry-run) dry=1; shift;;
  --force) force=1; shift;;
  *) usage;; esac; done
case $focus in world|shots|people|light|story|motion|sound) ;; *) echo "look.sh: --focus must be world, shots, people, light, story, motion or sound" >&2; exit 2;; esac
for f in "$clip" "$brief" $meaning $prior $claims $protect $words $facts $refframe; do [ -f "$f" ] || { echo "look.sh: missing file $f" >&2; exit 1; }; done
[ $dry = 1 ] || command -v claude >/dev/null || { echo "look.sh: the claude CLI is not on PATH" >&2; exit 1; }
# S5-46: after a lost or tied round the judge runs first. Inside a loop folder (scene.json beside the round) step.mjs
# decides; a look outside a loop (a first scene's review, a spike) is not checked. --force skips it.
loopdir=$(cd "$(dirname "$out")" 2>/dev/null && pwd || true)
if [ $force = 0 ] && [ -n "$loopdir" ] && [ -f "$loopdir/scene.json" ] && command -v node >/dev/null; then
  node "$here/step.mjs" "$loopdir" check look || exit 1
fi
mkdir -p "$out/looks"
out=$(cd "$out" && pwd); clip=$(cd "$(dirname "$clip")" && pwd)/$(basename "$clip")
L=$out/looks; T0=$(date +%s)
nmodels=$(echo $models | wc -w | tr -d ' ')

# 0. the reference frame (S2-37): the flag, else the scene's loop folder
if [ -z "$refframe" ]; then
  for c in "$out/../ref-frame.jpg" "$out/../ref-frame.jpeg" "$out/../ref-frame.png"; do [ -f "$c" ] && { refframe=$c; break; }; done
fi
rm -f "$L"/ref-frame.*
if [ -n "$refframe" ]; then
  ext=${refframe##*.}; cp "$refframe" "$L/ref-frame.$ext"; rf="$L/ref-frame.$ext"
  cat > "$L/refblock.txt" <<EOR
- FIRST, the scene's reference frame: $rf. It is a frame of the same kind and light level from the kind of video we
  copy (a night camp against a night camp). Keep it beside every frame you open. Answer the world rows against it and
  give the likeness number (1 to 10) for how close this clip comes to it.
EOR
else
  rf=""
  echo "" >&2
  echo "look.sh: WARNING ****************************************************************" >&2
  echo "look.sh: WARNING  no reference frame for this scene (S2-37): no likeness number this round." >&2
  echo "look.sh: WARNING  Put it at $(cd "$out/.." && pwd)/ref-frame.jpg or pass --ref-frame <image>." >&2
  echo "look.sh: WARNING ****************************************************************" >&2
  echo "" >&2
  echo "- No reference frame was given for this scene. Answer the world rows on the frames alone and write \`likeness -\`." > "$L/refblock.txt"
fi

# 1. frames (with every-frame strips round hits and protected beats) for every reviewer; full-size stills for reviewer 3
strips=$(python3 "$here/_beats.py" "${protect:--}" "${hits:--}" strips)
"$here/frames.sh" "$clip" "$L/frames" ${strips:+--strips "$strips"} >/dev/null
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
if [ -n "$claims" ]; then cp "$claims" "$L/claims.txt"; else echo "None given: skip the Claims section." > "$L/claims.txt"; fi
python3 "$here/_beats.py" "${protect:--}" - text > "$L/protect.txt"
echo "(Not shown to you: you are the cold reader this round. Judge what the scene seems to say.)" > "$L/cold-meaning.txt"
echo "Not shown to you: you are the cold reader. Skip the Last round, Claims and Protected beats sections." > "$L/cold-none.txt"
cat > "$L/cold-yes.txt" <<'EOC'
You are the cold reader this round: you have not been told the story. Before anything else, for each main thing on
screen (each person, each prop the action uses, each sign or written word, the place, and the event that happens),
answer in the Cold read section: what is it? Name it in a few plain words. If you are not sure, say what else it
could be. A thing you cannot name is a fault: list it in Faults too, area story, severity 3. Do not guess a story. Say
only what you see.
EOC
echo "Another reviewer is the cold reader this round. Write \`- none (not the cold reader)\` in the Cold read section." > "$L/cold-no.txt"
case $focus in
  world) ftxt="world and light (answer the World and Light questions)";;
  shots) ftxt="shot sizes and framing: faces readable on a phone, the hero big enough on each beat, the far picture in frame (answer the Story and People questions)";;
  light) ftxt="light (answer the Light questions)";;
  people) ftxt="people and acting (answer the People and Story questions)";;
  story) ftxt="story (answer the Story questions)";;
  motion) ftxt="motion and staging (answer the Motion questions)";;
  sound) ftxt="sound (answer the Sound questions)";;
esac
sheets="- every sheet in $L/frames/ named sheet-*.jpg (ls it first): 6 frames a second, 30 tiles a sheet, the clip time and frame number at each tile's top left. Judge camera moves and pacing here: a move is a snap only if it jumps between two neighbouring tiles."
stripl=""
[ -d "$L/frames/strips" ] && stripl="
- every file in $L/frames/strips/ (ls it first): EVERY frame round each hit and protected beat (X-23), the time and frame number on each tile. Judge hits, landings, taps, pops and each protected beat here, frame by frame, not on the 6 fps sheets."
A12="$(cat "$L/refblock.txt")
$sheets
- every file in $L/frames/full/ (ls it first): one frame every 0.5 s and the last frame, 540 px wide, time in the name. Judge look, faces, hands, contact and framing here. You may open single tiles in $L/frames/f6/.$stripl"
A3="$(cat "$L/refblock.txt")
- every file in $L/words/ (ls it first): full-size stills on the action words (the word and the time are in the name:$names). Judge faces, hands, contact and whether each action reads as its word, here.
$sheets$stripl"
durtxt=$(awk -v d="$dur" 'BEGIN{printf "%.1f seconds", d}')

# 3. the briefs: reviewer 1 is the cold reader (when there are two or more), the last reviewer gets the word stills
n=0
[ "$nmodels" -ge 2 ] || echo "look.sh: one reviewer only: no cold reader this round" >&2
for m in $models; do
  n=$((n + 1)); imgs=$A12; [ $n = 3 ] && imgs=$A3
  printf '%s\n' "$imgs" > "$L/images$n.txt"
  if [ $n = 1 ] && [ "$nmodels" -ge 2 ]; then
    python3 "$here/_brief.py" "$brief" "$L/brief$n.md" "N=$n" "FOCUS=$ftxt" "DURATION=$durtxt" \
      "IMAGES=@$L/images$n.txt" "MEANING=@$L/cold-meaning.txt" "FACTS=@$L/facts.txt" "PRIOR=@$L/cold-none.txt" \
      "CLAIMS=@$L/cold-none.txt" "PROTECT=@$L/cold-none.txt" "COLD=@$L/cold-yes.txt"
  else
    python3 "$here/_brief.py" "$brief" "$L/brief$n.md" "N=$n" "FOCUS=$ftxt" "DURATION=$durtxt" \
      "IMAGES=@$L/images$n.txt" "MEANING=@$L/meaning.txt" "FACTS=@$L/facts.txt" "PRIOR=@$L/prior.txt" \
      "CLAIMS=@$L/claims.txt" "PROTECT=@$L/protect.txt" "COLD=@$L/cold-no.txt"
  fi
done

# 4. three reviewers in the foreground, in parallel; usage logged per call
prompt() { echo "Follow the brief in $L/brief$1.md exactly. Read it first. Reply with text only."; }
cmd() { echo "(cd $L && claude -p \"$(prompt $1)\" --model $2 --allowedTools \"Read,Glob,Bash(ls:*)\" --output-format json < /dev/null > $L/$1.json 2> $L/$1.err)"; }
if [ $dry = 1 ]; then
  n=0; for m in $models; do n=$((n + 1)); echo "dry-run: reviewer $n ($m$([ $n = 1 ] && [ "$nmodels" -ge 2 ] && echo ', cold reader')): $(cmd $n $m)"; done
  echo "dry-run: then _usage.py writes $L/<n>.md and $L/usage.jsonl, and _merge_looks.py writes $out/faults.md"
  exit 0
fi
rm -f "$L/usage.jsonl"
run() { # run <n> <model>
  local t0; t0=$(date +%s)
  (cd "$L" && claude -p "$(prompt $1)" --model "$2" --allowedTools "Read,Glob,Bash(ls:*)" --output-format json \
     < /dev/null > "$L/$1.json" 2> "$L/$1.err") || true
  python3 "$here/_usage.py" "$L/$1.json" "$L/$1.md" "$L/usage.jsonl" "reviewer-$1" "$2" "$(( $(date +%s) - t0 ))" || true
}
n=0; pids=""
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

# 5. merge
python3 "$here/_merge_looks.py" "$out" "$focus"
python3 - "$L/usage.jsonl" <<'EOF' || true
import json, sys
rows = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
tok = sum(r["tokens"] or 0 for r in rows); sec = sum(r["seconds"] or 0 for r in rows)
print(f"usage: {len(rows)} reviewer call(s), {tok} tokens, {sec:.0f} s of model time" + ("" if all(r["tokens"] is not None for r in rows) else " (some calls have no count)"))
EOF
[ -n "$rf" ] || echo "look.sh: WARNING no reference frame: no likeness this round (S2-37)" >&2
echo "look: $(( ($(date +%s) - T0) / 60 )) min $(( ($(date +%s) - T0) % 60 )) s -> $out/faults.md"
