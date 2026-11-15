/**
 * Authored fortress architecture: the far trench wall, gate installations and
 * one landmark per sector, composed from the environment kit's templates.
 *
 * Contract (proved by tests/environment-kit.test.js):
 *  - The composer draws nothing from the chunk RNG. `Fortress` runs every
 *    seeded source draw in source order and only records the far wall's
 *    parameters (height, rib tuples, ledge, windows, bay, fans, sign) instead
 *    of emitting boxes for them. Emitters, guide surfaces, level features,
 *    colliders and all other layers are unchanged.
 *  - Fans keep their source pivot / radius / rate; windows, strobes, chase
 *    lamps and signs keep their source animation tuples.
 *  - Nothing is nearer the lane than the source geometry it replaces
 *    (x >= 24.15 for gate hardware, x >= 25.7 for wall structure), and gate
 *    ornament stays inside the source gate solids.
 *  - Geometry is stamped into the chunk's existing buckets: no material,
 *    texture, Object3D or draw call is added.
 */
import { LIGHT_ANIM } from '../render/Materials.js';
import { appendImportedCoolingStack } from '../render/ImportedCoolingStack.js';
import { Rng } from '../core/Utils.js';
import { CHUNK_LEN, DECK_HALF, CORRIDOR_HALF, ALT_MAX, SECTOR_KINDS } from './Level.js';
import { environmentKitReady, put } from './EnvironmentKit.js';

const { STROBE, CHASE, BREATHE } = LIGHT_ANIM;
const fract = (v) => ((v % 1) + 1) % 1;

const FACE = DECK_HALF - 0.1;          // source `face`
const FIELD = DECK_HALF + 0.4;         // recessed wall-field plane
const MASS_W = 6.6, MASS_CX = FIELD + MASS_W / 2;
const WALL_TINT = 0xc8d2de;
const TOP = ALT_MAX + 10;
const PIPE_X = FACE - 0.5, PIPE_R = 0.34, PIPES = [3.2, 5.1];

/* ------------------------------------------------------------------ */
/* Themes                                                              */
/* ------------------------------------------------------------------ */

/**
 * One theme per fortress sector. `accent` is the source sector accent (base conduit).
 * `landmark`: offset from the sector start picks the chunk, `half` is its half length
 * on the wall, `cut` the wall-mass / crest opening it needs, `xMax` its depth.
 * `lean` marks the two sectors whose source props are already the heaviest in the game:
 * they omit pier caps, fan stators and window bezels and space rail posts wider, to stay
 * under the 85k High-window ceiling.
 */
const AIRFIELD = {
  key: 'airfield', accent: 0x8bcbd0, gates: false, pipes: false, gallery: 'rail', crest: 'airfield', bay: 'hangar', rowStart: 7.0, lean: true,
  landmark: { kind: 'tower', offset: 700, half: 7.9, cut: 0, crestCut: 7.0, xMax: 35.5 },
};
const BATTERY = {
  key: 'battery', accent: 0xa8bccc, gates: false, pipes: false, gallery: null, crest: 'battery', bay: 'casemate', rowStart: 8.4, glacis: true, lean: true,
  landmark: { kind: 'director', offset: 760, half: 8.9, cut: 0, crestCut: 8.2, xMax: 35.2 },
};
const REACTOR = {
  key: 'reactor', accent: 0xffbf69, gates: true, pipes: true, gallery: 'rail', crest: 'reactor', bay: 'service', rowStart: 7.0,
  landmark: { kind: 'core', offset: 840, half: 13.7, cut: 13, crestCut: 12.9, xMax: 39.6 },
};
const CITADEL = {
  key: 'citadel', accent: 0xe5c2a0, gates: true, pipes: false, gallery: 'tiers', crest: 'citadel', bay: 'portal', rowStart: 7.0, fins: true,
  landmark: { kind: 'keep', offset: 900, half: 9.5, cut: 0, crestCut: 8.8, xMax: 36 },
};
const GAUNTLET = {
  key: 'gauntlet', accent: 0xe5c2a0, gates: true, pipes: false, gallery: null, crest: 'gauntlet', bay: 'blast', rowStart: 7.0, alarm: true, slits: true,
  landmark: { kind: 'siren', offset: 800, half: 6.9, cut: 0, crestCut: 6.0, xMax: 34.6 },
};

/** Sector index -> wall theme. Sectors without one keep the procedural source wall. */
const WALL_THEMES = [AIRFIELD, BATTERY, null, REACTOR, null, CITADEL, GAUNTLET, null];

export const wallThemeFor = (sector) => (environmentKitReady() && sector?.kind === SECTOR_KINDS.FORTRESS ? WALL_THEMES[sector.index] ?? null : null);

/** A fresh record for one chunk's seeded far-wall parameters, or null for the procedural wall. */
export function wallRecordFor(sector, z0) {
  const theme = wallThemeFor(sector);
  return theme ? { theme, z0, h: 0, ledgeY: 0, ribs: [], windows: [], hangar: null, fans: [], sign: null, towers: [], props: [] } : null;
}

/** Do coolant gates in this sector take the authored gate housing? */
export const gateKitFor = (sector) => !!wallThemeFor(sector)?.gates;

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                    */
/* ------------------------------------------------------------------ */

/** Does a far tower (footprint at world height yy) overlap an axis-aligned XZ rect? (SAT, OBB vs AABB) */
function towerHitsRect(t, yy, x0, x1, zA, zB) {
  if (yy > t.yTop || yy < t.yBottom) return false;
  const k = (yy - t.yBottom) / (t.yTop - t.yBottom);
  const hx = t.bottom[0] + (t.top[0] - t.bottom[0]) * k, hz = t.bottom[1] + (t.top[1] - t.bottom[1]) * k;
  const c = Math.cos(t.rot), s = Math.sin(t.rot);
  const pts = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([lx, lz]) => [lx * c + lz * s + t.x, -lx * s + lz * c + t.z]);
  const rect = [[x0, zA], [x1, zA], [x1, zB], [x0, zB]];
  for (const [ax, az] of [[1, 0], [0, 1], [c, -s], [s, c]]) {
    const pa = pts.map(([px, pz]) => px * ax + pz * az), pb = rect.map(([px, pz]) => px * ax + pz * az);
    if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
  }
  return true;
}

