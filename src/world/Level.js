/**
 * Level planning.
 *
 * This module produces *data only* — a deterministic list of sectors and the
 * features inside them. Geometry streaming lives in Fortress.js and entity
 * spawning lives in Game.js, both of which read this plan.
 *
 * Keeping the plan pure means the whole run is reproducible from a seed, and
 * the difficulty curve can be inspected and tuned without touching rendering.
 */

import { Rng, clamp, lerp } from '../core/Utils.js';

/* --- world constants ------------------------------------------------ */

/** Player may fly between -CORRIDOR_HALF and +CORRIDOR_HALF on X. */
export const CORRIDOR_HALF = 16;
/** The deck extends past the playfield so the walls feel like real geometry. */
export const DECK_HALF = 27;
/** Flight ceiling and floor. */
export const ALT_MIN = 1.3;
export const ALT_MAX = 25;
export const FLIGHT_SPEED = 40;
/**
 * Static geometry is built in slices this long. Longer slices mean fewer
 * merged meshes on screen — the streamer is draw-call bound, not fill bound.
 */
export const CHUNK_LEN = 96;
/** Collider broad-phase bucket size along Z. */
const BUCKET = 32;

export const SECTOR_KINDS = { FORTRESS: 'fortress', SPACE: 'space', BOSS: 'boss' };

/**
 * The campaign. After the last sector the plan loops with escalating
 * difficulty, which is what turns this into an endless score attack.
 */
const CAMPAIGN = [
  {
    name: 'OUTER FORTRESS', sub: 'PERIMETER DEFENCE GRID', kind: SECTOR_KINDS.FORTRESS,
    sky: 'dusk', length: 1500, threat: 0.22,
    rhythm: 'LEARN THE RUN', weights: [1.2, 0, 1, .9, .4, 0, .2, 1.1, .3],
    brief: 'Punch through the outer wall. Watch your altitude.',
  },
  {
    name: 'GUN BATTERIES', sub: 'HEAVY EMPLACEMENTS', kind: SECTOR_KINDS.FORTRESS,
    sky: 'dusk', length: 1700, threat: 0.45,
    rhythm: 'GROUND ASSAULT', weights: [1, 0, 2, .85, .9, .15, .25, .6, .7],
    brief: 'Flak corridor. Keep moving.',
  },
  {
    name: 'THE VOID GAP', sub: 'OPEN SPACE TRANSIT', kind: SECTOR_KINDS.SPACE,
    sky: 'deepspace', length: 1350, threat: 0.50,
    rhythm: 'FIGHTER WAVES', spaceWeights: [1.8, .25, .15, .65],
    brief: 'No deck, no cover. Interceptors inbound.',
  },
  {
    name: 'REACTOR SPINE', sub: 'THERMAL EXHAUST TRENCH', kind: SECTOR_KINDS.FORTRESS,
    sky: 'ember', length: 1800, threat: 0.62,
    rhythm: 'TIME THE GATES', weights: [.9, 1.4, .8, .85, .3, .2, .8, .2, .8],
    brief: 'Coolant gates cycle open. Time them.',
  },
  {
    name: 'INTERCEPTOR SCREEN', sub: 'FIGHTER WING ENGAGEMENT', kind: SECTOR_KINDS.SPACE,
    sky: 'deepspace', length: 1450, threat: 0.72,
    rhythm: 'FORMATION ATTACK', spaceWeights: [2.2, .35, .35, .4],
    brief: 'Their whole wing is up. Chain your kills.',
  },
  {
    name: 'INNER CITADEL', sub: 'COMMAND SUPERSTRUCTURE', kind: SECTOR_KINDS.FORTRESS,
    sky: 'ember', length: 1900, threat: 0.85,
    rhythm: 'PRECISION RUN', weights: [1.4, .7, 1.2, .85, .8, .35, .8, .3, 1],
    brief: 'Dense architecture. Threading required.',
  },
  {
    name: 'THE GAUNTLET', sub: 'FINAL APPROACH', kind: SECTOR_KINDS.FORTRESS,
    sky: 'void', length: 1600, threat: 1.0,
    rhythm: 'FINAL ASSAULT', weights: [1.2, 1.2, 1.35, 1, .7, .7, .6, .2, 1.1],
    brief: 'Everything they have left is pointed at you.',
  },
  {
    name: 'THE IRON SENTINEL', sub: 'FORTRESS CORE', kind: SECTOR_KINDS.BOSS,
    sky: 'void', length: 900, threat: 1.0,
    rhythm: 'DESTROY THE CORE',
    brief: 'Kill the core.',
  },
];

