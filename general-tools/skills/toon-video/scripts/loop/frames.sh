#!/bin/bash
# frames.sh <clip.mp4> <outdir> [fps=6] [--strips a-b,c-d,...]
# Contact sheets for a reviewer or a judge, at the size the spikes found readable on a 5 s clip:
#   <outdir>/f6/NNN.jpg        every frame at <fps>, 540 px on the short side, time and source frame burned in (yellow)
#   <outdir>/sheet-NN.jpg      30 tiles each (6 x 5, 216 px tiles for 9:16), one sheet per 5 s at 6 fps
#   <outdir>/full/tSS.SS.jpg   one frame every 0.5 s and the last frame, 540x960 (960x540 for 16:9), time in the name
#   <outdir>/strips/strip-NN-<a>s.jpg   with --strips: EVERY source frame from a to b seconds (at most 1.6 s), 8 tiles a
#                              row, time and frame burned in. A hit, a landing or a protected beat is judged here, not on
#                              the 6 fps sheets (X-23: two-frame taps read only as a flicker at 6 fps). A single time
#                              "t" (no dash) is the window t-0.4 to t+0.4.
# A move is a snap only if it jumps between two neighbouring tiles. Works on macOS (bash 3, BSD tools).
set -eu
usage() { echo "usage: frames.sh <clip.mp4> <outdir> [fps=6] [--strips a-b,t,...]" >&2; exit 2; }
[ $# -ge 2 ] || usage
clip=$1; out=$2; shift 2; fps=6; strips=""
while [ $# -gt 0 ]; do case $1 in
  --strips) strips=$2; shift 2;;
  [0-9]*) fps=$1; shift;;
  *) usage;; esac; done
[ -f "$clip" ] || { echo "frames.sh: no clip $clip" >&2; exit 1; }
mkdir -p "$out/f6" "$out/full"
rm -f "$out"/f6/*.jpg "$out"/full/*.jpg "$out"/sheet-*.jpg
rm -rf "$out/strips"

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

# every-frame strips round each hit or protected beat (X-23)
ns=0
if [ -n "$strips" ]; then
  mkdir -p "$out/strips"
  for win in $(printf '%s' "$strips" | tr ',' ' '); do
    case $win in *-*) a=${win%%-*}; b=${win#*-};; *) a=$(awk -v t="$win" 'BEGIN{printf "%.2f", t-0.4}'); b=$(awk -v t="$win" 'BEGIN{printf "%.2f", t+0.4}');; esac
    # clamp to the clip, at most 1.6 s
    win2=$(awk -v a="$a" -v b="$b" -v d="$dur" 'BEGIN{if(a<0)a=0; if(b>d-0.04)b=d-0.04; if(b-a>1.6)b=a+1.6; if(b<=a)b=a+0.04; printf "%.2f %.2f", a, b}')
    a=${win2% *}; b=${win2#* }
    nf=$(awk -v a="$a" -v b="$b" -v f="$src_fps" 'BEGIN{n=int((b-a)*f+0.5); if(n<1)n=1; printf "%d", n}')
    rows=$(( (nf + 7) / 8 ))
    ns=$((ns + 1))
    stxt="%{eif\:t+${a}\:d}.%{eif\:mod((t+${a})*100,100)\:d\:2}s f%{eif\:(t+${a})*${src_fps}+0.5\:d}"
    ffmpeg -nostdin -v error -y -ss "$a" -i "$clip" \
      -vf "setpts=PTS-STARTPTS,scale=${tilew}:-2,drawtext=text='${stxt}':x=4:y=4:fontsize=14:fontcolor=yellow:box=1:boxcolor=black@0.6,tile=8x${rows}:padding=3:nb_frames=${nf}" \
      -frames:v 1 -q:v 3 "$out/strips/strip-$(printf %02d $ns)-${a}s.jpg"
  done
fi
echo "frames: $n tiles at ${fps} fps in $k sheet(s), $(ls "$out/full" | wc -l | tr -d ' ') full frames, $ns every-frame strip(s) -> $out"
