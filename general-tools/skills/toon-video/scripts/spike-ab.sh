#!/bin/sh
# The baseline over a spike at the same seconds, one picture: the fastest way to judge a try.
#   sh <toon-video>/scripts/spike-ab.sh <baseline-frames-dir> <spike-frames-dir> <out.jpg> [seconds, default "1 3 5 7 9 11 13 15"]
# (toon-video references/spikes.md). Needs ffmpeg. A second past the clip's end takes its last frame.
# Both dirs come from spike-frames.sh (full/sNNN.jpg, sN = (N-1)/2 s). Top row: baseline. Bottom row: the spike.
set -e
a="$1"; b="$2"; out="$3"; secs="${4:-1 3 5 7 9 11 13 15}"
row() { d="$1"; in=""; n=0; for s in $secs; do f=$(printf "%s/full/s%03d.jpg" "$d" $((s*2+1))); [ -f "$f" ] || f=$(ls "$d"/full/*.jpg | tail -1); in="$in -i $f"; n=$((n+1)); done
  ffmpeg -v error -y $in -filter_complex "$(i=0; while [ $i -lt $n ]; do printf "[%d:v]scale=270:480[v%d];" $i $i; i=$((i+1)); done; i=0; while [ $i -lt $n ]; do printf "[v%d]" $i; i=$((i+1)); done)hstack=inputs=$n" -q:v 3 "$2"; }
tmp=$(mktemp -d); row "$a" "$tmp/a.jpg"; row "$b" "$tmp/b.jpg"
ffmpeg -v error -y -i "$tmp/a.jpg" -i "$tmp/b.jpg" -filter_complex vstack -q:v 3 "$out"; rm -rf "$tmp"; echo "$out"