/** Gap-in-wall archetypes. Each forces a different reading of the altimeter. */
const WALL_TYPES = ['slot', 'window', 'notch', 'pillars', 'stagger'];

export class Level {
  /**
   * @param {number} seed
   * @param {number} loop how many times the campaign has been completed
   */
  constructor(seed = 1, loop = 0) {
    this.seed = seed;
    this.loop = loop;
    this.rng = new Rng(seed);
    this.sectors = [];
    this.features = [];
    this.colliders = [];
    this.totalLength = 0;
    this._generate();
  }

  /** Global difficulty scalar. Grows with sector and with each campaign loop. */
  difficultyAt(z) {
    const s = this.sectorAt(z);
    const base = s ? s.threat : 0.5;
    return base * (1 + this.loop * 0.35);
  }

  /** A gentler launch, then the existing gradual sector/loop escalation. */
  paceAt(z) {
    const sector = this.sectorAt(z);
    const index = sector?.index ?? 0;
    const t = clamp((z - (sector?.zStart ?? 0)) / 600, 0, 1);
    const launch = index === 0 ? .9 + .1 * t * t * (3 - 2 * t) : 1;
    return (1 + index * .035 + this.loop * .16) * launch;
  }

  sectorAt(z) {
    for (let i = 0; i < this.sectors.length; i++) {
      const s = this.sectors[i];
      if (z >= s.zStart && z < s.zEnd) return s;
    }
    return this.sectors[this.sectors.length - 1];
  }

  /* ------------------------------------------------------------------ */
  /* Generation                                                          */
  /* ------------------------------------------------------------------ */

  _generate() {
    let z = 0;
    CAMPAIGN.forEach((tpl, i) => {
      const sector = {
        index: i,
        ...tpl,
        threat: clamp(tpl.threat * (1 + this.loop * 0.3), 0, 2.2),
        zStart: z,
        zEnd: z + tpl.length,
        featureStart: this.features.length,
      };
      // Sector-local RNG so editing one sector never reshuffles the others.
      const rng = new Rng((this.seed * 7919 + i * 104729 + this.loop * 31337) >>> 0);
      if (tpl.kind === SECTOR_KINDS.FORTRESS) this._genFortress(sector, rng);
      else if (tpl.kind === SECTOR_KINDS.SPACE) this._genSpace(sector, rng);
      else this._genBoss(sector, rng);

      sector.featureEnd = this.features.length;
      this.sectors.push(sector);
      z = sector.zEnd;
    });

    this.totalLength = z;
    this.features.sort((a, b) => a.z - b.z);
    this.features.forEach((f, i) => { f.id = i; });
    this.colliders.sort((a, b) => a.minZ - b.minZ);
    this._buildColliderIndex();
  }

  _push(feature) {
    this.features.push(feature);
    return feature;
  }

  /** Register a solid box. `lethal` boxes kill on contact rather than block. */
  _collider(x, y, z, w, h, d, lethal = true, tag = 'wall') {
    this.colliders.push({
      minX: x - w / 2, maxX: x + w / 2,
      minY: y, maxY: y + h,
      minZ: z - d / 2, maxZ: z + d / 2,
      lethal, tag,
    });
  }

  /* --- fortress ------------------------------------------------------ */

  /** Authored opening beats: fuel lane, lone gun, forgiving clearance, radar, then fighters. */
  _openingRun(sector, rng) {
    const start = sector.zStart;
    for (const [kind,x,y,z] of [
      ['fuel',-7,0,180], ['fuel',-7,0,214], ['turret',7,0,310],
      ['radar',0,0,610], ['drone',-6,11,780], ['drone',6,11,810],
    ]) this._push({kind,x,y,z:start+z,seed:rng.int(0,1e6),pattern:'weave'});
    const z=start+460, thickness=5, y=5, h=13, width=DECK_HALF*2;
    this._push({kind:'wall',type:'slot',z,thickness,gaps:[{x:0,w:width,y,h}]});
    this._collider(0,0,z,width,y,thickness,true,'wall');
    this._collider(0,y+h,z,width,ALT_MAX+10-y-h,thickness,true,'wall');
  }

