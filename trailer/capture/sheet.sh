#!/bin/bash
# sheet.sh <dir> <out.jpg> [cols] [width] [first] [count]: tile stills, labelled with their frame numbers
d=$1; out=$2; cols=${3:-8}; w=${4:-240}; first=${5:-1}; count=${6:-100000}
tmp=$(mktemp -d); i=0
for f in $(ls $d/*.jpg | tail -n +$first | head -n $count); do n=$(basename $f .jpg); ffmpeg -v error -y -i $f -vf "scale=$w:-2,drawtext=fontfile=/home/knotz2/.local/share/fonts/win/arialbd.ttf:text='${n##+(0)}':x=4:y=h-20:fontsize=15:fontcolor=yellow:box=1:boxcolor=black@0.6" $tmp/$(printf %04d $i).jpg; i=$((i+1)); done
rows=$(( (i + cols - 1) / cols ))
ffmpeg -v error -y -framerate 1 -i $tmp/%04d.jpg -vf "tile=${cols}x${rows}" -frames:v 1 -q:v 3 $out
rm -rf $tmp; echo $out
