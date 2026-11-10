# Selected Blender assets

The player fighter is contest entry C (Sonnet 5.5 High, initial submission).
The Iron Sentinel is entry A (Opus 5.5 High, initial submission).
The editable Blender files, original generators and manifests are preserved here.
Only the selected GLBs in `public/models/` ship in the web build.

The standard turret and radar tower come from round 2 entry A (Haiku High with Terra
Medium advice). Their sources are in `ground/`. Integration moves the turret gun to a
side trunnion at local (2.30, 0.15, 0) under the turntable, with an extended axle.
This clears the body and eye throughout the pitch sweep without clamping gameplay aim.
The shot still originates from the actual barrel pivot plus aim times 1.6. Health,
collision radii, scoring, heavy turrets and radar jamming retain their existing rules.
`ground/contest-manifest.json` records the original submission; the integrated turret
has a wider silhouette after the mount correction. Rebuild using `ground/scripts/build_assets.py`
with `-- --out OUTPUT_DIRECTORY --only both`, then copy the GLBs to `public/models/`.

Use Blender 5.2.1 to regenerate either asset into a temporary output directory:

```text
blender --background --factory-startup --python assets-source/fighter/blender/build_player.py -- OUTPUT_DIRECTORY
blender --background --factory-startup --python assets-source/sentinel/build/build_sentinel.py -- OUTPUT_DIRECTORY
```

When invoking Windows Blender from WSL, convert script and output paths with `wslpath -w`.
Review the generated files before copying the selected GLB to `public/models/`.
Original manifests also describe the other contestant asset; only the selected asset
in each directory is used by the game.

`src/render/ImportedModels.js` loads the files before game construction and binds the
authored hierarchy to existing gameplay animation. It keeps the exported PBR materials
and packed palette textures, replaces the Sentinel's dynamic cue/core materials, hides
inactive stumps, and generates damage shells and the fighter occlusion silhouette.
The gameplay code drives poses; exported demonstration clips are not played concurrently.
Model instances own geometry and cloned materials. Templates own shared textures until shutdown.

Run `node scripts/qa/imported-models.cjs` to check boot, imported model bindings,
reactor and charge states, shoulder destruction, and repeated boss creation/disposal
in Chromium. `npm run build:pages` and `npm run test:release` check the deployable build.
