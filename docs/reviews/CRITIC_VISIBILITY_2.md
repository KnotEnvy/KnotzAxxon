# Focused critic review 2: playfield and enemy visibility

**Score: 8.3 / 10, provisional static assessment. Gate: pending; no live 8.5 acceptance.**

Scope remains playfield/enemy visibility and altitude legibility only. September 9, 2026. This review does not change any aggregate or other-category score. Browser initialization remained unavailable; no playtesting, screenshot inspection or GPU measurement is claimed.

## Verified corrections

- Classic visibility testing now uses parallel orthographic view rays and confirms that the old tall foreground wall fixture really occludes a target. This fixes the first review's validation defect.
- Decorative deck boxes capture surface tops only during `_deck`; capture resets before trench walls and skyline. `surfaceAt` filters overhead surfaces and queries the guide footprint. Platforms add their receiver surface explicitly.
- Player guide placement queries the surface through a callback at its updated position, rather than using a stale pre-movement height. The central conduit/plate burying defect is addressed in the fortress path. Pipe tops are below minimum flight altitude.
- Material depth testing remains enabled, so this correction does not turn altitude guides into an overlay visible through approaching physical barriers.
- Gate animation retains chunk ownership; passed obstacle visibility and animation cleanup still pass regression checks.
- Six focused visibility tests were independently run and passed on the finalized snapshot, including current-position guide placement and generated arena receiver capture. The parent reports a passing full suite and production build; those are not substitutes for rendered acceptance.

## Remaining findings and trade-offs

- The arena receiver omission found during this iteration is resolved: `_arena` captures the slab and stripe, then resets capture before buttresses. Independent source inspection and the generated-arena regression confirm the stripe contributes y=0.16 and buttresses are excluded. No unresolved implementation defect was confirmed in this final focused inspection.
- The guide uses one highest receiver plane over a small footprint, not a projected decal conforming to geometry. Its height may step at plate edges, and the wider soft blob can clip neighboring raised decoration. This is a bounded practical treatment; live movement must establish whether these artifacts are noticeable.
- The primary unresolved acceptance evidence is rendered combat: enemy silhouette/contrast at actual size, low-altitude and lane-edge visibility, boost reveal time, barrier disappearance and HUD overlap. Orthographic containment is evidence of framing, not proof of legible enemies.
- Modern/chase require their own observed coverage because forward corridor anchoring applies to classic only. Mobile autodetection selects chase, so a portrait classic projection test does not validate the actual mobile default.

## Gate recommendation

Retain the corrected receiver handling and regression suite. Keep this area active until an independent live run checks classic fortress combat and arena passage at landscape and narrow viewports, low/high altitude, boost, and a low quality preset. Record viewport, browser and quality. Do not round the provisional score up or advance the overall five-category gate from static tests.

No implementation was changed by this critic.
