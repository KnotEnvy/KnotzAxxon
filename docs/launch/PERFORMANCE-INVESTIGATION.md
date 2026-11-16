# Render-submission stall investigation

This is diagnostic evidence, not sustained FPS or physical latency certification.

Sol Low's normal realtime loop0/seed170001 pilot on e1623af9 rendered18,347frames.
Its largest CPU submission was3116.1ms, largest rAF interval3133ms. The initial
observation o001 contains frame1 and elapsedWallMs3137.5: the large stall localizes
to the first rendered frame. Subsequent observation deltas do not isolate any later
3second event. The initial shot was taken immediately after the fixture changed
quality fromHigh toMedium and cameraChase toModern. These facts do not identify
the root cause; shader compilation, driver scheduling and instrumented capture cost
were not separated.

Bot QA now records every submission>=50ms as an observational event and retains
the16slowest in each result: actual frame/wall clock/sector/state, program counts
before/after, resources, canvas/settings and current pilot intent. It invokes the
original render unchanged and does not change step/render cadence or gameplay.

The follow-up pilot-live-sheet-smoke-01 on f35524e9 rendered743/743actual frames:
max342.4ms atframe451, sector1, programs49to51; opening56.1ms. Chrome157.0.8103.52
GTX1650Ti/D3D11 onNitroBliss, High/Chase/960x540/DPR1. It retained normal resources
and ended in genuine death. This shows the new telemetry works; it does not prove
the3.1second stall is fixed or assign a cause. Both raw receipts remain uncredited
development pilots in artifacts/launch/live-sol-low/.

Next useful diagnostics are paired same-seed quality-transition versus boot-at-
selected-quality runs and a repeated warm run, with the same context/viewport,
actual program/clock telemetry and source identity. These must not be pooled into
final frozen-candidate episodes unless they independently meet all campaign rules.
UI fixes belongOpus; visual/material/art changes belongFable; code scheduling/
resource ownership findings coordinateHydrogen. No arbitrary quality reduction or
gameplay rebalance is justified by these measurements.

## Paired30second realtime startup probes

On the unchanged f35524e9 runtime, two normal-resource bot-operated, actual-rAF
flights used seed170001, synthetic gamepad/Modern/Medium,960x540/DPR1, initial
engine time25.180588853711168 and the same shared PRNG seed. Each stopped deliberately
at30seconds, so both are incomplete diagnostics and receive zero episode credit.
The first bootedHigh before switching toMedium; the second bootedMedium directly.

- pilot-stall-high-to-medium-01:1785actual renders/frames; max submission431.6ms
  atframe527/z310.40, programs63to64.
- pilot-stall-medium-boot-01:1794actual renders/frames; max290.1ms atframe535/
  z311.16, programs49to50; opening frame56.8ms.

Both source receipts match; neither reproduced the3.1second first-frame event.
Both slower submissions coincide with a program-count increase nearz310. This is
a correlation, not isolated proof of shader compilation cost. Browser contexts were
fresh but driver/OS caches were not controlled or cleared. ActualrAF timestamps
differ, so this is a paired-seed startup probe, not identical frame timing or a
balance comparison. No quality/gameplay/material change was made. Next telemetry
also records added program names/cache-key tails to identify the missing variant
before considering any owner-coordinated fix.

An accelerated fixed60Hz, every-frame-rendered30second diagnostic (1801actual
renders, deliberate timeout, no episode credit) then identified the added program
atframe539/z311.06: `warm_armor`, duration281.2ms, count49to50. The opening
64.9ms submission added `FUEL_Hull` and `FUEL_Band`. Raw cache keys/adapter/source
receipts are in artifacts/launch/bot/pilot-stall-program-id-01/. This narrows the
prewarm investigation to actual material variants; it is not sustained realtime
performance evidence or a proven root cause.