/** Subtract blocked intervals from [a,b]; returns sorted open segments. */
function segments(a, b, blocked, min = 0.05) {
  let out = [[a, b]];
  for (const [c, d] of blocked) {
    const next = [];
    for (const [s, e] of out) {
      if (d <= s || c >= e) { next.push([s, e]); continue; }
      if (c > s) next.push([s, c]);
      if (d < e) next.push([d, e]);
    }
    out = next;
  }
  return out.filter(([s, e]) => e - s > min).sort((p, q) => p[0] - q[0]);
}
const overlaps1 = (a0, a1, b0, b1) => a0 < b1 && b0 < a1;

/* ------------------------------------------------------------------ */
/* Near parapet (carved inside the source box x-34..-27, y0..3.2)      */
/* ------------------------------------------------------------------ */
export function composeNearParapet(batch, z0, theme) {
  const zc = z0 + CHUNK_LEN / 2;
  put(batch, 'EK_Parapet.channel', 0, 0, zc, { sz: CHUNK_LEN });
  put(batch, 'EK_Parapet.tray', 0, 0, zc, { sz: CHUNK_LEN });
  for (let i = 0; i < 6; i++) {
    const z = z0 + 8 + i * 16;
    put(batch, 'EK_Parapet.outer_rib', 0, 0, z);
    put(batch, 'EK_Parapet.bridge', 0, 0, z);
    put(batch, 'EK_Parapet.bridge_lamp', 0, 0, z, { tint: theme.accent, fx: { anim: [BREATHE, 0.4, i * 0.17] } });
  }
  for (const dz of theme.lean ? [56] : [32, 80]) put(batch, 'EK_Parapet.hatch', 0, 0, z0 + dz);
}

/* ------------------------------------------------------------------ */
/* Landmark placement (one chunk per sector, seeded inputs only)       */
/* ------------------------------------------------------------------ */
const landmarkChunkOf = (sector, lm) => Math.floor((sector.zStart + lm.offset) / CHUNK_LEN);

function landmarkFor(sector, z0, rec, gates, h) {
  const lm = rec.theme.landmark;
  if (!lm || Math.floor(z0 / CHUNK_LEN) !== landmarkChunkOf(sector, lm)) return null;
  let best = null;
  for (const o of [48, 40, 56, 32, 64, 26, 70, 20, 76]) {
    const zc = z0 + o;
    const gateClash = gates.some((g) => Math.abs(g.z - zc) < lm.half + 5.8);
    const fans = rec.fans.filter((f) => Math.abs(f.z - zc) < lm.half + 1.4 * f.r).length;
    const props = rec.props.filter((p) => p.x + p.hx > 25.75 && Math.abs(p.z - zc) < lm.half + p.hz).length;
    let towers = 0;
    for (const t of rec.towers) for (const yy of [h, h + 8, h + 16]) if (towerHitsRect(t, yy, 26, lm.xMax, zc - lm.half + 0.3, zc + lm.half - 0.3)) { towers++; break; }
    const score = (gateClash ? 100 : 0) + fans * 6 + props * 3 + towers;
    if (!best || score < best.score) best = { zc, score, gateClash };
    if (score === 0) break;
  }
  if (best.gateClash) return null;          // never crowd a gate: the landmark yields
  best.Hb = h + 6;                          // reactor bastion top
  return best;
}

