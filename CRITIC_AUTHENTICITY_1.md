# Independent critic: Authenticity & Altitude Feel, baseline

- Scope: one category only; retain the existing sectors and user-approved three camera views.
- Evaluation date: 2026-09-10.
- Score: **7.0 / 10, implementation and simulation assessment. Gate: below 8.5.**
- Evidence: independent source inspection, the existing 16-test suite (16 passed), and four direct gameplay-method probes plus a one-second actual Drone update simulation. No implementation files were edited by this critic.
- Live evidence: the user reports that visibility is now good in all three views. This review accepts that as user evidence, not independent browser observation. Browser startup remained unavailable to the parent; no rendered playtest, subjective input-feel acceptance, or GPU evidence is claimed here. No other category is scored or advanced by this report.

## Blocking findings, in priority order

### 1. Normal gunfire solves altitude and lane alignment for the player

`src/entities/Player.js`, `_fire`, bends every locked shot 86% toward its target even when assist is disabled. `Game.findTarget` permits up to 3.5 units of vertical error in normal mode and a broad forward cone. A direct `_fire` probe with assist off, craft position (0,9,0), and target (6,6,60) produced direction (0.065454, -0.043140, 0.996923): the supposedly level pulse dives and turns toward the target. This makes matching the opponent's altitude optional over much of its hit volume and changes the defining shooting task.

Acceptance: normal primary shots remain level and forward; a targeting marker communicates actual firing alignment/occlusion. Any assistance is clearly optional and constrained. Verify misses above/below the target and hits after changing altitude. Remove the unsubstantiated separate-bomb-button claim in the targeting comment; parent is independently checking primary historical sources.

### 2. Dive fighters accelerate away instead of entering combat

`src/entities/Enemies.js`, `Flyer.update`, computes player-minus-enemy depth. When a dive fighter is ahead by more than 12 units, it sets its forward speed to 1.15 times the player's speed. It therefore increases separation indefinitely while remaining ahead. An actual `Drone.update` simulation starting 100 units ahead at player speed 48 increased the separation to 107.2 after one second; enemy speed was 55.2. Fighters spawned well ahead can remain outside a useful combat range rather than attacking.

Acceptance: an existing dive fighter visibly closes, makes a readable attack pass, and exits/despawns. Use explicit approach/attack/exit behavior or correct the directional/phase rule. Add a bounded simulation proving forward-spawned fighters enter and leave the engagement envelope; do not add sectors or more enemy types to mask this bug.

### 3. Cover rules differ between player fire, hostile fire, and gates

`Game._collidePlayerProjectiles` queries static solids and resolves nearest contact. `_collideEnemyProjectiles` checks the player only; it never queries level solids. Dynamic coolant gates are absent from both projectile paths. A direct enemy-fire probe supplied an intervening wall between hostile shot and player: damage was invoked once and the wall-query callback zero times.

Acceptance: both projectile sides respect the same current solid cover, including gate halves. The nearest wall/gate must win before a later actor contact, while shots through the genuine opening remain valid. Target brackets and hostile firing should not misleadingly acquire through solid cover where avoidable.

### 4. Invulnerability disables terrain response, and safe-gap cues disagree with geometry

`Game._crash` returns before `_pushOut` whenever `Player.damage` returns `none`; both barrel-roll and prior-hit invulnerability therefore let the ship continue through walls/gates. A direct probe confirmed no push-out occurs for an invulnerable ship. This is a spatial-rule defect even if damage immunity is intentional.

The static collision radius is 1.08 (player radius 1.5 times 0.72), while dynamic gate passage uses only a 0.4-unit center margin. The HUD reports raw opening bounds without ship clearance. Consequently a green/inside-range altitude cue can still accompany a collision, and different obstacles disagree about fit.

Acceptance: resolve physical overlap independently from whether damage is permitted; use one flight-body clearance model for wall, gate, and HUD safe-opening cues. Include edge/grazing cases. The existing bounded 1/60 simulation steps mitigate static tunneling, so this report does not claim a normal-rate thin-wall tunneling reproduction; continuous checks are nevertheless the stronger contract.

### 5. Fuel rewards and depletion can be gamed through unrelated protection

`Game._collideContact` calls `_killEnemy(e, ctx, false)` on a ram, but `_killEnemy` grants fuel before its reward guard. A direct no-reward kill probe still granted 0.16 fuel. Rolling into tanks can therefore produce refuel while `damage` is suppressed. Fuel exhaustion also goes through standard `Player.damage`: shields absorb it and roll/recent-hit invulnerability postpones it.

The silent hull damage does **not** itself grant fresh hull invulnerability; the stronger claim that fuel depletion is permanently blocked is unsupported and rejected by this audit.

Acceptance: shooting a fuel installation grants its fuel reward; ramming it obeys the chosen collision penalty and does not silently receive the shooting reward. Empty-fuel behavior is deterministic and independent of projectile shields/invulnerability, with a clear warning and bounded terminal consequence.

## Strengths to retain

- Fixed isometric classic projection, depth-independent scale, three user-approved views, and current altitude guide placement.
- Limited flight envelope, level gap patterns, procedural enemy roster, destruction-triggered fuel rewards, and radar disruption already provide a workable foundation.
- Nearest-hit swept player projectile collision is materially better than endpoint-only overlap and has passing regression coverage.
- Responsive vertical/lateral acceleration and separate floor shadow/drop-line cues support a modern interpretation without requiring new sectors.

## Scope-limited next gate

Fix the five defects above within the current campaign, add behavioral regressions that fail on this snapshot, and independently re-review this same category before proceeding to another. Keep source/simulation acceptance and live acceptance distinct. A truthful 8.5+ overall gate still requires the remaining four categories and sufficient observed evidence; this baseline is not a final five-category verdict.
