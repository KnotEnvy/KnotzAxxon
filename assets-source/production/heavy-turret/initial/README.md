# Heavy turret INITIAL

Status: **pending_deferred_opus_review**. Zero formal reviews or formal review/fix rounds. No final art approval. This original asset uses an annular armored foundation and open twin-weapon yoke to accommodate rooftop downward aim without changing the source pivots.

Open `heavy-turret.blend` for the editable packed geometry; use `heavy-turret.glb` for integration. No textures or external image dependencies are needed. Mesh vertex groups identify individual mechanical parts. The blend contains a hidden flash prototype outside the export collection. Detach is N/A.

`manifest.json` has measured geometry, source contracts, settings, hashes, verification and all limitations. `runtime-map.json` contains every node and material plus exact moving parents, pivots, axes and resource ownership. `verification/` contains reopen/reimport, binary bounds/transforms, sampled source dynamics, density and disposal checks. `evidence/` contains individual rest/action/charge/flash PNGs, same-scale shipped reference views, camera reconstructions, small PNGs and contact sheets. Offline reconstruction is not live gameplay proof.

Integration is deferred to the orchestrator's bound SuperBeast worktree. Production files were not edited. Add `heavy-turret` to the ImportedModels loader keys. After Turret initializes its heavy gameplay properties, route heavy graphics to `buildImportedGround(this, 'heavy-turret')`. Add the following branch to that function and retain its existing flash bake and clone/disposal logic:

```js
} else if (kind === 'heavy-turret') {
  enemy.turntable = node(root, 'turntable');
  enemy.barrels = [node(root, 'barrel-L'), node(root, 'barrel-R')];
  enemy.eye = node(root, 'eye');
  replaceMaterial(root, 'HT_Eye_Red_ff3d55', enemy.mats.neon(0xff3d55, 3));
  flashSource = node(root, 'dome');
  flashParent = enemy.turntable;
```

Do not substitute `muzzle-L/R` for barrel pivots. Those markers diagnose visual placement only; the existing `_shoot` computes predictive world direction and adds aim*1.6. Keep the two cloned asset materials owned by `root.userData.modelOwnedMaterials`; let `Enemy.dispose` own `flashMat` separately. Replace the lens material through the existing replaceMaterial helper to preserve the source neon shader and toneMapped=false. The unused cloned exported eye material remains in modelOwnedMaterials and is disposed with the instance; shared neon stays Materials-owned. Never clamp aim to protect graphics.

To reproduce, copy this frozen directory to a mutable working directory. Set `KNOTZ_REPO` to the shared source checkout. `scripts/blender.sh` is runtime tooling only and expects the existing NitroBliss executable/sysroot; adapt those paths to the receiver's existing native Blender installation as needed. No installation or tool binaries are supplied.

```bash
node scripts/sample_source.mjs
node scripts/sample_density.mjs
scripts/blender.sh --background --threads 4 --factory-startup --python scripts/build_heavy_turret.py
python3 scripts/inspect_glb.py
node scripts/check_ownership.mjs
scripts/blender.sh --background --threads 4 --factory-startup --python scripts/verify_blender.py
scripts/blender.sh --background --gpu-backend opengl --threads 4 --factory-startup --python scripts/render_evidence.py
python3 scripts/contact_sheet.py
python3 scripts/write_manifest.py
```

All limitations from the manifest:

- Exported lens is an offline PBR emissive approximation. Runtime must apply the documented source shared-neon material replacement to preserve unlit toneMapped=false behavior. Shared neon stays Materials-owned.
- INITIAL only. Zero formal reviews and zero formal review/fix rounds. Opus review/polish on SuperBeast remains pending_deferred_opus_review; no final art acceptance.
- Not integrated into production. No heavy-turret adapter exists in this checkout. Receiver must add the loader key and bindings documented in runtime-map.json; HP, radius, score, timing, targeting, hit handling, source pivots, projectile origins, lifecycle and camera contracts must remain unchanged.
- Offline EEVEE reconstructions are not live gameplay proof. Actual CameraRig.snap and source dusk key/rim positions, targets and colors are used. Hemisphere ambient is approximated by world illumination; no Three PMREM, scene cubemap, live fog, bloom, tone mapper, particles, HUD, renderer or combat/occlusion integration is reproduced.
- Source constructor/update/_shoot execute unchanged in a minimal CPU geometry/math harness because Three.js is not installed in this checkout; this is not a native Three/WebGL execution. The Level density sampler imports the actual dependency-free Level module. Independent binary GLB checks and Blender reimport are separate verifications.
- Predictive shot direction differs from damped visual barrel aim. Across the deterministic sampled moving passages, peak shot-origin to diagnostic visual-muzzle offset is 1.961649 units and peak angular difference is 75.615693 degrees. These are sampled values, not global bounds; no clamp, shot-origin rewrite or hidden correction was applied.
- Visible muzzle lip spans local Z1.5915..1.6265 near source pivot+aim1.6 when directions agree. The shot radius.9/width1.35 is a stylized source projectile wider than the bore; these values are preserved.
- Clearance uses actual mesh vertices across361 elevation samples at0.5-degree intervals and all sampled source poses. Annular radial and lateral envelope gaps cover arbitrary yaw. Seated axle/bearing contact and structural assembly overlaps are intentional. This is not an exhaustive live triangle/world collider test.
- Rooftop shots can point into the underlying roof/world surface; the annular art clears the weapons but cannot change the source world projectile trace. No terrain hole or production collider was edited.
- Hit-flash evidence is a solid emissive diagnostic of the packed hidden prototype. Runtime must generate the existing transparent additive Enemy flash shell; its live blending/disposal still needs integration validation.
- Common rest camera sees the rear of the source-rest +Z-facing eye; action/front views expose the charge cue. Gameplay views retain actual source camera orientation and common world scale, with the heavy on X-5 and shipped standard on X+5.
- Density11 in355 units is a seeds1..100, loops0/1/3 feature-density proxy, not live maximum or measured FPS. Small camera views expose limited detail and modest cue size at distance; art polish remains deferred.
- Native headless runtime logged EGL_BAD_MATCH attempts before successful software EEVEE renders. No Windows Blender, installation, tool binary, sysroot or cache is included.
