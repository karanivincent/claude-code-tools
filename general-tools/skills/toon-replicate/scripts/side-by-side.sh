#!/usr/bin/env bash
# side-by-side.sh <ref.mp4> [ours.mp4] <outdir> [every_seconds=2.5]
# Theirs on the left, ours on the right, at the same seconds; also prints duration and hard cuts.
# With only a reference and an outdir, makes a sheet of the reference alone.
set -euo pipefail
ref="$1"
if [ $# -ge 3 ] && [ -f "$2" ]; then ours="$2"; out="$3"; step="${4:-2.5}"; else ours=""; out="$2"; step="${3:-2.5}"; fi
mkdir -p "$out/pairs"
dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }
cuts() { ffmpeg -i "$1" -vf "select='gt(scene,0.3)',showinfo" -f null - 2>&1 | grep -c pts_time || true; }
d=$(dur "$ref"); echo "theirs: ${d}s, hard cuts $(cuts "$ref")"
[ -n "$ours" ] && echo "ours:   $(dur "$ours")s, hard cuts $(cuts "$ours")"
i=0
for t in $(awk -v d="$d" -v s="$step" 'BEGIN{for(t=0.5;t<d;t+=s) printf "%.2f\n", t}'); do
  n=$(printf "%03d" $i)
  ffmpeg -v error -y -ss "$t" -i "$ref" -frames:v 1 -vf "scale=360:640,drawtext=text='$t s':x=10:y=10:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.6" "$out/pairs/$n-a.png"
  if [ -n "$ours" ]; then
    ffmpeg -v error -y -ss "$t" -i "$ours" -frames:v 1 -vf "scale=360:640" "$out/pairs/$n-b.png" 2>/dev/null || ffmpeg -v error -y -f lavfi -i color=gray:s=360x640 -frames:v 1 "$out/pairs/$n-b.png"
    ffmpeg -v error -y -i "$out/pairs/$n-a.png" -i "$out/pairs/$n-b.png" -filter_complex hstack "$out/pairs/$n.png"
    rm "$out/pairs/$n-a.png" "$out/pairs/$n-b.png"
  else mv "$out/pairs/$n-a.png" "$out/pairs/$n.png"; fi
  i=$((i+1))
done
cols=$([ -n "$ours" ] && echo 3 || echo 6)
ffmpeg -v error -y -pattern_type glob -i "$out/pairs/*.png" -vf "tile=${cols}x$(( (i + cols - 1) / cols ))" -frames:v 1 "$out/side-by-side.jpg"
echo "sheet: $out/side-by-side.jpg ($i moments, every ${step}s)"
