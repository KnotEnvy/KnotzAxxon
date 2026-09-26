/**
 * Fortress geometry streamer.
 *
 * The level is sliced into CHUNK_LEN chunks. Each chunk merges its dozens of
 * boxes down to one mesh per material, so a whole visible fortress costs a
 * handful of draw calls instead of hundreds. Chunks are built lazily ahead of
 * the player (one per frame, to avoid hitching) and disposed once behind.
 * Vertices are stamped straight into flat arrays, so a detailed chunk builds
 * in a few milliseconds.
 *
 * Per-block variation comes from vertex colours, which is why the structural
 * materials are declared with `vertexColors: true`.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { taperedBox } from '../render/GeoUtils.js';
import { LIGHT_ANIM } from '../render/Materials.js';
import { Rng, clamp, lerp, TAU } from '../core/Utils.js';
import { CHUNK_LEN, DECK_HALF, CORRIDOR_HALF, ALT_MAX, SECTOR_KINDS } from './Level.js';

const _c = new THREE.Color();
const { STROBE, CHASE, BREATHE, FLICKER } = LIGHT_ANIM;

/** Lit structure gets baked contact shading; emissive and flat buckets do not. */
const AO_KEYS = new Set(['hull', 'deck', 'dark', 'grate', 'hazard']);
/** Buckets whose material rotates vertices; they always carry pivot/spin data. */
const SPIN_KEYS = new Set(['spin', 'rock']);
/** Flat or self-lit buckets never cast shadows; spinning ones cannot. */
const NO_CAST = new Set(['neon', 'glass', 'paint', 'spin', 'rock']);

/** Unit cube, non-indexed, bottom face at y = -0.5: the template every box is stamped from. */
const BOX = (() => {
  const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const out = { p: g.attributes.position.array.slice(), n: g.attributes.normal.array.slice(), count: g.attributes.position.count };
  g.dispose();
  return out;
})();

/** Growable float buffer: chunk building appends without per-piece allocation. */
class FloatBuf {
  constructor(size = 8192) { this.a = new Float32Array(size); this.n = 0; }
  reserve(k) {
    if (this.n + k <= this.a.length) return;
    let len = this.a.length * 2;
    while (len < this.n + k) len *= 2;
    const b = new Float32Array(len);
    b.set(this.a.subarray(0, this.n));
    this.a = b;
  }
  view() { return this.a.slice(0, this.n); }
}

class Bucket {
  constructor(key) {
    this.key = key;
    this.pos = new FloatBuf(); this.nrm = new FloatBuf(); this.uv = new FloatBuf(); this.col = new FloatBuf();
    this.anim = key === 'neon' ? new FloatBuf() : null;
    this.pivot = SPIN_KEYS.has(key) ? new FloatBuf() : null;
    this.spin = SPIN_KEYS.has(key) ? new FloatBuf() : null;
  }
  reserve(verts) {
    this.pos.reserve(verts * 3); this.nrm.reserve(verts * 3); this.uv.reserve(verts * 2); this.col.reserve(verts * 3);
    this.anim?.reserve(verts * 3); this.pivot?.reserve(verts * 3); this.spin?.reserve(verts * 4);
  }
  reset() {
    this.pos.n = this.nrm.n = this.uv.n = this.col.n = 0;
    if (this.anim) this.anim.n = 0;
    if (this.pivot) this.pivot.n = this.spin.n = 0;
    return this;
  }
}

/** Scratch buckets are recycled across chunk builds; uploads copy out of them. */
const BUCKET_POOL = new Map();

/**
 * Accumulates geometry per material bucket straight into flat vertex arrays,
 * then uploads each bucket once. Boxes, by far the commonest piece, are
 * stamped from a template with no intermediate BufferGeometry at all.
 */
class Batch {
  constructor() {
    this.buckets = new Map();
    this.surfaces = [];
    this.captureSurfaces = false;
  }

  _bucket(key) {
    let b = this.buckets.get(key);
    if (!b) this.buckets.set(key, (b = BUCKET_POOL.get(key)?.pop()?.reset() ?? new Bucket(key)));
    return b;
  }

  /**
   * Write one vertex. (x,y,z)/(nx,ny,nz) are final world values; `k` scales the tint.
   */
  _vertex(b, x, y, z, nx, ny, nz, u, v, r, g, bl, k, fx, px, py, pz) {
    let i = b.pos.n; const P = b.pos.a; P[i] = x; P[i + 1] = y; P[i + 2] = z; b.pos.n += 3;
    const N = b.nrm.a; N[i] = nx; N[i + 1] = ny; N[i + 2] = nz; b.nrm.n += 3;
    const C = b.col.a; C[i] = r * k; C[i + 1] = g * k; C[i + 2] = bl * k; b.col.n += 3;
    const j = b.uv.n; b.uv.a[j] = u; b.uv.a[j + 1] = v; b.uv.n += 2;
    if (b.anim) {
      const a = fx?.anim, A = b.anim.a;
      A[i] = a ? a[0] : 0; A[i + 1] = a ? a[1] : 0; A[i + 2] = a ? a[2] : 0; b.anim.n += 3;
    } else if (b.pivot) {
      const pv = fx?.pivot, sp = fx?.spin, V = b.pivot.a, S = b.spin.a, s4 = b.spin.n;
      V[i] = pv ? pv[0] : px; V[i + 1] = pv ? pv[1] : py; V[i + 2] = pv ? pv[2] : pz; b.pivot.n += 3;
      S[s4] = sp ? sp[0] : 0; S[s4 + 1] = sp ? sp[1] : 1; S[s4 + 2] = sp ? sp[2] : 0; S[s4 + 3] = sp ? sp[3] : 0; b.spin.n += 4;
    }
  }

  /**
   * Add an arbitrary geometry (consumed). Rotated about Y, then translated.
   * UVs are a box projection on each face's dominant axis, so texel density
   * matches the boxes around it.
   * @param {object} [fx] `anim: [mode, rate, phase]` for neon; `pivot: [x,y,z]`,
   *   `spin: [ax, ay, az, radPerSec]` for spinning buckets (pivot is world space)
   */
  add(key, geo, x, y, z, uvScale, color, rotY = 0, gain = 1, fx = null) {
    this._emit(key, geo, x, y, z, 1, 1, 1, rotY, uvScale, color, gain, fx);
    geo.dispose();
  }

  /**
   * Stamp a cached template (not consumed) with a non-uniform scale:
   * pipes, drums, fans, dishes and parked aircraft reuse one geometry each.
   */
  stamp(key, tpl, x, y, z, uvScale, color, { sx = 1, sy = 1, sz = 1, s = 0, rotY = 0, gain = 1, fx = null } = {}) {
    if (s) sx = sy = sz = s;
    this._emit(key, tpl, x, y, z, sx, sy, sz, rotY, uvScale, color, gain, fx);
  }

  _emit(key, geo, x, y, z, sx, sy, sz, rotY, uvScale, color, gain, fx) {
    const b = this._bucket(key);
    const P = geo.attributes.position.array, N = geo.attributes.normal?.array, I = geo.index?.array;
    const count = I ? I.length : P.length / 3;
    b.reserve(count);
    _c.setHex(color);
    // Emissive pieces push the vertex colour above 1 so the bloom pass can
    // pick them out; structural pieces stay at gain 1 and are just tinted.
    if (gain !== 1) _c.multiplyScalar(gain);
    const cos = Math.cos(rotY), sin = Math.sin(rotY), inv = 1 / uvScale;
    const scaled = sx !== 1 || sy !== 1 || sz !== 1;
    // Baked ambient occlusion: a piece darkens toward its footing and its
    // upward faces catch a little extra sky. Free depth cues, no extra pass.
    const ao = AO_KEYS.has(key);
    let minY = Infinity, maxY = -Infinity;
    if (ao) for (let i = 1; i < P.length; i += 3) { const vy = P[i] * sy; if (vy < minY) minY = vy; if (vy > maxY) maxY = vy; }
    const span = maxY - minY;
    const tri = _tri;
    for (let t = 0; t < count; t += 3) {
      for (let k = 0; k < 3; k++) {
        const vi = (I ? I[t + k] : t + k) * 3;
        const lx = P[vi] * sx, lz = P[vi + 2] * sz;
        tri[k * 3] = lx * cos + lz * sin + x;
        tri[k * 3 + 1] = P[vi + 1] * sy + y;
        tri[k * 3 + 2] = -lx * sin + lz * cos + z;
      }
      // face normal picks the box-projection plane
      const e1x = tri[3] - tri[0], e1y = tri[4] - tri[1], e1z = tri[5] - tri[2];
      const e2x = tri[6] - tri[0], e2y = tri[7] - tri[1], e2z = tri[8] - tri[2];
      const fnx = Math.abs(e1y * e2z - e1z * e2y), fny = Math.abs(e1z * e2x - e1x * e2z), fnz = Math.abs(e1x * e2y - e1y * e2x);
      const plane = fnx >= fny && fnx >= fnz ? 0 : fny >= fnz ? 1 : 2;
      for (let k = 0; k < 3; k++) {
        const vi = (I ? I[t + k] : t + k) * 3;
        const wx = tri[k * 3], wy = tri[k * 3 + 1], wz = tri[k * 3 + 2];
        let lnx = N ? N[vi] : 0, lny = N ? N[vi + 1] : 1, lnz = N ? N[vi + 2] : 0;
        if (scaled) {
          // normals take the inverse scale, then renormalise
          lnx /= sx; lny /= sy; lnz /= sz;
          const l = Math.hypot(lnx, lny, lnz) || 1;
          lnx /= l; lny /= l; lnz /= l;
        }
        const nx = lnx * cos + lnz * sin, nz = -lnx * sin + lnz * cos;
        const u = (plane === 0 ? wz : wx) * inv, v = (plane === 1 ? wz : wy) * inv;
        let shade = 1;
        if (ao) {
          if (span > 0.6) shade = 0.58 + 0.42 * Math.sqrt(Math.max(0, wy - y - minY) / span);
          if (lny > 0.7) shade *= 1.1;
        }
        this._vertex(b, wx, wy, wz, nx, lny, nz, u, v, _c.r, _c.g, _c.b, shade, fx, x, y, z);
      }
    }
  }