  _genFortress(sector, rng) {
    const { zStart, zEnd, threat } = sector;
    // A short calm lead-in so the sector card is readable before anything shoots.
    let z = zStart + (sector.index === 0 ? 980 : 160);

    // Ambient architecture markers — the streamer turns these into geometry.
    for (let mz = zStart; mz < zEnd; mz += CHUNK_LEN) {
      this._push({ kind: 'deck', z: mz, seed: rng.int(0, 1e6) });
    }

    if (sector.index === 0) this._openingRun(sector, rng);
    // Arriving from open space you clear the fortress's outer wall: the
    // Zaxxon entry beat, with a generous slot and a fuel reward behind it.
    const previous = CAMPAIGN[sector.index - 1];
    if (previous?.kind === SECTOR_KINDS.SPACE) {
      const wz = zStart + 70, y = 6, h = 12, W = DECK_HALF * 2, top = ALT_MAX + 10;
      this._push({ kind: 'wall', type: 'slot', z: wz, thickness: 6, perimeter: true, gaps: [{ x: 0, w: W, y, h }] });
      this._collider(0, 0, wz, W, y, 6, true, 'wall');
      this._collider(0, y + h, wz, W, top - y - h, 6, true, 'wall');
      for (const x of [-6, 6]) this._push({ kind: 'fuel', x, y: 0, z: zStart + 125, seed: rng.int(0, 1e6) });
    }

    // A final fuel lane gives a deliberate reward before the next sector.
    for (let i=0;i<2;i++) this._push({kind:'fuel',x:0,y:0,z:zEnd-110+i*24,seed:rng.int(0,1e6)});

    while (z < zEnd - 260) {
      const kinds = ['wall','gate','emplacement','supply','tower','flight','arch','airfield','phrase'];
      const roll = rng.weighted(kinds.map((kind,i)=>[kind,sector.weights[i] ?? 0]));

      switch (roll) {
        case 'wall': {
          this._wall(z, rng, threat);
          z += rng.range(140, 220);
          break;
        }
        case 'gate': {
          const gapH = lerp(11, 6.5, clamp(threat, 0, 1));
          const gapY = rng.range(ALT_MIN + 1, ALT_MAX - gapH - 1);
          this._push({
            kind: 'gate', z, gapY, gapH,
            cycle: rng.bool(0.55) ? rng.range(2.6, 4.4) : 0,
            phase: rng.next() * 6.28,
          });
          // The gate's solid halves are lethal energy, handled dynamically.
          z += rng.range(150, 230);
          break;
        }
        case 'emplacement': {
          const n = 1 + Math.round(rng.range(0, 1 + threat * 2.4));
          for (let i = 0; i < n; i++) {
            const heavy = sector.index > 0 && rng.bool(threat * 0.45);
            this._push({
              kind: heavy ? 'heavyTurret' : 'turret',
              z: z + i * rng.range(26, 46),
              x: rng.range(-CORRIDOR_HALF + 2, CORRIDOR_HALF - 2),
              y: 0,
              onWall: false,
              seed: rng.int(0, 1e6),
            });
          }
          if (sector.index > 0 && rng.bool(0.35 + threat * 0.3)) {
            this._push({
              kind: 'silo',
              z: z + rng.range(20, 70),
              x: rng.range(-CORRIDOR_HALF + 3, CORRIDOR_HALF - 3),
              y: 0,
              seed: rng.int(0, 1e6),
            });
          }
          z += rng.range(120, 200);
          break;
        }
        case 'supply': {
          const n = rng.int(2, 4);
          const baseX = rng.range(-CORRIDOR_HALF + 4, CORRIDOR_HALF - 4);
          for (let i = 0; i < n; i++) {
            this._push({
              kind: 'fuel',
              z: z + i * 22,
              x: baseX + rng.range(-3, 3),
              y: 0,
              seed: rng.int(0, 1e6),
            });
          }
          z += rng.range(110, 170);
          break;
        }
        case 'tower': {
          this._push({
            kind: 'radar',
            z,
            x: rng.range(-CORRIDOR_HALF + 5, CORRIDOR_HALF - 5),
            y: 0,
            seed: rng.int(0, 1e6),
          });
          // Radar towers are worth defending.
          this._push({
            kind: 'turret', z: z + rng.range(-24, 24),
            x: rng.range(-CORRIDOR_HALF + 3, CORRIDOR_HALF - 3), y: 0,
            seed: rng.int(0, 1e6),
          });
          z += rng.range(130, 190);
          break;
        }
        case 'flight': {
          const count = 2 + Math.round(threat * 3);
          const formation = rng.pick(['vee', 'line', 'column']);
          for (let i = 0; i < count; i++) {
            let dx = 0, dz = 0, dy = 0;
            if (formation === 'vee') {
              const side = i % 2 === 0 ? 1 : -1;
              const rank = Math.floor(i / 2);
              dx = side * rank * 4.5;
              dz = rank * 9;
            } else if (formation === 'line') {
              dx = (i - (count - 1) / 2) * 6.5;
            } else {
              dz = i * 14;
              dy = Math.sin(i) * 2;
            }
            this._push({
              kind: 'drone',
              z: z + dz,
              x: clamp(rng.range(-8, 8) + dx, -CORRIDOR_HALF + 1, CORRIDOR_HALF - 1),
              y: clamp(rng.range(5, 16) + dy, ALT_MIN + 2, ALT_MAX - 2),
              pattern: rng.pick(['weave', 'dive', 'strafe']),
              seed: rng.int(0, 1e6),
            });
          }
          z += rng.range(140, 210);
          break;
        }
        case 'arch': {
          const clearance = rng.range(9, 15);
          this._push({ kind: 'arch', z, clearance, seed: rng.int(0, 1e6) });
          this._collider(0, clearance, z, DECK_HALF * 2, ALT_MAX + 12 - clearance, 7, true, 'arch');
          z += rng.range(120, 180);
          break;
        }
        case 'airfield': {
          // Parked fighters in a hardstand row: a strafing run for low flyers.
          const n = rng.int(3, 5);
          const lane = rng.range(-CORRIDOR_HALF + 4, CORRIDOR_HALF - 4);
          const diagonal = rng.bool(0.5) ? rng.range(-2.2, 2.2) : 0;
          for (let i = 0; i < n; i++) {
            this._push({
              kind: 'parked', z: z + i * 11,
              x: clamp(lane + (i - (n - 1) / 2) * diagonal, -CORRIDOR_HALF + 2, CORRIDOR_HALF - 2),
              y: 0, seed: rng.int(0, 1e6),
            });
          }
          if (sector.index > 0 && rng.bool(0.5)) {
            this._push({ kind: 'turret', z: z + n * 11 + 16, x: clamp(-lane * 0.6, -CORRIDOR_HALF + 3, CORRIDOR_HALF - 3), y: 0, seed: rng.int(0, 1e6) });
          }
          z += rng.range(130, 190);
          break;
        }
        case 'phrase': {
          z = this._phrase(sector, rng, z, threat);
          break;
        }
      }

      // Free-floating mines fill dead air at higher threat.
      if (sector.index > 0 && rng.bool(threat * 0.5)) {
        const n = rng.int(2, 5);
        for (let i = 0; i < n; i++) {
          this._push({
            kind: 'mine',
            z: z - rng.range(30, 110),
            x: rng.range(-CORRIDOR_HALF + 2, CORRIDOR_HALF - 2),
            y: rng.range(ALT_MIN + 2, ALT_MAX - 2),
            seed: rng.int(0, 1e6),
          });
        }
      }
    }
  }

