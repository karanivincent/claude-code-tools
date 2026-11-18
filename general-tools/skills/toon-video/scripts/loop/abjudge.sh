#!/bin/bash
# abjudge.sh <best.mp4> <new.mp4> <outdir> [--judges 1|3] [--brief <file>] [--meaning <file>] [--focus <area>]
#            [--ref-frame <image>] [--ref <reference.mp4>] [--stills <dir>] [--protect <protect.md>]
#            [--hits <cues.json|t1,t2>] [--model sonnet|opus] [--any-length] [--dry-run]
#
# Blind A/B: each judge is a fresh `claude -p`, run in the FOREGROUND (all at once, then waits). Each judge gets its own
# folder holding only A/, B/ (frames.sh output), F/ (the reference frame), R/ and S/ when given, and its brief; A/B
# order is drawn per judge, and the key is written outside that folder. The judge replies with text; this script
# keeps the reply and reads it.
#
# Writes, in <outdir> (a round folder, or out/<slug>/film-<n>/ for the final film):
#   judge-<j>/A, judge-<j>/B, judge-<j>/F, judge-<j>/brief.md, judge-<j>/reply.md, judge-<j>/raw.json
#   keys/judge-<j>.key        "A=best B=new" or "A=new B=best"
#   judges-usage.jsonl        tokens and seconds per judge call (claude -p --output-format json; _usage.py)
#   verdict.json              each judge's scores per area, likeness and world rows for best and new, the averages,
#                             winner (win, loss or tie), prefer, keep, the protected beats, and what each judge credited
#                             and blamed in each clip
#
# --judges 1 for a round (the default), 3 for the final film. --meaning: what the scene must say (pasted in).
# --focus: lean the judges toward one area; leave it out for a neutral judging (the final film, calibration).
# --ref-frame: the scene's reference frame (S2-37), shown as F/; the judges score likeness 1 to 10 against it and the
#   world rows. Default: <outdir>/../ref-frame.jpg (or .jpeg, .png). Without one: a loud warning and no likeness.
# --ref: an earlier build of the same beat or film that is known to be good (a spike, a practice clip, an earlier
#   version: S5-76, S5-77). Each judge sees it too, as R, labelled as the reference (not blind), scores it, and says
#   whether A and B beat, tie or fall short of it. verdict.json then has "ref": best and new against it.
# --stills: a folder of the picked reference stills (*.jpg, S2-34, S5-97), shown as S/, for detail.
# --protect: the scene's protected beats (protect.md, X-20). The judges say which clip plays each better; a round
#   whose new clip plays one worse is a loss, whatever its average (_verdict.py).
# --hits: hits, landings and strikes (a cues.json or "1.2,3.4"): every-frame strips round each, and round each
#   protected beat (X-23), in A/strips and B/strips.
# --model: the judges' model, sonnet by default (S5-101); opus for a second opinion.
# Clip lengths (S5-82): a clip under half the length of another is refused, so a 60 s film is never judged against a
#   5 s clip (the cliff film's first render was). --any-length lets it through, for a scene's first look at its
#   reference.
# --dry-run: make the folders and briefs, print each `claude -p` command it would run, and stop.
# Three judges on a long film run past three minutes: run this with a 10-minute command timeout.
set -eu
usage() { echo "usage: abjudge.sh <best.mp4> <new.mp4> <outdir> [--judges 1|3] [--brief f] [--meaning f] [--focus area] [--ref-frame img] [--ref clip] [--stills dir] [--protect f] [--hits f|t,t] [--model m] [--any-length] [--dry-run]" >&2; exit 2; }
[ $# -ge 3 ] || usage
best=$1; new=$2; out=$3; shift 3
here=$(cd "$(dirname "$0")" && pwd)
judges=1; brief=$here/../../references/judge-brief.md; meaning=""; focus=""; ref=""; stills=""; model=sonnet; anylen=0
refframe=""; protect=""; hits=""; dry=0
while [ $# -gt 0 ]; do case $1 in
  --judges) judges=$2; shift 2;; --brief) brief=$2; shift 2;; --meaning) meaning=$2; shift 2;;
  --focus) focus=$2; shift 2;; --ref) ref=$2; shift 2;; --stills) stills=$2; shift 2;; --model) model=$2; shift 2;;
  --ref-frame) refframe=$2; shift 2;; --protect) protect=$2; shift 2;; --hits) hits=$2; shift 2;;
  --any-length) anylen=1; shift;; --dry-run) dry=1; shift;; *) usage;; esac; done
