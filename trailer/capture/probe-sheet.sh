#!/bin/bash
# probe-sheet.sh <probe-id> [width]: one row per rendered variant (main, @alts), stills left to right
id=$1; w=${2:-200}; d=/home/knotz2/code/KnotzAxxon/trailer/work/probe/$id; out=/home/knotz2/code/KnotzAxxon/trailer/work/sheets/$id.jpg
rows=()
for v in $(ls -d $d/*/ | xargs -n1 basename); do
  n=$(ls $d/$v/*.jpg | wc -l)
  /home/knotz2/code/KnotzAxxon/trailer/capture/sheet.sh $d/$v /tmp/row-$id-$v.jpg $n $w >/dev/null
  rows+=(-i /tmp/row-$id-$v.jpg)
done
k=$(( ${#rows[@]} / 2 ))
if [ $k -gt 1 ]; then ffmpeg -v error -y "${rows[@]}" -filter_complex "vstack=inputs=$k" -q:v 3 $out; else cp /tmp/row-$id-main.jpg $out; fi
rm -f /tmp/row-$id-*.jpg; echo $out