  /** Convenience: box whose origin is its bottom-centre, stamped from the template. */
  box(key, w, h, d, x, y, z, uvScale, color, rotY = 0, gain = 1, fx = null) {
    if (this.captureSurfaces) this.surfaces.push({ minX:x-w/2, maxX:x+w/2, minZ:z-d/2, maxZ:z+d/2, top:y+h });
    const b = this._bucket(key);
    b.reserve(BOX.count);
    _c.setHex(color);
    if (gain !== 1) _c.multiplyScalar(gain);
    const cos = Math.cos(rotY), sin = Math.sin(rotY), inv = 1 / uvScale;
    const ao = AO_KEYS.has(key);
    const { p, n } = BOX;
    for (let i = 0; i < BOX.count; i++) {
      const lx = p[i * 3] * w, ly = (p[i * 3 + 1] + 0.5) * h, lz = p[i * 3 + 2] * d;
      const wx = lx * cos + lz * sin + x, wy = ly + y, wz = -lx * sin + lz * cos + z;
      const lnx = n[i * 3], ny = n[i * 3 + 1], lnz = n[i * 3 + 2];
      const nx = lnx * cos + lnz * sin, nz = -lnx * sin + lnz * cos;
      const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
      const plane = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
      const u = (plane === 0 ? wz : wx) * inv, v = (plane === 1 ? wz : wy) * inv;
      let s = 1;
      if (ao) {
        if (h > 0.6) s = 0.58 + 0.42 * Math.sqrt(ly / h);
        if (ny > 0.7) s *= 1.1;
      }
      this._vertex(b, wx, wy, wz, nx, ny, nz, u, v, _c.r, _c.g, _c.b, s, fx, x, y, z);
    }
  }

  /** A small emissive lamp; `anim` is [mode, rate, phase]. */
  lamp(x, y, z, size, color, gain, anim = null) {
    this.box('neon', size, size, size, x, y, z, 8, color, 0, gain, anim ? { anim } : null);
  }

  merge(materialFor, group, castShadow = true, receiveShadow = true) {
    for (const [key, b] of this.buckets) {
      if (!b.pos.n) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(b.pos.view(), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(b.nrm.view(), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(b.uv.view(), 2));
      g.setAttribute('color', new THREE.BufferAttribute(b.col.view(), 3));
      if (b.anim) g.setAttribute('aAnim', new THREE.BufferAttribute(b.anim.view(), 3));
      if (b.pivot) {
        g.setAttribute('aPivot', new THREE.BufferAttribute(b.pivot.view(), 3));
        g.setAttribute('aSpin', new THREE.BufferAttribute(b.spin.view(), 4));
      }
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, materialFor(key));
      mesh.castShadow = castShadow && !NO_CAST.has(key);
      mesh.receiveShadow = receiveShadow && key !== 'neon' && key !== 'glass';
      // Rotating geometry can leave its rest-pose bounds.
      if (SPIN_KEYS.has(key)) mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
    }
    for (const [key, b] of this.buckets) {
      if (!BUCKET_POOL.has(key)) BUCKET_POOL.set(key, []);
      BUCKET_POOL.get(key).push(b);
    }
    this.buckets.clear();
  }
}

const _tri = new Float32Array(9);

/* ------------------------------------------------------------------ */
/* Prop geometry                                                       */
/* ------------------------------------------------------------------ */

/** Closed parabolic-ish dish facing +Z with a feed horn, origin at the hub. */
function dishGeometry(r) {
  const bowl = new THREE.CylinderGeometry(r, r * 0.28, r * 0.42, 14, 1, false);
  bowl.rotateX(Math.PI / 2);
  const horn = new THREE.CylinderGeometry(r * 0.05, r * 0.05, r * 0.9, 5).rotateX(Math.PI / 2).translate(0, 0, r * 0.55);
  const hub = new THREE.BoxGeometry(r * 0.35, r * 0.35, r * 0.3).translate(0, 0, -r * 0.3);
  return mergeFlat([bowl, horn, hub]);
}

/** Four-bladed fan in a square housing, facing -X (toward the corridor). */
function fanGeometry(r) {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    parts.push(new THREE.BoxGeometry(0.12, r * 0.92, r * 0.28).translate(0, r * 0.46, 0).rotateX(i * Math.PI / 2 + 0.3));
  }
  parts.push(new THREE.CylinderGeometry(r * 0.16, r * 0.16, 0.3, 8).rotateZ(Math.PI / 2));
  return mergeFlat(parts);
}

/** Low-poly tumbling rock: displaced icosphere with deterministic dents. */
function rockGeometry(rng, r) {
  const g = new THREE.IcosahedronGeometry(r, rng.bool(0.4) ? 1 : 0);
  const p = g.attributes.position;
  const sx = rng.range(0.7, 1.3), sy = rng.range(0.55, 1.0), sz = rng.range(0.7, 1.4);
  const seed = rng.next() * 10;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // Hash on the position so shared corners move together and stay watertight.
    const h = Math.sin(x * 3.1 + y * 5.7 + z * 2.3 + seed) * 43758.5453;
    const k = 0.78 + (h - Math.floor(h)) * 0.38;
    p.setXYZ(i, x * k * sx, y * k * sy, z * k * sz);
  }
  g.computeVertexNormals();
  return g;
}

