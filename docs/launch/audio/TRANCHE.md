# Audio tranche — SUPERBEAST, 2026-11-15 (Spark1.3 audio owner)

Base: `2a77036cbc6a64b1b1656c8df8949a5650098dab` (previous live runtime `1b3ff18…`
is audio-identical: empty diff on `src/audio/`, `src/game/Game.js`,
`scripts/qa/audio-render.cjs`). Shared root untouched (`git status` clean);
Hydrogen worktree untouched. All outputs below are owned exclusive files.

## 1. Hearing vs analysis (read first)

**This session has no audio perception.** No playback device (`aplay` absent),
no listening tool in this harness (`read_file` attaches images/video only).
Nothing below was heard by me; nothing is described as heard.

What *was* done, all measured:

- Real Chromium (playwright, already installed) rendered the game's **actual
  `Audio.js`** through `OfflineAudioContext` (CPU DSP, no GPU): 5 programs,
  deterministic seed (`Math.random` stub + `rand.reset`), 44.1 kHz stereo WAV.
- Cross-check: my `audition` mirror reproduces the repo's own recorded peak
  **exactly** (`-5.32 dBFS`, cf. base `handoff.json` → `audio_peak_dbfs`).
- Two independent meters (in-page + stdlib Python FFT/RMS) agree on every peak.
- Node fixtures: base `opus-code-audio-lifecycle` 13/13 green in an owned
  sandbox of individual file copies (no full checkout anywhere).

## 2. Audit results (base)

| Area | Verdict | Key numbers |
|---|---|---|
| Weapons | healthy | laser transient short; enemy far(70u) −47.6 vs near(8u) −36.5 dB: distance model works |
| Music | healthy | s0/boss bed ≈ −21…−24 dB; duck mechanism code-verified (blast lifts sub, pocket opens) |
| Warnings, isolated | healthy, well separated | alarm=low band (420 Hz); lowFuel=mid pips (880/1046); shield=mid ring (1540); hull=low thump (161); overheat=air; zap=presence |
| Warnings over dense bed | all cut through (narrowband) | 800–1200 Hz lift: alarm +8.8 dB, lowFuel pip +17 dB, hull +7.5 dB; alarm mid/presence +6 dB broadband |
| Dense mix | healthy | peak −5.4 dBFS, 0 clipped / 0 non-finite across all clips |
| Stereo | healthy | hard pans ±18 dB L/R; sweeps move the right way; curtain gap dips |
| Title cue (lens7) | healthy | menu bed −32.6, confirm −21.8, sting −23.9, bar-line switch to s0 with no dropout (100 ms envelope checked 5–8.5 s) |
| Interrupt/visibility/unlock | healthy (state-level) | 13/13 chromium+webkit cases: tap/Escape/interrupt/hide-show/no-force/fault-inert/re-enable |
| Clipping anywhere | none | 0 clipped samples in 10 renders; limiter chain verified |

Watch items for human audition (no change made, deliberately):

- `mineArm` (2×1240 Hz pips, positional) vs `lowFuel` urgent (2×1046 Hz pips,
  center): spectrally adjacent; distinguished by pan + context. Needs ears.
- `lowFuel` in *max* combat is narrowband-clear (+17 dB in-band) but faint
  broadband; raising it would annoy calm flight where it is already clear.
  No churn without a heard complaint.

## 3. The one change: distinct MISSILE LOCK critical cue

Measured gap: every warning — routine (`BARRAGE`, `COOLANT DISCHARGE`) and
action-critical (`MISSILE LOCK - ROLL`) — plays the identical low-band klaxon.
Priority existed only visually + via cooldown bypass. The dodge cue deserves
its own voice.

Design (from the measurements, §2):

- `Audio.missileLock()`: 3 rising pips D6→E6→G6 (1174.66/1318.51/1567.98 Hz),
  105 ms apart, square 0.2 + 3 kHz click edge per pip (the `lockTick` recipe,
  proven to cut). Rising contour is unique among warnings; the 1–3 kHz cue
  band is where the dense bed is weakest and the music pocket opens.
- `Game.warn()`: one additive line — `if (critical) audio.missileLock();`
  after `audio.alarm()`. Alarm still fires on all paths, so the existing
  `warning-priority.test.js` contract (alarm counts) is preserved untouched.
- Own 0.5 s throttle (critical path bypasses the HUD cooldown); routes to
  `sfxBus` direct like all warnings (keeps level under combat duck); no extra
  pocket (the klaxon already opens it).

Candidate measurements (same harness, same seed):

- Isolated: rms −34.5 (same scale as lowFuel urgent −34.7, no loudness jump);
  pip peaks render at 1163→1314→1572 Hz (targets ±FFT bin); centroid rises
  1916→2078→2430 — contour verified in the actual render.
- Over dense: mid +5.6 dB, **presence +28 dB**, centroid 766 vs bed 154.
- No regression: all peaks identical to base (−5.32/−7.7/−5.41/−8.93/−5.4),
  0 clipped; SFX-only programs bit-identical; music programs differ ≤±1 LSB
  on 0.06% of samples — proven Chromium multithread-render churn by a
  base-vs-base control re-render, not the patch.
- Lifecycle fixture on candidate code: 13/13 still green.
- New focused test `tests/missile-lock-cue.test.js`: scheduling/throttle/
  inert part **fails on base, passes on candidate** (verbatim part executed
  in sandbox); dispatch part (studio-feel pattern) authored for the repo
  layout — **not executed here** (needs the full tree), primary runs it.

## 4. What primary must still do on Nitro (not claimed here)

- Apply `delivery.patch` (verified: `git apply --check` clean, reproduces
  candidate SHA256), run `npm test` (full gate), `audio-render.cjs`,
  `audio-lifecycle.cjs`.
- Physical audition: speakers/headphones (damage vs armor, warning priority,
  dense mix, stereo), title→flight on device, phone-call interruption,
  portrait/landscape.
- Seven-lens final gate (21× ≥9 on one frozen candidate): **not run, not
  claimed** — this tranche is lens-6 measured input only.

## 5. Files

- `delivery.patch` — base-relative, git-apply clean (Audio.js +33, Game.js +1,
  tests/missile-lock-cue.test.js new).
- `candidate/{src/audio/Audio.js,src/game/Game.js,tests/missile-lock-cue.test.js}`
  — exact replacement files.
- `clips/*-base.{wav,json}`, `clips-cand/*-cand.{wav,json}` — owned renders
  (audition/title/warnings/stereo/dense).
- `measurements/audit-{base,cand}.json` — full spectra/RMS/stereo/envelopes.
- `harness/{render.cjs,analyze.py}` (+ `render-cand.cjs`, `analyze-cand.py`
  generated variants) — reproducible harness; serves owned file copies only.
- `base/`, `sandbox/`, `sandbox-cand/`, `lifecycle/`, `lifecycle-cand/` —
  owned evidence inputs (individual file copies, never a checkout).

SHA256 (original → result):

- `src/audio/Audio.js`: `42a261cd…35979452` → `0189e501…869f244ea`
- `src/game/Game.js`: `3ac668b6…736f3b4d` → `204eac86…3c7f8`
- `tests/missile-lock-cue.test.js`: new, `2fb675f7…02494`