/* ------------------------------------------------------------------ */
/* Far wall composer                                                   */
/* ------------------------------------------------------------------ */
export function composeFarWall(fortress, batch, rec, z0, z1, sector) {
  const { theme, towers } = rec;
  const level = fortress.level;
  const ACCENT = theme.accent;
  const h = rec.h, L = rec.ledgeY;
  const index = Math.floor(z0 / CHUNK_LEN);
  const gatesNear = theme.gates ? level.features.filter((f) => f.kind === 'gate' && f.z >= z0 - 8 && f.z < z1 + 8) : [];
  const gatesOwn = gatesNear.filter((f) => f.z >= z0 && f.z < z1);
  const prevH = fortress._farWallHeight(index - 1, sector), nextH = fortress._farWallHeight(index + 1, sector);
  const firstChunk = level.sectorAt(z0 - CHUNK_LEN * 0.5) !== sector;
  const lastChunk = level.sectorAt(z1 + CHUNK_LEN * 0.5) !== sector;
  const core = landmarkFor(sector, z0, rec, gatesNear, h);
  const LM = theme.landmark, isCore = LM?.kind === 'core';
  const CORE_HALF = LM?.half ?? 0;
  const coreZ = theme.landmark ? landmarkChunkOf(sector, theme.landmark) * CHUNK_LEN + CHUNK_LEN / 2 : 0;
  const frieze = h - 1.3;                     // frieze rail centre

  // ---- reserved rectangles on the wall face: [zA, zB, yA, yB, kind] ----
  const blocks = [];
  const hit = (za, zb, ya, yb, kinds = null) => blocks.some(([c, d, e, f, k]) => (!kinds || kinds.includes(k)) && overlaps1(za, zb, c, d) && overlaps1(ya, yb, e, f));
  for (const g of gatesNear) {
    blocks.push([g.z - 4.75, g.z + 4.75, -1, 6.2, 'pylonFoot']);
    blocks.push([g.z - 3.55, g.z + 3.55, 6.2, 99, 'pylon']);
  }
  if (core) blocks.push([core.zc - CORE_HALF, core.zc + CORE_HALF, -1, 99, 'core']);
  // junction houses on chunk seams (crest zone only)
  const houses = [];
  const houseAt = (zSeam, hA, hB) => {
    const yMin = Math.min(hA, hB) - 0.5, yTop = Math.max(hA, hB) + 4.0;
    if (hit(zSeam - 0.4, zSeam + 4.8, yMin, yTop, ['pylon', 'core'])) return;
    houses.push({ z: zSeam, yMin, yTop });
    blocks.push([zSeam - 0.3, zSeam + 4.7, yMin, 99, 'house']);
  };
  // The seam house straddles the seam by 0.3 m: it swallows the previous chunk's trunk end and never
  // shares a plane with this chunk's wall-mass end face where the seeded heights step.
  houseAt(z0 - 0.3, firstChunk || prevH == null ? h : prevH, h);
  if (lastChunk || nextH == null) houseAt(z1 - 4.4, h, h);

  // fans keep their source pivot, radius, rate and emitter; only the picture can yield
  const fans = [], fanVents = [];
  for (const fan of rec.fans) {
    const e = fan.r * 1.4 + 0.1;
    if (core && Math.abs(fan.z - core.zc) < CORE_HALF + e) {
      const dz = fan.z - core.zc;
      // a flush vent grille marks the source steam emitter on the bastion front, between the slots
      if (isCore && Math.abs(dz) < 6.2 && ![-4.8, 0, 4.8].some((s) => Math.abs(dz - s) < 2.3) && fan.y < core.Hb - 2) fanVents.push(fan);
      continue;
    }
    if (hit(fan.z - e, fan.z + e, fan.y - e, fan.y + e, ['pylon', 'pylonFoot'])) continue;
    fans.push(fan);
    blocks.push([fan.z - e, fan.z + e, fan.y - e, fan.y + e, 'fan']);
  }

  // service bay: source size; the picture may slide along the wall or lower its header to fit
  let hangar = null;
  if (rec.hangar) {
    const src = rec.hangar;
    const fits = (z, hh) => z - src.w / 2 - 1.2 > z0 + 5 && z + src.w / 2 + 1.2 < z1 - 0.6 && !hit(z - src.w / 2 - 1.0, z + src.w / 2 + 1.0, -1, hh + 2.4);
    const tries = [0, -3, 3, -6, 6, -9, 9, -12, 12, -16, 16, -20, 20, -26, 26];
    for (const hh of [src.h, Math.max(5.0, src.h - 1.2)]) {
      const dz = tries.find((d) => fits(src.z + d, hh));
      if (dz !== undefined) { hangar = { ...src, z: src.z + dz, h: hh }; break; }
    }
    if (hangar) blocks.push([hangar.z - hangar.w / 2 - 0.95, hangar.z + hangar.w / 2 + 0.95, -1, hangar.h + 2.4, 'hangar']);
  }

  let sign = null;
  if (rec.sign) {
    const src = rec.sign;
    const clash = (z) => z - src.w / 2 - 0.8 < z0 + 0.5 || z + src.w / 2 + 0.8 > z1 - 0.5 || src.y + src.h + 0.9 > frieze - 0.3
      || hit(z - src.w / 2 - 0.7, z + src.w / 2 + 0.7, src.y - 0.65, src.y + src.h + 0.85);
    const dz = [0, -4, 4, -8, 8, -12, 12, -18, 18].find((d) => !clash(src.z + d));
    if (dz !== undefined) {
      sign = { ...src, z: src.z + dz };
      blocks.push([sign.z - sign.w / 2 - 0.7, sign.z + sign.w / 2 + 0.7, sign.y - 0.65, sign.y + sign.h + 0.85, 'sign']);
    }
  }

  // ---- wall mass: source tint and height, front moved back to the field plane ----
  const massCuts = [];
  const pocket = hangar && theme.bay !== 'blast';        // the Gauntlet's bay is a sealed door on an uncut wall
  if (pocket) massCuts.push([hangar.z - hangar.w / 2, hangar.z + hangar.w / 2]);
  if (core && LM.cut) massCuts.push([core.zc - LM.cut, core.zc + LM.cut]);
  for (const [s, e] of segments(z0, z1, massCuts)) batch.box('hull', MASS_W, h, e - s, MASS_CX, 0, (s + e) / 2, 10, WALL_TINT);
  if (pocket) batch.box('hull', MASS_W, h - hangar.h, hangar.w, MASS_CX, hangar.h, hangar.z, 10, WALL_TINT);

  // ---- plinth course with the source base conduit in its kerb ----
  const baseCuts = blocks.filter(([, , e]) => e < 1.0).map(([c, d]) => [c, d]);
  for (const [s, e] of segments(z0, z1, baseCuts)) {
    put(batch, 'RS_WallFrame.plinth', 0, 0, (s + e) / 2, { sz: e - s });
    batch.box('neon', 0.3, 0.3, e - s, 26.52, 0.55, (s + e) / 2, 10, ACCENT, 0, 0.62);
  }

  // ---- buttress piers at the source rib positions and heights ----
  const piers = [];
  for (const rib of rec.ribs) {
    let H = rib.H;
    // a pier yields to an unchanged source prop standing in its footprint (cooling stack base, dish sweep)
    if (rec.props.some((p) => p.x + p.hx > 25.75 && Math.abs(p.z - rib.z) < 1.62 + p.hz)) continue;
    const over = blocks.filter(([c, d, e]) => overlaps1(rib.z - 1.62, rib.z + 1.62, c, d) && e < H);
    if (over.some(([, , e]) => e < 2.6)) continue;
    if (over.length) H = Math.min(...over.map(([, , e]) => e)) - 0.2;
    if (H < 6.2) continue;
    piers.push({ ...rib, H });
    put(batch, 'RS_WallFrame.pier_foot', 0, 0, rib.z);
    put(batch, 'RS_WallFrame.pier_shaft', 0, 2.5, rib.z, { sy: H - 4.3 });
    put(batch, 'RS_WallFrame.pier_head', 0, H - 1.8, rib.z);
    if (!theme.lean) put(batch, 'RS_WallFrame.pier_cap', 0, H - 1.8, rib.z);
    put(batch, 'RS_WallFrame.pier_lamp', 0, H - 1.8, rib.z, { tint: ACCENT, fx: { anim: [BREATHE, 0.4, rib.i * 0.17] } });
    if (theme.alarm && H > 8) {
      // the Gauntlet's red alarm ribs: a breathing strip up each pier shaft at the source conduit rate
      put(batch, 'TG_Alarm.rib_light', 0, 3.0, rib.z, { sy: H - 5.2, fx: { anim: [BREATHE, 0.5, rib.i * 0.17] } });
      put(batch, 'TG_Alarm.rib_guard', 0, 3.0, rib.z, { sy: H - 5.2 });
    }
    // the Citadel's flying fins carry each pier line on up to the crest
    if (theme.fins && H === rib.H && h - H > 2.4 && !hit(rib.z - 0.5, rib.z + 0.5, H, h - 1.0)) {
      blocks.push([rib.z - 0.5, rib.z + 0.5, H, 99, 'fin']);
      put(batch, 'IC_Buttress.fin', 0, H, rib.z, { sy: h - H });
    }
  }

  // ---- Gun Batteries: sloped armour skirt between the piers ----
  if (theme.glacis) {
    const cuts = blocks.filter(([, , e]) => e < 7.5).map(([c, d]) => [c - 0.1, d + 0.1]);
    for (const p of piers) cuts.push([p.z - 1.3, p.z + 1.3]);
    for (const [s, e] of segments(z0, z1, cuts, 1.2)) {
      put(batch, 'GB_Armor.glacis', 0, 0, (s + e) / 2, { sz: e - s });
      put(batch, 'GB_Armor.glacis_cap', 0, 0, (s + e) / 2, { sz: e - s });
      if (e - s > 10) put(batch, 'GB_Armor.strake', 0, 0, (s + e) / 2);
    }
  }

  // ---- coolant mains threaded through the piers ----
  const elbow = (name, y, z) => put(batch, `RS_PipeRun.${name}`, PIPE_X, y, z);
  const mainRuns = {};
  for (const y of theme.pipes ? PIPES : []) {
    const cuts = [];
    for (const g of gatesNear) cuts.push([g.z - 2.6, g.z + 2.6, 'solid']);   // ends die inside the pylon cheeks
    if (core) cuts.push([core.zc - 7.6, core.zc + 7.6, 'solid']);
    for (const [c, d, e, f, k] of blocks) if ((k === 'hangar' || k === 'fan') && overlaps1(y - 0.6, y + 0.6, e, f)) cuts.push([c - 0.75, d + 0.75, 'bend']);
    const runs = segments(z0, z1, cuts, 1.4);
    mainRuns[y] = runs;
    for (const [s, e] of runs) {
      // a run that ends at a bay or fan turns into the wall; one that meets a pier, pylon or bastion simply enters it
      const bendStart = cuts.some(([, d, k]) => k === 'bend' && Math.abs(d - s) < 1e-6);
      const bendEnd = cuts.some(([c, , k]) => k === 'bend' && Math.abs(c - e) < 1e-6);
      const a = s + (bendStart ? 0.6 : 0), b = e - (bendEnd ? 0.6 : 0);
      put(batch, 'RS_PipeRun.main', PIPE_X, y, a, { sx: PIPE_R, sy: PIPE_R, sz: b - a });
      if (bendStart) elbow('elbow_start', y, a);
      if (bendEnd) elbow('elbow_end', y, b);
      for (const p of piers) if (p.z - 1.3 > a + 0.3 && p.z - 1.3 < b) put(batch, 'RS_PipeRun.collar', PIPE_X, y, p.z - 1.3);
      for (const g of gatesNear) if (Math.abs(e - (g.z - 2.6)) < 1e-6 && g.z - 3.0 > a + 0.3) put(batch, 'RS_PipeRun.collar', PIPE_X, y, g.z - 3.0);
    }
  }
  const onRun = (runs, z, m = 0.6) => runs.some(([s, e]) => z > s + m && z < e - m);

  // ---- crest: coping plus the sector's own crest line ----
  const crestCuts = [];
  for (const g of gatesNear) crestCuts.push([g.z - 3.2, g.z + 3.2]);
  if (core) crestCuts.push([core.zc - LM.crestCut, core.zc + LM.crestCut]);
  for (const hs of houses) crestCuts.push([hs.z - 0.5, hs.z + 4.2]);
  const crest = segments(z0, z1, crestCuts, 0.6);
  const ribsIn = (s, e, m) => rec.ribs.filter((rib) => rib.z > s + m && rib.z < e - m);
  for (const [s, e] of crest) {
    const mid = (s + e) / 2, len = e - s;
    put(batch, 'RS_WallFrame.coping', 0, h, mid, { sz: len });
    if (theme.crest === 'reactor') {
      // thermal exhaust trunk, coolant main, expansion joints, vents chasing toward the core
      put(batch, 'RS_ExhaustTrunk.trunk', 0, h, mid, { sz: len });
      put(batch, 'RS_PipeRun.main', 28.2, h + 1.0, s, { sx: 0.5, sy: 0.5, sz: len });
      for (const rib of ribsIn(s, e, 0.6)) put(batch, 'RS_ExhaustTrunk.joint', 0, h, rib.z);
      for (let k = 1; k < 6; k++) {
        const vz = z0 + k * 16;
        if (vz < s + 1.6 || vz > e - 1.6) continue;
        put(batch, 'RS_ExhaustTrunk.vent', 0, h, vz);
        put(batch, 'RS_ExhaustTrunk.vent_glow', 0, h, vz, { fx: { anim: [CHASE, 0.35, fract(Math.abs(vz - coreZ) / 160)] } });
      }
    } else if (theme.crest === 'airfield') {
      // service walk with a handrail; floodlight masts over the apron on two pier lines
      put(batch, 'AF_Crest.rail', 0, h, mid, { sz: len });
      const n = Math.max(1, Math.round(len / 16));
      for (let k = 0; k <= n; k++) put(batch, 'AF_Crest.post', 0, h, s + 0.06 + (len - 0.12) * (k / n));
      for (const rib of ribsIn(s, e, 1.2)) if (rib.i === 1 || rib.i === 4) {
        put(batch, 'AF_Crest.mast', 0, h, rib.z);
        put(batch, 'AF_Crest.mast_lamp', 0, h, rib.z);
      }
    } else if (theme.crest === 'battery') {
      // armour merlons; blast deflectors behind them on two pier lines
      for (let k = 0; k < 8; k++) { const mz = z0 + 6 + k * 12; if (mz > s + 2 && mz < e - 2) put(batch, 'GB_Crest.merlon', 0, h, mz); }
      for (const rib of ribsIn(s, e, 3.4)) if (rib.i === 1 || rib.i === 4) put(batch, 'GB_Crest.deflector', 0, h, rib.z);
    } else if (theme.crest === 'citadel') {
      // attic storey with a lit command slot per bay, pilasters and finials on the pier lines
      put(batch, 'IC_Crest.attic', 0, h, mid, { sz: len });
      const marks = [s, ...ribsIn(s, e, 1.0).map((rib) => rib.z), e];
      for (let k = 0; k < marks.length - 1; k++) {
        const a = marks[k] + 1.0, b = marks[k + 1] - 1.0;
        if (b - a > 1.5) put(batch, 'IC_Crest.attic_band', 0, h, (a + b) / 2, { sz: b - a, fx: { anim: [BREATHE, 0.22, fract((a + b) / 64)] } });
      }
      for (const rib of ribsIn(s, e, 1.0)) {
        put(batch, 'IC_Crest.attic_pilaster', 0, h, rib.z);
        put(batch, 'IC_Buttress.finial', 0, h, rib.z);
        put(batch, 'IC_Buttress.finial_lamp', 0, h, rib.z, { fx: { anim: [BREATHE, 0.22, rib.i * 0.17] } });
      }
    } else if (theme.crest === 'gauntlet') {
      // saw-tooth crest and barbed masts
      for (let k = 0; k < 24; k++) { const tz = z0 + 2 + k * 4; if (tz > s + 1.8 && tz < e - 1.8) put(batch, 'TG_Crest.tooth', 0, h, tz); }
      for (const rib of ribsIn(s, e, 1.5)) put(batch, 'TG_Crest.barb', 0, h, rib.z);
    }
  }
  for (const hs of houses) {
    put(batch, 'RS_ExhaustTrunk.house_body', 0, hs.yMin, hs.z, { sy: hs.yTop - hs.yMin });
    put(batch, 'RS_ExhaustTrunk.house_roof', 0, hs.yTop, hs.z);
    put(batch, 'RS_ExhaustTrunk.house_louvre', 0, hs.yTop - 2.6, hs.z);
    put(batch, 'RS_ExhaustTrunk.house_lamp', 0, hs.yTop + 0.5, hs.z, { fx: { anim: [STROBE, 0.7, fract(hs.z / 97)] } });
  }

  // ---- risers: upper main -> crest main, on the approach side of piers 1 and 4 ----
  const risers = [];
  for (const p of theme.pipes ? piers : []) {
    if (p.i !== 1 && p.i !== 4) continue;
    const rz = p.z - 1.8;
    if (!onRun(mainRuns[5.1], rz) || !crest.some(([s, e]) => rz > s + 0.5 && rz < e - 0.5) || hit(rz - 0.45, rz + 0.45, 5.0, h + 1.4)) continue;
    risers.push(rz);
    blocks.push([rz - 0.45, rz + 0.45, 5.0, 99, 'riser']);
    put(batch, 'RS_PipeRun.riser_tee', PIPE_X, 5.1, rz);
    put(batch, 'RS_PipeRun.riser', PIPE_X, 5.8, rz, { sy: h + 0.5 - 5.8 });
    put(batch, 'RS_PipeRun.riser_head', 0, h, rz);
  }

  // ---- gallery at the source ledge height, bay by bay (the Citadel carries a second tier) ----
  const gallery = [], braces = [];
  const levels = !theme.gallery ? [] : theme.gallery === 'tiers' && L + 6.2 < frieze - 3.2 ? [L, L + 6.2] : [L];
  for (const gy of levels) {
    const galleryCuts = blocks.filter(([, , e, f, k]) => k !== 'riser' && overlaps1(gy - 2.1, gy + 1.2, e, f)).map(([c, d]) => [c - 0.05, d + 0.05]);
    for (const p of piers) if (p.H > gy - 0.3) galleryCuts.push([p.z - 1.3, p.z + 1.3]);
    for (const [s, e] of segments(z0, z1, galleryCuts, 1.6)) {
      const len = e - s;
      gallery.push([s, e, gy]);
      put(batch, 'RS_Gallery.deck', 0, gy, (s + e) / 2, { sz: len });
      put(batch, 'RS_Gallery.rail', 0, gy, (s + e) / 2, { sz: len });
      const n = Math.max(1, Math.round(len / (theme.lean ? 9.9 : 6.6)));
      for (let k = 0; k <= n; k++) put(batch, 'RS_Gallery.post', 0, gy, s + 0.06 + (len - 0.12) * (k / n));
      for (const bz of len > (theme.lean ? 12 : 6) ? [s + 1.3, e - 1.3] : [(s + e) / 2]) { put(batch, 'RS_Gallery.brace', 0, gy, bz); braces.push([bz, gy]); }
      for (const rz of risers) if (rz > s + 0.5 && rz < e - 0.5) put(batch, 'RS_PipeRun.riser_sleeve', PIPE_X, gy, rz);
    }
  }

  // ---- frame: frieze rail and stiles on the recessed field ----
  const friezeCuts = blocks.filter(([, , e, f]) => overlaps1(frieze - 0.3, frieze + 0.3, e, f)).map(([c, d]) => [c, d]);
  for (const [s, e] of segments(z0, z1, friezeCuts, 0.5)) put(batch, 'RS_WallFrame.rail', 0, frieze, (s + e) / 2, { sz: e - s });
  const stileZ = [];
  for (let k = 1; k < 6; k++) stileZ.push([z0 + k * 16, 1.5]);
  if (hangar) for (const sg of [-1, 1]) stileZ.push([hangar.z + sg * (hangar.w / 2 + 0.45), hangar.h + 1.5]);
  const stiles = [];
  for (const [sz, y0] of stileZ) {
    if (piers.some((p) => Math.abs(p.z - sz) < 1.7)) continue;
    const cuts = blocks.filter(([c, d, , , k]) => k !== 'riser' && overlaps1(sz - 0.3, sz + 0.3, c, d)).map(([, , e, f]) => [e, f]);
    for (const [a, b] of segments(y0, frieze - 0.25, cuts, 0.9)) { put(batch, 'RS_WallFrame.stile', 0, a, sz, { sy: b - a }); stiles.push([sz, a, b]); }
  }

  // ---- the source bay: a real pocket in the wall, dressed per sector ----
  if (hangar) {
    const { z, w, h: hh, strobePhase } = hangar;
    if (pocket) {
      put(batch, 'RS_ServiceBay.shell', 0, 0, z, { sy: hh - 0.03, sz: w - 0.04 });   // just inside the cut wall mass, so no coplanar faces
      put(batch, 'RS_ServiceBay.floor', 0, 0, z, { sz: w });
      put(batch, 'RS_ServiceBay.ceiling_light', 0, hh, z, { sz: w - 1 });
      put(batch, 'RS_ServiceBay.back_light', 0, 0, z, { sz: w - 2, fx: { anim: [CHASE, 0.5, 0] } });
    }
    for (const sg of [-1, 1]) put(batch, 'RS_ServiceBay.jamb', 0, 0, z + sg * (w / 2 + 0.45), { sy: hh + 1.5 });
    put(batch, 'RS_ServiceBay.header', 0, hh, z, { sz: w + 1.8 });
    put(batch, 'RS_ServiceBay.hazard', 0, hh, z, { sz: w + 1.2 });
    if (theme.bay === 'service') put(batch, 'RS_ServiceBay.shutter', 0, 0, z, { sy: hh, sz: w - 0.1 });
    else if (theme.bay === 'hangar') {
      // sliding doors parked half open, head track, apron flood bar
      for (const sg of [-1, 1]) put(batch, 'AF_Hangar.door_leaf', 0, 0, z + sg * w * 0.36, { sy: hh - 0.3, sz: w * 0.28 });
      put(batch, 'AF_Hangar.door_track', 0, hh, z, { sz: w });
      put(batch, 'AF_Hangar.apron_bar', 0, hh, z, { sz: w - 1 });
    } else if (theme.bay === 'casemate') {
      // closed armoured doors; a shell hoist climbs the wall above the bay
      put(batch, 'GB_Casemate.blast_door', 0, 0, z, { sy: hh, sz: w - 0.1 });
      const y0 = hh + 2.4, y1 = frieze - 1.0;
      if (y1 - y0 > 4 && !hit(z - 1.4, z + 1.4, y0, y1 + 0.6)) {
        blocks.push([z - 1.4, z + 1.4, y0, y1 + 0.6, 'hoist']);
        put(batch, 'GB_Casemate.hoist_rail', 0, y0, z, { sy: y1 - y0 });
        put(batch, 'GB_Casemate.hoist_car', 0, y0 + (y1 - y0) * 0.42, z);
        put(batch, 'GB_Casemate.hoist_head', 0, y1, z);
      }
    } else if (theme.bay === 'portal') {
      put(batch, 'IC_Portal.grille', 0, 0, z, { sy: hh, sz: w - 0.1 });
      if (!hit(z - 2.3, z + 2.3, hh + 2.5, hh + 3.7)) {
        blocks.push([z - 2.3, z + 2.3, hh + 1.5, hh + 3.7, 'keystone']);
        put(batch, 'IC_Portal.keystone', 0, hh + 1.5, z);
        put(batch, 'IC_Portal.crest_light', 0, hh + 1.5, z);
      }
    } else if (theme.bay === 'blast') {
      put(batch, 'TG_Blast.door', 0, 0, z, { sy: hh, sz: w });
      put(batch, 'TG_Blast.chevrons', 0, 0, z, { sy: hh, sz: w });
      put(batch, 'TG_Blast.lock', 0, hh * 0.5, z);
    }
    if (theme.bay !== 'portal') {
      put(batch, 'RS_ServiceBay.strobe_housing', 0, hh + 1.5, z);
      put(batch, 'RS_ServiceBay.strobe', 0, hh + 1.8, z, { fx: { anim: [STROBE, 0.8, strobePhase] } });
    } else {
      // the portal keeps the source warning strobe beside its crest block
      put(batch, 'RS_ServiceBay.strobe_housing', 0, hh + 1.5, z - 3.2);
      put(batch, 'RS_ServiceBay.strobe', 0, hh + 1.8, z - 3.2, { fx: { anim: [STROBE, 0.8, strobePhase] } });
    }
  }

  // ---- cowled extractor fans (source pivot / spin) ----
  for (const { z, y, r, rate } of fans) {
    // the two heaviest sectors drop the stator struts behind the rotor sweep
    for (const name of theme.lean ? ['cowl', 'mount', 'void'] : ['cowl', 'mount', 'void', 'stator']) put(batch, `RS_FanHousing.${name}`, 0, y, z, { sy: r, sz: r });
    put(batch, 'RS_FanHousing.rotor', FACE - 0.6, y, z, { s: r, fx: { pivot: [FACE - 0.6, y, z], spin: [1, 0, 0, rate] } });
  }

  // ---- sign: the source neon tubes and backing, on stand-offs under a hood ----
  if (sign) {
    const { z, y, w, h: sh, color, anim, bars } = sign;
    batch.box('dark', 0.4, sh + 0.8, w + 0.8, FACE - 0.2, y - 0.4, z, 6, 0x222a34);
    for (const dy of [0, sh]) batch.box('neon', 0.16, 0.16, w, FACE - 0.5, y + dy, z, 8, color, 0, 1.3, anim);
    for (const dz of [-w / 2, w / 2]) batch.box('neon', 0.16, sh, 0.16, FACE - 0.5, y, z + dz, 8, color, 0, 1.3, anim);
    for (let k = 0; k < 3; k++) batch.box('neon', 0.12, 0.4, bars[k], FACE - 0.5, y + sh * (0.25 + k * 0.25), z, 8, color, 0, 0.7, anim);
    put(batch, 'RS_WallFrame.sign_hood', 0, y + sh + 0.45, z, { sz: w + 1.4 });
    if (!theme.lean) for (const sg of [-1, 1]) put(batch, 'RS_WallFrame.sign_arm', 0, y + sh * 0.5, z + sg * w * 0.3);
  }

  // ---- windows: source tuples, set in rows on the recessed field ----
  const rows = [];
  for (let yy = theme.rowStart; yy < frieze - 2.2; yy += 3.0) rows.push(yy);
  const kept = [];
  const windowClash = (zA, zB, yA, yB) => zA < z0 + 0.4 || zB > z1 - 0.4 || hit(zA, zB, yA, yB)
    || piers.some((p) => overlaps1(zA, zB, p.z - 1.5, p.z + 1.5) && yA < p.H + 0.2)
    || stiles.some(([sz, a, b]) => overlaps1(zA, zB, sz - 0.4, sz + 0.4) && overlaps1(yA, yB, a, b))
    || gallery.some(([s, e, gy]) => overlaps1(zA, zB, s, e) && overlaps1(yA, yB, gy - 0.45, gy + 1.25))
    || braces.some(([bz, gy]) => overlaps1(zA, zB, bz - 0.3, bz + 0.3) && overlaps1(yA, yB, gy - 2.1, gy + 1.25))
    || kept.some((k) => overlaps1(zA, zB, k[0] - 0.5, k[1] + 0.5) && overlaps1(yA, yB, k[2] - 0.4, k[3] + 0.4));
  for (const win of rec.windows) {
    // source size / warm flag / flicker tuple are kept; the pane takes the nearest free row and may slide
    // sideways out of a pier's shadow, so the seeded lit-window count survives the new structure
    const order = rows.slice().sort((a, b) => Math.abs(a - win.y) - Math.abs(b - win.y));
    let placed = null;
    for (const dz of [0, -2.4, 2.4, -3.8, 3.8]) {
      const zA = win.z + dz - win.dep / 2 - 0.15, zB = win.z + dz + win.dep / 2 + 0.15;
      const y = order.find((yy) => !windowClash(zA, zB, yy - 0.15, yy + win.hgt + 0.15));
      if (y !== undefined) { placed = { z: win.z + dz, y, zA, zB }; break; }
    }
    if (!placed) continue;
    const { z, y } = placed;
    kept.push([placed.zA, placed.zB, y - 0.15, y + win.hgt + 0.15]);
    if (!theme.lean) put(batch, 'RS_WallFrame.win_frame', 0, y + win.hgt / 2, z, { sy: win.hgt + 0.3, sz: win.dep + 0.3 });
    // the Gauntlet is shuttered: each seeded window shows only a slit of its light
    put(batch, 'RS_WallFrame.win_glass', 0, y + win.hgt / 2, z, { sy: theme.slits ? win.hgt * 0.24 : win.hgt, sz: win.dep, tint: win.warm ? 0xffb43a : 0x9fc8da, gain: win.warm ? 1.1 : 0.95, fx: win.anim ? { anim: win.anim } : null });
  }

  // ---- static gate pylons owned by this chunk (persist after the gate picture retires) ----
  for (const g of gatesOwn) {
    for (const name of ['pylon_body', 'pylon_footing', 'pylon_cheeks', 'pylon_bands', 'pylon_crown']) put(batch, `RS_GateHousing.${name}`, 0, 0, g.z);
    put(batch, 'RS_GateHousing.pylon_beacon', 0, 0, g.z, { fx: { anim: [STROBE, 0.9, fract(g.z / 53)] } });
  }

  // ---- the sector landmark ----
  if (core) LANDMARKS[LM.kind](batch, rec, core, h, index, level, fanVents);
}