  /**
   * Authored encounter sentences mixed into the roll: a hazard, a threat that
   * uses it, and a reward for handling both. Returns the next free Z.
   */
  _phrase(sector, rng, z, threat) {
    const gatesAllowed = z >= 3200;
    const pick = rng.pick(gatesAllowed ? ['guarded', 'window', 'gate', 'fuelrun'] : ['guarded', 'window', 'fuelrun']);
    if (pick === 'guarded') {
      // a slot wall with a gun pair waiting on the far side, fuel after that
      this._wall(z, rng, Math.min(threat, 0.25));
      for (const x of [-7, 7]) this._push({ kind: 'turret', z: z + 38, x: x + rng.range(-2, 2), y: 0, seed: rng.int(0, 1e6) });
      this._push({ kind: 'fuel', z: z + 72, x: rng.range(-6, 6), y: 0, seed: rng.int(0, 1e6) });
      return z + rng.range(150, 200);
    }
    if (pick === 'window') {
      // shoot the radar through the window before you reach it
      const h = lerp(11, 8, clamp(threat, 0, 1)), w = lerp(15, 11, clamp(threat, 0, 1));
      const x = rng.range(-CORRIDOR_HALF + w / 2 + 1, CORRIDOR_HALF - w / 2 - 1), y = ALT_MIN + 0.4;
      const W = DECK_HALF * 2, top = ALT_MAX + 10, t = 5;
      this._push({ kind: 'wall', z, type: 'window', thickness: t, gaps: [{ x, w, y, h }] });
      this._collider(0, y + h, z, W, top - (y + h), t);
      this._collider(0, 0, z, W, y, t);
      const leftW = (x - w / 2) + DECK_HALF, rightW = DECK_HALF - (x + w / 2);
      if (leftW > 0.2) this._collider(-DECK_HALF + leftW / 2, y, z, leftW, h, t);
      if (rightW > 0.2) this._collider(DECK_HALF - rightW / 2, y, z, rightW, h, t);
      this._push({ kind: 'radar', z: z + 45, x, y: 0, seed: rng.int(0, 1e6) });
      return z + rng.range(150, 200);
    }
    if (pick === 'gate') {
      // a cycling gate with a fighter pair riding through it
      const gapH = lerp(11, 7, clamp(threat, 0, 1));
      this._push({ kind: 'gate', z, gapY: rng.range(ALT_MIN + 1, ALT_MAX - gapH - 1), gapH, cycle: rng.range(3, 4.2), phase: rng.next() * 6.28 });
      for (let i = 0; i < 2; i++) {
        this._push({ kind: 'drone', z: z + 60 + i * 10, x: (i ? 1 : -1) * rng.range(4, 9), y: rng.range(6, 16), pattern: 'weave', seed: rng.int(0, 1e6) });
      }
      return z + rng.range(160, 210);
    }
    // fuel run: a tempting tank lane threaded with mines
    const lane = rng.range(-CORRIDOR_HALF + 4, CORRIDOR_HALF - 4);
    for (let i = 0; i < 3; i++) this._push({ kind: 'fuel', z: z + i * 20, x: lane, y: 0, seed: rng.int(0, 1e6) });
    for (let i = 0; i < 3 + Math.round(threat * 2); i++) {
      this._push({ kind: 'mine', z: z + rng.range(0, 60), x: lane + rng.range(-7, 7), y: rng.range(3, 12), seed: rng.int(0, 1e6) });
    }
    return z + rng.range(130, 180);
  }

