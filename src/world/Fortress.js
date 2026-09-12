/**
 * Fortress geometry streamer.
 *
 * The level is sliced into CHUNK_LEN chunks. Each chunk merges its dozens of
 * boxes down to one mesh per material, so a whole visible fortress costs a
 * handful of draw calls instead of hundreds. Chunks are built lazily ahead of
 * the player (one per frame, to avoid hitching) and disposed once behind.
 *
 * Per-block variation comes from vertex colours, which is why the structural
 * materials are declared with `vertexColors: true`.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { applyBoxUV, taperedBox } from '../render/GeoUtils.js';
import { Rng, clamp, lerp } from '../core/Utils.js';
import { CHUNK_LEN, DECK_HALF, ALT_MAX, SECTOR_KINDS } from './Level.js';

const _m = new THREE.Matrix4();
const _c = new THREE.Color();

/**
 * Accumulates geometry per material bucket, then merges each bucket once.
 */
class Batch {
  constructor() {
    this.buckets = new Map();
    this.surfaces = [];
    this.captureSurfaces = false;
  }

  /**
   * @param {string} key material bucket
   * @param {THREE.BufferGeometry} geo consumed (disposed after merge)
   * @param {number} x
   * @param {number} y bottom of the box
   * @param {number} z
   * @param {number} uvScale world units per texture tile
   * @param {number} color vertex tint
   * @param {number} [rotY]
   */
  add(key, geo, x, y, z, uvScale, color, rotY = 0, gain = 1) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();

    if (rotY) g.rotateY(rotY);
    g.translate(x, y, z);
    applyBoxUV(g, uvScale);

    _c.setHex(color);
    // Emissive pieces push the vertex colour above 1 so the bloom pass can
    // pick them out; structural pieces stay at gain 1 and are just tinted.
    if (gain !== 1) _c.multiplyScalar(gain);
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      colors[i * 3] = _c.r;
      colors[i * 3 + 1] = _c.g;
      colors[i * 3 + 2] = _c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.deleteAttribute('uv1');
    g.deleteAttribute('tangent');

