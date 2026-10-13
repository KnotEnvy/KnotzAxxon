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
    for (let k = 0; k < 3; k++) {
      const shape = new THREE.Shape([[-.9,-.15],[0,.48],[.9,-.15],[.7,-.37],[0,.13],[-.7,-.37]].map(p=>new THREE.Vector2(...p)));
      parts.push(new THREE.ExtrudeGeometry(shape,{depth:.12,bevelEnabled:true,bevelThickness:.035,bevelSize:.035,bevelSegments:1}).translate(0,-.8+k*.8,0));
    }
    g = merge(parts);                                                     // triple chevron
  } else if (kind === 'repair') {
    const shape = new THREE.Shape([[-.31,-1.1],[.31,-1.1],[.31,-.31],[1.1,-.31],[1.1,.31],[.31,.31],
      [.31,1.1],[-.31,1.1],[-.31,.31],[-1.1,.31],[-1.1,-.31],[-.31,-.31]].map(p=>new THREE.Vector2(...p)));
    g = new THREE.ExtrudeGeometry(shape,{depth:.12,bevelEnabled:true,bevelThickness:.04,bevelSize:.04,bevelSegments:1});
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

    shellGeo ??= new THREE.TorusGeometry(1.98, .065, 6, 32);
    coreGeo ??= new THREE.CylinderGeometry(1.64,1.64,.16,6).rotateX(Math.PI/2);

    this.group = new THREE.Group();
    this.pos = this.group.position;
    this.pos.set(x, y, z);

    this.shell = new THREE.Mesh(
      shellGeo,
      mats.neon(def.color, 1.15),
    );
    this.core = new THREE.Mesh(coreGeo, mats.enemyMetal ?? mats.darkMetal);
    this.core.position.z = -.30;
    this.shape = new THREE.Mesh(shapeFor(kind), mats.neon(def.color, 1.35));
    this.shape.position.z = .10;
    if (kind === 'fuel') this.shape.scale.set(.82, .82, .25);
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
    // Keep the badge readable in every rig; its ring never sweeps through it.
    if (ctx.camera?.quaternion) this.group.quaternion.copy(ctx.camera.quaternion);
    this.shell.rotation.z += dt * .3;
    this.shape.rotation.z = Math.sin(this.phase * 2.2) * .08;
    const pulse = 1 + Math.sin(this.phase * 4) * 0.025;
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