/** Parked enemy fighter silhouette, nose toward -Z (they face the intruder). */
function parkedFighterParts() {
  // Extrusion normalises shape winding, so a mirrored outline stays front-facing.
  const wings = [1, -1].map(side => {
    const wing = new THREE.Shape();
    wing.moveTo(0, -0.6); wing.lineTo(side * 2.9, 0.9); wing.lineTo(side * 3.0, 1.35); wing.lineTo(side * 0.4, 0.8); wing.closePath();
    return new THREE.ExtrudeGeometry(wing, { depth: 0.14, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, 0.9, 0.2);
  });
  return {
    hull: [
      new THREE.BoxGeometry(1.1, 0.7, 4.2).translate(0, 1.0, 0),
      new THREE.ConeGeometry(0.55, 1.6, 6).rotateX(-Math.PI / 2).translate(0, 1.0, -2.8),
      ...wings,
    ],
    dark: [
      new THREE.BoxGeometry(0.16, 1.1, 1.3).translate(0, 1.7, 1.5),
      new THREE.CylinderGeometry(0.08, 0.1, 0.9, 5).translate(0, 0.45, -1.4),
      new THREE.CylinderGeometry(0.08, 0.1, 0.9, 5).translate(-1, 0.45, 0.8),
      new THREE.CylinderGeometry(0.08, 0.1, 0.9, 5).translate(1, 0.45, 0.8),
    ],
  };
}

/** Shared prop templates, built once and stamped with scale for every chunk. */
const TPL = {
  get pipeZ() { return (this._pipeZ ??= new THREE.CylinderGeometry(1, 1, 1, 8).rotateX(Math.PI / 2)); },
  get drum() { return (this._drum ??= new THREE.CylinderGeometry(1, 1, 1, 10).translate(0, 0.5, 0)); },
  get fan() { return (this._fan ??= fanGeometry(1)); },
  get dish() { return (this._dish ??= dishGeometry(1).rotateX(-0.4)); },
  get pad() { return (this._pad ??= new THREE.RingGeometry(3.3, 3.8, 24).rotateX(-Math.PI / 2)); },
  get padSmall() { return (this._padSmall ??= new THREE.RingGeometry(2.6, 3.0, 20).rotateX(-Math.PI / 2)); },
  get fighter() {
    if (!this._fighter) {
      const parts = parkedFighterParts();
      this._fighter = { hull: mergeFlat(parts.hull), dark: mergeFlat(parts.dark) };
    }
    return this._fighter;
  },
};

/** Release the prop templates (application shutdown). */
export function disposeFortressTemplates() {
  for (const key of ['_pipeZ', '_drum', '_fan', '_dish', '_pad', '_padSmall']) { TPL[key]?.dispose(); TPL[key] = null; }
  if (TPL._fighter) { TPL._fighter.hull.dispose(); TPL._fighter.dark.dispose(); TPL._fighter = null; }
}

function mergeFlat(parts) {
  const flat = parts.map(g => (g.index ? g.toNonIndexed() : g));
  for (const g of flat) { g.deleteAttribute('uv1'); g.clearGroups(); }
  const merged = mergeGeometries(flat, false);
  for (const g of new Set([...parts, ...flat])) g.dispose();
  return merged;
}
/** Per-sector dressing palette. Index matches the campaign order in Level.js. */
const THEMES = [
  { name: 'airfield', conduit: 0x3ad6b0, conduitAnim: null, accent: 0x8bcbd0, warm: 0xffb43a },
  { name: 'battery', conduit: 0xffb43a, conduitAnim: null, accent: 0xffbf69, warm: 0xffb43a },
  null,
  { name: 'reactor', conduit: 0xff7a3a, conduitAnim: [BREATHE, 0.35, 0], accent: 0xffbf69, warm: 0xff8a3a },
  null,
  { name: 'citadel', conduit: 0xffc36a, conduitAnim: [BREATHE, 0.22, 0], accent: 0xe5c2a0, warm: 0xffb43a },
  { name: 'gauntlet', conduit: 0xff3d55, conduitAnim: [BREATHE, 0.5, 0], accent: 0xe5c2a0, warm: 0xff6a3a },
];
const themeFor = (sector) => THEMES[sector?.index ?? 0] ?? THEMES[0];

export class Fortress {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../render/Materials.js').Materials} materials
   * @param {import('./Level.js').Level} level
   * @param {object} quality
   */
  constructor(scene, materials, level, quality) {
    this.scene = scene;
    this.materials = materials;
    this.level = level;
    this.quality = quality;

    this.root = new THREE.Group();
    this.root.matrixAutoUpdate = false;
    scene.add(this.root);

    /** chunkIndex -> THREE.Group */
    this.chunks = new Map();
    this.buildQueue = [];

    this._matFor = (key) => {
      switch (key) {
        case 'hull': return materials.hull;
        case 'deck': return materials.deck;
        case 'dark': return materials.darkMetal;
        case 'grate': return materials.grating;
        case 'hazard': return materials.hazard;
        // All emissive strips share one vertex-coloured material, so a chunk's
        // entire lighting rig is a single draw call instead of three.
        case 'neon': return materials.neonVertex;
        case 'paint': return materials.paint ?? materials.deck;
        case 'rock': return materials.rock ?? materials.darkMetal;
        case 'spin': return materials.spinMetal ?? materials.darkMetal;
        default: return materials.hull;
      }
    };

    /** Animated pieces (gates, rotating radar dishes) live here. */
    this.animated = [];
    this.rearObstacles = [];
    /** Ambient smoke/steam/flak sources, read by the effects director. */
    this.emitters = [];
  }

  /* ------------------------------------------------------------------ */
  /* Streaming                                                           */
  /* ------------------------------------------------------------------ */

  update(playerZ, dt, time, frame) {
    const ahead = this.quality.drawDistance;
    const behind = 90;
    const first = Math.floor((playerZ - behind) / CHUNK_LEN);
    const last = Math.floor((playerZ + ahead) / CHUNK_LEN);

    // queue anything missing: the chunk under the ship first, then ahead, then behind
    for (let i = first; i <= last; i++) {
      if (!this.chunks.has(i) && !this.buildQueue.includes(i)) this.buildQueue.push(i);
    }
    const here = Math.floor(playerZ / CHUNK_LEN);
    const urgency = (i) => Math.abs(i - here) + (i < here ? 0.5 : 0);
    this.buildQueue.sort((a, b) => urgency(a) - urgency(b));

    // build at most a couple per frame so streaming never causes a hitch
    if (frame === undefined || frame !== this._buildFrame) {
      this._buildFrame = frame;
      this._buildBudget = 2;
    }
    // A second build in the same frame only happens if the first left time
    // in a small slice; the first always runs so streaming keeps moving.
    const sliceEnd = performance.now() + 6;
    while (this._buildBudget > 0 && this.buildQueue.length) {
      if (this._buildBudget < 2 && performance.now() > sliceEnd) break;
      const i = this.buildQueue.shift();
      if (i < first || i > last) continue;
      this._buildBudget--;
      this.chunks.set(i, this._buildChunk(i));
    }

    // retire chunks behind the player
    for (const [i, group] of this.chunks) {
      if (i < first - 1 || i > last + 2) {
        this._disposeChunk(group);
        this.chunks.delete(i);
      }
    }

    for (const a of this.animated) a.update?.(dt, time, playerZ);
    for (const obstacle of this.rearObstacles) {
      // Keep approaching barriers opaque; retire their picture after clearing
      // them so they cannot obscure the next encounter. Collision data is intact.
      obstacle.group.visible = obstacle.endZ >= playerZ - 4;
    }
  }

  _disposeChunk(group) {
    group.traverse((o) => {
      if (o.isMesh) o.geometry.dispose();
    });
    this.root.remove(group);
    this.rearObstacles = this.rearObstacles.filter(o => o.owner !== group);
    this.emitters = this.emitters.filter(e => e.owner !== group);
    for (let i = this.animated.length - 1; i >= 0; i--) {
      if (this.animated[i].owner === group) this.animated.splice(i, 1);
    }
  }

  /** Highest decorative deck surface beneath the guide footprint.
   * Does not include walls or alter physical collision/altitude rules.
   */
  surfaceAt(x, z, belowY, radius = 1.6) {
    let height = 0;
    const first = Math.floor((z-radius)/CHUNK_LEN), last = Math.floor((z+radius)/CHUNK_LEN);
    for (let i=first;i<=last;i++) {
      for (const surface of this.chunks.get(i)?.userData.deckSurfaces ?? []) {
        if(surface.top + 0.08 >= belowY) continue;
        if(x+radius<surface.minX || x-radius>surface.maxX || z+radius<surface.minZ || z-radius>surface.maxZ) continue;
        height=Math.max(height,surface.top);
      }
    }
    return height;
  }

  clear() {
    for (const [, g] of this.chunks) this._disposeChunk(g);
    this.chunks.clear();
    this.buildQueue.length = 0;
    this.animated.length = 0;
    this.rearObstacles.length = 0;
    this.emitters.length = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Chunk construction                                                  */
  /* ------------------------------------------------------------------ */

  _buildChunk(index) {
    const z0 = index * CHUNK_LEN;
    const z1 = z0 + CHUNK_LEN;
    const group = new THREE.Group();
    group.matrixAutoUpdate = false;
    this.root.add(group);

    const rng = new Rng((index * 2654435761 + this.level.seed) >>> 0);
    const sector = this.level.sectorAt(z0 + CHUNK_LEN * 0.5);
    const batch = new Batch();
    const emit = (kind, x, y, z, rate = 1, dir = null) => this.emitters.push({ owner: group, kind, x, y, z, rate, dir, t: rng.next() });

    if (!sector) return group;

    if (sector.kind === SECTOR_KINDS.FORTRESS) {
      this._deck(batch, rng, z0, sector);
      this._trenchWalls(batch, rng, z0, sector);
      this._wallDressing(batch, rng, z0, sector, emit);
      this._deckProps(batch, rng, z0, sector, emit);
      this._skyline(batch, rng, z0, sector, emit);
      this._sectorEdges(batch, z0, z1, sector);
    } else if (sector.kind === SECTOR_KINDS.BOSS) {
      this._arena(batch, rng, z0, sector);
      this._sectorEdges(batch, z0, z1, sector);
    } else {
      this._voidProps(batch, rng, z0, sector);
    }

    // features that own real geometry
    for (const f of this.level.features) {
      if (f.z < z0 || f.z >= z1) continue;
      if (f.kind === 'wall' || f.kind === 'arch' || f.kind === 'gate' || f.kind === 'fence') {
        const obstacle = new THREE.Group();
        group.add(obstacle);
        const featureBatch = new Batch();
        if (f.kind === 'gate') this._gate(obstacle, f, group, featureBatch);
        else if (f.kind === 'fence') this._fence(obstacle, f, featureBatch, rng);
        else if (f.kind === 'wall') this._wall(featureBatch, f, rng);
        else this._arch(featureBatch, f, rng);
        featureBatch.merge(this._matFor, obstacle);
        this.rearObstacles.push({ owner: group, group: obstacle, endZ: f.z + (f.thickness ?? 7) / 2 });
      } else if (f.kind === 'platform') this._platform(batch, f, rng);
      else if (f.kind === 'debrisRing') this._debrisRing(batch, f, rng);
    }

    group.userData.deckSurfaces = batch.surfaces;
    batch.merge(this._matFor, group);
    return group;
  }

  /* --- deck ---------------------------------------------------------- */

  _deck(batch, rng, z0, sector) {
    batch.captureSurfaces = true;
    const zc = z0 + CHUNK_LEN / 2;
    const W = DECK_HALF * 2;
    const theme = themeFor(sector);

    // main slab
    batch.box('deck', W, 2.4, CHUNK_LEN, 0, -2.4, zc, 11, 0xd8dee6);

    // Recessed centre channel with sector-tinted centreline dashes. Saturated
    // cyan belongs to the player's own bolts and trim, so the lane never
    // swallows your fire; a slow chase runs the dashes toward the fortress.
    batch.box('grate', 7, 0.35, CHUNK_LEN, 0, -0.12, zc, 4, 0x9aa6b4);
    for (let z = z0 + 3; z < z0 + CHUNK_LEN; z += 8) {
      const anim = theme.conduitAnim ? [theme.conduitAnim[0], theme.conduitAnim[1], rng.next()] : [CHASE, 0.45, ((-z / 96) % 1 + 1) % 1];
      batch.box('neon', 1.1, 0.1, 5, 0, 0.22, z + 2.5, 10, theme.conduit, 0, 0.42, { anim });
    }

    // Small runway edge dashes share the existing emissive batch.
    const stripeColor = theme.accent;
    for (let i=0;i<4;i++) for (const side of [-1,1]) {
      batch.box('neon', i===0 ? 2.8 : 1.5, .025, .45, side*23, .72, z0+12+i*24, 10, stripeColor, 0, .28);
    }

    // surface plating variation
    const plates = rng.int(5, 5 + Math.round(CHUNK_LEN / 12));
    for (let i = 0; i < plates; i++) {
      const w = rng.range(6, 17);
      const d = rng.range(9, 26);
      const x = rng.range(-DECK_HALF + w / 2, DECK_HALF - w / 2);
      const z = z0 + rng.range(d / 2, CHUNK_LEN - d / 2);
      if (Math.abs(x) < 5) continue; // keep the centre channel clear
      batch.box('deck', w, rng.range(0.18, 0.7), d, x, 0, z, 9, rng.bool(0.3) ? 0x8f9aa8 : 0xc4ccd6);
    }

    // pipe runs and vents
    for (let i = 0; i < rng.int(2, 5); i++) {
      const side = rng.bool() ? 1 : -1;
      const x = side * rng.range(DECK_HALF * 0.32, DECK_HALF - 2);
      batch.box('dark', rng.range(0.7, 1.6), rng.range(0.25, 0.45), CHUNK_LEN, x, 0.1, z0 + CHUNK_LEN / 2, 5, 0xffffff);
    }
    for (let i = 0; i < rng.int(1, 4); i++) {
      const x = rng.range(-DECK_HALF + 4, DECK_HALF - 4);
      const z = z0 + rng.range(4, CHUNK_LEN - 4);
      if (Math.abs(x) < 6) continue;
      batch.box('grate', rng.range(3, 6), 0.3, rng.range(3, 6), x, 0.02, z, 3, 0x7f8a99);
      if (rng.bool(0.4)) batch.box('neon', 1.1, 0.06, 1.1, x, 0.34, z, 8, theme.warm, 0, 0.7, { anim: [BREATHE, 0.5, rng.next()] });
    }
    batch.captureSurfaces = false;

    /* --- painted runway ------------------------------------------------
       Corridor edge dashes mark the real flight envelope; chevrons point the
       way. Paint sits flush, so it never reads as an obstacle.             */
    const paintWhite = 0xc9d2da, paintAmber = 0xe0a040;
    for (const side of [-1, 1]) {
      for (let z = z0 + 2; z < z0 + CHUNK_LEN - 4; z += 10) {
        batch.box('paint', 0.42, 0.02, 6, side * (CORRIDOR_HALF + 0.9), 0.005, z + 3, 6, paintWhite);
      }
    }
    for (let z = z0 + 20; z < z0 + CHUNK_LEN; z += 48) {
      for (const lane of [-9, 9]) this._chevron(batch, lane, z, paintAmber);
    }
    // Runway approach lights just outside the envelope: a chase that runs
    // with the ship sells speed without adding screen-filling glow.
    for (const side of [-1, 1]) {
      for (let z = z0 + 4; z < z0 + CHUNK_LEN; z += 8) {
        batch.box('neon', 0.55, 0.1, 0.55, side * (CORRIDOR_HALF + 2.4), 0.02, z, 8, 0xdff3ff, 0, 1.05,
          { anim: [CHASE, 0.85, ((-z / 64) % 1 + 1) % 1] });
      }
    }
  }

  /** A painted forward-pointing chevron centred on (x, z). */
  _chevron(batch, x, z, color) {
    for (const side of [-1, 1]) {
      batch.box('paint', 0.5, 0.02, 3.2, x + side * 0.95, 0.005, z, 6, color, side * 0.62);
    }
  }

  /* Near-side decorative structures use a cutaway profile; gameplay barriers stay full height. */
  /* --- trench walls --------------------------------------------------- */

  _trenchWalls(batch, rng, z0, sector) {
    const zc = z0 + CHUNK_LEN / 2;
    for (const side of [-1, 1]) {
      const baseX = side * (DECK_HALF + 3.5);
      const fullHeight = rng.range(20, 34);
      const h = side < 0 ? 3.2 : fullHeight;

      batch.box('hull', 7, h, CHUNK_LEN, baseX, 0, zc, 10, 0xc8d2de);

      // vertical ribs
      // detail density has to track chunk length, not be a fixed count
      const ribs = Math.max(3, Math.round(CHUNK_LEN / 16));
      for (let i = 0; i < ribs; i++) {
        const z = z0 + (i + 0.5) * (CHUNK_LEN / ribs);
        batch.box('dark', 1.6, h * rng.range(0.55, 0.95), 2.6, baseX - side * 3.6, 0, z, 6, 0xffffff);
        // Rib-cap beacons: the near side's low parapet gets a slow breathe.
        if (side < 0) batch.box('neon', 0.5, 0.25, 0.5, baseX - side * 3.6, h * 0.5, z, 8, 0xff8a4a, 0, 0.9, { anim: [BREATHE, 0.4, i * 0.17] });
      }

      // horizontal ledge + hazard stripe at flight-deck height
      batch.box('dark', 2.4, 0.9, CHUNK_LEN, baseX - side * 3.6, side < 0 ? 1.8 : rng.range(9, 15), zc, 6, 0xffffff);

      // glowing conduit at the base, in the sector's accent rather than player cyan
      batch.box('neon', 0.5, 0.5, CHUNK_LEN - 2, baseX - side * 3.5, 0.7, zc, 10, themeFor(sector).accent, 0, 0.62);

      // lit windows; a few are failing tubes
      const wins = rng.int(5, 5 + Math.round(CHUNK_LEN / 8));
      for (let i = 0; i < wins; i++) {
        const wz = z0 + rng.range(2, CHUNK_LEN - 2);
        const wy = rng.range(0.6, Math.max(0.8, h - 2));
        const warm = rng.bool(0.35);
        const failing = rng.bool(0.12);
        batch.box('neon', 0.25, rng.range(0.5, 1.6), rng.range(1.2, 3.2),
          baseX - side * 3.55, wy, wz, 8, warm ? 0xffb43a : 0x45e0ff, 0, 1.25,
          failing ? { anim: [FLICKER, rng.range(0.6, 1.4), rng.next()] } : null);
      }
    }
  }

  /**
   * Far trench-wall machinery: hangar mouths, turning fans, pipe runs and
   * signage. The far wall is behind every target in all three rigs, so it can
   * be busy without ever hiding a threat.
   */
  _wallDressing(batch, rng, z0, sector, emit) {
    const face = DECK_HALF - 0.1;          // inner face of the far wall
    const theme = themeFor(sector);

    // two horizontal pipe runs with collars
    for (const y of [3.2, 5.1]) {
      batch.stamp('dark', TPL.pipeZ, face - 0.5, y, z0 + CHUNK_LEN / 2, 4, 0xffffff, { sx: 0.34, sy: 0.34, sz: CHUNK_LEN });
      for (let z = z0 + 6; z < z0 + CHUNK_LEN; z += 12) {
        batch.stamp('hull', TPL.pipeZ, face - 0.5, y, z, 4, 0x8894a4, { sx: 0.46, sy: 0.46, sz: 0.4 });
      }
    }

    // hangar mouth: dark recess, lit ceiling, hazard lintel, warning strobe
    if (rng.bool(0.7)) {
      const z = z0 + rng.range(18, CHUNK_LEN - 18);
      const w = rng.range(9, 13), h = rng.range(6, 8);
      batch.box('dark', 0.6, h, w, face - 0.2, 0, z, 6, 0x303844);
      batch.box('neon', 0.3, 0.25, w - 1, face - 0.55, h - 0.6, z, 8, theme.warm, 0, 0.85);
      batch.box('hazard', 0.5, 0.6, w + 1.2, face - 0.35, h, z, 3, 0xffffff);
      for (const s of [-1, 1]) batch.box('hazard', 0.5, h, 0.6, face - 0.35, 0, z + s * (w / 2 + 0.3), 3, 0xffffff);
      batch.lamp(face - 0.6, h + 1.0, z, 0.55, 0xff8a3a, 1.6, [STROBE, 0.8, rng.next()]);
      // inner glow floor strip and a parked tug
      batch.box('neon', 0.2, 0.08, w - 2, face - 0.7, 0.05, z, 8, 0x45e0ff, 0, 0.7, { anim: [CHASE, 0.5, 0] });
    }

    // big extractor fans set into the wall
    const fans = rng.int(1, 2);
    for (let i = 0; i < fans; i++) {
      const z = z0 + rng.range(10, CHUNK_LEN - 10);
      const y = rng.range(9, 15), r = rng.range(2.2, 3.2);
      batch.box('dark', 0.5, r * 2.3, r * 2.3, face - 0.2, y - r * 1.15, z, 5, 0x5a6878);
      batch.box('neon', 0.15, r * 2.1, r * 2.1, face - 0.35, y - r * 1.05, z, 8, 0x0c1418, 0, 1);
      batch.stamp('spin', TPL.fan, face - 0.6, y, z, 4, 0xa8b4c2,
        { s: r, fx: { pivot: [face - 0.6, y, z], spin: [1, 0, 0, rng.range(3.5, 6) * (rng.bool() ? 1 : -1)] } });
      if (theme.name === 'reactor') emit('steam', face - 1.2, y, z, 1.4);
    }

    // neon signage: an outlined panel; some tubes have a bad ballast
    if (rng.bool(0.55)) {
      const z = z0 + rng.range(8, CHUNK_LEN - 8), y = rng.range(15, 19);
      const w = rng.range(5, 9), h = rng.range(1.6, 2.6);
      const color = rng.pick([0xff3d55, 0x45e0ff, theme.warm, 0x52ffa8]);
      const anim = rng.bool(0.35) ? { anim: [FLICKER, rng.range(0.5, 1.2), rng.next()] } : null;
      batch.box('dark', 0.4, h + 0.8, w + 0.8, face - 0.2, y - 0.4, z, 6, 0x222a34);
      for (const dy of [0, h]) batch.box('neon', 0.16, 0.16, w, face - 0.5, y + dy, z, 8, color, 0, 1.3, anim);
      for (const dz of [-w / 2, w / 2]) batch.box('neon', 0.16, h, 0.16, face - 0.5, y, z + dz, 8, color, 0, 1.3, anim);
      for (let k = 0; k < 3; k++) batch.box('neon', 0.12, 0.4, w * rng.range(0.2, 0.6), face - 0.5, y + h * (0.25 + k * 0.25), z, 8, color, 0, 0.7, anim);
    }
  }

  /**
   * Set dressing on the open deck, themed per sector. Nothing inside the
   * flight envelope rises above the existing plates; tall props live on the
   * far side where they sit behind every target.
   */
  _deckProps(batch, rng, z0, sector, emit) {
    const theme = themeFor(sector);
    const farX = () => rng.range(CORRIDOR_HALF + 3.5, DECK_HALF - 3);
    const nearX = () => -rng.range(CORRIDOR_HALF + 3.5, DECK_HALF - 2.5);

    // low cargo on the near shoulder: never taller than the parapet
    for (let i = 0; i < rng.int(1, 3); i++) {
      const x = nearX(), z = z0 + rng.range(6, CHUNK_LEN - 6);
      this._crates(batch, rng, x, z, 1.9);
    }

    if (theme.name === 'airfield') {
      // parked fighters on hardstands, the fortress's own air wing
      if (rng.bool(0.75)) {
        const z = z0 + rng.range(14, CHUNK_LEN - 14);
        for (let k = 0; k < rng.int(1, 3); k++) this._parkedFighter(batch, clamp(farX() + 1.5, 21, 23.5), z + k * 9, rng);
      }
      if (rng.bool(0.5)) this._landingPad(batch, rng, rng.range(21, 22.5), z0 + rng.range(12, CHUNK_LEN - 12), theme);
      if (rng.bool(0.6)) this._fuelDepot(batch, rng, farX(), z0 + rng.range(10, CHUNK_LEN - 10));
    } else if (theme.name === 'battery') {
      for (let k = 0; k < rng.int(1, 2); k++) this._flakGun(batch, rng, farX() + 1, z0 + rng.range(10, CHUNK_LEN - 10), emit);
      for (let k = 0; k < 2; k++) this._crates(batch, rng, farX(), z0 + rng.range(6, CHUNK_LEN - 6), 3.2);
      if (rng.bool(0.5)) this._hazardPad(batch, farX(), z0 + rng.range(12, CHUNK_LEN - 12));
    } else if (theme.name === 'reactor') {
      for (let k = 0; k < rng.int(1, 2); k++) this._coolingStack(batch, rng, farX() + 1, z0 + rng.range(10, CHUNK_LEN - 10), emit);
      // glowing heat vents in the deck either side of the channel
      for (let k = 0; k < rng.int(2, 4); k++) {
        const x = (rng.bool() ? 1 : -1) * rng.range(6, CORRIDOR_HALF - 2), z = z0 + rng.range(6, CHUNK_LEN - 6);
        batch.box('grate', 3.4, 0.12, 2.2, x, 0.0, z, 2, 0x5a4a44);
        batch.box('neon', 2.8, 0.05, 1.6, x, 0.02, z, 8, 0xff5a1a, 0, 0.8, { anim: [BREATHE, rng.range(0.3, 0.6), rng.next()] });
        if (rng.bool(0.4)) emit('heat', x, 0.4, z, 0.8);
      }
    } else {
      // citadel / gauntlet: antenna forest and armoured bunkers
      for (let k = 0; k < rng.int(1, 3); k++) this._antenna(batch, rng, farX(), z0 + rng.range(6, CHUNK_LEN - 6), theme);
      if (rng.bool(0.6)) this._bunker(batch, rng, farX(), z0 + rng.range(12, CHUNK_LEN - 12), theme);
      if (theme.name === 'gauntlet') {
        for (let z = z0 + 8; z < z0 + CHUNK_LEN; z += 16) {
          for (const side of [-1, 1]) batch.lamp(side * (CORRIDOR_HALF + 5.5), 0.1, z, 0.5, 0xff2a3a, 1.5, [STROBE, 1.1, (z / 16) % 2 === 0 ? 0 : 0.5]);
        }
      }
    }

    // satellite dishes on the far shoulder of every fortress sector
    if (rng.bool(0.45)) {
      const x = DECK_HALF - 3, z = z0 + rng.range(8, CHUNK_LEN - 8);
      batch.box('dark', 1.2, 2.6, 1.2, x, 0, z, 4, 0xffffff);
      batch.stamp('spin', TPL.dish, x, 3.4, z, 3, 0xc0cad6,
        { s: 2.2, fx: { pivot: [x, 3.4, z], spin: [0, 1, 0, rng.range(0.35, 0.8)] } });
      batch.lamp(x, 5.6, z, 0.35, 0xff3d55, 1.5, [STROBE, 0.7, rng.next()]);
    }
  }

  _crates(batch, rng, x, z, maxH) {
    const tints = [0x8f9a6a, 0xa87a58, 0x7c8ea4, 0x9aa0a8];
    let y = 0;
    for (let k = 0; k < rng.int(1, 3) && y < maxH - 0.8; k++) {
      const s = rng.range(1.4, 2.2), h = Math.min(rng.range(0.8, 1.2), maxH - y);
      batch.box('hull', s, h, s * rng.range(1, 1.6), x + rng.range(-0.4, 0.4), y, z + rng.range(-0.4, 0.4), 3, rng.pick(tints), rng.range(-0.3, 0.3));
      y += h;
    }
    if (rng.bool(0.5)) {
      // drum barrels beside the stack
      for (let k = 0; k < 3; k++) {
        batch.stamp('hull', TPL.drum, x + 1.6 + (k % 2) * 0.9, 0, z - 1 + k * 0.8, 2, rng.pick([0xb04a3a, 0xc8a040, 0x6a7a8a]),
          { sx: 0.42, sy: 1.1, sz: 0.42 });
      }
    }
  }

  _parkedFighter(batch, x, z, rng) {
    const rot = rng.range(-0.25, 0.25);
    const tint = rng.pick([0xa06a64, 0x8a7072, 0x9a7a5a]);
    batch.stamp('hull', TPL.fighter.hull, x, 0, z, 3, tint, { rotY: rot });
    batch.stamp('dark', TPL.fighter.dark, x, 0, z, 3, 0xffffff, { rotY: rot });
    // hardstand outline and a red canopy light
    batch.box('paint', 7.5, 0.02, 0.3, x, 0.006, z - 3.6, 4, 0xd8c060);
    batch.box('paint', 7.5, 0.02, 0.3, x, 0.006, z + 3.6, 4, 0xd8c060);
    batch.lamp(x, 1.5, z - 0.8, 0.25, 0xff3d55, 1.3, [BREATHE, 0.5, rng.next()]);
  }

  _landingPad(batch, rng, x, z, theme) {
    batch.stamp('paint', TPL.pad, x, 0.02, z, 4, 0xd8dee6);
    batch.box('paint', 0.5, 0.02, 3.4, x - 1, 0.006, z, 4, 0xd8dee6);
    batch.box('paint', 0.5, 0.02, 3.4, x + 1, 0.006, z, 4, 0xd8dee6);
    batch.box('paint', 2, 0.02, 0.5, x, 0.006, z, 4, 0xd8dee6);
    for (let k = 0; k < 8; k++) {
      const a = k * TAU / 8;
      batch.lamp(x + Math.cos(a) * 4.3, 0.02, z + Math.sin(a) * 4.3, 0.35, 0x52ffa8, 1.2, [CHASE, 0.9, k / 8]);
    }
  }

  _fuelDepot(batch, rng, x, z) {
    for (let k = 0; k < 2; k++) {
      batch.stamp('hull', TPL.drum, x, 0, z + k * 3.6, 3, 0xc9b98a, { sx: 1.5, sy: 3.4, sz: 1.5 });
      batch.stamp('hazard', TPL.drum, x, 2.25, z + k * 3.6, 2, 0xffffff, { sx: 1.56, sy: 0.3, sz: 1.56 });
    }
    batch.stamp('dark', TPL.pipeZ, x - 1.8, 0.6, z + 1.8, 3, 0xffffff, { sx: 0.2, sy: 0.2, sz: 5 });
  }

  _hazardPad(batch, x, z) {
    batch.box('hazard', 6, 0.04, 6, x, 0.004, z, 3, 0xffffff);
    batch.box('grate', 4, 0.1, 4, x, 0.02, z, 2, 0x7f8a99);
  }

  /** Static anti-aircraft gun that fires tracer flak into the sky. */
  _flakGun(batch, rng, x, z, emit) {
    batch.box('dark', 3.4, 1.2, 3.4, x, 0, z, 3, 0xffffff);
    batch.stamp('hull', TPL.drum, x, 1.2, z, 3, 0x8a7a70, { sx: 1.4, sy: 1.2, sz: 1.4 });
    const pitch = rng.range(0.7, 1.0), yaw = rng.range(-0.5, 0.5);
    for (const s of [-0.45, 0.45]) {
      const barrel = new THREE.CylinderGeometry(0.16, 0.2, 4.2, 6)
        .translate(0, 2.1, 0).rotateX(-(Math.PI / 2 - pitch)).translate(s, 2.1, 0);
      batch.add('dark', barrel, x, 0, z, 3, 0xffffff, yaw);
    }
    const tip = new THREE.Vector3(0, 4.2 * Math.cos(Math.PI / 2 - pitch) + 2.1, -4.2 * Math.sin(Math.PI / 2 - pitch))
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const dir = new THREE.Vector3(0, Math.cos(Math.PI / 2 - pitch), -Math.sin(Math.PI / 2 - pitch)).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    emit('flak', x + tip.x, tip.y, z + tip.z, rng.range(0.25, 0.45), dir);
  }

  _coolingStack(batch, rng, x, z, emit) {
    const h = rng.range(7, 11);
    batch.add('hull', taperedBox(4.2, 3.0, h, 4.2, 3.0), x, 0, z, 4, 0x9a8a80);
    for (let y = 1.5; y < h - 1; y += 2.2) batch.box('dark', 4.4, 0.35, 4.4, x, y, z, 3, 0xffffff);
    batch.box('neon', 3.1, 0.2, 3.1, x, h, z, 8, 0xff6a2a, 0, 1.2, { anim: [BREATHE, 0.4, rng.next()] });
    emit('steam', x, h + 0.4, z, 1);
  }

  _antenna(batch, rng, x, z, theme) {
    const h = rng.range(7, 13);
    batch.box('dark', 0.35, h, 0.35, x, 0, z, 3, 0xffffff);
    for (let y = 2; y < h; y += rng.range(1.8, 2.6)) batch.box('dark', rng.range(1.2, 2.4), 0.12, 0.12, x, y, z, 3, 0xffffff);
    batch.lamp(x, h, z, 0.4, theme.name === 'gauntlet' ? 0xff2a3a : 0xff3d55, 1.6, [STROBE, rng.range(0.6, 1), rng.next()]);
  }

  _bunker(batch, rng, x, z, theme) {
    batch.add('hull', taperedBox(7, 5, 3.2, 8, 6), x, 0, z, 4, 0x8a929c);
    batch.box('neon', 0.15, 0.4, 4, x - 2.6, 1.8, z, 8, theme.warm, 0, 1.1, { anim: [BREATHE, 0.3, rng.next()] });
    batch.box('dark', 2.4, 0.8, 2.4, x, 3.2, z, 3, 0xffffff);
  }

  /* --- background skyline --------------------------------------------- */

  _skyline(batch, rng, z0, sector, emit = () => {}) {
    const count = rng.int(4, 4 + Math.round(CHUNK_LEN / 14));
    for (let i = 0; i < count; i++) {
      const side = rng.bool() ? 1 : -1;
      const x = side * rng.range(DECK_HALF + 14, DECK_HALF + 62);
      const z = z0 + rng.range(0, CHUNK_LEN);
      const fullHeight = rng.range(18, 78);
      const h = side < 0 ? 6 : fullHeight;
      const w = rng.range(7, 20);
      const wTop = w * rng.range(0.5, 0.95), dBottom = w * rng.range(0.8, 1.2), dTop = w * 0.6;
      const rot = rng.range(-0.4, 0.4);
      // Towers rise from the fortress's lower tiers, so none of them float.
      const root = 60, taper = h / (h + root);
      batch.add('dark', taperedBox(lerp(wTop, w, 1 / taper), wTop, h + root, lerp(dTop, dBottom, 1 / taper), dTop), x, -root, z, 12, 0xffffff, rot);
      if (side < 0) {
        // Low near-side roofs get a lit parapet so they read as buildings, not slabs.
        batch.box('neon', w * 0.9, 0.18, 0.18, x, h - 0.1, z - dTop * 0.45, 8, 0x45e0ff, rot, 0.75);
        batch.box('neon', w * 0.9, 0.18, 0.18, x, h - 0.1, z + dTop * 0.45, 8, 0x45e0ff, rot, 0.75);
      }

      // aircraft warning lights, strobing out of phase like a real skyline
      if (rng.bool(0.55)) {
        batch.box('neon', 1.1, 1.1, 1.1, x, h + 0.4, z, 8, 0xff3d55, 0, 1.5, { anim: [STROBE, rng.range(0.45, 0.8), rng.next()] });
      }
      if (rng.bool(0.5)) {
        batch.box('neon', 0.4, h * 0.6, 0.4, x + w * 0.4, h * 0.2, z, 8, 0x45e0ff, 0, 0.85, rng.bool(0.3) ? { anim: [BREATHE, 0.25, rng.next()] } : null);
      }
      if (side < 0) continue;
      // Tall far towers carry rotating radar and lit floors.
      if (h > 34 && rng.bool(0.45)) {
        const r = rng.range(3, 5);
        batch.stamp('spin', TPL.dish, x, h + r * 0.4, z, 4, 0xa4b0bf,
          { s: r, fx: { pivot: [x, h, z], spin: [0, 1, 0, rng.range(0.25, 0.6) * (rng.bool() ? 1 : -1)] } });
      }
      // Lit floors on the corridor-facing side, following the tower's taper and yaw.
      const floors = Math.floor(h / 6);
      for (let f = 1; f < floors; f++) {
        if (!rng.bool(0.4)) continue;
        const y = f * 6, t = y / h;
        const ox = -(lerp(w, wTop, t) / 2 + 0.08);
        batch.box('neon', 0.3, 0.5, lerp(dBottom, dTop, t) * rng.range(0.3, 0.7),
          x + ox * Math.cos(rot), y, z - ox * Math.sin(rot), 8, rng.bool(0.7) ? 0xffc27a : 0x9fe8ff, rot, 1.05);
      }
      if (h > 40 && rng.bool(0.25)) emit('stack', x, h + 1, z, 0.5);
    }
  }

  /**
   * Where a fortress sector meets open space, the deck ends in a lit
   * bulkhead cliff; arriving from space, the next fortress presents one too.
   */
  _sectorEdges(batch, z0, z1, sector) {
    const level = this.level;
    if (!level.sectors) return;
    // Decks are built per chunk, so the lip sits on a chunk boundary, not on zEnd.
    const isSpace = (z) => level.sectorAt(z)?.kind === SECTOR_KINDS.SPACE;
    const edges = [];
    if (isSpace(z1 + CHUNK_LEN / 2)) edges.push([z1, 1]);
    if (z0 > 0 && isSpace(z0 - CHUNK_LEN / 2)) edges.push([z0, -1]);
    for (const [z, dir] of edges) {
      const W = DECK_HALF * 2;
      // cliff face below the deck lip
      batch.box('hull', W + 8, 38, 3, 0, -40.4, z - dir * 1.5, 10, 0x8a96a6);
      batch.box('hazard', W + 8, 0.9, 3.4, 0, -3.3, z - dir * 1.5, 3, 0xffffff);
      for (let x = -DECK_HALF; x <= DECK_HALF; x += 4.5) {
        batch.lamp(x, -2.2, z - dir * 0.1, 0.6, 0xffb43a, 1.4, [CHASE, 0.8, ((x + DECK_HALF) / 54 + (dir > 0 ? 0 : 0.5)) % 1]);
        batch.box('neon', 0.5, 30, 0.3, x, -36, z + dir * 0.05, 10, 0x2a5a70, 0, 0.7);
      }
      // launch pylons stand clear of the corridor on both shoulders
      for (const side of [-1, 1]) {
        const h = side < 0 ? 3 : 26;
        batch.box('hull', 3, h, 3, side * (DECK_HALF - 2), 0, z - dir * 3, 5, 0x9aa6b4);
        batch.lamp(side * (DECK_HALF - 2), h + 0.2, z - dir * 3, 0.8, 0xff3d55, 1.6, [STROBE, 0.9, side > 0 ? 0 : 0.5]);
      }
    }
  }

  /* --- barrier walls -------------------------------------------------- */

  _wall(batch, f, rng) {
    const top = ALT_MAX + 10;
    const W = DECK_HALF * 2;
    const t = f.thickness;
    const tint = 0xb9c4d2;
    const face = f.z - t / 2 - 0.08;   // approach face, where the lamps live
    // Masonry courses on the approach face give the walls weight and scale.
    const courses = (x0, x1, y0, y1) => {
      for (let y = y0 + 2.4; y < y1 - 0.4; y += 2.4) {
        batch.box('dark', x1 - x0, 0.14, 0.2, (x0 + x1) / 2, y, face, 4, 0x6a7686);
      }
    };

    const stripe = (x, y, w, h) => {
      // hazard chevrons framing every gap edge — the read at speed
      batch.box('hazard', w, 0.55, t + 0.35, x, y, f.z, 4, 0xffffff);
    };

    if (f.type === 'pillars') {
      f.gaps.forEach((g, i) => {
        batch.box('hull', g.w, top, t, g.x, 0, f.z, 9, tint);
        batch.box('hazard', g.w + 0.2, 0.7, t + 0.3, g.x, 1.2, f.z, 4, 0xffffff);
        batch.box('neon', g.w * 0.35, top * 0.8, 0.16, g.x, 1.6, f.z - t / 2 - 0.1, 9, 0xffb43a, 0, 0.95);
        batch.lamp(g.x, top + 0.3, f.z, 0.9, 0xff3d55, 1.6, [STROBE, 0.9, i % 2 ? 0.5 : 0]);
        courses(g.x - g.w / 2, g.x + g.w / 2, 0, top);
      });
      return;
    }

    const gap = f.gaps[0];
    // Tiny guide lamps chase toward the opening. Pieces are small, so they
    // can sit above the bloom threshold without washing the frame.
    const lampRow = (x0, x1, y, color) => {
      for (let x = x0; x <= x1; x += 2.4) {
        batch.box('neon', 0.42, 0.42, 0.2, x, y, face - 0.08, 8, color, 0, 1.35,
          { anim: [CHASE, 1.1, (Math.abs(x - (gap.x ?? 0)) / 24) % 1] });
      }
    };

    if (f.type === 'slot' || f.type === 'stagger') {
      if (gap.y > 0.3) batch.box('hull', W, gap.y, t, 0, 0, f.z, 9, tint);
      batch.box('hull', W, top - (gap.y + gap.h), t, 0, gap.y + gap.h, f.z, 9, tint);
      stripe(0, gap.y - 0.55, W, 0.55);
      stripe(0, gap.y + gap.h, W, 0.55);
      courses(-W / 2, W / 2, 0, gap.y - 0.6);
      courses(-W / 2, W / 2, gap.y + gap.h + 0.6, top);
      // guide lights down the throat of the gap
      for (const side of [-1, 1]) {
        batch.box('neon', 0.4, gap.h, 0.4, side * (W / 2 - 1.2), gap.y, f.z, 8, 0x45e0ff, 0, 1.45);
      }
      lampRow(-CORRIDOR_HALF, CORRIDOR_HALF, gap.y - 0.95, 0xffc060);
      lampRow(-CORRIDOR_HALF, CORRIDOR_HALF, gap.y + gap.h + 0.62, 0xffc060);
    } else if (f.type === 'notch') {
      const leftW = (gap.x - gap.w / 2) + DECK_HALF;
      const rightW = DECK_HALF - (gap.x + gap.w / 2);
      if (leftW > 0.2) { batch.box('hull', leftW, top, t, -DECK_HALF + leftW / 2, 0, f.z, 9, tint); courses(-DECK_HALF, -DECK_HALF + leftW, 0, top); }
      if (rightW > 0.2) { batch.box('hull', rightW, top, t, DECK_HALF - rightW / 2, 0, f.z, 9, tint); courses(DECK_HALF - rightW, DECK_HALF, 0, top); }
      for (const side of [-1, 1]) {
        const ex = gap.x + side * gap.w / 2;
        batch.box('hazard', 0.6, top, t + 0.3, ex, 0, f.z, 5, 0xffffff);
        batch.box('neon', 0.22, top * 0.9, 0.22, ex - side * 0.6, 0.5, f.z - t / 2 - 0.12, 8, 0xffb43a, 0, 1.4);
        for (let y = 1.5; y < ALT_MAX; y += 2.6) {
          batch.box('neon', 0.42, 0.42, 0.2, ex + side * 0.9, y, face - 0.08, 8, 0xffc060, 0, 1.3, { anim: [CHASE, 1.1, (y / 26) % 1] });
        }
      }
    } else {
      // window
      if (gap.y > 0.3) batch.box('hull', W, gap.y, t, 0, 0, f.z, 9, tint);
      batch.box('hull', W, top - (gap.y + gap.h), t, 0, gap.y + gap.h, f.z, 9, tint);
      const leftW = (gap.x - gap.w / 2) + DECK_HALF;
      const rightW = DECK_HALF - (gap.x + gap.w / 2);
      if (leftW > 0.2) batch.box('hull', leftW, gap.h, t, -DECK_HALF + leftW / 2, gap.y, f.z, 9, tint);
      if (rightW > 0.2) batch.box('hull', rightW, gap.h, t, DECK_HALF - rightW / 2, gap.y, f.z, 9, tint);
      courses(-W / 2, W / 2, 0, gap.y - 0.6);
      courses(-W / 2, W / 2, gap.y + gap.h + 0.6, top);
      // frame the opening
      batch.box('hazard', gap.w + 1.2, 0.5, t + 0.3, gap.x, gap.y - 0.5, f.z, 4, 0xffffff);
      batch.box('hazard', gap.w + 1.2, 0.5, t + 0.3, gap.x, gap.y + gap.h, f.z, 4, 0xffffff);
      for (const side of [-1, 1]) {
        batch.box('neon', 0.35, gap.h, 0.35, gap.x + side * (gap.w / 2 + 0.3), gap.y, f.z, 8, 0x45e0ff, 0, 1.45);
      }
      // a ring of lamps circulating around the frame
      const perimeter = [];
      for (let x = gap.x - gap.w / 2 - 0.9; x <= gap.x + gap.w / 2 + 0.9; x += 2) perimeter.push([x, gap.y - 1.1], [x, gap.y + gap.h + 0.6]);
      perimeter.forEach(([x, y], k) => batch.box('neon', 0.4, 0.4, 0.2, x, y, face - 0.08, 8, 0xffc060, 0, 1.35, { anim: [CHASE, 1.2, (k / perimeter.length) % 1] }));
    }

    // emitter pylons crown every wall
    for (const x of [-DECK_HALF + 3, DECK_HALF - 3]) {
      batch.box('dark', 1.6, 2.2, 1.6, x, top, f.z, 3, 0xffffff);
      batch.lamp(x, top + 2.3, f.z, 0.8, 0xff3d55, 1.6, [STROBE, 0.9, x < 0 ? 0 : 0.5]);
    }

    // The outer fortress wall: battlements, gate towers and searchlight
    // housings mark the moment you arrive back over the fortress.
    if (f.perimeter) {
      for (let x = -DECK_HALF + 2.4; x < DECK_HALF - 2; x += 4.8) {
        batch.box('hull', 2.4, 2.4, t + 0.6, x, top, f.z, 5, tint);
      }
      for (const side of [-1, 1]) {
        const tx = side * (DECK_HALF + 2);
        batch.box('hull', 6, top + 12, t + 4, tx, 0, f.z, 9, 0x9aa6b4);
        batch.box('dark', 6.8, 1.2, t + 4.8, tx, top + 4, f.z, 4, 0xffffff);
        batch.box('neon', 0.4, top * 0.7, 0.4, tx - side * 3.2, 2, face - 1.9, 8, 0xffb43a, 0, 1.2, { anim: [CHASE, 0.7, 0] });
        batch.lamp(tx, top + 12.4, f.z, 1.2, 0xff3d55, 1.7, [STROBE, 0.6, side > 0 ? 0 : 0.5]);
      }
    }
  }

  _arch(batch, f, rng) {
    const W = DECK_HALF * 2;
    const h = ALT_MAX + 12 - f.clearance;
    batch.box('hull', W, h, 7, 0, f.clearance, f.z, 10, 0xb0bccb);
    batch.box('hazard', W, 0.6, 7.4, 0, f.clearance - 0.6, f.z, 4, 0xffffff);
    for (const side of [-1, 1]) {
      batch.box('dark', 3, f.clearance, 7, side * (DECK_HALF - 1.5), 0, f.z, 8, 0xffffff);
      batch.box('neon', 0.3, 0.3, 7.2, side * (DECK_HALF - 3.2), f.clearance - 1.1, f.z, 8, 0xffb43a, 0, 1.3);
    }
    // soffit lamps chase toward the far side: "go under"
    for (let z = f.z - 3; z <= f.z + 3; z += 1.5) {
      for (let x = -CORRIDOR_HALF; x <= CORRIDOR_HALF; x += 4) {
        batch.box('neon', 0.4, 0.12, 0.4, x, f.clearance - 0.75, z, 8, 0xffe0a0, 0, 1.2, { anim: [CHASE, 1.2, ((z - f.z + 3) / 6) % 1] });
      }
    }
  }

  /**
   * Electric barrier: emitter pylons just outside the flight envelope and a
   * live horizontal beam between them. The beam is the shared force-field
   * shader in a cold blue-white; flickering zig-zag arcs crawl along it.
   */
  _fence(group, f, batch, rng) {
    const W = DECK_HALF * 2;
    const mat = (this._fenceMat ??= this.materials.forceField(0x8fdcff));
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(W, f.band), mat);
    beam.position.set(0, f.y + f.band / 2, f.z);
    beam.frustumCulled = false;
    group.add(beam);
    for (const side of [-1, 1]) {
      const x = side * (CORRIDOR_HALF + 4);
      // A barrier, not decoration: the near pylon rises just past the beam it holds.
      const h = side < 0 ? f.y + f.band + 2.5 : ALT_MAX + 4;
      batch.box('dark', 2.6, h, 2.6, x, 0, f.z, 4, 0xffffff);
      batch.box('hull', 3.6, 1.2, 3.6, x, 0, f.z, 4, 0x8a96a6);
      // insulator coils around the emitter head, breathing with the current
      for (let k = 0; k < 4; k++) {
        const y = f.y - 1 + k * (f.band + 2) / 4;
        batch.box('dark', 3.4, 0.5, 3.4, x, y, f.z, 3, 0xffffff);
        batch.box('neon', 3.5, 0.2, 3.5, x, y + 0.15, f.z, 8, 0x9fe8ff, 0, 1.3, { anim: [BREATHE, 2.2, k / 4 + (side > 0 ? 0.5 : 0)] });
      }
      batch.box('neon', 0.8, f.band, 0.8, x - side * 1.5, f.y, f.z, 8, 0xdff6ff, 0, 1.5, { anim: [FLICKER, 1.3, side > 0 ? 0.3 : 0.7] });
      if (side > 0) batch.lamp(x, h + 0.3, f.z, 0.8, 0xff3d55, 1.6, [STROBE, 0.8, 0]);
    }
    // three zig-zag arcs along the beam, each flickering on its own beat
    for (let a = 0; a < 3; a++) {
      const yc = f.y + f.band * (0.25 + a * 0.25);
      const anim = { anim: [FLICKER, rng.range(1.4, 2.4), rng.next()] };
      let x = -CORRIDOR_HALF - 3, y = yc;
      while (x < CORRIDOR_HALF + 3) {
        const step = rng.range(1.2, 2.6);
        const ny = yc + rng.range(-f.band * 0.35, f.band * 0.35);
        const len = Math.hypot(step, ny - y);
        const g = new THREE.BoxGeometry(len, 0.12, 0.12).rotateZ(Math.atan2(ny - y, step)).translate(step / 2, (y + ny) / 2 - y, 0);
        batch.add('neon', g, x, y, f.z - 0.05, 8, 0xeaf8ff, 0, 1.6, anim);
        x += step; y = ny;
      }
    }
  }

  _platform(batch, f, rng) {
    batch.surfaces.push({ minX:f.x-8, maxX:f.x+8, minZ:f.z-8, maxZ:f.z+8, top:f.y+2.57 });
    batch.box('deck', 16, 2.4, 16, f.x, f.y, f.z, 8, 0xc8d2de);
    batch.box('dark', 17.5, 0.5, 17.5, f.x, f.y - 0.5, f.z, 8, 0xffffff);
    batch.box('neon', 15, 0.12, 0.35, f.x, f.y + 2.45, f.z - 7.6, 8, 0x45e0ff, 0, 0.85);
    batch.box('neon', 15, 0.12, 0.35, f.x, f.y + 2.45, f.z + 7.6, 8, 0x45e0ff, 0, 0.85);
    // underside strut, so it doesn't look like it's floating by magic
    batch.box('dark', 2, 6, 2, f.x, f.y - 6.2, f.z, 6, 0xffffff);
    // station-keeping thrusters and corner beacons
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      batch.box('dark', 1.6, 1.2, 1.6, f.x + sx * 6.5, f.y - 1.6, f.z + sz * 6.5, 3, 0xffffff);
      batch.box('neon', 1.1, 0.1, 1.1, f.x + sx * 6.5, f.y - 1.7, f.z + sz * 6.5, 8, 0x8fe4ff, 0, 1.3, { anim: [BREATHE, 0.9, rng.next()] });
      batch.lamp(f.x + sx * 7.6, f.y + 2.5, f.z + sz * 7.6, 0.4, sx < 0 ? 0xff3d55 : 0x52ffa8, 1.5, [STROBE, 0.8, sz < 0 ? 0 : 0.5]);
    }
    // painted pad centre for the turret
    batch.stamp('paint', TPL.padSmall, f.x, f.y + 2.43, f.z, 4, 0xe0a040);
  }

  /**
   * A rotating ring of rock and wreckage around the flight path. Pieces keep
   * a radius clear of the whole playfield box through every rotation angle.
   */
  _debrisRing(batch, f, rng) {
    const n = rng.int(12, 20);
    const radius = Math.max(28, f.radius);
    const speed = rng.range(0.08, 0.16) * (rng.bool() ? 1 : -1);
    const pivot = [0, 12, f.z];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rng.range(-0.2, 0.2);
      const r = radius * rng.range(1, 1.25);
      const x = Math.cos(a) * r;
      const y = 12 + Math.sin(a) * r;
      const s = rng.range(1.6, 4.6);
      const z = f.z + rng.range(-24, 24);
      const spin = { pivot: [pivot[0], pivot[1], z], spin: [0, 0, 1, speed] };
      if (rng.bool(0.7)) {
        batch.add('rock', rockGeometry(rng, s), x, y, z, s * 2, rng.pick([0xb8b0a4, 0x9a928a, 0xc4b8a8]), 0, 1, spin);
      } else {
        const g = new THREE.BoxGeometry(s * 2.2, s * 0.25, s * 0.5).rotateZ(rng.next() * 3).rotateY(rng.next() * 3);
        batch.add('spin', g, x, y, z, 5, 0x7a8696, 0, 1, spin);
      }
    }
  }

  /* --- void sectors ---------------------------------------------------- */

  /**
   * Open space: tumbling asteroids, drifting hull wreckage with burning
   * edges, and distant station trusses. All of it stays well outside the
   * playfield box so nothing decorative can be mistaken for a hazard.
   */
  _voidProps(batch, rng, z0, sector) {
    if (sector.index === 2) this._dreadnought(batch, rng, z0, sector);
    if (sector.index === 4) this._carrier(batch, rng, z0, sector);
    const clearX = CORRIDOR_HALF + 14;
    const place = (minR, maxR) => {
      const side = rng.bool() ? 1 : -1;
      return [side * rng.range(Math.max(clearX, minR), maxR), rng.range(-50, 70)];
    };

    // asteroid field, parallax from near to far
    for (let i = 0; i < rng.int(5, 9); i++) {
      const [x, y] = place(34, 170);
      const s = lerp(2.5, 16, rng.next() ** 2) * (Math.abs(x) > 90 ? 1.8 : 1);
      const z = z0 + rng.range(0, CHUNK_LEN);
      const axis = new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize();
      batch.add('rock', rockGeometry(rng, s), x, y, z, s * 2, rng.pick([0xb8b0a4, 0x9a928a, 0xc4b8a8, 0xa89c90]), 0, 1,
        { pivot: [x, y, z], spin: [axis.x, axis.y, axis.z, rng.range(0.05, 0.3)] });
    }

    // drifting wreck: a gutted hull section with glowing torn edges
    if (rng.bool(0.5)) {
      const [x, y] = place(60, 150);
      const z = z0 + rng.range(10, CHUNK_LEN - 10);
      const s = rng.range(10, 22);
      const rot = rng.range(-0.8, 0.8);
      batch.add('dark', taperedBox(s * 0.6, s * 0.35, s * 1.8, s * 0.5, s * 0.3).rotateX(Math.PI / 2).rotateZ(rng.range(-0.6, 0.6)), x, y, z, 12, 0x6a7482, rot);
      for (let k = 0; k < 5; k++) {
        batch.box('dark', s * 0.9, 0.5, 0.6, x, y - s * 0.2 + k * s * 0.12, z - s * 0.6 + k * s * 0.3, 4, 0x4a5462, rot);
      }
      for (let k = 0; k < 4; k++) {
        batch.box('neon', rng.range(1, 3), 0.25, 0.25, x + rng.range(-s * 0.2, s * 0.2), y + rng.range(-s * 0.2, s * 0.2),
          z + rng.range(-s * 0.6, s * 0.6), 8, 0xff7a2a, rot, 1.4, { anim: [FLICKER, rng.range(0.8, 1.6), rng.next()] });
      }
    }

    // distant orbital station truss with running lights
    if (rng.bool(0.35)) {
      const side = rng.bool() ? 1 : -1;
      const x = side * rng.range(140, 220), y = rng.range(-20, 50);
      const z = z0 + CHUNK_LEN / 2;
      batch.box('dark', 3, 3, CHUNK_LEN, x, y, z, 10, 0x5a6472);
      for (let k = 0; k < 6; k++) {
        const zz = z0 + k * CHUNK_LEN / 6;
        batch.box('dark', 1, 14, 1, x, y - 5.5, zz, 5, 0x5a6472);
        batch.box('hull', 6, 5, 7, x + side * 4, y - 1, zz + 6, 6, 0x9aa6b4);
        batch.box('neon', 0.4, 2.5, 5, x - side * 0.6, y - 0.2, zz + 6, 8, rng.bool(0.7) ? 0xffc27a : 0x9fe8ff, 0, 1.1);
        batch.lamp(x, y + 2, zz, 0.9, 0xff3d55, 1.6, [STROBE, 0.7, k / 6]);
      }
    }
  }

  /**
   * THE VOID GAP's landmark: a gutted dreadnought drifting beneath the lane.
   * Its deck lies well under the flight floor, so it frames the classic view
   * without ever standing between you and a target.
   */
  _dreadnought(batch, rng, z0, sector) {
    const start = (sector.zStart ?? 0) + 200, end = start + 820;
    const a = Math.max(z0, start), b = Math.min(z0 + CHUNK_LEN, end);
    if (b <= a) return;
    const top = -15, W = 64, cx = 6;
    for (let z = a; z < b; z += 12) {
      const len = Math.min(12, b - z);
      const zc = z + len / 2;
      const u = (zc - start) / (end - start);
      // bow and stern taper; three breaches expose the ribs
      const taper = Math.min(1, u / 0.12, (1 - u) / 0.1);
      const w = W * (0.35 + 0.65 * Math.max(0, taper));
      const local = zc - start;
      const breach = Math.floor(local / 110) % 3 === 1 && local % 110 > 30 && local % 110 < 78;
      if (!breach) {
        batch.box('hull', w, 26, len, cx, top - 26, zc, 12, 0x8e98a6);
        batch.box('dark', w * 0.92, 0.5, len * 0.9, cx, top, zc, 5, 0x5a6472);
      } else {
        batch.box('hull', w, 10, len, cx, top - 26, zc, 12, 0x7a8492);
        for (let k = -2; k <= 2; k++) batch.box('dark', 0.9, 16, 0.9, cx + k * w * 0.2, top - 16, zc, 4, 0x4a5462);
        batch.box('dark', w, 0.8, 0.9, cx, top - 1, zc, 4, 0x4a5462);
        batch.box('neon', w * 0.5, 0.3, len * 0.6, cx, top - 14, zc, 8, 0xff6a2a, 0, 1.1, { anim: [FLICKER, 0.7, rng.next()] });
      }
      // hull-side windows, mostly dead, a few still burning
      for (const s of [-1, 1]) {
        if (!rng.bool(0.5)) continue;
        const lit = rng.bool(0.3);
        batch.box('neon', 0.3, 0.6, len * 0.5, cx + s * (w / 2 + 0.1), top - 6 - rng.range(0, 12), zc, 8,
          lit ? 0xffb46a : 0x5a7890, 0, 0.9, lit ? { anim: [FLICKER, 0.9, rng.next()] } : null);
      }
    }
    // superstructure on the far beam, turret housings along the spine
    if (rng.bool(0.8)) {
      const z = a + 10 + rng.range(0, Math.max(1, b - a - 20));
      if (z < b) {
        const h = rng.range(16, 30);
        batch.add('hull', taperedBox(12, 8, h, 16, 10), cx + 24, top, z, 8, 0x9aa4b2);
        batch.box('dark', 14, 1, 18, cx + 24, top + h * 0.6, z, 4, 0xffffff);
        for (let k = 0; k < 4; k++) batch.box('neon', 0.3, 0.7, 8, cx + 17.8, top + 4 + k * h * 0.2, z, 8, rng.bool(0.6) ? 0x3a5068 : 0xffc27a, 0, 1);
        batch.lamp(cx + 24, top + h + 0.6, z, 1, 0xff3d55, 1.6, [STROBE, 0.5, rng.next()]);
      }
    }
    for (let k = 0; k < 2; k++) {
      const z = a + rng.range(4, Math.max(5, b - a - 4));
      const x = cx + rng.range(-20, 12);
      batch.box('dark', 5, 2.2, 6, x, top, z, 3, 0xffffff);
      const barrel = new THREE.CylinderGeometry(0.4, 0.5, 9, 6).rotateX(Math.PI / 2 - 0.5).translate(0, 3.2, 3);
      batch.add('dark', barrel, x, top, z, 3, 0xffffff, rng.range(-0.5, 0.5));
    }
    // stern engine bells
    if (end > z0 && end <= z0 + CHUNK_LEN) {
      for (const s of [-1, 1]) {
        const bell = new THREE.CylinderGeometry(6, 8, 10, 12, 1, true).rotateX(Math.PI / 2);
        batch.add('dark', bell, cx + s * 14, top - 14, end + 4, 6, 0xffffff);
        batch.box('neon', 9, 9, 0.4, cx + s * 14, top - 18.5, end + 0.5, 8, 0x3a6aa8, 0, 0.8, { anim: [BREATHE, 0.2, s > 0 ? 0 : 0.5] });
      }
    }
  }

  /**
   * INTERCEPTOR SCREEN's landmark: the wing's carrier running alongside on
   * the far beam, hangar mouths lit and catapult lights racing forward.
   */
  _carrier(batch, rng, z0, sector) {
    const start = (sector.zStart ?? 0) + 160, end = start + 980;
    const a = Math.max(z0, start), b = Math.min(z0 + CHUNK_LEN, end);
    if (b <= a) return;
    const x0 = 58, W = 50, y0 = -26, H = 40;
    for (let z = a; z < b; z += 16) {
      const len = Math.min(16, b - z), zc = z + len / 2;
      const u = (zc - start) / (end - start);
      const taper = Math.max(0.3, Math.min(1, u / 0.1, (1 - u) / 0.08));
      batch.box('hull', W * taper, H, len, x0 + W / 2, y0, zc, 14, 0x8a94a4);
      // flight deck overhanging on the corridor side
      batch.box('deck', W * taper + 10, 1.4, len, x0 + W / 2 - 5, y0 + H, zc, 10, 0xb8c0cc);
      batch.box('paint', 0.5, 0.02, len * 0.6, x0 + 6, y0 + H + 1.42, zc, 4, 0xe0c060);
      // hangar bays on the corridor-facing flank
      if (Math.floor(zc / 16) % 3 !== 0) {
        batch.box('dark', 0.8, 9, len - 3, x0 - 0.2, y0 + 20, zc, 4, 0x1c222c);
        batch.box('neon', 0.3, 0.4, len - 4, x0 - 0.6, y0 + 28.6, zc, 8, 0xffa04a, 0, 1.15);
        batch.box('neon', 0.3, 0.2, len - 4, x0 - 0.6, y0 + 20.3, zc, 8, 0x45e0ff, 0, 0.8, { anim: [CHASE, 0.8, ((-zc / 128) % 1 + 1) % 1] });
      } else {
        for (let k = 0; k < 4; k++) batch.box('neon', 0.3, 0.6, 2, x0 - 0.2, y0 + 8 + k * 7, zc + rng.range(-4, 4), 8, rng.bool(0.7) ? 0xffc27a : 0x9fe8ff, 0, 1);
      }
      // catapult lights racing along the deck edge
      batch.box('neon', 0.5, 0.2, 0.8, x0 - 4.6, y0 + H + 1.5, zc, 8, 0xfff0c0, 0, 1.3, { anim: [CHASE, 1.4, ((-zc / 96) % 1 + 1) % 1] });
    }
    // the island superstructure
    const islandZ = start + 420;
    if (islandZ >= z0 && islandZ < z0 + CHUNK_LEN) {
      batch.add('hull', taperedBox(10, 7, 22, 26, 18), x0 + 36, y0 + H, islandZ, 8, 0x9aa4b2);
      for (let k = 0; k < 5; k++) batch.box('neon', 0.3, 0.8, 16, x0 + 30.8, y0 + H + 3 + k * 3.6, islandZ, 8, 0xffc27a, 0, 1.05);
      batch.stamp('spin', TPL.dish, x0 + 36, y0 + H + 25, islandZ, 4, 0xa4b0bf,
        { s: 4, fx: { pivot: [x0 + 36, y0 + H + 25, islandZ], spin: [0, 1, 0, 0.6] } });
      batch.lamp(x0 + 36, y0 + H + 29.5, islandZ, 1, 0xff3d55, 1.6, [STROBE, 0.7, 0]);
    }
    if (end > z0 && end <= z0 + CHUNK_LEN) {
      for (const dy of [8, 24]) {
        const bell = new THREE.CylinderGeometry(5, 7, 8, 12, 1, true).rotateX(Math.PI / 2);
        batch.add('dark', bell, x0 + W / 2, y0 + dy, end + 3, 6, 0xffffff);
        batch.box('neon', 8, 8, 0.4, x0 + W / 2, y0 + dy - 4, end + 0.4, 8, 0x5a9aff, 0, 1.1, { anim: [BREATHE, 0.8, dy / 30] });
      }
    }
  }

  /* --- boss arena ------------------------------------------------------ */

  _arena(batch, rng, z0, sector) {
    batch.captureSurfaces = true;
    const zc = z0 + CHUNK_LEN / 2;
    const local = z0 - sector.zStart;
    const W = 84;

    batch.box('deck', W, 2.4, CHUNK_LEN, 0, -2.4, zc, 12, 0xaab6c4);
    batch.box('neon', W - 8, 0.1, 1.2, 0, 0.06, zc, 10, 0xff3d55, 0, 0.55);

    batch.captureSurfaces = false;

    // radial floor ribs and a pulse that runs the length of the arena
    for (let z = z0 + 6; z < z0 + CHUNK_LEN; z += 12) {
      batch.box('paint', W - 10, 0.02, 0.5, 0, 0.006, z, 6, 0x6a2a34);
      for (const x of [-30, -18, 18, 30]) {
        batch.lamp(x, 0.02, z, 0.6, 0xff3d55, 1.25, [CHASE, 0.7, ((-z / 96) % 1 + 1) % 1]);
      }
    }

    // buttresses marching down both sides of the arena
    for (const side of [-1, 1]) {
      const x = side * (W / 2 - 3);
      batch.box('hull', 8, side < 0 ? 3.2 : rng.range(26, 44), 8, x, 0, z0 + 14, 10, 0x9fb0c2);
      batch.box('hull', 8, side < 0 ? 3.2 : rng.range(26, 44), 8, x, 0, z0 + 44, 10, 0x9fb0c2);
      batch.box('neon', 0.4, side < 0 ? 1.8 : 24, 0.4, x - side * 4.3, side < 0 ? 0.6 : 3, z0 + 14, 8, 0xff3d55, 0, 1.1, { anim: [BREATHE, 0.5, 0] });
      batch.box('neon', 0.4, side < 0 ? 1.8 : 24, 0.4, x - side * 4.3, side < 0 ? 0.6 : 3, z0 + 44, 8, 0xff3d55, 0, 1.1, { anim: [BREATHE, 0.5, 0.5] });
      if (side > 0) {
        // conduit coils climbing the far buttresses
        for (let y = 4; y < 24; y += 3) batch.box('dark', 9, 0.6, 9, x, y, z0 + 44, 3, 0xffffff);
        batch.stamp('spin', TPL.dish, x, 30, z0 + 14, 4, 0xa4b0bf,
          { s: 4, fx: { pivot: [x, 30, z0 + 14], spin: [0, 1, 0, 0.5] } });
      }
    }

    // the approach throat narrows before the core chamber
    if (local < 240) {
      for (const side of [-1, 1]) {
        batch.box('hull', 14, side < 0 ? 3.2 : 40, CHUNK_LEN, side * (W / 2 + 6), 0, zc, 12, 0x8f9dad);
      }
    }
  }

  /* --- animated: coolant gates ------------------------------------------ */

  _gate(group, f, owner = group, batch = null) {
    const W = DECK_HALF * 2;
    const top = ALT_MAX + 10;
    // One shared material for every gate: creating one per chunk build
    // would leak a ShaderMaterial on each stream-in.
    const mat = (this._gateMat ??= this.materials.forceField(0xff6a2a));

    const lower = new THREE.Mesh(new THREE.PlaneGeometry(W, 1), mat);
    const upper = new THREE.Mesh(new THREE.PlaneGeometry(W, 1), mat);
    lower.position.set(0, 0, f.z);
    upper.position.set(0, 0, f.z);
    lower.frustumCulled = false;
    upper.frustumCulled = false;
    group.add(lower, upper);

    // physical frame so the gate reads as installed hardware
    const frameMat = this.materials.hazard;
    const frameGeo = new THREE.BoxGeometry(2.4, top, 3);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(frameGeo, frameMat);
      post.position.set(side * (DECK_HALF - 1.2), top / 2, f.z);
      post.castShadow = true;
      // hazard material expects vertex colours; supply white
      const n = post.geometry.attributes.position.count;
      if (!post.geometry.attributes.color) {
        post.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
      }
      group.add(post);
    }

    // Emitter coils on each post pulse with the field; a lintel carries the projector.
    if (batch) {
      for (const side of [-1, 1]) {
        const x = side * (DECK_HALF - 1.2);
        for (let y = 2; y < top - 1; y += 3) {
          batch.box('dark', 3.2, 0.7, 3.8, x, y, f.z, 3, 0xffffff);
          batch.box('neon', 3.3, 0.25, 3.9, x, y + 0.22, f.z, 8, 0xff7a3a, 0, 1.3, { anim: [BREATHE, 1.4, y / top] });
        }
      }
      batch.box('hull', W, 1.6, 3.4, 0, top, f.z, 8, 0x8a96a6);
      for (let x = -CORRIDOR_HALF; x <= CORRIDOR_HALF; x += 3) {
        batch.box('neon', 0.6, 0.3, 0.6, x, top - 0.25, f.z - 1.8, 8, 0xff9a4a, 0, 1.3, { anim: [CHASE, 1.4, (Math.abs(x) / 18) % 1] });
      }
    }

    const state = {
      owner,
      feature: f,
      /** Current opening, mirrored into the level's dynamic collider set. */
      gapY: f.gapY,
      gapH: f.gapH,
      update: (dt, time) => {
        state.previousGapY = state.gapY;
        if (f.cycle > 0) {
          // the slot slides up and down, so timing matters as much as aim
          const t = Math.sin(time * (6.283 / f.cycle) + f.phase);
          state.gapY = f.gapY + t * 4.5;
        }
        const gy = state.gapY;
        const gh = state.gapH;
        lower.scale.set(1, Math.max(gy, 0.001), 1);
        lower.position.y = gy / 2;
        upper.scale.set(1, Math.max(top - (gy + gh), 0.001), 1);
        upper.position.y = (gy + gh + top) / 2;
      },
    };
    f.runtime = state;
    this.animated.push(state);
    state.update(0, 0);
  }
}
