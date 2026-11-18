#!/bin/sh
# Frames of one spike clip for a reviewer or a builder (toon-video references/spikes.md): full frames twice a second,
# every frame on sheets of 60, and a strip of one frame a second.
#   sh <toon-video>/scripts/spike-frames.sh <clip.mp4> <out-dir>
# Needs ffmpeg. The sheets assume a 30 fps clip (60 frames = 2 s a sheet).
# Writes <out-dir>/full/sNNN.jpg (sN = (N-1)/2 s), <out-dir>/sheets/NN.jpg (60 frames a sheet, 10 x 6, in order,
# so sheet NN starts at (NN-1)*2 s) and <out-dir>/strip.jpg (one frame a second).
set -e
clip="$1"; out="$2"; mkdir -p "$out/full" "$out/sheets"
ffmpeg -v error -y -i "$clip" -vf "fps=2" -q:v 3 "$out/full/s%03d.jpg"
ffmpeg -v error -y -i "$clip" -vf "scale=180:320,tile=10x6" -q:v 4 "$out/sheets/%02d.jpg"
ffmpeg -v error -y -i "$clip" -vf "fps=1,scale=216:384,tile=16x1" -frames:v 1 -q:v 3 "$out/strip.jpg"
echo "$out: $(ls "$out/full" | wc -l | tr -d ' ') full frames, $(ls "$out/sheets" | wc -l | tr -d ' ') sheets"
