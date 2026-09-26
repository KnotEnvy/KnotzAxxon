/**
 * Power-ups.
 *
 * Dropped by the tougher emplacements. They drift, spin, and magnet toward the
 * player once you're close enough that collecting them feels deserved rather
 * than fiddly — chasing a pickup across the corridor at 50 m/s is not fun.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp01, damp, TAU } from '../core/Utils.js';

const _v = new THREE.Vector3();

const KINDS = {
  shield: { color: 0x45e0ff, label: 'SHIELD', score: 250 },
  spread: { color: 0xffb43a, label: 'SPREAD', score: 250 },
  repair: { color: 0x52ffa8, label: 'HULL +1', score: 250 },
  fuel: { color: 0xffd76a, label: 'FUEL', score: 150 },
};

let shellGeo = null;
let coreGeo = null;
/** Each kind has its own silhouette, so colour is a second cue, not the only one. */
const shapeGeo = new Map();

function merge(parts) {
  const flat = parts.map(g => (g.index ? g.toNonIndexed() : g));
  for (const g of flat) { g.deleteAttribute('uv1'); g.clearGroups(); }
  const out = mergeGeometries(flat, false);
  for (const g of new Set([...parts, ...flat])) g.dispose();
  return out;
}

function shapeFor(kind) {
  if (shapeGeo.has(kind)) return shapeGeo.get(kind);
  let g;
  if (kind === 'shield') {
    g = new THREE.TorusGeometry(1.55, 0.26, 4, 6);                       // hex ring
  } else if (kind === 'spread') {
    const parts = [];
    for (let k = 0; k < 3; k++) for (const s of [-1, 1]) {
      parts.push(new THREE.BoxGeometry(1.3, 0.3, 0.3).rotateZ(s * 0.6).translate(s * 0.5, -0.8 + k * 0.8 + 0.35, 0));
    }
    g = merge(parts);                                                     // triple chevron
  } else if (kind === 'repair') {
    g = merge([new THREE.BoxGeometry(2.2, 0.62, 0.5), new THREE.BoxGeometry(0.62, 2.2, 0.5)]);   // cross
  } else {
    g = merge([
      new THREE.CylinderGeometry(0.7, 0.7, 1.6, 10),
      new THREE.TorusGeometry(0.72, 0.1, 4, 12).rotateX(Math.PI / 2).translate(0, 0.45, 0),
      new THREE.TorusGeometry(0.72, 0.1, 4, 12).rotateX(Math.PI / 2).translate(0, -0.45, 0),
    ]);                                                                   // drum
  }
  shapeGeo.set(kind, g);
  return g;
}

export class Pickup {
  constructor(scene, mats, kind, x, y, z) {
    this.kind = kind;
    const def = KINDS[kind] ?? KINDS.shield;
    this.def = def;
    this.color = def.color;
    this.score = def.score;
    this.alive = true;
    this.radius = 2.2;

    shellGeo ??= new THREE.OctahedronGeometry(1.5, 0);
    coreGeo ??= new THREE.IcosahedronGeometry(0.7, 0);

    this.group = new THREE.Group();
    this.pos = this.group.position;
    this.pos.set(x, y, z);

    this.shell = new THREE.Mesh(
      shellGeo,
      mats.neon(def.color, 1.4, { transparent: true, opacity: 0.45, additive: true, depthWrite: false }),
    );
    this.core = new THREE.Mesh(coreGeo, mats.neon(def.color, 3.2));
    this.core.scale.setScalar(0.55);
    this.shape = new THREE.Mesh(shapeFor(kind), mats.neon(def.color, 1.9));
    this.group.add(this.shell, this.core, this.shape);

    const halos = (mats._pickupHalos ??= new Map());
    if (!halos.has(def.color)) halos.set(def.color, mats.sprite(mats.glow, def.color, { opacity: 0.35 }));
    this.halo = new THREE.Sprite(halos.get(def.color));
    this.halo.scale.setScalar(7);
    this.group.add(this.halo);

    scene.add(this.group);
    this.phase = Math.random() * TAU;
    this.baseY = y;
    this.velocity = new THREE.Vector3(0, 0, 0);
  }

  update(dt, ctx) {
    this.phase += dt;
    this.shell.rotation.y += dt * 1.4;
    this.shell.rotation.x += dt * 0.9;
    this.core.rotation.y -= dt * 2.2;
    // the silhouette turns to face you on a slow wobble
    this.shape.rotation.y = Math.sin(this.phase * 1.7) * 0.6 + (this.kind === 'shield' ? this.phase : 0);
    this.shape.rotation.z = this.kind === 'shield' ? this.phase * 0.8 : Math.sin(this.phase * 2.2) * 0.12;
    const pulse = 1 + Math.sin(this.phase * 4) * 0.12;
    this.shell.scale.setScalar(pulse);
    // the shared halo breathes in size rather than opacity
    this.halo.scale.setScalar(7 * (1 + Math.sin(this.phase * 4) * 0.2));

    const p = ctx.player;
    const d = this.pos.distanceTo(p.pos);
    if (d < 22 && p.alive) {
      // magnet: pull harder the closer it gets
      const strength = (1 - d / 22) ** 2 * 60;
      _v.copy(p.pos).sub(this.pos).normalize().multiplyScalar(strength);
      this.pos.addScaledVector(_v, dt);
    } else {
      this.pos.y = this.baseY + Math.sin(this.phase * 1.6) * 0.7;
    }
  }

  dispose() {
    this.group.parent?.remove(this.group);
  }
}

export const PICKUP_KINDS = Object.keys(KINDS);

/** Called once after all pickups are detached during application shutdown. */
export function disposePickupGeometry() {
  shellGeo?.dispose(); coreGeo?.dispose();
  shellGeo = coreGeo = null;
  for (const g of shapeGeo.values()) g.dispose();
  shapeGeo.clear();
}
