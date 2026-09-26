import { disposeModel } from '../render/Dispose.js';
/**
 * THE IRON SENTINEL — the fortress core guardian, and this game's answer to
 * Zaxxon's robot.
 *
 * A rail boss: it holds station ahead of the player and matches their forward
 * speed, so the fight plays out as a duel in a moving arena rather than a
 * chase. Three phases, each with a different vulnerability rule:
 *
 *   1. Armoured. Only the two shoulder cannons can be hurt. Kill both to crack it.
 *   2. The chest reactor cycles open and shut. Punish the windows.
 *   3. Reactor permanently exposed, but it fights back with everything.
 *
 * From phase 2 the right arm charges a heavy homing missile. Land six hits on
 * the glowing launcher during the charge and it detonates in the robot's hand.
 *
 * Static parts are baked per material inside each moving limb, so the whole
 * robot is a couple of dozen draws however much detail it carries.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SIDE } from './Projectiles.js';
import { CORRIDOR_HALF, ALT_MAX } from '../world/Level.js';
import { taperedBox } from '../render/GeoUtils.js';
import { Rng, clamp, damp, lerp, rand, TAU } from '../core/Utils.js';
import { audio } from '../audio/Audio.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _obj = new THREE.Object3D();

const STANDOFF = [92, 78, 64];
/** Hits the launcher must take while charging to blow the missile in its rack. */
export const LAUNCHER_HITS = 6;
const CHARGE_TIME = 2.6;

/** Collects transformed parts per material key and bakes them into one mesh each. */
class Kit {
  constructor() { this.parts = new Map(); }
  add(key, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    _obj.position.set(x, y, z);
    _obj.rotation.set(rx, ry, rz);
    _obj.scale.set(1, 1, 1);
    _obj.updateMatrix();
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.applyMatrix4(_obj.matrix);
    g.deleteAttribute('uv1');
    g.clearGroups();
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(g);
    return this;
  }
  build(parent, materials, shadow = true) {
    for (const [key, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      const mesh = new THREE.Mesh(merged, materials[key]);
      const lit = key === 'hull' || key === 'dark';
      mesh.castShadow = shadow && lit;
      mesh.receiveShadow = shadow && lit;
      parent.add(mesh);
    }
    this.parts.clear();
  }
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);

export class Boss {
  constructor(scene, mats, feature) {
    this.mats = mats;
    this.rng = new Rng(feature.seed ?? 7);
    this.group = new THREE.Group();
    this.pos = this.group.position;
    this.pos.set(0, 14, feature.z);
    scene.add(this.group);

    this.name = 'IRON SENTINEL';
    this.alive = true;
    this.active = false;
    this.phase = 0;
    this.hpMax = 120;
    this.hp = this.hpMax;
    this.radius = 9;
    this.score = 15000;

    this.coreOpen = 0;
    this.coreTimer = 4;
    this.attackTimer = 2.4;
    this.spiralAngle = 0;
    this.entrance = 0;
    this.deathTimer = 0;
    this.stagger = 0;
    this.velocity = new THREE.Vector3();
    this._hover = 14;
    this._dropY = 58;

    this._build(mats);
  }

  /* ------------------------------------------------------------------ */
  /* Model                                                               */
  /* ------------------------------------------------------------------ */

