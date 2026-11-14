#!/bin/bash
# abjudge.sh <best.mp4> <new.mp4> <outdir> [--judges 1|3] [--brief <file>] [--meaning <file>] [--focus <area>]
#            [--ref <reference.mp4>] [--stills <dir>] [--model opus|sonnet] [--any-length]
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
# --ref: an earlier build of the same beat or film that is known to be good (a spike, a practice clip, an earlier
#   version: S5-76, S5-77). Each judge sees it too, as R, labelled as the reference (not blind), scores it, and says
#   whether A and B beat, tie or fall short of it. verdict.json then has "ref": best and new against it.
# --stills: a folder of the picked reference stills (*.jpg, S2-34, S5-97). Each judge sees them as S/ and scores how
#   close each clip's detail comes to them (separate objects near the lens, materials, light, sharp backgrounds).
# --model: the judges' model, sonnet by default (S5-101); opus for a second opinion.
# Clip lengths (S5-82): a clip under half the length of another is refused, so a 60 s film is never judged against a
#   5 s clip (the cliff film's first render was). --any-length lets it through, for a scene's first look at its
#   reference.
# Three judges on a long film run past three minutes: run this with a 10-minute command timeout.
set -eu
usage() { echo "usage: abjudge.sh <best.mp4> <new.mp4> <outdir> [--judges 1|3] [--brief f] [--meaning f] [--focus area] [--ref clip] [--stills dir] [--model m] [--any-length]" >&2; exit 2; }
[ $# -ge 3 ] || usage
best=$1; new=$2; out=$3; shift 3
here=$(cd "$(dirname "$0")" && pwd)
judges=1; brief=$here/../../references/judge-brief.md; meaning=""; focus=""; ref=""; stills=""; model=sonnet; anylen=0
while [ $# -gt 0 ]; do case $1 in
  --judges) judges=$2; shift 2;; --brief) brief=$2; shift 2;; --meaning) meaning=$2; shift 2;;
  --focus) focus=$2; shift 2;; --ref) ref=$2; shift 2;; --stills) stills=$2; shift 2;; --model) model=$2; shift 2;; --any-length) anylen=1; shift;; *) usage;; esac; done
for f in "$best" "$new" "$brief" $meaning $ref; do [ -f "$f" ] || { echo "abjudge.sh: missing file $f" >&2; exit 1; }; done
len() { ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$1"; }
if [ $anylen = 0 ]; then
  for c in "$best" $ref; do
    if ! awk -v a="$(len "$c")" -v b="$(len "$new")" 'BEGIN{lo=(a<b)?a:b; hi=(a<b)?b:a; exit !(lo >= 0.5*hi)}'; then
      echo "abjudge.sh: $c ($(len "$c") s) and $new ($(len "$new") s) differ by more than two times in length; judge a film against a film of about its length (S5-82), or pass --any-length" >&2; exit 1
    fi
  done
fi
command -v claude >/dev/null || { echo "abjudge.sh: the claude CLI is not on PATH" >&2; exit 1; }
mkdir -p "$out"; out=$(cd "$out" && pwd); T0=$(date +%s)
rm -rf "$out"/judge-* "$out/keys" "$out/.frames"; mkdir -p "$out/keys" "$out/.frames"

"$here/frames.sh" "$best" "$out/.frames/c1" >/dev/null
"$here/frames.sh" "$new" "$out/.frames/c2" >/dev/null
if [ -n "$meaning" ]; then cp "$meaning" "$out/.frames/meaning.txt"; else echo "(No meaning sheet given: judge what the scene seems to say.)" > "$out/.frames/meaning.txt"; fi
if [ -n "$ref" ]; then
  "$here/frames.sh" "$ref" "$out/.frames/ref" >/dev/null
  cat > "$out/.frames/refblock.txt" <<'EOR'
A third clip, R, is the reference: an earlier build of this same beat that is known to be good (a spike, a practice
clip or an earlier version). It is not blind and it is not one of the two you pick between. Open it the same way
(`R/sheet-*.jpg`, then every file in `R/full/`). Score R in the same five areas. Then say, for A and for B, whether it
beats R, ties it or falls short of it, and what R does better (its shot sizes, faces, acting, far picture, timing).
A and B are judged first against each other, then each against R.
EOR
  printf '%s' ' "R": {"world": 4, "people": 4, "light": 4, "story": 4, "motion": 3, "better_than_A": ["what R does better than A"], "better_than_B": ["..."]},' > "$out/.frames/refjson.txt"
else
  : > "$out/.frames/refblock.txt"; : > "$out/.frames/refjson.txt"
fi
if [ -n "$stills" ]; then
  [ -d "$stills" ] || { echo "abjudge.sh: missing stills folder $stills" >&2; exit 1; }
  mkdir -p "$out/.frames/S"; cp "$stills"/*.jpg "$out/.frames/S/"
  cat >> "$out/.frames/refblock.txt" <<'EOS'

The folder S/ holds reference stills: frames from the best videos of the kind we copy, picked for this place and beat.
Open every one. They set the bar for detail: separate objects near the lens, materials and textures, light and
shadow, sharp backgrounds, things moving behind the hero. In each area's notes say how close A and B come to S, and
score world and light against S, not only against each other.
EOS
fi
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
  if [ -n "$ref" ]; then cp -R "$out/.frames/ref" "$d/R"; fi
  if [ -n "$stills" ]; then cp -R "$out/.frames/S" "$d/S"; fi
  python3 "$here/_brief.py" "$brief" "$d/brief.md" "MEANING=@$out/.frames/meaning.txt" "FOCUS_LINE=$fl" \
    "REF_BLOCK=@$out/.frames/refblock.txt" "REF_JSON=@$out/.frames/refjson.txt"
  (cd "$d" && claude -p "Follow the brief in $d/brief.md exactly. Read it first. Read only files inside $d. Reply with text only." \
     --model "$model" --allowedTools "Read,Glob" < /dev/null > "$d/reply.md" 2> "$d/reply.err") &
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
       --model "$model" --allowedTools "Read,Glob" < /dev/null > "$d/reply.md" 2> "$d/reply.err") &
    pids="$pids $!"
  fi
done
for p in $pids; do wait $p || true; done
rm -rf "$out/.frames"
python3 "$here/_verdict.py" "$out" "$best" "$new" $ref
echo "abjudge: $(( ($(date +%s) - T0) / 60 )) min $(( ($(date +%s) - T0) % 60 )) s -> $out/verdict.json"
