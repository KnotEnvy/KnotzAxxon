# Builder–advisor Blender contest — round 2

## Objective
Build TWO original game-ready assets: the standard ground gun turret (not heavy turret)
and radar tower for KnotzAxxon. Each of four teams receives this same brief.
The builder must author both assets in Blender based on its assigned advisor's suggestions.
The advisor supplies art direction, answers questions and reviews; the builder implements.
No winner is chosen until the user and orchestrator review the entries together.

## Process (mandatory, identical for every team)
1. Initial direction: obtain one design consultation from your assigned advisor BEFORE
   authoring geometry. Give it this brief, source paths and baseline.json; request actionable
   visual/articulation guidance for both assets in <=1,000 words.
2. Build your best initial submission. You MAY ask your assigned advisor questions in
   up to THREE exchanges during the build, each containing up to THREE specific questions.
   These exchanges are optional, not a requirement to spend them. Each answer <=900 words.
   Log each batch and answer, even unused allowance, in team-entry/process.json.
   Do not turn an exchange into another broad design review or a hidden implementation task.
3. Render, visually inspect and self-verify until you consider BOTH assets your best initial
   work. Preserve a complete immutable submission in team-entry/initial/, including build
   scripts, blends, GLBs, measurements and self-review PNGs. Record hashes before the review.
4. Request ONE formal final review from the same assigned advisor in a NEW delegate_task.
   Give it initial submission, rendered views and verification evidence. Ask for prioritized
   findings/objections and actionable improvements for both assets, <=1,000 words.
   This formal review is separate from the three optional question exchanges.
5. Apply ONE fix/polish round based on that review. Save the result in team-entry/final/.
   Reopen, reimport, self-verify and inspect the final files; technical self-verification
   during this pass is allowed. No further advisor reviews, question exchanges or polish
   rounds after this final pass. If advisor finds no changes necessary, copy initial to final
   and document that outcome. Never silently omit the formal review or final pass.
6. Return final artifact paths, initial hashes, process log, actual settings, question count,
   advisor findings, addressed/unaddressed findings, verification and limitations.

Only your specifically assigned advisor may be delegated to. No helpers, coding agents,
other models or reviewers. Advisor must be READ ONLY and cannot write geometry, generators,
Blender files, implementation patches or alternate assets. Concise mathematical guidance is
allowed, but all implementation belongs to the builder. The advisor may inspect source files
and rendered images with tools. Start a fresh delegate for every consultation/review, include
sufficient context and prior advice. Do not send new tasks with t3_thread_send.
If a requested model/provider or option is unavailable, report the blocker; do not substitute.
Never inspect another team or round-1 contestant work. Current selected production fighter
and boss can be used solely as shared style references at the explicit paths below.
Do not edit production files, install/change shared tools, create a PR, commit, or publish.

## Source and style references
All worktrees use baseline commit c07e5e7236afa8ee53bf42bc831f0f7cb3802ce0.
The parent has uncommitted unrelated work; your prepared checkout excludes it. Do not copy it.
Read src/entities/Enemies.js (Turret and RadarTower), src/render/Materials.js,
src/render/GeoUtils.js, README.md and the camera code.
Shared authoritative baseline measurements:
 /home/knotz2/code/KnotzAxxon/artifacts/asset-contest-teams/baseline.json
Shared current selected game art, for style only:
 /home/knotz2/code/KnotzAxxon/public/models/player.glb
 /home/knotz2/code/KnotzAxxon/public/models/sentinel.glb

Industrial orbital fortress: manufactured layered armor, believable mechanical joins,
purposeful silhouettes, readable cues against busy scenery. Bring original design craft,
not a primitive reconstruction. Turret should look threatening and able to aim; radar
should read as a high-value communications target. Preserve the material/color hierarchy:
warm armor, cool dark structure, amber turret eye, green radar emitter. Keep bloom restrained.
Close-up polish must survive small isometric framing. Neither speed nor using all budget wins.

