# Ambient tranche 1 — distant operational traffic (Fable High, Nitro, 2026-11-15)

Implementation receipt for the primary. Not committed; nothing judged or self-reviewed.

## What ships

One additive background detail: **service craft on fixed lanes outside the fortress**, in the
five fortress sectors only. Each craft is a running light, a marker lamp and a short wake.

| # | Sector | Character | Craft shown / 64 | Clock | Marker |
| --- | --- | --- | ---: | ---: | --- |
| 1 | Outer Fortress | pattern traffic: sparse, steady | 35 | 0.80 | teal, near-steady |
| 2 | Gun Batteries | ammunition haulers: slow, long wake | 51 | 0.70 | amber |
| 4 | Reactor Spine | coolant tenders | 45 | 0.75 | orange |
| 6 | Inner Citadel | full command lanes | 64 | 1.00 | gold |
| 7 | The Gauntlet | lockdown patrols: few, fast | 22 | 1.45 | red strobe, cold lamp |
| 3, 5, 8 | Void Gap, Interceptor Screen, Iron Sentinel | none, by design | 0 | – | – |

Three lane families, placed by where they land on screen:

* **near** (20 craft): x −49…−54, y 11.5…13.5, just outside the near parapet and above the
  near roofs. Classic: lower-right background wedge. Chase/Modern: low on the open side.
* **deep** (24): x 130…166, y −59…−88, beyond and below the far towers. Classic: upper-left
  wedge above the far-wall crest. Hidden behind the far wall in the perspective rigs.
* **sky** (20): above the far towers (y 96…118) and low over the near side (y 34…44).
  Perspective rigs only; off the Classic landscape frame.

## Why this one, and what was left alone

Existing frames showed the fortress sectors' background (the two corner wedges in Classic, the
sky and roofline in Chase/Modern) had static light but no life beyond roof strobes and radar.
Categories inspected and deliberately **not** changed:

* Space sectors and the boss arena: small moving lights there are threats; the arena's open
  chamber is an accepted decision. Traffic is off, pixel-identical (see evidence).
* Sky cubemap, planet, sun, underlay city and dust presets: already sector-specific; the
  underlay's own avenue traffic is too sparse in the Classic wedge to justify a shader change.
* Chunk geometry, hazard bands, guide lamps, emitters, landmarks, accepted models: untouched.

## Files (primary integrates; nothing else was edited)

| File | Change | SHA-256 before | SHA-256 after |
| --- | --- | --- | --- |
| `src/world/AmbientTraffic.js` | new, 368 lines | – | `720550fd6eb8c6c7c29a60af96d5bf304a12ac6ac563c6667fa633d3c138788c` |
| `src/world/Fortress.js` | +6 lines, 5 hunks | `a3dc93d67d5e4d2169f0cbbe08f4faee2629460279498947ba3dbb023360bdb0` | `794ade4427894c413ef2960401900ceea4b592b238feb3df535c48437ac647c5` |
| `tests/ambient-traffic.test.js` | new, 9 tests | – | `dc3cabfc72f22dc754525dfc139799ddebff13efab5635e4687ec2f8eacb6258` |

`Fortress.js` hunks: import; `disposeFortressTemplates()` also calls `disposeAmbientTraffic()`;
constructor creates `this.traffic`; `update()` ends with `this.traffic.update(level, playerZ, dt)`;
`clear()` ends with `this.traffic.detach()`. No `Game.js`, render, UI or audio edit was needed:
the existing shutdown hook in `main.js` already calls `disposeFortressTemplates()`.

Owned sources/evidence: `assets-source/launch-environment/` (tools, specs, curated evidence,
`retainedSHA256SUMS`), `artifacts/launch/fable/` (raw runs, `manifest.sha256`), this file.

## Contracts (each is a test)