for f in "$best" "$new" "$brief" $meaning $ref $refframe $protect; do [ -f "$f" ] || { echo "abjudge.sh: missing file $f" >&2; exit 1; }; done
len() { ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$1"; }
if [ $anylen = 0 ]; then
  for c in "$best" $ref; do
    if ! awk -v a="$(len "$c")" -v b="$(len "$new")" 'BEGIN{lo=(a<b)?a:b; hi=(a<b)?b:a; exit !(lo >= 0.5*hi)}'; then
      echo "abjudge.sh: $c ($(len "$c") s) and $new ($(len "$new") s) differ by more than two times in length; judge a film against a film of about its length (S5-82), or pass --any-length" >&2; exit 1
    fi
  done
fi
[ $dry = 1 ] || command -v claude >/dev/null || { echo "abjudge.sh: the claude CLI is not on PATH" >&2; exit 1; }
mkdir -p "$out"; out=$(cd "$out" && pwd); T0=$(date +%s)
rm -rf "$out"/judge-* "$out/keys" "$out/.frames"; mkdir -p "$out/keys" "$out/.frames"
F=$out/.frames

# the reference frame (S2-37): the flag, else the scene's loop folder
if [ -z "$refframe" ]; then
  for c in "$out/../ref-frame.jpg" "$out/../ref-frame.jpeg" "$out/../ref-frame.png"; do [ -f "$c" ] && { refframe=$c; break; }; done
fi
if [ -n "$refframe" ]; then
  mkdir -p "$F/F"; ext=${refframe##*.}; cp "$refframe" "$F/F/ref-frame.$ext"
  cat > "$F/frameblock.txt" <<EOF
FIRST open \`F/ref-frame.$ext\`: the scene's reference frame, a frame of the same kind and light level from the kind of
video we copy. It is not one of the two you pick between. Keep it beside every frame you open: the likeness number and
the world rows are judged against it.
EOF
else
  echo "" >&2
  echo "abjudge.sh: WARNING ****************************************************************" >&2
  echo "abjudge.sh: WARNING  no reference frame (S2-37): the judges give no likeness number." >&2
  echo "abjudge.sh: WARNING  Put it at $(cd "$out/.." && pwd)/ref-frame.jpg or pass --ref-frame <image>." >&2
  echo "abjudge.sh: WARNING ****************************************************************" >&2
  echo "" >&2
  echo "No reference frame was given for this scene: judge the world rows on the frames alone, and write \"likeness\": null." > "$F/frameblock.txt"
fi

strips=$(python3 "$here/_beats.py" "${protect:--}" "${hits:--}" strips)
"$here/frames.sh" "$best" "$F/c1" ${strips:+--strips "$strips"} >/dev/null
"$here/frames.sh" "$new" "$F/c2" ${strips:+--strips "$strips"} >/dev/null
if [ -n "$meaning" ]; then cp "$meaning" "$F/meaning.txt"; else echo "(No meaning sheet given: judge what the scene seems to say.)" > "$F/meaning.txt"; fi
if [ -n "$protect" ] && [ "$(python3 "$here/_beats.py" "$protect" - json)" != "[]" ]; then
  { echo "Protected beats: these must not get worse (X-20). For each, compare A and B on their strips (\`<X>/strips/\`)"
    echo "and say which plays it better. A clip that plays one worse does not get \`better\`, whatever its other scores."
    echo
    python3 "$here/_beats.py" "$protect" - text; } > "$F/protectblock.txt"
  printf '%s' ' "protected": [{"beat": 1, "better": "A, B or same"}],' > "$F/protectjson.txt"
else
  : > "$F/protectblock.txt"; : > "$F/protectjson.txt"
fi
if [ -n "$ref" ]; then
  "$here/frames.sh" "$ref" "$F/ref" >/dev/null
  cat > "$F/refblock.txt" <<'EOR'
A third clip, R, is the reference: an earlier build of this same beat that is known to be good (a spike, a practice
clip or an earlier version). It is not blind and it is not one of the two you pick between. Open it the same way
(`R/sheet-*.jpg`, then every file in `R/full/`). Score R in the same five areas. Then say, for A and for B, whether it
beats R, ties it or falls short of it, and what R does better (its shot sizes, faces, acting, far picture, timing).
A and B are judged first against each other, then each against R.
EOR
  printf '%s' ' "R": {"world": 4, "people": 4, "light": 4, "story": 4, "motion": 3, "better_than_A": ["what R does better than A"], "better_than_B": ["..."]},' > "$F/refjson.txt"
else
  : > "$F/refblock.txt"; : > "$F/refjson.txt"
fi
if [ -n "$stills" ]; then
  [ -d "$stills" ] || { echo "abjudge.sh: missing stills folder $stills" >&2; exit 1; }
  mkdir -p "$F/S"; cp "$stills"/*.jpg "$F/S/"
  cat >> "$F/refblock.txt" <<'EOS'

The folder S/ holds reference stills: frames from the best videos of the kind we copy, picked for this place and beat.
Open every one. They set the bar for detail: separate objects near the lens, materials and textures, light and
shadow, sharp backgrounds, things moving behind the hero. In each area's notes say how close A and B come to S. The
likeness number stays against the reference frame in F/.
EOS
fi
if [ -n "$focus" ]; then
  fl="Look hardest at $focus, then the rest. Still score every area."
else
  fl="Weigh the five areas equally."
fi

prompt() { echo "Follow the brief in $1/brief.md exactly. Read it first. Read only files inside $1. Reply with text only."; }
j=0
while [ $j -lt "$judges" ]; do
  j=$((j + 1)); d=$out/judge-$j; mkdir -p "$d"
  if [ $((RANDOM % 2)) = 1 ]; then a=best; b=new; ca=c1; cb=c2; else a=new; b=best; ca=c2; cb=c1; fi
  echo "A=$a B=$b" > "$out/keys/judge-$j.key"
  cp -R "$F/$ca" "$d/A"; cp -R "$F/$cb" "$d/B"
  if [ -d "$F/F" ]; then cp -R "$F/F" "$d/F"; fi
  if [ -n "$ref" ]; then cp -R "$F/ref" "$d/R"; fi
  if [ -n "$stills" ]; then cp -R "$F/S" "$d/S"; fi
  python3 "$here/_brief.py" "$brief" "$d/brief.md" "MEANING=@$F/meaning.txt" "FOCUS_LINE=$fl" \
    "FRAME_BLOCK=@$F/frameblock.txt" "REF_BLOCK=@$F/refblock.txt" "REF_JSON=@$F/refjson.txt" \
    "PROTECT_BLOCK=@$F/protectblock.txt" "PROTECT_JSON=@$F/protectjson.txt"
done
if [ $dry = 1 ]; then
  j=0; while [ $j -lt "$judges" ]; do j=$((j + 1)); d=$out/judge-$j
    echo "dry-run: judge $j ($model, $(cat "$out/keys/judge-$j.key")): (cd $d && claude -p \"$(prompt "$d")\" --model $model --allowedTools \"Read,Glob\" --output-format json < /dev/null > $d/raw.json 2> $d/reply.err)"
  done
  echo "dry-run: then _usage.py writes judge-<j>/reply.md and $out/judges-usage.jsonl, and _verdict.py writes $out/verdict.json"
  rm -rf "$F"; exit 0
fi
rm -f "$out/judges-usage.jsonl"
judge() { # judge <j>
  local d=$out/judge-$1 t0; t0=$(date +%s)
  (cd "$d" && claude -p "$(prompt "$d")" --model "$model" --allowedTools "Read,Glob" --output-format json \
     < /dev/null > "$d/raw.json" 2> "$d/reply.err") || true
  python3 "$here/_usage.py" "$d/raw.json" "$d/reply.md" "$out/judges-usage.jsonl" "judge-$1" "$model" "$(( $(date +%s) - t0 ))" || true
}
j=0; pids=""
while [ $j -lt "$judges" ]; do j=$((j + 1)); judge $j & pids="$pids $!"; done
for p in $pids; do wait $p || true; done
# one retry for a judge whose reply has no JSON block
j=0; pids=""
while [ $j -lt "$judges" ]; do
  j=$((j + 1))
  if ! grep -q '"better"' "$out/judge-$j/reply.md" 2>/dev/null; then
    echo "abjudge.sh: retrying judge $j" >&2
    judge $j & pids="$pids $!"
  fi
done
for p in $pids; do wait $p || true; done
rm -rf "$F"
python3 "$here/_verdict.py" "$out" "$best" "$new" $ref ${protect:+--protect "$protect"}
[ -n "$refframe" ] || echo "abjudge.sh: WARNING no reference frame: no likeness in this verdict (S2-37)" >&2
echo "abjudge: $(( ($(date +%s) - T0) / 60 )) min $(( ($(date +%s) - T0) % 60 )) s -> $out/verdict.json"