## Coordinates, dimensions and mechanics
Use glTF X across, Y up, +Z turret forward. Assets stand at local ground Y=0 with root at origin.
Use Blender's coordinate conversion correctly; no arbitrary export root scale/rotation.
Match each baseline visible rest-state overall dimension within 10%; visible geometry only,
excluding hidden hit-flash helpers, at origin, yaw=0/pitch=0. Report per-axis percentage changes.
Turret baseline size: (3.7999999523, 2.1399999857, 4.7250000238).
Radar baseline size: (4.6999998093, 9.6598052502, 4.4000000954).
Maintain plausible animated clearance and do not extend decorative forms beyond the budget.

Turret hierarchy: root 'turret', 'base' static, yaw group 'turntable' at (0,1,0);
pitch group 'barrel' at (0,0.15,0) relative turntable, pointing +Z;
'eye' at (0,0.58,1.02) relative turntable, with independent scale/charge control.
Give 'muzzle' socket at actual modeled barrel tip; document how it relates to existing
shoot logic, which emits from barrel pivot plus aim*1.6. Do not alter gameplay shooting,
collision radius (2.4), health (2), scoring or the heavy-turret variant.
Keep the dome/armor eligible to detach as a death part. Supply explicit mapping, not code edits.

Radar hierarchy: root 'radar', static base/mast; yaw group 'dish' at (0,7.2,0);
'emitter' at (0,0.42,1.65) rotated -0.28 radians about X relative dish (approximately
(0,0.85964,1.47079); calculate exact value from the source).
Dish assembly rest tilt follows existing reflectorGeometry(...).rotateX(-0.28).
Yaw rotates continuously about Y; emitter pulses independently; dish needs front/back
geometry or a properly double-sided exported material. Preserve radius (3), health (4),
scoring and gameplay radar-jamming behavior. Provide a detachable dish assembly.

Demonstrate turret rest/aim/charge and detached dome, radar rotating dish/pulse and toppled dish
via exported clips OR reproducible pose scripts. Existing procedural runtime will remain
authoritative during any later integration. No actual integration is requested this round.

## Common budgets and outputs
Turret <=15,000 evaluated triangles and <=8 material primitives.
Radar <=20,000 evaluated triangles and <=10 material primitives.
Each GLB <=16 MiB. Textures <=2048 pixels on either axis, embedded in GLB and packed in blend.
PBR materials compatible with Three.js/glTF; bake any procedural-only shaders.
No downloaded assets, external artwork or generated image textures from other models.
Use named independent moving nodes and batch static detail by material.

Each of initial/ and final/ contains:
 turret.blend, turret.glb, radar.blend, radar.glb;
 reproducible Blender Python generator(s), pose/demo scripts and commands;
 manifest.json (actual triangles/primitives/bounds/bytes/pivots/material mapping/hashes);
 verification records from reopening BOTH blends and reimporting BOTH GLBs into clean scenes;
 neutral rest, close-up, rear/side and small isometric self-review PNGs, plus key state views;
 README.md with rationale, actual checks, limitations and reproduction steps.
These are real file deliveries; code without rendered/verified Blender artifacts is incomplete.
Team process log and advisor records sit in team-entry/ outside the frozen snapshots.
No author/model identifiers on asset geometry, texture labels or self-review renders.
Put author/team identity only in process records so final comparison can be anonymous.

All teams use the same verified executable:
 "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" (5.2.1 LTS)
This is Windows Blender from WSL. Convert paths with wslpath -w; if UNC access is awkward,
use a UNIQUE per-team Windows temp directory and copy artifacts back. Never share temp outputs.
Do not install shared tools. Node/npm dependencies may be installed normally in your own checkout.
Inspect your actual render PNGs using view_image; don't claim visual review based only on code.
Report elapsed time descriptively. No fixed wall-clock cap or token quota is imposed.
Final comparison uses the orchestrator's identical renderer/camera/world scale/exposure
for all four entries and existing baseline. Author renders are self-review only.

## Joint judging
Initial and final versions are both preserved. Review anonymous final versions against baseline
and each other, then reveal teams. Visual craft and gameplay readability lead; articulation,
compatibility and measured efficiency matter. Same limits and same fix opportunity for all teams.
No model/provider identity should influence feedback. The user and orchestrator choose together.
