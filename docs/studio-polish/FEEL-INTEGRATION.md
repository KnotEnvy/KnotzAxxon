# Gameplay recovery integration

Opus Medium with fast mode retained the inherited Sonnet Input fixes and prior Opus Engine recovery changes, and added three fault/lifecycle regressions. Its historical ledger is preserved in `opus-medium-worker-ledger.md`; statements there marked as findings describe worker completion, before the primary follow-up below.

The primary fixed both main resume routes, including the real Screens cancel/pause routing: Escape, P and the Resume button cannot resume gameplay while the WebGL context is lost or renderer recovery is pending. Recovery alone leaves the game paused; a fresh action is required. Input suspension transitions discard queued touch/keyboard/pointer intent. Renderer setup must succeed before input unsuspends; a setup failure preserves the original error and starts no frame loop. Sky-bake failure continues to surface its error while allowing the usable renderer loop to run.

The regressions exercised the original failing code before the fixes. The combined suite passes **205 tests**, and the Pages build and diff checks pass. `scripts/qa/context-recovery.cjs` exercises the actual page through Escape, P and the real Resume button, including queued touch taps; its server and browser close on completion. It uses software rendering and makes no hardware performance claim. Existing human cross-device testing is user-reported acceptance.

HP, scoring, collision geometry, movement, cameras, RNG and weapon tuning are unchanged by this pass. Environment scenes remain a separate active assignment. After integration, repeat collision, cover/occlusion, Classic engagement-envelope, first-shot cue and real-page checks before a combined release. Current polish is uncommitted and has not changed the live site.