| Contract | How it is held |
| --- | --- |
| Bounded cost | One indexed draw, 64 quads = 128 triangles, 256 vertices, 12,032 B of static buffers; 4 uniform writes per frame; no vertex buffer is ever re-uploaded. |
| Seeded streams never move | Layout comes from a private fixed-seed generator; chunk digests, emitters, `animated` and `rearObstacles` are identical with traffic running. The 16 pre-existing environment-kit contracts still pass. |
| Nothing over the corridor | Classic looks along (+x, −y, +z); a point is on a sight line through the corridor only when −17 ≤ x+y ≤ 43. Every lane is ≥ 18 outside that band, checked against the shipped rig constants by ray test. |
| Clear of structure | Near lanes ≥ 10 above deck level (roofs top out near 8.1); deep lanes beyond x 126, where nothing is built; every lane outside deck and trench walls. |
| Clear of the HUD | Near and deep lanes sit in the Classic bands the landscape HUD leaves open; every craft fades out between 66 % and 80 % of the half-width, so none sits behind the score, altimeter or tactical blocks. |
| Calm opening, no bloom | Brightest value any look can write is < 1.02 (the bloom gate); Outer Fortress ≤ 0.65 with the lowest density and no real strobe. |
| Only fortress sectors | Craft exist only inside the current fortress sector, 30 units short of each end; sector swaps happen below 2 % opacity. |
| One owner | The mesh is a scene child, never a chunk; `clear()` detaches it; the shared geometry and program are disposed exactly once with the fortress templates, idempotently, and rebuild if streaming resumes. |
| Bounded clock | Whole-number speeds let the clock wrap at 480 s with no jump, however long the session. |

`npm test`: **259 / 259 pass** (250 before this tranche in the current tree + 9 new).

## Hardware evidence

`artifacts/launch/fable/traffic-final/` — 37 frame pairs, `report.json`, `diff.json`, `source.json`.

* Renderer: `ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Ti (0x00001F95) Direct3D11 vs_5_0 ps_5_0, D3D11)`.
* Browser: installed Windows Chrome 157.0.8103.52, headless, Playwright local pipes (no debug port);
  Windows Node `C:\nvm4w\nodejs\node.exe`; device NitroBliss.
* Settings: quality High, shake 0, DPR 1; 1280×720 and 540×960; canvas equals viewport.
* Source: HEAD `e748dc5` plus the working tree listed in `source.json`; seed 20261115.
* Each pair is **one frozen simulation state rendered twice**: with the traffic draw, and with only
  that draw hidden. The harness steps the simulation at a fixed 60 Hz (300–390 frames per shot),
  holds the ship on a line and disables damage. This is picture evidence, not gameplay evidence.
* GPU lease: taken and released by the harness for each run; five bounded runs, all released.

| Measure | Result |
| --- | --- |
| Draw calls while the layer is visible | +1 in all 33 such pairs (e.g. 145→146, 203→204) |
| Triangles | +128 in every such pair |
| Void Gap, boss arena, past the sector edge | +0 draws, +0 triangles, 0 changed pixels (4 pairs) |
| Changed pixels per frame | 0.00–0.46 % (median ≈ 0.07 %) |
| Lights inside the HUD side bands | none above the diff threshold |
| `gl.finish()` frame cost, 11 timed shots × 24 alternating samples | traffic on − off: −0.30…+0.10 ms, mean −0.03 ms: **below this method's noise** |
| CPU `update()` | 0.13 µs per call in Node |

Curated frames (`assets-source/launch-environment/evidence/frames/`):

1. `guns-classic-wide-f345--before|after.png` + `--detail-before-after-3x.png` — Classic, both wedges.
2. `citadel-classic-wide-f390--before|after|page.png` — densest look; `page` includes the live HUD.
3. `outer-chase-wide-f345--before|after.png` + detail — the calm opening sector in Chase.
4. `gauntlet-chase-wide-f345--before|after.png` + detail — lockdown patrols.
5. `reactor-classic-tall-f345--page.png` — portrait with HUD.

## Limits

* No frame-rate claim. The timing above is a synchronised single-frame cost in a headless harness;
  it shows no measurable difference, not a sustained hardware FPS.
* Not captured: Low/Medium/Ultra presets, DPR > 1, ultrawide, loops > 0, physical phones. The
  shader has no quality-dependent path; only High at two viewports was rendered.
* The HUD-clear bands were derived from the HUD as rendered at 1280×720 and 540×960 on HEAD
  `e748dc5`. A later HUD layout change that widens the side blocks past 66 % of the half-width
  would need `EDGE_START`/`EDGE_END` retuned (two constants).
* Motion was reviewed as stills 45 frames apart, not as video. No human play session.
* In Classic landscape the opening seconds can show no craft at all (one of three Outer Fortress
  shots has none): lanes are sparse there on purpose.
* Earlier runs (`pilot-1`, `traffic-2…4`) are development iterations kept for the record; only
  `traffic-final` matches the hashes above.
