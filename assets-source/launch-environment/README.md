# Launch environment — ambient traffic sources and evidence

Owner: Fable High. Receipt: `docs/launch/fable/AMBIENT-TRAFFIC.md`.
Runtime: `src/world/AmbientTraffic.js` (shader, lane table, per-sector looks). No mesh asset, no
Blender source: the layer is 64 shader-driven quads.

* `tools/capture.cjs <spec> <out>` — takes the cooperative GPU lease, starts a localhost Vite
  server, drives installed Windows Chrome over Playwright pipes (`tools/capture-win.cjs`) and
  releases its own lease. Refuses to overwrite a run. Hardware renderer required.
* `tools/diff.mjs <run> [--json f] [--crops d] [--mark d]` — stdlib PNG comparison of each
  before/after pair: changed pixels, peak change, located lights, enlarged crops.
* `specs/traffic.json` — the 18-scene, two-viewport set used for the retained evidence.
* `evidence/` — curated frames, capture report/diff/source hashes, CPU measurements, test log.
* `retainedSHA256SUMS` — verifies this directory.
