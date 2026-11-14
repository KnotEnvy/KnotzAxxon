#!/usr/bin/env bash
# Usage: run_blender.sh SCRIPT.py [BLEND_OR_-] -- args...   (WSL paths are converted automatically)
set -euo pipefail
B="${BLENDER:-/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe}"
script="$1"; shift
blend=""
if [[ "${1:-}" != "--" && -n "${1:-}" ]]; then blend="$(wslpath -w "$1")"; shift; fi
[[ "${1:-}" == "--" ]] && shift
conv=()
for a in "$@"; do
  if [[ "$a" == /* ]]; then conv+=("$(wslpath -w "$a")"); else conv+=("$a"); fi
done
if [[ -n "$blend" ]]; then
  "$B" --background --factory-startup "$blend" --python "$(wslpath -w "$script")" -- "${conv[@]}"
else
  "$B" --background --factory-startup --python "$(wslpath -w "$script")" -- "${conv[@]}"
fi
