# Blender asset contest — round 1

Baseline commit: c07e5e7236afa8ee53bf42bc831f0f7cb3802ce0.
Each of the four contestants builds BOTH the player fighter and Iron Sentinel in Blender.
All receive this identical brief; model High effort is set by the orchestrator.
One initial submission each, followed by the same opportunity for technical repairs.
No ranking until joint review with the user. Cosmetic preferences are not technical repairs.
Do not inspect other entries. No subagents. Do not modify production game code or publish anything.

## Art direction
Create your strongest original upgrade for this industrial orbital-fortress rail shooter.
Maintain recognizable roles and readable silhouettes at small isometric gameplay sizes.
Fighter: precision interceptor, coherent manufactured surfaces, clear cockpit and twin engines.
Sentinel: imposing hovering mechanical fortress guardian, identifiable shoulder weapons,
chest reactor and missile arm. Preserve gameplay colors/cues. Creative freedom within these constraints.
Avoid detail that only reads in a close-up or bloom that obscures shapes.

## Source of truth and compatibility
Read README.md, src/render/PlayerShip.js, src/entities/Player.js, src/entities/Boss.js,
src/render/Materials.js and src/game camera code in your own baseline checkout.
Export glTF with X across, Y up. Fighter nose +Z; boss front -Z.
Preserve baseline overall dimensions within 10%, origin and functional attachment positions.
Fighter muzzle sockets: (+/-1.6,-0.1,2.4); engine centers: (+/-1.05,-0.1,-2.515).
Separate named engine cores for animation.
Boss: retain torso, head, separate shoulder pods/barrels, forearms, reactor and four shutters.
Head pivot (0,8.4,-0.6) relative torso; forearms (+/-10.4,-2.6,0.4);
pods (+/-13.8,5.6,-0.6); reactor group (0,1,-5.6).
Missile mouth (0,0.3,-8.8) relative +X forearm. Source code resolves remaining details.
Supply explicit node-to-runtime mapping, including pivots and materials for charge/open/damage cues.
Demonstrate closed/open reactor, charge, and destroyed shoulder states with exportable animations
or a documented, reproducible pose script. Do not change combat, collision or targeting rules.

## Common limits and deliverables
These are contest budgets, not measured baseline performance:
fighter <=25,000 evaluated triangles and <=8 material primitives;
boss <=100,000 evaluated triangles and <=48 material primitives.
Aim lower when it preserves quality. Report actual counts and any overages.
glTF-compatible PBR materials; no unbaked procedural shaders. No external assets or downloaded art.
If textures are used, pack them into blend/GLB, max 2048 per texture, <=16 MiB GLB per asset.
Deliver under contest-entry/: player.blend, sentinel.blend, player.glb, sentinel.glb,
reproducible Blender Python build script(s), manifest.json with counts/bounds/node mappings,
and concise README.md with build commands, verification, limitations and artistic rationale.
Reopen both saved .blend files and reimport both GLBs to verify them.
Do not claim runtime integration or performance tests that you did not run.
Use the same Blender executable available to all:
"/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" (verified 5.2.1 LTS).
This is Windows Blender from WSL: convert filesystem paths with wslpath -w, including
scripts/output directories; use a unique Windows temp directory if UNC access fails.
Do not install or change shared tools. Ask orchestrator about blockers or ambiguous requirements.
No hard wall-clock cap: finish both assets and self-validation in one submission.
Report time spent; speed is descriptive, not a judging criterion.
Optional author renders are supplementary; orchestrator will control final comparison cameras,
lighting, framing, exposure and renderer identically for all entries and baseline.

## Joint review
Use anonymous A–D labels for review assets; do not include author/model labels inside assets.
Score each asset on visual craft 30%, gameplay readability 30%, animation/attachment compatibility
25%, and measured asset efficiency 15%. File integrity and required deliverables are eligibility checks.
These proposed weights can be adjusted by the user before reviewing entries.
The user and orchestrator compare baseline with each entry and discuss tradeoffs before selecting
any winner. Winning this round does not automatically authorize replacing every production asset.