  /**
   * Barrier wall with a gap. The gap shape is what makes each one a different
   * problem: `slot` tests altitude, `notch` tests lateral, `window` tests both.
   */
  _wall(z, rng, threat) {
    const type = rng.pick(threat < .3 ? ['slot','notch'] : WALL_TYPES);
    const thickness = rng.range(4, 7);
    const top = ALT_MAX + 10;
    const W = DECK_HALF * 2;

    if (type === 'slot') {
      // horizontal band you must match altitude with
      const h = lerp(10, 6, clamp(threat, 0, 1)) + rng.range(-0.8, 1.4);
      const y = rng.range(ALT_MIN + 0.8, ALT_MAX - h - 0.5);
      this._push({ kind: 'wall', z, type, thickness, gaps: [{ x: 0, w: W, y, h }] });
      this._collider(0, 0, z, W, y, thickness, true, 'wall');
      this._collider(0, y + h, z, W, top - (y + h), thickness, true, 'wall');
    } else if (type === 'notch') {
      // vertical slot you must line up laterally with
      const w = lerp(13, 8, clamp(threat, 0, 1)) + rng.range(-1, 2);
      const x = rng.range(-CORRIDOR_HALF + w / 2, CORRIDOR_HALF - w / 2);
      this._push({ kind: 'wall', z, type, thickness, gaps: [{ x, w, y: 0, h: top }] });
      const leftW = (x - w / 2) - (-DECK_HALF);
      const rightW = DECK_HALF - (x + w / 2);
      if (leftW > 0.2) this._collider(-DECK_HALF + leftW / 2, 0, z, leftW, top, thickness);
      if (rightW > 0.2) this._collider(DECK_HALF - rightW / 2, 0, z, rightW, top, thickness);
    } else if (type === 'window') {
      const h = lerp(11, 7.5, clamp(threat, 0, 1));
      const w = lerp(15, 10, clamp(threat, 0, 1));
      const y = rng.range(ALT_MIN + 1, ALT_MAX - h - 1);
      const x = rng.range(-CORRIDOR_HALF + w / 2, CORRIDOR_HALF - w / 2);
      this._push({ kind: 'wall', z, type, thickness, gaps: [{ x, w, y, h }] });
      this._collider(0, 0, z, W, y, thickness);
      this._collider(0, y + h, z, W, top - (y + h), thickness);
      const leftW = (x - w / 2) - (-DECK_HALF);
      const rightW = DECK_HALF - (x + w / 2);
      if (leftW > 0.2) this._collider(-DECK_HALF + leftW / 2, y, z, leftW, h, thickness);
      if (rightW > 0.2) this._collider(DECK_HALF - rightW / 2, y, z, rightW, h, thickness);
    } else if (type === 'pillars') {
      // a row of columns; weave between them
      const count = rng.int(3, 5);
      const spacing = (CORRIDOR_HALF * 2 + 10) / count;
      const gaps = [];
      const offset = rng.range(-spacing / 2, spacing / 2);
      for (let i = 0; i <= count; i++) {
        const px = -CORRIDOR_HALF - 5 + i * spacing + offset;
        const pw = rng.range(4, 7);
        this._collider(px, 0, z, pw, top, thickness);
        gaps.push({ x: px, w: pw, y: 0, h: top, solid: true });
      }
      this._push({ kind: 'wall', z, type, thickness, gaps, columns: true });
    } else {
      // stagger: two thin walls close together with offset slots
      const h = lerp(11, 8, clamp(threat, 0, 1));
      const y1 = rng.range(ALT_MIN + 0.5, ALT_MAX - h - 6);
      const y2 = clamp(y1 + rng.range(6, 11) * (rng.bool() ? 1 : -1), ALT_MIN + 0.5, ALT_MAX - h - 0.5);
      const t = 3.2;
      const dz = rng.range(26, 40);
      this._push({ kind: 'wall', z, type, thickness: t, gaps: [{ x: 0, w: W, y: y1, h }] });
      this._collider(0, 0, z, W, y1, t);
      this._collider(0, y1 + h, z, W, top - (y1 + h), t);
      this._push({ kind: 'wall', z: z + dz, type: 'slot', thickness: t, gaps: [{ x: 0, w: W, y: y2, h }] });
      this._collider(0, 0, z + dz, W, y2, t);
      this._collider(0, y2 + h, z + dz, W, top - (y2 + h), t);
    }
  }

