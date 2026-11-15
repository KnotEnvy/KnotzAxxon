# Player verification and issue intake

Play https://knotenvy.github.io/KnotzAxxon/ in a fresh browser first. Read handoff.json
for the published revision and [launch/FINISH-LINE.md](launch/FINISH-LINE.md) for the
separate public-launch candidate. The user has reported successful earlier cross-device
play and accepted the art/gunner. New-architecture physical-device play and audible
perception require their own evidence; automated GPU/agent trials are labelled as such.
Use this guide for actual player reports without overwriting earlier acceptance.

## Before the run

Record the deployed commit from the successful GitHub Pages release workflow, browser/version, device/GPU, viewport, quality preset, camera, Flight Assist and control method. Use the random fortress code printed on the results screen or a URL with ?seed=4F9K2A to reproduce a run. Daily sortie changes on the UTC date boundary. Browser settings and records persist locally; a different browser or origin starts fresh.

## Priority checks

1. Fly the gentle opening in Classic, Modern and Chase. Check screen-relative left/right controls and rolls, reaction time, fuel availability, target contrast and the first wall.
2. Use the single altimeter contact band for firing height and amber obstacle-clearance band for walls. Check covered and off-screen targets do not award invisible kills or explosions.
3. Shoot fuel, radar, guns and parked enemy fighters. Decorative grey objects must remain distinguishable. Build chains through multiplier milestones; check expiry, damage interruption, pause and retry.
   Check the brief damage cross, gold weak-point/kill confirmation and grey armor diamond. Listen for the rising damage chirp versus the dry armor strike. Boss armor should not improve shot accuracy.
4. Traverse all eight sectors: fortress ground targets, reactor moving gates, electric barriers, open-space formations and debris gates. Check near geometry, shadow depth cues and route/grade cards.
5. Earn thread, low-pass and graze awards. Finish a clean sector below and above 35% targets; the clean bonus starts only above that threshold. Check sector grades, best grades and hull awards at 50,000 and 150,000.
6. Fight the Sentinel pods, core and phase-two missile rack (six hits during charging). Beat it, inspect results, share the fortress code, retry and continue to loop 2 with score banked.
7. Listen on speakers and headphones: warning clarity, music hooks, environment beds, stereo placement, dense-combat mix and curtain-gap cue. Confirm low-fuel, hull/shield damage and overheat warnings remain clear as the weapon bed briefly dips. Audio needs an audition by ear.
8. Test physical controller and touch in portrait and landscape. Check menus, altimeter, buttons, orientation changes and pause when focus leaves the game. Repeat with reduced motion.
9. Use F for telemetry. Record sustained FPS and p95 frame intervals during crowded combat and the boss; inspect resource growth through ten retries and quality switches on named hardware.

## Report each finding

```text
Deployed commit:
Browser/device/GPU:
Viewport / quality / camera / assist / input:
Fortress code or URL / sector / approximate position:
Steps to reproduce:
Expected behavior:
Observed behavior:
Screenshot/video and telemetry if relevant:
Severity: blocker / gameplay issue / visual or audio polish
```

Report in GitHub Issues or return the collected notes to the next team. Historical invulnerable scenario/autopilot tools are diagnostics, not balance evidence.
The new launch bot uses normal resources, damage, collisions and weapons; its accelerated
GPU coverage still differs from realtime visually observed agent trials and human play.
Published-release evidence is in release-validation.json; candidate evidence and limits
are indexed in [launch/PROOF-PACKET.md](launch/PROOF-PACKET.md). Historical text reviews
remain under docs/reviews/.

## Next team after playtesting

Reproduce reported blockers on the deployed revision first. Prioritize input, progression, altitude/collision and fuel defects, then balance and readability, then optional scenery. Preserve the eight-sector structure, accepted camera rigs, level forward fire and seeded reproducibility. Run npm test, build:pages and test:release before merging a fix; use development capture scripts for specific scenes and campaign progression. Update handoff.json with evidence and unresolved items after each accepted pass. The accepted art/gunner and earlier optional asset-review backlog are closed by user
acceptance. Additional targeted world/lighting/ambient findings go to Fable High;
UI/HUD/title/layout findings go to Opus High. Preserve all seven stable judging lenses
and the all21 individual >=9 gate for the final launch. Do not treat deferred next-month
stage ideas as current-release requirements.
