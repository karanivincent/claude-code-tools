#!/bin/bash
# frames.sh <clip.mp4> <outdir> [fps=6]
# Contact sheets for a reviewer or a judge, at the size the spikes found readable on a 5 s clip:
#   <outdir>/f6/NNN.jpg        every frame at <fps>, 540 px on the short side, time and source frame burned in (yellow)
#   <outdir>/sheet-NN.jpg      30 tiles each (6 x 5, 216 px tiles for 9:16), one sheet per 5 s at 6 fps
#   <outdir>/full/tSS.SS.jpg   one frame every 0.5 s and the last frame, 540x960 (960x540 for 16:9), time in the name
# A move is a snap only if it jumps between two neighbouring tiles. Works on macOS (bash 3, BSD tools).
set -eu
[ $# -ge 2 ] || { echo "usage: frames.sh <clip.mp4> <outdir> [fps=6]" >&2; exit 2; }
clip=$1; out=$2; fps=${3:-6}
[ -f "$clip" ] || { echo "frames.sh: no clip $clip" >&2; exit 1; }
mkdir -p "$out/f6" "$out/full"
rm -f "$out"/f6/*.jpg "$out"/full/*.jpg "$out"/sheet-*.jpg

probe() { ffprobe -v error -select_streams v:0 -show_entries "$1" -of default=nw=1:nk=1 "$clip" | head -1; }
w=$(probe stream=width); h=$(probe stream=height)
rate=$(probe stream=r_frame_rate); src_fps=$(awk -v r="$rate" 'BEGIN{split(r,a,"/"); printf "%.4f", (a[2]?a[1]/a[2]:a[1])}')
dur=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$clip")
if [ "$w" -gt "$h" ]; then scale="960:-2"; tilew=360; else scale="540:-2"; tilew=216; fi

# every frame at <fps>, with clip time and the source frame number
txt="%{eif\:t\:d}.%{eif\:mod(t*100,100)\:d\:2}s f%{eif\:t*${src_fps}+0.5\:d}"
ffmpeg -nostdin -v error -y -i "$clip" -vf "fps=${fps},scale=${scale},drawtext=text='${txt}':x=8:y=8:fontsize=26:fontcolor=yellow:box=1:boxcolor=black@0.6" -q:v 3 -start_number 1 "$out/f6/%03d.jpg"

# sheets of 30 tiles
n=$(ls "$out/f6" | wc -l | tr -d ' '); per=30; k=0
while [ $((k * per)) -lt "$n" ]; do
  left=$((n - k * per)); [ $left -gt $per ] && left=$per
  ffmpeg -nostdin -v error -y -start_number $((k * per + 1)) -i "$out/f6/%03d.jpg" \
    -vf "scale=${tilew}:-2,tile=6x5:padding=4:nb_frames=${left}" -frames:v 1 -q:v 3 "$out/sheet-$(printf %02d $((k + 1))).jpg"
  k=$((k + 1))
done

# full frames every 0.5 s and the last frame
last=$(awk -v d="$dur" -v f="$src_fps" 'BEGIN{printf "%.2f", d - 1.0/f}')
for t in $(awk -v d="$last" 'BEGIN{for(t=0;t<d-0.05;t+=0.5) printf "%.2f\n", t}'); do
  ffmpeg -nostdin -v error -y -ss "$t" -i "$clip" -frames:v 1 -vf "scale=${scale}" -q:v 2 "$out/full/t$(printf %05.2f "$t").jpg"
done
ffmpeg -nostdin -v error -y -sseof -0.3 -i "$clip" -vf "scale=${scale}" -update 1 -q:v 2 "$out/full/t$(printf %05.2f "$last").jpg"
echo "frames: $n tiles at ${fps} fps in $k sheet(s), $(ls "$out/full" | wc -l | tr -d ' ') full frames -> $out"
