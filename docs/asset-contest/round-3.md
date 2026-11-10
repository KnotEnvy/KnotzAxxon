# Round 3: winning pair versus solo builders

Build two original Blender assets for KnotzAxxon: missile silo (`silo`) and fuel cell
(`fuel`). Entrants are Haiku 5.5 High building with Terra 6.1 Medium advising, Opus
5.5 High solo, and Sonnet 5.5 High solo. All begin from the same clean main revision.
The orchestrator and user will review anonymous entries together. No production edits,
commits, PRs, publishing, other-entry reads, downloaded artwork or substitute models.

Read `src/entities/Enemies.js` (Silo/FuelCell), `src/render/Materials.js`, the camera
code and `assets-source/README.md`. Current `public/models/*.glb` are shared style
references. Build distinct manufactured silhouettes with purposeful armor, cavities,
bevel highlights and readable mechanisms at small isometric size. The silo is a warm
armored missile well with a hatch and red charge glow. The fuel cell is a safety-yellow
drum with clear FUEL identification, dark plumbing and a moving amber band, distinguishable
from weapons. Keep glow restrained and implement glTF-compatible PBR materials.

Use the authoritative visible rest-state dimensions in `round-3-baseline.json`; maintain
each axis within 10%, ground Y=0, origin at zero, glTF X across/Y up/+Z forward, identity
root transforms. Do not hide oversized geometry to pass. Blender Z-up conversion must
be correct. Preserve Silo hatch pivot (0,2.45,0), hatch opening scale and red glow at
(0,2.415,0); document the existing launch point. Preserve FuelCell band pivot (0,2.2,0),
its Y travel of +/-1.1 and Y rotation. Demonstrate rest, charge/open/launch and detachable
hatch; fuel band movement and ruptured tank. No gameplay, collision or target changes.
If a visual feature cannot clear its actual movement, redesign the geometry rather
than proposing a gameplay clamp. Do not repeat the previous turret's clearance failure.

Silo budget: 15,000 evaluated triangles and 10 material primitives. Fuel: 12,000 and 8.
Each GLB <=16 MiB, textures <=2048 per axis, embedded/packed. Batch per material and rigid
motion group. No other AI image generation or outsourced implementation.

All entrants build their best initial submission, render and inspect it, verify it, and
freeze `contest-entry/initial/` with hashes. Each receives exactly ONE fix/polish pass,
then freezes `contest-entry/final/`. Solo entrants perform a written self-review before
their fix pass; they have no advisors or subagents. The paired entrant obtains initial
Terra Medium direction, may use up to THREE optional exchanges of THREE specific questions
each, and obtains ONE Terra Medium formal review of the frozen initial before its fix.
Advisors are read-only: no code, generators, geometry or file writes. Every advisor call
uses a fresh delegate_task with exact settings. No additional reviews or build rounds.
Initial advice and the formal review are separate from the optional question quota.
Log actual settings/calls/questions, review findings, fixes, timings and limitations
in `contest-entry/process.json`. All geometry and scripts belong to the builder.

Each snapshot must contain `silo.blend`, `silo.glb`, `fuel.blend`, `fuel.glb`, reproducible
Blender build/pose/verification scripts, README commands, measured manifest with actual
triangles/primitives/bytes/transformed bounds/pivots/material mappings/hashes, and evidence
from reopening BOTH saved blends and reimporting BOTH GLBs into clean scenes. Include
neutral front/rear/side, close-up, small isometric and important state PNGs; actually
inspect them with view_image. Verify moving clearances. No model/team names on assets or
renders; identities go only in the process log. No unsupported verification claims.

Use the shared verified Blender 5.2.1 executable:
`/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe`.
Convert WSL paths with wslpath -w; use unique Windows temporary outputs if needed.
The correct engine enum is BLENDER_EEVEE, not BLENDER_EEVEE_NEXT. Do not alter shared tools.
Work through routine errors; there is no fixed time cap. Finish both assets through the
initial/review/fix/final protocol before reporting completion. Report limitations honestly.
Final comparison uses identical cameras, lighting, exposure, world scale and renderer.
Visual craft, readability, articulation, integration compatibility and efficiency all matter.
