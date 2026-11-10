// The trailer's gameplay shots. Bar = 100 frames (144 bpm at 60 fps).
//
// Each spec is a deterministic scene for harness.js:
//   seed, camera ('classic' | 'modern' | 'chase'), crt, sector + into (metres),
//   card (sector card at frame 0), pilot (pilot.js options), prerollSeconds,
//   after (code run after the preroll) + prerollAfter, script [{f, to?, do, ...}].
// `speed` keys are [frame, speed] pairs (eased between keys): real slow motion.
// `alts` re-render every frame through other rigs from the same simulation.
// `keep4k` keeps the 2x frames too, for close-up crops in the edit.
export const SEED = 19403;

const card = (id, sector, camera, crt = false, seed = SEED, into = 12) =>
  ({ id, frames: 90, spec: { seed, camera, crt, sector, into, card: true, pilot: { thread: 0.3 } } });

// Boss set-ups (sector 8). The robot engages ~200 m in and lands 2.4 s later.
const BOSS = { seed: SEED, sector: 7, into: 150, prerollSeconds: 4 };
const PHASE1 = 'T.killPods()';
const PHASE2 = 'T.killPods(); T.step(1, false); T.boss.hp = T.boss.hpMax * 0.3';

export const SHOTS = [
  /* ---- bars 0-4: cold open, CLASSIC 45 + CRT, then the fly-in to CHASE ---- */
  {
    id: 'c01-open', frames: 440,
    speed: [[0, 1], [228, 1], [285, 0.32], [330, 0.32], [400, 1]],
    spec: {
      seed: SEED, camera: 'classic', crt: true, sector: 0, into: 228, shake: 0.5,
      pilot: { thread: 0.2 },
      script: [
        { f: 110, do: 'pilot', opts: { boost: true } },
        { f: 196, do: 'crt', on: false },
        { f: 200, do: 'morph', from: 'classic', to: 'chase', frames: 95 },
        { f: 205, do: 'hud', on: false, fade: 0.5 },
        { f: 250, do: 'pilot', opts: { boost: false } },
      ],
    },
  },

  /* ---- bars 4-8: one simulation, three rigs (CLASSIC 45 + CRT | MODERN 20 | CHASE) ---- */
  { id: 'c02-rigs', frames: 440, alts: ['modern', 'chase'], spec: { seed: SEED, camera: 'classic', crt: true, sector: 1, into: 880, pilot: { thread: 0.5 } } },

  /* ---- bars 8-12: combat, one bar each ---- */
  { id: 'c03-fuel', frames: 170, spec: { seed: SEED, camera: 'chase', sector: 3, into: 430, pilot: { prefer: 'fuel' } } },
  { id: 'c04-radar', frames: 170, spec: { seed: SEED, camera: 'modern', sector: 1, into: 470, pilot: { prefer: 'radar' } } },
  { id: 'c05-flak', frames: 170, spec: { seed: SEED, camera: 'modern', sector: 1, into: 95 } },
  { id: 'c06-airfield', frames: 170, spec: { seed: 364, camera: 'classic', sector: 1, into: 60, pilot: { prefer: 'parked' } } },

  /* ---- bars 12-16: the sector tour, half a bar each, with the game's sector cards ---- */
  card('t1-card', 0, 'classic', true, SEED, 40),
  card('t2-card', 1, 'chase', false, 364),
  card('t3-card', 2, 'modern'),
  card('t4-card', 3, 'chase'),
  card('t5-card', 4, 'chase'),
  card('t6-card', 5, 'modern'),
  card('t7-card', 6, 'chase'),
  card('t8-card', 7, 'modern', false, SEED, 60),

  /* ---- bars 16-24: the break, in slow motion ---- */
  // MATCH ALTITUDE: climb level with the fighters and take them.
  { id: 'c10-match', frames: 240, speed: 0.5, spec: { seed: SEED, camera: 'modern', sector: 2, into: 40, pilot: { rate: 0.12 } } },
  // READ YOUR SHADOW: thread the window, low, and shoot the radar through it.
  { id: 'c11-shadow', frames: 240, speed: 0.4, keep4k: true, spec: { seed: 994, camera: 'classic', sector: 1, into: 440, pilot: { thread: 0.75, prefer: 'radar' } } },
  // Under the wire.
  { id: 'c12-wire', frames: 240, speed: 0.4, spec: { seed: 3805, camera: 'chase', sector: 1, into: 105, pilot: { thread: 0.8 } } },
  // TIME THE GATES: the reactor's coolant gate, then back up to speed.
  { id: 'c13-gates', frames: 240, speed: [[0, 0.45], [150, 0.45], [230, 1]], spec: { seed: 364, camera: 'chase', sector: 3, into: 270, pilot: { thread: 0.4 } } },

  /* ---- bars 24-32: escalation, one bar each ---- */
  { id: 'c14-debris', frames: 140, spec: { seed: SEED, camera: 'chase', sector: 2, into: 610 } },
  { id: 'c15-towers', frames: 140, spec: { seed: SEED, camera: 'modern', sector: 2, into: 260 } },
  { id: 'c16-carrier', frames: 140, spec: { seed: SEED, camera: 'modern', sector: 4, into: 700 } },
  { id: 'c17-wing', frames: 140, spec: { seed: SEED, camera: 'chase', sector: 2, into: 470 } },
  { id: 'c18-citadel', frames: 140, spec: { seed: SEED, camera: 'modern', sector: 5, into: 250, pilot: { prefer: 'radar' } } },
  { id: 'c19-gatesync', frames: 140, spec: { seed: 994, camera: 'classic', sector: 5, into: 270 } },
  { id: 'c20-gauntlet', frames: 140, spec: { seed: SEED, camera: 'chase', sector: 6, into: 230 } },
  { id: 'c21-gauntlet2', frames: 140, spec: { seed: SEED, camera: 'modern', sector: 6, into: 780 } },

  /* ---- bars 32-44: the Iron Sentinel ---- */
  { id: 'c22-boss-in', frames: 260, keep4k: true, spec: { ...BOSS, camera: 'modern', prerollSeconds: 0.4 } },
  { id: 'c23-pods', frames: 260, keep4k: true, spec: { ...BOSS, camera: 'chase', script: [{ f: 20, do: 'eval', code: 'T.boss.pods.forEach(p => p.hp = Math.min(p.hp, 2))' }] } },
  { id: 'c24-core', frames: 120, keep4k: true, spec: { ...BOSS, camera: 'classic', after: PHASE1, prerollAfter: 2.5, bossMinHp: 46 } },
  { id: 'c25-curtain', frames: 120, keep4k: true, spec: { ...BOSS, camera: 'chase', after: PHASE2, prerollAfter: 3, bossMinHp: 12 } },
  { id: 'c26-escort', frames: 120, keep4k: true, spec: { ...BOSS, camera: 'modern', after: PHASE2, prerollAfter: 6.8, bossMinHp: 12 } },
  {
    id: 'c27-missile', frames: 260, keep4k: true,
    spec: { ...BOSS, camera: 'chase', after: PHASE1, prerollAfter: 1.5, bossMinHp: 46, pilot: { fire: false },
      script: [{ f: 5, do: 'eval', code: 'T.boss.launcher.cooldown = 0' }, { f: 166, do: 'roll', dir: 1 }] },
  },
  {
    // The duel: the launcher charges, RACK 1/6 .. 5/6 on the HUD, the missile
    // blows in the rack on bar 42 (frame 200) and the robot dies; the final
    // blast lands on bar 44 (frame 400).
    id: 'c28-duel', frames: 470, keep4k: true, alts: ['classic'],
    spec: {
      ...BOSS, camera: 'chase', after: PHASE2, prerollAfter: 3, bossMinHp: 12,
      script: [
        { f: 8, do: 'eval', code: 'T.boss.launcher.cooldown = 0; T.boss.stagger = 0' },
        { f: 9, to: 199, do: 'eval', code: 'const L = T.boss.launcher; if (L.charging) { L.hits = Math.min(L.hits, 4); L.timer = Math.max(L.timer, 0.5); }' },
        { f: 200, do: 'eval', code: 'const b = T.boss; if (b.launcher.charging) { b.hp = Math.min(b.hp, 8); b._detonateLauncher(T.ctx()); }' },
        { f: 201, do: 'eval', code: 'if (T.boss && !T.boss.alive) T.boss.deathTimer = 1.0' },
      ],
    },
  },

  /* ---- end card background: the classic, under the CRT ---- */
  { id: 'c30-end', frames: 640, spec: { seed: SEED, camera: 'classic', crt: true, sector: 1, into: 150, hud: false } },
];
