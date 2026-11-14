#!/usr/bin/env bash
# Rebuild, verify and render a full snapshot in the directory that contains this scripts/ folder.
#   scripts/make_snapshot.sh            (from WSL; Windows Blender 5.2.1 via run_blender.sh)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SNAP="$(dirname "$HERE")"
BASELINE="$(cd "$SNAP/../.." && pwd)/docs/asset-contest/round-3-baseline.json"
RB="$HERE/run_blender.sh"
cd "$SNAP"
mkdir -p verification renders textures
rm -f silo.blend fuel.blend silo.glb fuel.glb silo.blend1 fuel.blend1
"$RB" "$HERE/build.py" -- --out "$SNAP" --asset both > verification/build.log 2>&1
grep -q "BUILT silo" verification/build.log && grep -q "BUILT fuel" verification/build.log
for a in silo fuel; do
  # reopen the saved blend in a fresh Blender process
  "$RB" "$HERE/verify_blend.py" "$SNAP/$a.blend" -- --asset $a --json "$SNAP/verification/${a}_blend.json" > "verification/${a}_blend.log" 2>&1
  # import the GLB into a clean empty scene
  "$RB" "$HERE/verify_glb.py" -- --glb "$SNAP/$a.glb" --json "$SNAP/verification/${a}_glb_reimport.json" > "verification/${a}_glb_reimport.log" 2>&1
  # independent standard-library parse of the GLB
  python3 "$HERE/inspect_glb.py" "$a.glb" > "verification/${a}_inspect.json"
  # motion sweeps against real meshes
  "$RB" "$HERE/clearance.py" "$SNAP/$a.blend" -- --asset $a --json "$SNAP/verification/${a}_clearance.json" > "verification/${a}_clearance.log" 2>&1
  "$RB" "$HERE/render.py" "$SNAP/$a.blend" -- --asset $a --out "$SNAP/renders" > "verification/${a}_render.log" 2>&1
done
python3 "$HERE/manifest.py" "$SNAP" "$BASELINE" | tee verification/manifest.log
grep -h "VERIFY_\|CLEAR\|RENDER_DONE" verification/*.log
