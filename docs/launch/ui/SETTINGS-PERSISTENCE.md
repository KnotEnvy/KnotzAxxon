# Actual settings persistence status

Integrated on 2026-11-15 after the real SettingsStore API from remote commit `efabcec623d125deb82b0ba1c910e62a43338d70` (Nitro `059a395`). Opus’s patch SHA256 is `9934b05067233cee8382f533d2f2ea9b4ac1385fe5fa22c417b15920b55de176`; it applies cleanly after the UI ownership patch, preserving that work.

The SettingsStore reports `persistent=null` until it attempts a real settings payload write, then true/false, and returns the same boolean from save. Screens saves once on opening Systems, then reads this status; it no longer tests a separate probe key. Unknown status makes no persistence claim. Session changes survive a rejected save, and subsequent successful writes recover the saved status. The exported storageWritable wrapper now writes actual settings for compatibility.

Primary independently ran actual-source persistence, settings quality, UI feedback and UI ownership suites against the integrated implementations: **25/25 pass**. This includes the case where a tiny probe fits but settings do not, the reverse quota case, storage rejection/recovery and exactly one real save on open. CPU only; hardware UI checks remain part of the combined candidate pass.

Original patch, handoff and primary log are retained under `artifacts/launch/integration/settings-persistence/`.
