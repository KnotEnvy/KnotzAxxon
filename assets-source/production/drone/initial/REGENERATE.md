# Reproduce the initial drone

The generator is original, deterministic Python geometry. It imports no reference mesh. Shipped GLBs are read only by the separate style-reference and player-scale evidence scripts. All authored materials are plain packed Blender materials; no atlas, external textures or image dependencies exist. `drone.blend` is a compressed editable file, saved and reopened by a separate Blender process. `bpy.ops.file.pack_all` is called before save even though there are no external assets to pack.

Run from the shared repository root. The commands below use the editable `work/` directory. Keep the original `initial/` immutable. If only the archive is present, copy its contents into a new `asset-work/drone/work/` directory (or choose a fresh sibling and adjust these command paths). Scripts resolve output relative to their own directory and reference GLBs relative to this repository. Do not regenerate into the frozen snapshot.

```bash
node asset-work/drone/work/scripts/sample_runtime.mjs
asset-work/drone/blender.sh --background --factory-startup --disable-autoexec --threads 4 --python-exit-code 7 --python asset-work/drone/work/scripts/build_drone.py
python3 asset-work/drone/work/scripts/glb_audit.py
asset-work/drone/blender.sh --background --factory-startup --disable-autoexec --threads 4 --python-exit-code 7 --python asset-work/drone/work/scripts/references.py
asset-work/drone/blender.sh --background --factory-startup --disable-autoexec --threads 4 --python-exit-code 7 --python asset-work/drone/work/scripts/verify_render.py
asset-work/drone/blender.sh --background --factory-startup --disable-autoexec --threads 4 --python-exit-code 7 --python asset-work/drone/work/scripts/supplement.py
asset-work/drone/blender.sh --background --factory-startup --disable-autoexec --threads 4 --python-exit-code 7 --python asset-work/drone/work/scripts/shot_probe.py
python3 asset-work/drone/work/scripts/png_sheet.py
```

The wrapper is the existing verified Linux Blender 5.2.1 LTS build `9e2066aef7ef` with archived runtime sysroot libraries. Those tool binaries, libraries and caches are deliberately excluded from the delivery archive. On another machine, run these scripts with native Blender 5.2.1 LTS (or reassess exporter/render differences), Python 3 and Node. No npm or Python package installation is required.

`DRONE_RENDER_RESUME=1` skips existing PNGs after an interrupted render process, while redoing the technical checks. Omit it for a complete rerender. Offline camera reconstruction is documented in `evidence/reports/render_metadata.json`; it is not a browser/game screenshot. Geometry and the uncompressed binary export are deterministic given this Blender exporter; .blend bytes may vary because Blender includes save metadata. Hashes identify the delivered snapshot, not a universal byte-for-byte regeneration guarantee.

For economical software rendering on the shared host, use `DRONE_MAX_NEW_RENDERS=3 DRONE_RENDER_RESUME=1` on the verification process, then run `render_only.py` with those same variables until the 17 standard view PNGs exist. Run `render_only.py` once more with resume and no limit to emit final camera metadata. That helper reuses the exact rendering block without repeating passed geometry checks. A batch prints `DRONE_RENDER_CHECKPOINT` and exits 0 after closed PNG writes; image existence and inspection determine completion. The supplemental three views and the single diagnostic ray view are separate short jobs. References are independently framed style thumbnails; the player comparison uses actual common world scale.

Formal Opus review and its fix/polish round are deferred. Initial technical self-correction (pulse clearance, scale fit, packing and export scene semantics) is part of construction and is not counted as a formal review/fix round.
