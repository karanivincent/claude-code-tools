#!/bin/bash
# abjudge.sh <best.mp4> <new.mp4> <outdir> [--judges 1|3] [--brief <file>] [--meaning <file>] [--focus <area>]
#
# Blind A/B: each judge is a fresh `claude -p --model opus`, run in the FOREGROUND (all at once, then waits). Each
# judge gets its own folder holding only A/, B/ (frames.sh output) and its brief; A/B order is drawn per judge, and
# the key is written outside that folder. The judge replies with text; this script keeps the reply and reads it.
#
# Writes, in <outdir> (a round folder, or out/<slug>/film-<n>/ for the final film):
#   judge-<j>/A, judge-<j>/B, judge-<j>/brief.md, judge-<j>/reply.md
#   keys/judge-<j>.key        "A=best B=new" or "A=new B=best"
#   verdict.json              each judge's scores per area for best and new, the averages, winner (win, loss or
#                             tie), prefer, keep, and what each judge credited and blamed in each clip
#
# --judges 1 for a round (the default), 3 for the final film. --meaning: what the scene must say (pasted in).
# --focus: lean the judges toward one area; leave it out for a neutral judging (the final film, calibration).
set -eu
usage() { echo "usage: abjudge.sh <best.mp4> <new.mp4> <outdir> [--judges 1|3] [--brief f] [--meaning f] [--focus area]" >&2; exit 2; }
[ $# -ge 3 ] || usage
best=$1; new=$2; out=$3; shift 3
here=$(cd "$(dirname "$0")" && pwd)
judges=1; brief=$here/../../references/judge-brief.md; meaning=""; focus=""
while [ $# -gt 0 ]; do case $1 in
  --judges) judges=$2; shift 2;; --brief) brief=$2; shift 2;; --meaning) meaning=$2; shift 2;;
  --focus) focus=$2; shift 2;; *) usage;; esac; done
for f in "$best" "$new" "$brief" $meaning; do [ -f "$f" ] || { echo "abjudge.sh: missing file $f" >&2; exit 1; }; done
command -v claude >/dev/null || { echo "abjudge.sh: the claude CLI is not on PATH" >&2; exit 1; }
mkdir -p "$out"; out=$(cd "$out" && pwd); T0=$(date +%s)
rm -rf "$out"/judge-* "$out/keys" "$out/.frames"; mkdir -p "$out/keys" "$out/.frames"

"$here/frames.sh" "$best" "$out/.frames/c1" >/dev/null
"$here/frames.sh" "$new" "$out/.frames/c2" >/dev/null
if [ -n "$meaning" ]; then cp "$meaning" "$out/.frames/meaning.txt"; else echo "(No meaning sheet given: judge what the scene seems to say.)" > "$out/.frames/meaning.txt"; fi
if [ -n "$focus" ]; then
  fl="Look hardest at $focus, then the rest. Still score every area."
else
  fl="Weigh the five areas equally."
fi

j=0; pids=""
while [ $j -lt "$judges" ]; do
  j=$((j + 1)); d=$out/judge-$j; mkdir -p "$d"
  if [ $((RANDOM % 2)) = 1 ]; then a=best; b=new; ca=c1; cb=c2; else a=new; b=best; ca=c2; cb=c1; fi
  echo "A=$a B=$b" > "$out/keys/judge-$j.key"
  cp -R "$out/.frames/$ca" "$d/A"; cp -R "$out/.frames/$cb" "$d/B"
  python3 "$here/_brief.py" "$brief" "$d/brief.md" "MEANING=@$out/.frames/meaning.txt" "FOCUS_LINE=$fl"
  (cd "$d" && claude -p "Follow the brief in $d/brief.md exactly. Read it first. Read only files inside $d. Reply with text only." \
     --model opus --allowedTools "Read,Glob" < /dev/null > "$d/reply.md" 2> "$d/reply.err") &
  pids="$pids $!"
done
for p in $pids; do wait $p || true; done
# one retry for a judge whose reply has no JSON block
j=0; pids=""
while [ $j -lt "$judges" ]; do
  j=$((j + 1)); d=$out/judge-$j
  if ! grep -q '"better"' "$d/reply.md" 2>/dev/null; then
    echo "abjudge.sh: retrying judge $j" >&2
    (cd "$d" && claude -p "Follow the brief in $d/brief.md exactly. Read it first. Read only files inside $d. Reply with text only." \
       --model opus --allowedTools "Read,Glob" < /dev/null > "$d/reply.md" 2> "$d/reply.err") &
    pids="$pids $!"
  fi
done
for p in $pids; do wait $p || true; done
rm -rf "$out/.frames"
python3 "$here/_verdict.py" "$out" "$best" "$new"
echo "abjudge: $(( ($(date +%s) - T0) / 60 )) min $(( ($(date +%s) - T0) % 60 )) s -> $out/verdict.json"
