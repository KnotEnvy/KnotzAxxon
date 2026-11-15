# Editable authored environment kit

Native Blender 5.2.1 LTS sources for the default environment stream. `environment-kit.blend` contains the reusable kit; `scenes/` retains all ten world-scale composition scenes with shipped player/threat references and source cameras. `modules/`, `runtime/` and `kit-recipe.json` retain exports, named parts and measured metadata.

Build into a temporary directory and inspect before replacing the shipped GLB:

```bash
assets-source/environment/blender.sh --background --factory-startup -noaudio --python assets-source/environment/source/generate.py -- /tmp/knotzaxxon-environment-rebuild
python3 assets-source/environment/source/audit_glb.py /tmp/knotzaxxon-environment-rebuild /tmp/environment-audit.json
```

The wrapper reuses Nitro's installed native Linux Blender. On another machine run the installed native `blender` binary directly with the same arguments; no Windows Blender or reinstallation is required. Runtime loads only `public/models/environment/environment-kit.glb`, not these authoring files.

Run `npm test` for fallback golden hashes, seeded parity, clearance, budgets and ownership. `node assets-source/environment/tools/measure.mjs /tmp/environment-measure.json` measures the current tree with kit off/on. For historical parity, restore commit `cf5983c` into a temporary data directory with `git archive`, link that directory's node_modules to the repo's installed dependencies, then set `KZ_FROZEN_TREE` to that directory before running `tools/parity.mjs`. This is a data fixture, not a checkout/worktree. The optional original prototype comparison needs the initial sources from the verified full archive.

`tools/compose.sh` regenerates a composition from current streamed geometry. `tools/capture.sh spec.json` captures a temporary localhost dev build using native Chromium and software WebGL; the caller owns and closes the server, and coordinates other GPU/browser jobs. On Nitro set `KZ_BROWSER_WRAPPER` to the verified `asset-work/studio-browser-tools/bin/kz-pw`. Capture specs and renderer/error reports are in `evidence/captures/`. Windows browser probes and worker-only packaging helpers were archived out.

`devlog/` retains selected actual-game source/kit pairs and Blender MCP viewport images, clearly labelled by renderer. These show appearance, not hardware FPS or human play acceptance. `retention.json` locates the full original archive and hashes of omitted redundant files. `retainedSHA256SUMS` verifies this curated source pack.
