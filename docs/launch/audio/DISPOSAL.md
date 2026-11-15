# Audio retirement despite an independent failure

Spark1.3 completed this CPU-only implementation on approved SuperBeast. Primary integrated the literal source/test delivery onNitro and verified exact resulting hashes:

- `src/audio/Audio.js`: `0189e50169302e86e0af7ace8041132ab98372fdcd48fab0cf4803d869f244ea` → `765063c5c7fe236b19f7ab1bd7f0b431f21bf72e114a20e119b952a3e23d4f12`.
- `tests/audio-dispose.test.js`: `d10af1162e1ae83dc2d8fa3c286bd87688325abbef6a08c6775611aa972305b5`.

`Audio.dispose()` uses the existing runCleanups contract to attempt music/engine stop, listener lifetime, scheduler, graph, owned context close and field reset independently. Offline/borrowed contexts are not closed. Cold/repeated normal disposal and fresh initialization still work. A persistent injected stop-engine failure may re-report on retry, but the context is not closed twice. No music, mix, cue, synthesis, gesture or autoplay policy changed.

Primary independently reproduced **3/7 pass,4/7 fail** against the original source with force-exit because faults strand a scheduler interval. The exact delivered fixed files pass **7/7** without force-exit. Tests use the real Audio/Lifetime implementation with a fake context and injected retirement failures; these are not real-driver failures.

The remote worker’s original patch hash was `84fe9c918173e239671b02f4af6991392ae2766665315b76b857d2e8191e1dc3` (8,791 bytes). The Nitro reconstructed diff has different patch headers/format, SHA256 `04c3ffe0c0de7bd67329e68b0b837e4ce457934932315fd351ff484924db8655` (8,634 bytes); resulting source and test bytes match the worker’s exact hashes above. The local diff and primary before/after logs are retained in `artifacts/launch/audio-disposal/`. Actual Chromium lifecycle and audio rendering are separate combined-source validation. Nothing was heard in these sessions; physical audition remains unverified.