  /* --- open space ---------------------------------------------------- */

  _genSpace(sector, rng) {
    const { zStart, zEnd, threat } = sector;
    let z = zStart + 120;

    while (z < zEnd - 140) {
      const roll = rng.weighted(['wing','platform','minefield','debrisRing'].map((kind,i)=>[kind,sector.spaceWeights[i]]));

      if (roll === 'wing') {
        const count = 3 + Math.round(threat * 3);
        const altitude = rng.pick([7,13,19]);
        const centerX = rng.range(-3,3);
        const pattern = rng.pick(['weave','strafe','dive']);
        for (let i = 0; i < count; i++) {
          this._push({
            kind: 'interceptor',
            z: z + Math.abs(i-(count-1)/2)*14,
            x: clamp(centerX+(i-(count-1)/2)*5,-CORRIDOR_HALF+1,CORRIDOR_HALF-1),
            y: altitude,
            pattern,
            seed: rng.int(0, 1e6),
          });
        }
        z += rng.range(160, 240);
      } else if (roll === 'platform') {
        // free-floating gun platforms — cover in an otherwise empty sky
        const n = rng.int(1, 3);
        for (let i = 0; i < n; i++) {
          const px = rng.range(-CORRIDOR_HALF + 4, CORRIDOR_HALF - 4);
          const py = rng.range(3, ALT_MAX - 8);
          const pz = z + i * rng.range(40, 80);
          this._push({ kind: 'platform', z: pz, x: px, y: py, seed: rng.int(0, 1e6) });
          this._collider(px, py, pz, 16, 2.4, 16, true, 'platform');
          this._push({ kind: 'turret', z: pz, x: px, y: py + 2.4, seed: rng.int(0, 1e6) });
          if (rng.bool(0.4)) {
            this._push({ kind: 'fuel', z: pz + 6, x: px + rng.range(-4, 4), y: py + 2.4, seed: rng.int(0, 1e6) });
          }
        }
        z += rng.range(150, 220);
      } else if (roll === 'minefield') {
        const n = rng.int(6, 12);
        for (let i = 0; i < n; i++) {
          this._push({
            kind: 'mine',
            z: z + rng.range(0, 110),
            x: rng.range(-CORRIDOR_HALF, CORRIDOR_HALF),
            y: rng.range(ALT_MIN + 1, ALT_MAX - 1),
            seed: rng.int(0, 1e6),
          });
        }
        z += rng.range(150, 210);
      } else {
        this._push({ kind: 'debrisRing', z, seed: rng.int(0, 1e6), radius: rng.range(26, 40) });
        z += rng.range(120, 180);
      }
    }
  }