    if (!this.buckets.has(key)) this.buckets.set(key, []);
    this.buckets.get(key).push(g);
  }

  /** Convenience: axis-aligned box whose origin is its bottom-centre. */
  box(key, w, h, d, x, y, z, uvScale, color, rotY = 0, gain = 1) {
    if (this.captureSurfaces) this.surfaces.push({ minX:x-w/2, maxX:x+w/2, minZ:z-d/2, maxZ:z+d/2, top:y+h });
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
    this.add(key, g, x, y, z, uvScale, color, rotY, gain);
  }

  merge(materialFor, group, castShadow = true, receiveShadow = true) {
    for (const [key, list] of this.buckets) {
      if (!list.length) continue;
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, materialFor(key));
      mesh.castShadow = castShadow && key !== 'neon' && key !== 'glass';
      mesh.receiveShadow = receiveShadow && key !== 'neon' && key !== 'glass';
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
    }
    this.buckets.clear();
  }
}

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
        default: return materials.hull;
      }
    };

    /** Animated pieces (gates, rotating radar dishes) live here. */
    this.animated = [];
    this.rearObstacles = [];
  }

  /* ------------------------------------------------------------------ */
  /* Streaming                                                           */
  /* ------------------------------------------------------------------ */

  update(playerZ, dt, time, frame) {
    const ahead = this.quality.drawDistance;
    const behind = 90;
    const first = Math.floor((playerZ - behind) / CHUNK_LEN);
    const last = Math.floor((playerZ + ahead) / CHUNK_LEN);

    // queue anything missing, nearest first
    for (let i = first; i <= last; i++) {
      if (!this.chunks.has(i) && !this.buildQueue.includes(i)) this.buildQueue.push(i);
    }
    this.buildQueue.sort((a, b) => a - b);

    // build at most a couple per frame so streaming never causes a hitch
    if (frame === undefined || frame !== this._buildFrame) {
      this._buildFrame = frame;
      this._buildBudget = 2;
    }
    while (this._buildBudget > 0 && this.buildQueue.length) {
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

    if (!sector) return group;

    if (sector.kind === SECTOR_KINDS.FORTRESS) {
      this._deck(batch, rng, z0, sector);
      this._trenchWalls(batch, rng, z0, sector);
      this._skyline(batch, rng, z0, sector);
    } else if (sector.kind === SECTOR_KINDS.BOSS) {
      this._arena(batch, rng, z0, sector);
    } else {
      this._voidProps(batch, rng, z0, sector);
    }

    // features that own real geometry
    for (const f of this.level.features) {
      if (f.z < z0 || f.z >= z1) continue;
      if (f.kind === 'wall' || f.kind === 'arch' || f.kind === 'gate') {
        const obstacle = new THREE.Group();
        group.add(obstacle);
        if (f.kind === 'gate') this._gate(obstacle, f, group);
        else {
          const featureBatch = new Batch();
          if (f.kind === 'wall') this._wall(featureBatch, f, rng);
          else this._arch(featureBatch, f, rng);
          featureBatch.merge(this._matFor, obstacle);
        }
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

    // main slab
    batch.box('deck', W, 2.4, CHUNK_LEN, 0, -2.4, zc, 11, 0xd8dee6);

    // recessed centre channel with a glowing conduit
    batch.box('grate', 7, 0.35, CHUNK_LEN, 0, -0.12, zc, 4, 0x9aa6b4);
    batch.box('neon', 1.5, 0.1, CHUNK_LEN - 6, 0, 0.22, zc, 10, 0x45e0ff, 0, 0.5);

    // Small runway edge dashes share the existing emissive batch.
    const stripeColor = sector.index === 3 ? 0xffbf69 : sector.index >= 5 ? 0xe5c2a0 : 0x8bcbd0;
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
      if (rng.bool(0.4)) batch.box('neon', 1.1, 0.06, 1.1, x, 0.34, z, 8, 0xffb43a, 0, 0.7);
    }
    batch.captureSurfaces = false;
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
      }

      // horizontal ledge + hazard stripe at flight-deck height
      batch.box('dark', 2.4, 0.9, CHUNK_LEN, baseX - side * 3.6, side < 0 ? 1.8 : rng.range(9, 15), zc, 6, 0xffffff);

      // glowing conduit at the base
      batch.box('neon', 0.5, 0.5, CHUNK_LEN - 2, baseX - side * 3.5, 0.7, zc, 10, 0x45e0ff, 0, 0.62);

      // lit windows
      const wins = rng.int(5, 5 + Math.round(CHUNK_LEN / 8));
      for (let i = 0; i < wins; i++) {
        const wz = z0 + rng.range(2, CHUNK_LEN - 2);
        const wy = rng.range(0.6, Math.max(0.8, h - 2));
        const warm = rng.bool(0.35);
        batch.box('neon', 0.25, rng.range(0.5, 1.6), rng.range(1.2, 3.2),
          baseX - side * 3.55, wy, wz, 8, warm ? 0xffb43a : 0x45e0ff, 0, 1.25);
      }
    }
  }

  /* --- background skyline --------------------------------------------- */

  _skyline(batch, rng, z0, sector) {
    const count = rng.int(4, 4 + Math.round(CHUNK_LEN / 14));
    for (let i = 0; i < count; i++) {
      const side = rng.bool() ? 1 : -1;
      const x = side * rng.range(DECK_HALF + 14, DECK_HALF + 62);
      const z = z0 + rng.range(0, CHUNK_LEN);
      const fullHeight = rng.range(18, 78);
      const h = side < 0 ? 6 : fullHeight;
      const w = rng.range(7, 20);
      const g = taperedBox(w, w * rng.range(0.5, 0.95), h, w * rng.range(0.8, 1.2), w * 0.6);
      batch.add('dark', g, x, 0, z, 12, 0xffffff, rng.range(-0.4, 0.4));

      // aircraft warning lights
      if (rng.bool(0.55)) {
        batch.box('neon', 1.1, 1.1, 1.1, x, h + 0.4, z, 8, 0xff3d55, 0, 1.5);
      }
      if (rng.bool(0.5)) {
        batch.box('neon', 0.4, h * 0.6, 0.4, x + w * 0.4, h * 0.2, z, 8, 0x45e0ff, 0, 0.85);
      }
    }
  }

  /* --- barrier walls -------------------------------------------------- */

  _wall(batch, f, rng) {
    const top = ALT_MAX + 10;
    const W = DECK_HALF * 2;
    const t = f.thickness;
    const tint = 0xb9c4d2;

    const stripe = (x, y, w, h) => {
      // hazard chevrons framing every gap edge — the read at speed
      batch.box('hazard', w, 0.55, t + 0.35, x, y, f.z, 4, 0xffffff);
    };

    if (f.type === 'pillars') {
      for (const g of f.gaps) {
        batch.box('hull', g.w, top, t, g.x, 0, f.z, 9, tint);
        batch.box('hazard', g.w + 0.2, 0.7, t + 0.3, g.x, 1.2, f.z, 4, 0xffffff);
        batch.box('neon', g.w * 0.35, top * 0.8, 0.16, g.x, 1.6, f.z + t / 2 + 0.1, 9, 0xffb43a, 0, 0.95);
      }
      return;
    }

    const gap = f.gaps[0];

    if (f.type === 'slot' || f.type === 'stagger') {
      if (gap.y > 0.3) batch.box('hull', W, gap.y, t, 0, 0, f.z, 9, tint);
      batch.box('hull', W, top - (gap.y + gap.h), t, 0, gap.y + gap.h, f.z, 9, tint);
      stripe(0, gap.y - 0.55, W, 0.55);
      stripe(0, gap.y + gap.h, W, 0.55);
      // guide lights down the throat of the gap
      for (const side of [-1, 1]) {
        batch.box('neon', 0.4, gap.h, 0.4, side * (W / 2 - 1.2), gap.y, f.z, 8, 0x45e0ff, 0, 1.45);
      }
    } else if (f.type === 'notch') {
      const leftW = (gap.x - gap.w / 2) + DECK_HALF;
      const rightW = DECK_HALF - (gap.x + gap.w / 2);
      if (leftW > 0.2) batch.box('hull', leftW, top, t, -DECK_HALF + leftW / 2, 0, f.z, 9, tint);
      if (rightW > 0.2) batch.box('hull', rightW, top, t, DECK_HALF - rightW / 2, 0, f.z, 9, tint);
      for (const side of [-1, 1]) {
        const ex = gap.x + side * gap.w / 2;
        batch.box('hazard', 0.6, top, t + 0.3, ex, 0, f.z, 5, 0xffffff);
        batch.box('neon', 0.22, top * 0.9, 0.22, ex - side * 0.6, 0.5, f.z + t / 2 + 0.12, 8, 0xffb43a, 0, 1.4);
      }
    } else {
      // window
      if (gap.y > 0.3) batch.box('hull', W, gap.y, t, 0, 0, f.z, 9, tint);
      batch.box('hull', W, top - (gap.y + gap.h), t, 0, gap.y + gap.h, f.z, 9, tint);
      const leftW = (gap.x - gap.w / 2) + DECK_HALF;
      const rightW = DECK_HALF - (gap.x + gap.w / 2);
      if (leftW > 0.2) batch.box('hull', leftW, gap.h, t, -DECK_HALF + leftW / 2, gap.y, f.z, 9, tint);
      if (rightW > 0.2) batch.box('hull', rightW, gap.h, t, DECK_HALF - rightW / 2, gap.y, f.z, 9, tint);
      // frame the opening
      batch.box('hazard', gap.w + 1.2, 0.5, t + 0.3, gap.x, gap.y - 0.5, f.z, 4, 0xffffff);
      batch.box('hazard', gap.w + 1.2, 0.5, t + 0.3, gap.x, gap.y + gap.h, f.z, 4, 0xffffff);
      for (const side of [-1, 1]) {
        batch.box('neon', 0.35, gap.h, 0.35, gap.x + side * (gap.w / 2 + 0.3), gap.y, f.z, 8, 0x45e0ff, 0, 1.45);
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
  }

  _platform(batch, f, rng) {
    batch.surfaces.push({ minX:f.x-8, maxX:f.x+8, minZ:f.z-8, maxZ:f.z+8, top:f.y+2.57 });
    batch.box('deck', 16, 2.4, 16, f.x, f.y, f.z, 8, 0xc8d2de);
    batch.box('dark', 17.5, 0.5, 17.5, f.x, f.y - 0.5, f.z, 8, 0xffffff);
    batch.box('neon', 15, 0.12, 0.35, f.x, f.y + 2.45, f.z - 7.6, 8, 0x45e0ff, 0, 0.85);
    batch.box('neon', 15, 0.12, 0.35, f.x, f.y + 2.45, f.z + 7.6, 8, 0x45e0ff, 0, 0.85);
    // underside strut, so it doesn't look like it's floating by magic
    batch.box('dark', 2, 6, 2, f.x, f.y - 6.2, f.z, 6, 0xffffff);
  }

  _debrisRing(batch, f, rng) {
    const n = rng.int(10, 20);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const r = f.radius * rng.range(0.7, 1.25);
      const x = Math.cos(a) * r;
      const y = 12 + Math.sin(a) * r * 0.6;
      const s = rng.range(1.4, 5);
      batch.box('dark', s, s * rng.range(0.5, 1.4), s * rng.range(0.6, 1.6),
        x, y, f.z + rng.range(-24, 24), 5, 0xffffff, rng.next() * 3);
    }
  }

  /* --- void sectors ---------------------------------------------------- */

  _voidProps(batch, rng, z0, sector) {
    // A sparse lane of distant wreckage keeps open space from feeling empty.
    if (!rng.bool(0.55)) return;
    const n = rng.int(1, 3);
    for (let i = 0; i < n; i++) {
      const side = rng.bool() ? 1 : -1;
      const x = side * rng.range(70, 190);
      const y = rng.range(-40, 70);
      const z = z0 + rng.range(0, CHUNK_LEN);
      const s = rng.range(8, 34);
      batch.box('dark', s, s * rng.range(0.3, 0.8), s * rng.range(1.5, 4),
        x, y, z, 12, 0xffffff, rng.next() * 3);
      if (rng.bool(0.5)) batch.box('neon', 1.4, 1.4, 1.4, x, y + s * 0.5, z, 8, 0xff3d55, 0, 1.4);
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

    // buttresses marching down both sides of the arena
    for (const side of [-1, 1]) {
      const x = side * (W / 2 - 3);
      batch.box('hull', 8, side < 0 ? 3.2 : rng.range(26, 44), 8, x, 0, z0 + 14, 10, 0x9fb0c2);
      batch.box('hull', 8, side < 0 ? 3.2 : rng.range(26, 44), 8, x, 0, z0 + 44, 10, 0x9fb0c2);
      batch.box('neon', 0.4, side < 0 ? 1.8 : 24, 0.4, x - side * 4.3, side < 0 ? 0.6 : 3, z0 + 14, 8, 0xff3d55, 0, 1.1);
      batch.box('neon', 0.4, side < 0 ? 1.8 : 24, 0.4, x - side * 4.3, side < 0 ? 0.6 : 3, z0 + 44, 8, 0xff3d55, 0, 1.1);
    }

    // the approach throat narrows before the core chamber
    if (local < 240) {
      for (const side of [-1, 1]) {
        batch.box('hull', 14, side < 0 ? 3.2 : 40, CHUNK_LEN, side * (W / 2 + 6), 0, zc, 12, 0x8f9dad);
      }
    }
  }

  /* --- animated: coolant gates ------------------------------------------ */

  _gate(group, f, owner = group) {
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
