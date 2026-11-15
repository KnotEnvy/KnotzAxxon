#!/usr/bin/env bash
# compose.sh <name> <seed> <firstChunk> <lastChunk> <poseZ,...>
set -euo pipefail
BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(cd "$BASE/../.." && pwd)"
TASK_TMP="$(mktemp -d)"
trap 'rm -rf "$TASK_TMP"' EXIT
node "$BASE/tools/export-composition.mjs" "$TASK_TMP" "$2" "$3" "$4" "$5"
"$BASE/blender.sh" --background --factory-startup -noaudio --python "$BASE/source/compose_scene.py" -- "$TASK_TMP" "$BASE/environment-kit.blend" "$REPO" "$BASE/scenes/$1-composition.blend" "$1"