  /* --- boss ---------------------------------------------------------- */

  _genBoss(sector, rng) {
    const { zStart, zEnd } = sector;
    for (let mz = zStart; mz < zEnd; mz += CHUNK_LEN) {
      this._push({ kind: 'arena', z: mz, seed: rng.int(0, 1e6) });
    }
    // A short approach corridor before the arena opens up.
    this._push({ kind: 'fuel', z: zStart + 120, x: -8, y: 0, seed: rng.int(0, 1e6) });
    this._push({ kind: 'fuel', z: zStart + 140, x: 8, y: 0, seed: rng.int(0, 1e6) });
    this._push({ kind: 'boss', z: zStart + 420, x: 0, y: 12, seed: rng.int(0, 1e6) });
  }

  /* ------------------------------------------------------------------ */
  /* Collision queries                                                   */
  /* ------------------------------------------------------------------ */

  /**
   * Bucket the colliders by Z once, so queries are O(1) regardless of where
   * along the level they happen. Projectiles query far ahead of the player
   * while the ship queries around itself, so a single forward-only cursor
   * would thrash — this does not.
   */
  _buildColliderIndex() {
    this.buckets = new Map();
    for (const c of this.colliders) {
      const b0 = Math.floor(c.minZ / BUCKET);
      const b1 = Math.floor(c.maxZ / BUCKET);
      for (let b = b0; b <= b1; b++) {
        let list = this.buckets.get(b);
        if (!list) this.buckets.set(b, (list = []));
        list.push(c);
      }
    }
  }

  /**
   * All colliders overlapping [z0, z1]. May contain duplicates when a collider
   * straddles a bucket boundary; every caller is doing an overlap test, so a
   * repeated candidate is harmless and cheaper than de-duplicating.
   */
  collidersNear(z0, z1, out) {
    out.length = 0;
    const b0 = Math.floor(z0 / BUCKET);
    const b1 = Math.floor(z1 / BUCKET);
    for (let b = b0; b <= b1; b++) {
      const list = this.buckets.get(b);
      if (!list) continue;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (c.maxZ < z0 || c.minZ > z1) continue;
        out.push(c);
      }
    }
    return out;
  }

  /**
   * Ground height under a point. Fortress sectors have a deck at y=0; space
   * sectors have nothing, so the "floor" is far below the play area.
   */
  groundAt(z) {
    const s = this.sectorAt(z);
    return s && s.kind === SECTOR_KINDS.SPACE ? -400 : 0;
  }

  hasDeck(z) {
    const s = this.sectorAt(z);
    return !!s && s.kind !== SECTOR_KINDS.SPACE;
  }
}