const LANDMARKS = {
  /** REACTOR SPINE: the containment bastion. */
  core(batch, rec, core, h, index, level, fanVents) {
    const { zc, Hb } = core, sy = Hb - 5;
    put(batch, 'RS_ReactorCore.podium', 0, 0, zc);
    for (const name of ['body', 'slot_bars', 'fins']) put(batch, `RS_ReactorCore.${name}`, 0, 5, zc, { sy });
    put(batch, 'RS_ReactorCore.slot_glow', 0, 5, zc, { sy, fx: { anim: [BREATHE, 0.5, 0] } });
    put(batch, 'RS_ReactorCore.drum', 0, 0, zc, { sy: Hb + 0.9 });
    for (const name of ['crown', 'dome', 'stacks']) put(batch, `RS_ReactorCore.${name}`, 0, Hb, zc);
    put(batch, 'RS_ReactorCore.dome_band', 0, Hb, zc, { fx: { anim: [BREATHE, 0.35, 0.18] } });
    [-1, 1].forEach((dx, k) => put(batch, 'RS_ReactorCore.strobe', 33.5 + dx, Hb + 11.1, zc, { fx: { anim: [STROBE, 0.6, k * 0.5] } }));
    for (const fan of fanVents) put(batch, 'RS_ReactorCore.vent', 0, fan.y, fan.z);
    // approved cooling stack reuse: a pair of exchanger stacks flanking the bastion, tied in by header stubs
    const own = new Rng((0x52535043 ^ level.seed ^ Math.imul(index, 2654435761)) >>> 0);
    for (const sg of [-1, 1]) {
      const sx = 23.3, sz = zc + sg * 10.6;
      if (rec.props.some((p) => p.kind === 'stack' && Math.abs(p.x - sx) < 4.6 && Math.abs(p.z - sz) < 4.6)) continue;   // a source stack already stands here
      if (appendImportedCoolingStack(batch, own, sx, sz, () => {})) {
        put(batch, 'RS_PipeRun.main', sx + 1.9, 1.3, sz, { sx: 0.3, sy: 0.3, sz: 2.2, rotY: Math.PI / 2 });
      }
    }
  },

  /** OUTER FORTRESS: the control tower. */
  tower(batch, rec, { zc }, h) {
    const top = h + 2;
    put(batch, 'AF_Tower.base', 0, 0, zc);
    put(batch, 'AF_Tower.shaft', 0, 4, zc, { sy: top - 4 });
    put(batch, 'AF_Tower.shaft_ribs', 0, 4, zc, { sy: top - 4 });
    for (const name of ['cab', 'cab_glass', 'cab_trim', 'neck_lights', 'roof_gear']) put(batch, `AF_Tower.${name}`, 0, top, zc);
    put(batch, 'AF_Tower.radar', 29.6, top + 18.5, zc, { fx: { pivot: [29.6, top + 18.5, zc], spin: [0, 1, 0, 0.9] } });
    put(batch, 'AF_Tower.beacon', 32.4, top + 23.4, zc, { fx: { anim: [STROBE, 0.7, 0] } });
  },

  /** GUN BATTERIES: the fire-control director. */
  director(batch, rec, { zc }, h) {
    const top = h + 6;
    put(batch, 'GB_Director.barbette', 0, 0, zc);
    put(batch, 'GB_Director.tower', 0, 5, zc, { sy: top - 5 });
    put(batch, 'GB_Director.plates', 0, h - 5, zc);
    put(batch, 'GB_Director.slits', 0, h - 5, zc);
    for (const name of ['house', 'house_trim', 'mast']) put(batch, `GB_Director.${name}`, 0, top, zc);
    put(batch, 'GB_Director.rangefinder', 30.8, top + 5.9, zc, { fx: { pivot: [30.8, top + 5.9, zc], spin: [0, 1, 0, 0.25] } });
    put(batch, 'GB_Director.beacon', 33.2, top + 11.0, zc, { fx: { anim: [STROBE, 0.7, 0] } });
  },

  /** INNER CITADEL: the command keep. */
  keep(batch, rec, { zc }, h) {
    const top = h + 6;
    put(batch, 'IC_Keep.base', 0, 0, zc);
    for (const name of ['body', 'buttress']) put(batch, `IC_Keep.${name}`, 0, 5, zc, { sy: top - 5 });
    put(batch, 'IC_Keep.slot', 0, 5, zc, { sy: top - 5, fx: { anim: [BREATHE, 0.22, 0] } });
    for (const name of ['tiers', 'tier_trim', 'masts']) put(batch, `IC_Keep.${name}`, 0, top, zc);
    put(batch, 'IC_Keep.bridge_band', 0, top, zc, { fx: { anim: [BREATHE, 0.22, 0.4] } });
    [-1.6, 1.6].forEach((dz, k) => put(batch, 'IC_Keep.beacon', 31.4, top + 20.5, zc + dz, { fx: { anim: [STROBE, 0.6, k * 0.5] } }));
  },

  /** THE GAUNTLET: the siren tower. */
  siren(batch, rec, { zc }, h) {
    const top = h + 4;
    put(batch, 'TG_Siren.base', 0, 0, zc);
    for (const name of ['body', 'slot_fins']) put(batch, `TG_Siren.${name}`, 0, 5, zc, { sy: top - 5 });
    put(batch, 'TG_Siren.slots', 0, 5, zc, { sy: top - 5, fx: { anim: [BREATHE, 0.5, 0] } });
    for (const name of ['blades', 'horns']) put(batch, `TG_Siren.${name}`, 0, top, zc);
    put(batch, 'TG_Siren.beacon_bar', 30.5, top + 15.3, zc, { fx: { pivot: [30.5, top + 15.3, zc], spin: [0, 1, 0, 1.6] } });
    put(batch, 'TG_Siren.beacon', 30.5, top + 15.66, zc, { fx: { anim: [STROBE, 1.1, 0] } });
  },
};

/* ------------------------------------------------------------------ */
/* Gate ornament (feature batch; retires with the source gate picture) */
/* ------------------------------------------------------------------ */
export function composeGateOrnament(batch, f) {
  const z = f.z;
  for (let y = 2; y < TOP - 1; y += 3) {
    for (const rotY of [0, Math.PI]) {
      put(batch, 'RS_GateHousing.collar', 0, y, z, { rotY });
      put(batch, 'RS_GateHousing.emitter', 0, y, z, { rotY, fx: { anim: [BREATHE, 1.4, y / TOP] } });
    }
  }
  for (const name of ['truss', 'manifold']) put(batch, `RS_GateHousing.${name}`, 0, 0, z);
  for (let x = -CORRIDOR_HALF; x <= CORRIDOR_HALF; x += 3) {
    put(batch, 'RS_GateHousing.lamp_arm', x, 0, z);
    // source chase lamp, unchanged tuple/position
    batch.box('neon', 0.6, 0.3, 0.6, x, TOP - 0.25, z - 1.8, 8, 0xff9a4a, 0, 1.3, { anim: [CHASE, 1.4, (Math.abs(x) / 18) % 1] });
  }
}
