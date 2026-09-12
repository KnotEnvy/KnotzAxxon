/**
 * Power-ups.
 *
 * Dropped by the tougher emplacements. They drift, spin, and magnet toward the
 * player once you're close enough that collecting them feels deserved rather
 * than fiddly — chasing a pickup across the corridor at 50 m/s is not fun.
 */

import * as THREE from 'three';
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
    this.group.add(this.shell, this.core);

    this.halo = new THREE.Sprite(mats.sprite(mats.glow, def.color));
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
    const pulse = 1 + Math.sin(this.phase * 4) * 0.12;
    this.shell.scale.setScalar(pulse);
    this.halo.material.opacity = 0.35 + Math.sin(this.phase * 4) * 0.15;

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
    this.halo.material.dispose();
    this.group.parent?.remove(this.group);
  }
}

export const PICKUP_KINDS = Object.keys(KINDS);

/** Called once after all pickups are detached during application shutdown. */
export function disposePickupGeometry() {
  shellGeo?.dispose(); coreGeo?.dispose();
  shellGeo = coreGeo = null;
}