  _build(mats) {
    // Per-boss materials that animate; everything else is shared and cached.
    this.visorMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3d55).multiplyScalar(2.2), toneMapped: false });
    this.chargeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb43a), toneMapped: false });
    this.seamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3d55).multiplyScalar(0.8), toneMapped: false });
    const M = {
      hull: mats.enemyHull,
      dark: mats.darkMetal,
      neon: this.seamMat,
      glow: mats.neon(0xff7a3a, 2.4),
      visor: this.visorMat,
      charge: this.chargeMat,
    };
    // darkMetal expects vertex colours; bake a light grey into every dark part.
    const whiten = (kit) => {
      for (const g of kit.parts.get('dark') ?? []) {
        g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(0.85), 3));
      }
    };

    /* --- torso: V-chest over a hover skirt ------------------------------ */
    this.torso = new THREE.Group();
    this.group.add(this.torso);
    const t = new Kit();
    t.add('hull', taperedBox(12, 17, 10, 8, 10), 0, -4, 0);
    t.add('hull', taperedBox(13, 8, 5, 9, 6).rotateX(Math.PI), 0, -4, 0);          // skirt, narrowing down
    t.add('dark', box(8.5, 1.6, 7.5), 0, 6.6, 0.4);                                 // collar
    t.add('dark', box(15, 1.1, 10.4), 0, -4.3, 0);                                   // belt
    for (const s of [-1, 1]) {
      t.add('hull', box(6.2, 4.2, 1.1), s * 3.7, 3.2, -5.1, 0.12, s * 0.22, 0);      // pectoral plates
      t.add('dark', box(1.2, 8, 1.2), s * 7.2, 0.5, -3.8, 0, 0, s * 0.12);          // side ribs
      t.add('dark', cyl(0.9, 1.2, 5, 8), s * 3.6, 6.5, 5.2, -0.5, 0, 0);            // back exhaust stacks
      t.add('glow', cyl(0.7, 0.7, 0.2, 8), s * 3.6, 9.0, 6.4, -0.5, 0, 0);
      for (let k = 0; k < 2; k++) {
        t.add('dark', cyl(0.9, 1.3, 1.4, 10), s * 3.2, -9.6, k ? 2.2 : -2.2);        // hover nozzles
        t.add('glow', cyl(1.0, 1.0, 0.12, 10), s * 3.2, -10.35, k ? 2.2 : -2.2);
      }
    }
    for (let k = 0; k < 3; k++) t.add('hull', box(5 - k * 0.6, 1.3, 1), 0, -1.6 - k * 1.5, -4.5 + k * 0.3, 0.1);   // abdominal plates
    t.add('dark', new THREE.TorusGeometry(4.1, 0.55, 6, 24), 0, 1, -5.25);          // reactor housing ring
    for (const s of [-1, 1]) {
      t.add('neon', box(0.18, 5.5, 0.18), s * 5.2, 0.8, -5.0, 0, 0, s * 0.3);        // red chest seams
      t.add('neon', box(3.2, 0.16, 0.18), s * 3.8, -2.6, -4.7);
    }
    whiten(t);
    t.build(this.torso, M);

    /* --- head: helm, visor slit, crest and antennae ---------------------- */
    this.head = new THREE.Group();
    this.head.position.set(0, 8.4, -0.6);
    this.torso.add(this.head);
    const h = new Kit();
    h.add('hull', taperedBox(5.8, 4.4, 4.4, 6, 4.8), 0, -1, 0);
    h.add('dark', box(6.4, 1.3, 1.2), 0, 0.7, -2.9);                                 // brow over the visor
    h.add('dark', box(1.1, 2.4, 3.2), -3.1, -0.2, -0.5);
    h.add('dark', box(1.1, 2.4, 3.2), 3.1, -0.2, -0.5);
    h.add('hull', box(0.5, 1.8, 5.2), 0, 3.6, 0.2);                                  // crest fin
    h.add('dark', box(3.6, 1.1, 1.2), 0, -0.9, -2.7);                                // jaw grille
    for (const s of [-1, 1]) h.add('dark', cyl(0.08, 0.1, 3.4, 5), s * 2.6, 4.2, 1.2, 0.3);
    h.add('visor', box(4.8, 0.6, 0.35), 0, 0.05, -2.95);
    whiten(h);
    h.build(this.head, M);
    this.antennaTips = [];
    for (const s of [-1, 1]) {
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 4), mats.neon(0xff3d55, 3));
      tip.position.set(s * 2.6, 5.85, 1.7);
      this.head.add(tip);
      this.antennaTips.push(tip);
    }

    /* --- chest reactor: the core and its iris shutters ------------------ */
    this.coreGroup = new THREE.Group();
    this.coreGroup.position.set(0, 1, -5.6);
    this.torso.add(this.coreGroup);

    this.coreMat = mats.energyCore(0xff3d55);
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(3.1, 1), this.coreMat);
    this.coreGroup.add(this.core);

    this.coreShell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(3.5, 0),
      mats.neon(0xff3d55, 2.2, { transparent: true, opacity: 0.5, additive: true, depthWrite: false }),
    );
    this.coreGroup.add(this.coreShell);

    // iris shutters — four petals that retract to expose the core
    this.shutters = [];
    const petal = new THREE.BoxGeometry(6.4, 3.6, 1.4);
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(petal, mats.enemyHull);
      s.castShadow = true;
      const holder = new THREE.Group();
      holder.position.set(0, 1, 0);
      holder.rotation.z = (i / 4) * TAU + Math.PI / 4;
      holder.add(s);
      s.position.set(0, 3.4, -6.4);
      this.torso.add(holder);
      this.shutters.push({ holder, mesh: s, base: 3.4 });
    }

    /* --- shoulders, arms and the cannon pods ------------------------------ */
    this.pods = [];
    this.arms = [];
    const podGeo = new THREE.CylinderGeometry(3.4, 4.0, 6.5, 10);
    const barrelGeo = new THREE.CylinderGeometry(0.5, 0.62, 6, 8);
    barrelGeo.rotateX(-Math.PI / 2);
    barrelGeo.translate(0, 0, -3);

    for (const side of [1, -1]) {
      // pauldron on the torso
      const sh = new Kit();
      sh.add('hull', taperedBox(6.4, 4.6, 3.2, 7.6, 6), side * 9.6, 4.4, 0);
      sh.add('dark', box(7, 0.8, 8.2), side * 9.6, 4.2, 0);
      sh.add('dark', cyl(1.3, 1.3, 6, 10), side * 10.4, 0.8, 0.4);                  // upper arm
      sh.add('dark', new THREE.SphereGeometry(1.7, 10, 8), side * 10.4, -2.6, 0.4);  // elbow
      whiten(sh);
      sh.build(this.torso, M);

      // forearm pivots at the elbow; the +X arm carries the missile launcher
      const forearm = new THREE.Group();
      forearm.position.set(side * 10.4, -2.6, 0.4);
      this.torso.add(forearm);
      const fa = new Kit();
      fa.add('hull', box(3.2, 3.2, 7.4), 0, 0, -3.4);
      fa.add('dark', box(3.6, 0.7, 5), 0, 1.9, -3.6);
      if (side > 0) {
        fa.add('hull', box(4.6, 4.6, 5.6), 0, 0.3, -6.4);
        fa.add('dark', box(5, 1, 6), 0, 2.9, -6.4);
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          fa.add('dark', cyl(0.75, 0.75, 1.2, 10).rotateX(Math.PI / 2), dx * 1.1, 0.3 + dy * 1.1, -9.3);
          fa.add('charge', new THREE.CircleGeometry(0.62, 12).rotateY(Math.PI), dx * 1.1, 0.3 + dy * 1.1, -9.92);
        }
      } else {
        // a clawed fist on the other arm
        fa.add('dark', box(3.8, 3.8, 2.4), 0, 0, -8);
        for (let k = -1; k <= 1; k++) fa.add('dark', box(0.8, 0.9, 2.4), k * 1.2, -1.2, -9.8, 0.4);
      }
      whiten(fa);
      fa.build(forearm, M);
      this.arms.push({ side, forearm });
      if (side > 0) {
        this.launcher = {
          forearm, mouth: new THREE.Object3D(), pos: new THREE.Vector3(), radius: 3.4,
          alive: true, charging: false, charge: 0, hits: 0, cooldown: 7, timer: 0,
        };
        this.launcher.mouth.position.set(0, 0.3, -8.8);
        forearm.add(this.launcher.mouth);
      }

      // the cannon pod rides on the shoulder
      const g = new THREE.Group();
      g.position.set(side * 13.8, 5.6, -0.6);
      this.torso.add(g);

      const body = new THREE.Mesh(podGeo, mats.enemyHull);
      body.rotation.x = Math.PI / 2;
      body.castShadow = true;
      g.add(body);

      const barrels = [];
      for (const o of [-1.3, 1.3]) {
        const b = new THREE.Mesh(barrelGeo, mats.darkMetal);
        b.position.set(o, 0, -3);
        b.castShadow = true;
        g.add(b);
        barrels.push(b);
      }

      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), mats.neon(0xffb43a, 3));
      eye.position.set(0, 2.2, -2.4);
      g.add(eye);

      const flashMat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
        toneMapped: false, blending: THREE.AdditiveBlending,
      });
      const flashMesh = new THREE.Mesh(podGeo, flashMat);
      flashMesh.rotation.x = Math.PI / 2;
      flashMesh.scale.setScalar(1.1);
      flashMesh.visible = false;
      g.add(flashMesh);

      // what is left after the pod is shot off: a torn, sparking mount
      const stump = new THREE.Group();
      const st = new Kit();
      st.add('dark', cyl(2.2, 3.0, 2.2, 7), 0, 0, 0.6, Math.PI / 2);
      for (let k = 0; k < 5; k++) st.add('dark', box(0.6, 1.8, 0.5), Math.cos(k * 1.26) * 2, Math.sin(k * 1.26) * 2, -0.8, 0.4, 0, k * 1.26);
      st.add('glow', new THREE.CircleGeometry(1.6, 10).rotateY(Math.PI), 0, 0, -0.52);
      whiten(st);
      st.build(stump, M);
      stump.visible = false;
      g.add(stump);

      this.pods.push({
        group: g, side, hp: 22, hpMax: 22, alive: true, body, stump,
        barrels, eye, flashMat, flashMesh, flash: 0, fireTimer: this.rng.range(0.5, 2),
        pos: new THREE.Vector3(), radius: 5, recoil: 0, spark: 0,
      });
    }

    /* --- rear thrusters -------------------------------------------------- */
    this.thrusters = [];
    for (const side of [-1, 1]) {
      const t2 = new THREE.Mesh(new THREE.CircleGeometry(2.2, 16), mats.neon(0xff7a3a, 2.6));
      t2.position.set(side * 5, 0, 6.1);
      this.torso.add(t2);
      this.thrusters.push(t2);
    }
  }

  get podsAlive() {
    return this.pods.filter((p) => p.alive).length;
  }

  /* ------------------------------------------------------------------ */
  /* Update                                                              */
  /* ------------------------------------------------------------------ */

  update(dt, ctx) {
    const p = ctx.player;

    if (!this.alive) {
      this._updateDeath(dt, ctx);
      return;
    }

    /* --- entrance ---------------------------------------------------- */
    if (!this.active) {
      if (p.pos.z > this.pos.z - 220) {
        this.active = true;
        audio.roar();
        ctx.onBossEngage?.(this);
      } else {
        this.pos.z = Math.max(this.pos.z, p.pos.z + 200);
        this.pos.y = this._hover + this._dropY;
        return;
      }
    }
    const wasLanding = this.entrance < 1;
    this.entrance = Math.min(1, this.entrance + dt * 0.42);
    // The Sentinel drops in from above the arena and brakes on its hover jets.
    const drop = Math.pow(1 - this.entrance, 3) * this._dropY;
    if (wasLanding && this.entrance >= 1) {
      ctx.fx.rings.spawn(_v.set(this.pos.x, 0.4, this.pos.z), { from: 4, to: 46, life: 0.9, color: 0xff9a4a, billboard: false, normal: _v2.set(0, 1, 0), opacity: 0.8 });
      ctx.cameraKick?.(0.8);
      ctx.fx.addTrauma(0.6);
    }

    /* --- station keeping --------------------------------------------- */
    const standoff = STANDOFF[Math.min(this.phase, 2)];
    const wantZ = p.pos.z + standoff;
    const prevZ = this.pos.z;
    this.pos.z = damp(this.pos.z, wantZ, 2.6, dt);

    // lateral weave; more aggressive as phases advance
    this._t = (this._t ?? 0) + dt * (0.55 + this.phase * 0.35) * (this.stagger > 0 ? 0.3 : 1);
    const sweep = (CORRIDOR_HALF - 2) * (0.55 + this.phase * 0.2);
    const wantX = Math.sin(this._t) * sweep + Math.sin(this._t * 2.3) * 3;
    const wantY = 13 + Math.sin(this._t * 0.8) * (3 + this.phase * 2);

    const prevX = this.pos.x;
    const prevY = this.pos.y;
    this.pos.x = damp(this.pos.x, wantX, 2.2, dt);
    this._hover = damp(this._hover, clamp(wantY, 7, ALT_MAX - 4), 2.2, dt);
    this.pos.y = this._hover + drop;
    this.velocity.set(
      (this.pos.x - prevX) / dt, (this.pos.y - prevY) / dt, (this.pos.z - prevZ) / dt,
    );

    // face the player
    _v.copy(p.pos).sub(this.pos);
    const yaw = Math.atan2(_v.x, -_v.z);
    const pitchToPlayer = Math.atan2(_v.y, Math.hypot(_v.x, _v.z));
    this.group.rotation.y = damp(this.group.rotation.y, yaw * 0.35, 3, dt);
    this.group.rotation.z = damp(this.group.rotation.z, -this.velocity.x * 0.008 + (this.stagger > 0 ? Math.sin(ctx.time * 30) * 0.05 : 0), 3, dt);

    /* --- body language ------------------------------------------------ */
    const breathe = Math.sin(ctx.time * 1.6);
    this.torso.position.y = breathe * 0.35;
    this.torso.rotation.x = damp(this.torso.rotation.x, this.stagger > 0 ? 0.25 : breathe * 0.02, 4, dt);
    // the head tracks you harder than the body does
    this.head.rotation.y = damp(this.head.rotation.y, clamp(yaw * 0.9 - this.group.rotation.y, -0.7, 0.7), 5, dt);
    this.head.rotation.x = damp(this.head.rotation.x, clamp(-pitchToPlayer * 0.6, -0.4, 0.4), 5, dt);
    const visor = (1.6 + Math.sin(ctx.time * 5) * 0.35) * (this.phase >= 2 ? 1.5 : 1);
    this.visorMat.color.setRGB(visor, 0.24 * visor, 0.33 * visor);
    this.seamMat.color.setRGB(0.8 + this.phase * 0.5 + this.coreOpen * 0.4, 0.2, 0.26);
    for (const tip of this.antennaTips) tip.visible = Math.sin(ctx.time * 6) > 0;

    this.core.rotation.x += dt * 0.5;
    this.core.rotation.y += dt * 0.8;
    const pulse = 1 + Math.sin(ctx.time * 6) * 0.06;
    this.coreShell.scale.setScalar(pulse * (0.9 + this.coreOpen * 0.35));
    this.coreMat.uniforms.uIntensity.value = 0.35 + this.coreOpen * 1.5;
    for (const t of this.thrusters) t.scale.setScalar(1 + Math.sin(ctx.time * 22) * 0.1);

    // hover wash: jets under the skirt
    this._wash = (this._wash ?? 0) - dt;
    if (this._wash <= 0) {
      this._wash = 0.05;
      this.torso.localToWorld(_v.set(rand.range(-3.2, 3.2), -10.6, rand.range(-2.2, 2.2)));
      ctx.fx.sparks.burst({
        position: _v, count: 1, direction: _v2.set(0, -1, 0), spread: 0.3,
        speed: 14, speedVar: 0.3, life: 0.28, lifeVar: 0.3, size: 2.6, sizeVar: 0.3,
        colorA: 0xffe0b0, colorB: 0xff4a10, drag: 3, gravity: 0, grow: 1.2, fade: 1.3,
      });
    }

    /* --- phase logic --------------------------------------------------- */
    this._updatePhase(dt, ctx);

    /* --- shutters ------------------------------------------------------- */
    for (const s of this.shutters) {
      s.mesh.position.y = s.base + this.coreOpen * 4.6;
      s.mesh.visible = this.coreOpen < 0.98;
    }

    /* --- pods ------------------------------------------------------------ */
    for (const pod of this.pods) {
      pod.group.getWorldPosition(pod.pos);
      if (pod.flash > 0) {
        pod.flash = Math.max(0, pod.flash - dt * 6);
        pod.flashMat.opacity = pod.flash * 0.8;
      }
      pod.flashMesh.visible = pod.flash > 0;
      if (!pod.alive) {
        // the torn mount keeps sparking and smoking
        pod.spark -= dt;
        if (pod.spark <= 0) {
          pod.spark = rand.range(0.08, 0.2);
          ctx.fx.sparks.burst({
            position: pod.pos, count: 3, speed: 12, speedVar: 0.6, life: 0.4, lifeVar: 0.4,
            size: 1.6, sizeVar: 0.4, colorA: 0xffffff, colorB: 0xff8a2a, drag: 2, gravity: -14, fade: 1.6,
          });
          if (rand.bool(0.4)) ctx.fx.smoke.burst({
            position: pod.pos, count: 1, speed: 3, life: 1.4, size: 3, colorA: 0x2a2a2e, colorB: 0x0a0a0c,
            drag: 1, gravity: 2, grow: 2, fade: 1.2,
          });
        }
        continue;
      }
      // aim
      _v.copy(p.pos).sub(pod.pos);
      const pyaw = Math.atan2(_v.x, -_v.z);
      const pitch = Math.atan2(_v.y, Math.hypot(_v.x, _v.z));
      pod.group.rotation.y = damp(pod.group.rotation.y, pyaw * 0.6, 4, dt);
      pod.recoil = Math.max(0, pod.recoil - dt * 5);
      for (const b of pod.barrels) {
        b.rotation.x = damp(b.rotation.x, pitch * 0.6, 4, dt);
        b.position.z = -3 + pod.recoil * 1.2;
      }
      pod.eye.scale.setScalar(1 + Math.sin(ctx.time * 7 + pod.side) * 0.18);
    }

    /* --- arms and the missile launcher ------------------------------------- */
    this._updateLauncher(dt, ctx);
    for (const arm of this.arms) {
      // The launcher arm levels at the ship while it charges; otherwise both
      // forearms hang in a slow guard sway.
      const aiming = arm.side > 0 && this.launcher.charging;
      const want = aiming ? clamp(-pitchToPlayer, -0.4, 0.4) : 0.35 + Math.sin(ctx.time * 1.6 + arm.side) * 0.08;
      arm.forearm.rotation.x = damp(arm.forearm.rotation.x, want, aiming ? 6 : 3, dt);
    }

    /* --- attacks ---------------------------------------------------------- */
    if (this.stagger > 0) { this.stagger -= dt; return; }
    if (this.entrance < 0.85) return;
    this.attackTimer -= dt;
    if (this.attackTimer <= 0 && p.alive) this._chooseAttack(ctx);
  }

  _updatePhase(dt, ctx) {
    if (this.phase === 0) {
      // armoured: core sealed until both pods are gone
      this.coreOpen = damp(this.coreOpen, 0, 4, dt);
      if (this.podsAlive === 0) this._advancePhase(ctx);
    } else if (this.phase === 1) {
      this.coreTimer -= dt;
      if (this.coreTimer <= 0) {
        const opening = this.coreOpen < 0.5;
        this.coreTimer = opening ? 4.2 : 3.0;
        this._wantOpen = opening;
        audio.servo(0, opening);
        if (opening) {
          audio.sting(false);
          ctx.warn('CORE EXPOSED');
        }
      }
      this.coreOpen = damp(this.coreOpen, this._wantOpen ? 1 : 0, 3.4, dt);
      if (this.hp <= this.hpMax * 0.35) this._advancePhase(ctx);
    } else {
      this.coreOpen = damp(this.coreOpen, 1, 3, dt);
      this._rageTimer = (this._rageTimer ?? 0) - dt;
      if (this._rageTimer <= 0) {
        this._rageTimer = 6.5;
        // call in escorts
        for (let i = 0; i < 2; i++) {
          ctx.spawnEnemy?.('interceptor', {
            z: this.pos.z - 20 - i * 12,
            x: rand.range(-10, 10),
            y: rand.range(6, 18),
            pattern: 'dive',
            seed: rand.int(0, 1e6),
          });
        }
      }
    }
  }

  _advancePhase(ctx) {
    this.phase++;
    this.attackTimer = 1.4;
    this._wantOpen = true;
    this.coreTimer = 4.5;
    this.launcher.cooldown = Math.min(this.launcher.cooldown, 3);
    ctx.fx.explosion(this.pos, 2.4, { shake: 1.6, debris: false });
    ctx.postfx?.flash(0.5, 0xff8a4a);
    audio.explosion(2.2, 0);
    audio.sting(false);
    if (this.phase === 2) audio.roar();
    ctx.onBossPhase?.(this);
    ctx.warn(this.phase === 1 ? 'ARMOUR BREACHED' : 'SENTINEL ENRAGED');
  }

  /**
   * The Zaxxon duel. From phase 2 the launcher arm charges a heavy missile;
   * six hits in the window blow it in the rack, otherwise it launches.
   */
  _updateLauncher(dt, ctx) {
    const L = this.launcher;
    L.mouth.getWorldPosition(L.pos);
    L.charge = damp(L.charge, L.charging ? 1 : 0, L.charging ? 1.4 : 6, dt);
    const glow = L.charging ? 0.6 + L.charge * 3 + Math.sin(ctx.time * (10 + L.charge * 30)) * 0.5 : 0.35;
    this.chargeMat.color.setRGB(glow, glow * 0.62, glow * 0.18);
    if (this.phase < 1 || this.entrance < 1) return;
    if (!L.charging) {
      if (this.stagger <= 0) L.cooldown -= dt;
      if (L.cooldown <= 0) {
        L.charging = true;
        L.timer = CHARGE_TIME;
        L.hits = 0;
        audio.servo(audio.panFor(L.pos.x, ctx.player.pos.x), true);
        audio.charge(CHARGE_TIME);
        ctx.warn('MISSILE CHARGING');
      }
      return;
    }
    L.timer -= dt;
    if (L.timer > 0) return;
    // charge completed: launch the heavy homing missile
    L.charging = false;
    L.cooldown = lerp(9, 6.5, this.phase / 2);
    _v2.set(0, 0.1, -1);
    ctx.projectiles.launchMissile(L.pos.x, L.pos.y, L.pos.z, _v2.x, _v2.y, _v2.z, 40, ctx.player,
      { damage: 1, radius: 1.9, turn: 2.3, life: 8 });
    ctx.fx.muzzle(L.pos, _v2, 0xffb060, 2.2);
    audio.missile(audio.panFor(L.pos.x, ctx.player.pos.x), L.pos.z - ctx.player.pos.z);
    ctx.warn('MISSILE LOCK - ROLL');
  }

  /* ------------------------------------------------------------------ */
  /* Attacks                                                             */
  /* ------------------------------------------------------------------ */

  _chooseAttack(ctx) {
    const opts = [];
    if (this.podsAlive > 0) opts.push('spray', 'aimed');
    opts.push('spiral');
    if (this.phase >= 1) opts.push('missiles', 'sweep');
    if (this.phase >= 2) opts.push('sweep', 'spiral', 'missiles');

    const pick = opts[Math.floor(rand.next() * opts.length)];
    const cooldown = lerp(2.6, 1.1, this.phase / 2) * rand.range(0.85, 1.2);
    // Ease off while the launcher charges so the duel stays winnable.
    this.attackTimer = cooldown + (this.launcher.charging ? 0.8 : 0);

    switch (pick) {
      case 'spray': this._spray(ctx); break;
      case 'aimed': this._aimed(ctx); break;
      case 'spiral': this._spiral(ctx); break;
      case 'missiles': this._missiles(ctx); break;
      case 'sweep': this._sweep(ctx); break;
    }
  }

  _muzzle(ctx, from, dir, color = 0xff8a4a, scale = 1) {
    ctx.fx.muzzle(from, dir, color, scale);
  }

  _spray(ctx) {
    const speed = 68;
    for (const pod of this.pods) {
      if (!pod.alive) continue;
      const n = 5 + this.phase * 2;
      for (let i = 0; i < n; i++) {
        const a = (i / (n - 1) - 0.5) * 0.85;
        _v.copy(pod.pos);
        _v2.set(Math.sin(a), rand.range(-0.08, 0.02), -Math.cos(a));
        ctx.projectiles.fire(SIDE.ENEMY, _v.x, _v.y, _v.z, _v2.x, _v2.y, _v2.z, speed, {
          damage: 1, radius: 1, life: 4.5, width: 1.2,
        });
      }
      pod.recoil = 1;
      this._muzzle(ctx, pod.pos, _v2, 0xffb060, 1.4);
    }
    audio.enemyShot(0, this.pos.z - ctx.player.pos.z, 'boss');
  }

  _aimed(ctx) {
    const speed = 100;
    for (const pod of this.pods) {
      if (!pod.alive) continue;
      _v2.copy(ctx.player.pos);
      _v2.z += ctx.player.speed * 0.35;
      _v2.sub(pod.pos).normalize();
      for (let i = 0; i < 3; i++) {
        ctx.projectiles.fire(
          SIDE.ENEMY, pod.pos.x, pod.pos.y, pod.pos.z - i * 3,
          _v2.x + rand.gauss() * 0.02, _v2.y + rand.gauss() * 0.02, _v2.z,
          speed, { damage: 1, radius: 1, life: 4 },
        );
      }
      pod.recoil = 1;
      this._muzzle(ctx, pod.pos, _v2, 0xff5a3a, 1.2);
    }
    audio.enemyShot(0, this.pos.z - ctx.player.pos.z, 'boss');
  }

  _spiral(ctx) {
    const count = 14 + this.phase * 6;
    const speed = 56;
    // the reactor vents the ring of fire from the chest
    this.coreGroup.getWorldPosition(_v);
    _v.z -= 2;
    for (let i = 0; i < count; i++) {
      const a = this.spiralAngle + (i / count) * TAU;
      _v2.set(Math.cos(a) * 0.62, Math.sin(a) * 0.62, -0.78).normalize();
      ctx.projectiles.fire(SIDE.ENEMY, _v.x, _v.y, _v.z, _v2.x, _v2.y, _v2.z, speed, {
        damage: 1, radius: 0.9, life: 5, width: 1.1,
      });
    }
    this.spiralAngle += 0.42;
    ctx.fx.rings.spawn(_v, { from: 2, to: 26, life: 0.45, color: 0xff3d55, opacity: 0.8 });
    audio.enemyShot(0, this.pos.z - ctx.player.pos.z, 'boss');
  }

  _missiles(ctx) {
    const n = 2 + this.phase;
    for (let i = 0; i < n; i++) {
      // launched from the back stacks, arcing over the shoulders
      _v.copy(this.pos);
      _v.x += (i - (n - 1) / 2) * 4;
      _v.y += 8;
      ctx.projectiles.launchMissile(
        _v.x, _v.y, _v.z, (i - (n - 1) / 2) * 0.4, 0.9, -0.6, 46, ctx.player,
        { damage: 1, radius: 1.4, turn: 2.0 + this.phase * 0.3, life: 7.5 },
      );
    }
    audio.missile(0, this.pos.z - ctx.player.pos.z);
    ctx.warn('MISSILES INBOUND');
  }

  /**
   * A curtain of fire across the corridor with exactly one gap. Read it, fly
   * through it — the boss's version of the wall gaps from the rest of the game.
   */
  _sweep(ctx) {
    const speed = 62;
    const gapX = rand.range(-CORRIDOR_HALF + 4, CORRIDOR_HALF - 4);
    const gapW = lerp(9, 6.5, this.phase / 2);
    _v.copy(this.pos);
    for (let x = -CORRIDOR_HALF - 3; x <= CORRIDOR_HALF + 3; x += 2.6) {
      if (Math.abs(x - gapX) < gapW / 2) continue;
      for (const y of [this.pos.y - 4, this.pos.y + 4]) {
        ctx.projectiles.fire(SIDE.ENEMY, x, y, this.pos.z - 6, 0, 0, -1, speed, {
          damage: 1, radius: 0.9, life: 5, width: 1.3,
        });
      }
    }
    ctx.warn('BARRAGE');
    audio.enemyShot(0, this.pos.z - ctx.player.pos.z, 'boss');
  }

  /* ------------------------------------------------------------------ */
  /* Damage                                                              */
  /* ------------------------------------------------------------------ */

  /**
   * Resolve a hit at a world position.
   * @returns {'launcher'|'pod'|'core'|'armour'|null}
   */
  hitAt(worldPos, dmg, ctx) {
    if (!this.alive) return null;

    // the charging launcher is the priority target when it is live
    const L = this.launcher;
    if (L?.charging && worldPos.distanceTo(L.pos) < L.radius) {
      L.hits++;
      ctx.fx.impact(worldPos, _v2.set(0, 0, -1), 0xffb43a, 1.1);
      if (L.hits >= LAUNCHER_HITS) this._detonateLauncher(ctx);
      else ctx.awardScore?.(50, L.pos, `${LAUNCHER_HITS - L.hits}`);
      return 'launcher';
    }

    // pods first — they stick out and are the phase-1 objective
    for (const pod of this.pods) {
      if (!pod.alive) continue;
      if (worldPos.distanceTo(pod.pos) < pod.radius) {
        pod.hp -= dmg;
        pod.flash = 1;
        if (pod.hp <= 0) {
          pod.alive = false;
          pod.body.visible = false;
          pod.eye.visible = false;
          for (const b of pod.barrels) b.visible = false;
          pod.stump.visible = true;
          this.hp -= 18;
          ctx.fx.explosion(pod.pos, 1.8, { shake: 1.2 });
          audio.explosion(1.8, audio.panFor(pod.pos.x, ctx.player.pos.x), pod.pos.z - ctx.player.pos.z);
          ctx.awardScore?.(2500, pod.pos, 'CANNON DESTROYED');
        }
        return 'pod';
      }
    }

    // core, only when the shutters are open
    this.coreGroup.getWorldPosition(_v);
    if (this.coreOpen > 0.55 && worldPos.distanceTo(_v) < 6.5) {
      this.hp -= dmg * 1.6;
      ctx.fx.impact(worldPos, _v2.copy(worldPos).sub(_v).normalize(), 0xff3d55, 1.3);
      if (this.hp <= 0) this._die(ctx);
      return 'core';
    }

    // otherwise it bounces
    if (worldPos.distanceTo(this.pos) < this.radius + 2) {
      ctx.fx.impact(worldPos, _v2.copy(worldPos).sub(this.pos).normalize(), 0x9fb8cc, 0.8);
      return 'armour';
    }
    return null;
  }

  _detonateLauncher(ctx) {
    const L = this.launcher;
    L.charging = false;
    L.cooldown = 10;
    this.hp -= 14;
    this.stagger = 2.2;
    ctx.fx.explosion(L.pos, 2.2, { shake: 1.4, colorHot: 0xfff0a0, colorMid: 0xffa030 });
    ctx.postfx?.flash(0.35, 0xffb43a);
    audio.explosion(2.4, audio.panFor(L.pos.x, ctx.player.pos.x), L.pos.z - ctx.player.pos.z);
    ctx.awardScore?.(3000, L.pos, 'MISSILE DESTROYED IN RACK');
    ctx.warn('SENTINEL STAGGERED');
    if (this.hp <= 0) this._die(ctx);
  }

  _die(ctx) {
    this.alive = false;
    this.hp = 0;
    this.deathTimer = 3.4;
    this.launcher.charging = false;
    // the head tears free and tumbles away
    this._headSpin = new THREE.Vector3(rand.range(-3, 3), rand.range(2, 5), rand.range(-2, 2));
    ctx.onBossDefeated?.(this);
    audio.stopMusic();
  }

  _updateDeath(dt, ctx) {
    this.deathTimer -= dt;
    // ride along with the player so the spectacle stays on screen
    this.pos.z = damp(this.pos.z, ctx.player.pos.z + 70, 1.6, dt);
    this.group.rotation.z += dt * 0.5;
    this.group.rotation.x += dt * 0.2;
    this.coreOpen = 1;
    if (this._headSpin) {
      this.head.position.y += dt * 9;
      this.head.position.z += dt * 4;
      this.head.rotation.x += this._headSpin.x * dt;
      this.head.rotation.y += this._headSpin.y * dt;
      this.head.rotation.z += this._headSpin.z * dt;
    }

    this._boomTimer = (this._boomTimer ?? 0) - dt;
    if (this._boomTimer <= 0 && this.deathTimer > 0.6) {
      this._boomTimer = 0.14;
      _v.copy(this.pos).add(
        _v2.set(rand.range(-11, 11), rand.range(-6, 6), rand.range(-8, 8)),
      );
      ctx.fx.explosion(_v, rand.range(0.7, 1.7), { shake: 0.5 });
      audio.explosion(rand.range(0.8, 1.6), audio.panFor(_v.x, ctx.player.pos.x));
    }

    if (this.deathTimer <= 0 && !this._finalBoom) {
      this._finalBoom = true;
      ctx.fx.explosion(this.pos, 4.5, { shake: 3 });
      for (let i = 0; i < 5; i++) {
        ctx.fx.rings.spawn(this.pos, { from: 4, to: 90 + i * 30, life: 1.1 + i * 0.2, color: 0xffd9a0, opacity: 0.8 });
      }
      ctx.postfx?.flash(1, 0xffffff);
      audio.explosion(3, 0);
      this.group.visible = false;
      ctx.onBossGone?.(this);
    }
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    disposeModel(this.group);
    this.coreMat.dispose();
    for (const m of [this.visorMat, this.chargeMat, this.seamMat]) m.dispose();
    for (const pod of this.pods) pod.flashMat.dispose();
  }
}
