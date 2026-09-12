/**
 * Projectiles.
 *
 * All shots live in flat typed arrays and are drawn with three InstancedMesh
 * pools (player bolts, enemy bolts, missiles). Projectile slots reuse their storage;
 * a dead slot is just `life <= 0`.
 *
 * Collision resolution lives in Game.js — this module owns motion and drawing
 * only, which keeps the "what can hit what" rules in one readable place.
 */

import * as THREE from 'three';
import { rand, clamp } from '../core/Utils.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _fwd = new THREE.Vector3(0, 0, 1);

export const SIDE = { PLAYER: 0, ENEMY: 1 };

class Pool {
  constructor(capacity) {
    this.capacity = capacity;
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.z = new Float32Array(capacity);
    this.px = new Float32Array(capacity);
    this.py = new Float32Array(capacity);
    this.pz = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.vz = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.dmg = new Float32Array(capacity);
    this.radius = new Float32Array(capacity);
    this.scaleL = new Float32Array(capacity);
    this.scaleR = new Float32Array(capacity);
    this.target = new Array(capacity).fill(null);
    this.turn = new Float32Array(capacity);
    this.cursor = 0;
    this.count = 0;
  }

  next() {
    // Prefer a genuinely free slot; only stomp a live one if the pool is full.
    for (let i = 0; i < this.capacity; i++) {
      const idx = (this.cursor + i) % this.capacity;
      if (this.life[idx] <= 0) {
        this.cursor = (idx + 1) % this.capacity;
        return idx;
      }
    }
    const idx = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    return idx;
  }

  clear() {
    this.life.fill(0);
    this.target.fill(null);
  }
}

export class Projectiles {
  constructor(scene, materials, quality) {
    this.scene = scene;
    this.materials = materials;

    this.player = new Pool(140);
    this.enemy = new Pool(260);
    this.missile = new Pool(40);

    /* --- meshes ---------------------------------------------------- */

    // A stretched octahedron makes a nicer bolt than a box: it tapers.
    const boltGeo = new THREE.OctahedronGeometry(0.5, 0);
    boltGeo.scale(1, 1, 2.2);

    this.playerMesh = this._instanced(boltGeo, materials.neon(0x9ff4ff, 3.4), this.player.capacity);
    this.enemyMesh = this._instanced(boltGeo, materials.neon(0xff6a4a, 3.0), this.enemy.capacity);

    const missileGeo = new THREE.ConeGeometry(0.3, 1.6, 6);
    missileGeo.rotateX(Math.PI / 2);
    this.missileMesh = this._instanced(missileGeo, materials.enemyHull, this.missile.capacity);
    this.missileMesh.castShadow = false;

    // glowing halo around each bolt so they read against bright geometry
    const haloGeo = new THREE.PlaneGeometry(2.6, 2.6);
    this.playerHalo = this._instanced(haloGeo, materials.billboard(materials.glow, 0x6fe8ff), this.player.capacity);
    this.enemyHalo = this._instanced(haloGeo, materials.billboard(materials.glow, 0xff5a3a), this.enemy.capacity);
    this.playerHalo.renderOrder = 6;
    this.enemyHalo.renderOrder = 6;
  }

  _instanced(geo, mat, count) {
    const m = new THREE.InstancedMesh(geo, mat, count);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.castShadow = false;
    m.receiveShadow = false;
    m.count = 0;
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < count; i++) m.setMatrixAt(i, _m);
    m.instanceMatrix.needsUpdate = true;
    this.scene.add(m);
    return m;
  }

  /* ------------------------------------------------------------------ */
  /* Spawning                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * @param {number} side SIDE.PLAYER or SIDE.ENEMY
   */
  fire(side, px, py, pz, dx, dy, dz, speed, opts = {}) {
    const pool = side === SIDE.PLAYER ? this.player : this.enemy;
    const i = pool.next();
    const len = Math.hypot(dx, dy, dz) || 1;
    pool.x[i] = px; pool.y[i] = py; pool.z[i] = pz;
    pool.vx[i] = (dx / len) * speed;
    pool.vy[i] = (dy / len) * speed;
    pool.vz[i] = (dz / len) * speed;
    pool.life[i] = opts.life ?? 2.4;
    pool.maxLife[i] = pool.life[i];
    pool.dmg[i] = opts.damage ?? 1;
    pool.radius[i] = opts.radius ?? 0.7;
    pool.scaleL[i] = opts.length ?? 1;
    pool.scaleR[i] = opts.width ?? 1;
    return i;
  }

  /**
   * Homing missile. `target` is any object exposing `.pos` and `.alive`.
   */
  launchMissile(px, py, pz, dx, dy, dz, speed, target, opts = {}) {
    const p = this.missile;
    const i = p.next();
    const len = Math.hypot(dx, dy, dz) || 1;
    p.x[i] = px; p.y[i] = py; p.z[i] = pz;
    p.vx[i] = (dx / len) * speed;
    p.vy[i] = (dy / len) * speed;
    p.vz[i] = (dz / len) * speed;
    p.life[i] = opts.life ?? 6;
    p.maxLife[i] = p.life[i];
    p.dmg[i] = opts.damage ?? 1;
    p.radius[i] = opts.radius ?? 1.0;
    p.target[i] = target;
    p.turn[i] = opts.turn ?? 2.2;
    return i;
  }

  /* ------------------------------------------------------------------ */
  /* Simulation                                                          */
  /* ------------------------------------------------------------------ */

  update(dt, ctx) {
    this._stepBolts(this.player, dt, ctx);
    this._stepBolts(this.enemy, dt, ctx);
    this._stepMissiles(dt, ctx);
  }

  _stepBolts(pool, dt, ctx) {
    const cull = ctx.playerZ - 60;
    for (let i = 0; i < pool.capacity; i++) {
      if (pool.life[i] <= 0) continue;
      pool.px[i]=pool.x[i]; pool.py[i]=pool.y[i]; pool.pz[i]=pool.z[i];
      pool.life[i] -= dt;
      pool.x[i] += pool.vx[i] * dt;
      pool.y[i] += pool.vy[i] * dt;
      pool.z[i] += pool.vz[i] * dt;
      if (pool.z[i] < cull || pool.y[i] < -60 || pool.y[i] > 140) pool.life[i] = 0;
    }
  }

  _stepMissiles(dt, ctx) {
    const p = this.missile;
    for (let i = 0; i < p.capacity; i++) {
      if (p.life[i] <= 0) continue;
      p.px[i]=p.x[i]; p.py[i]=p.y[i]; p.pz[i]=p.z[i];
      p.life[i] -= dt;

      const tgt = p.target[i];
      if (tgt && tgt.alive !== false && tgt.pos) {
        // steer velocity toward the target, capped by turn rate
        _v.set(p.vx[i], p.vy[i], p.vz[i]);
        const speed = _v.length() || 1;
        _v.divideScalar(speed);

        _v2.set(tgt.pos.x - p.x[i], tgt.pos.y - p.y[i], tgt.pos.z - p.z[i]);
        // lead the target slightly — a missile that aims where you are is easy
        if (tgt.velocity) _v2.addScaledVector(tgt.velocity, 0.22);
        _v2.normalize();

        const maxTurn = p.turn[i] * dt;
        const dot = clamp(_v.dot(_v2), -1, 1);
        const angle = Math.acos(dot);
        if (angle > 1e-4) {
          const t = Math.min(1, maxTurn / angle);
          _v.lerp(_v2, t).normalize();
        }
        p.vx[i] = _v.x * speed;
        p.vy[i] = _v.y * speed;
        p.vz[i] = _v.z * speed;
      }

      p.x[i] += p.vx[i] * dt;
      p.y[i] += p.vy[i] * dt;
      p.z[i] += p.vz[i] * dt;

      // exhaust trail
      if (ctx.fx && rand.next() < 0.85) {
        _v.set(p.x[i], p.y[i], p.z[i]);
        _v2.set(-p.vx[i], -p.vy[i], -p.vz[i]).normalize();
        ctx.fx.sparks.burst({
          position: _v,
          count: 1,
          direction: _v2,
          spread: 0.5,
          speed: 6, speedVar: 0.5,
          life: 0.34, lifeVar: 0.4,
          size: 2.6, sizeVar: 0.4,
          colorA: 0xffd9a0, colorB: 0xff3d10,
          drag: 3, gravity: 0, grow: 1.6, fade: 1.4,
        });
      }

      if (p.z[i] < ctx.playerZ - 60 || p.y[i] < -50 || p.y[i] > 140) p.life[i] = 0;
    }
  }

  /** Kill a projectile and return its position for effect spawning. */
  kill(pool, i, out) {
    if (out) out.set(pool.x[i], pool.y[i], pool.z[i]);
    pool.life[i] = 0;
    pool.target[i] = null;
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Drawing                                                             */
  /* ------------------------------------------------------------------ */

  render(camera) {
    this._drawBolts(this.player, this.playerMesh, this.playerHalo, camera);
    this._drawBolts(this.enemy, this.enemyMesh, this.enemyHalo, camera);
    this._drawMissiles();
  }

  _drawBolts(pool, mesh, halo, camera) {
    let live = 0;
    for (let i = 0; i < pool.capacity; i++) {
      if (pool.life[i] <= 0) continue;
      _v.set(pool.vx[i], pool.vy[i], pool.vz[i]);
      const speed = _v.length() || 1;
      _v.divideScalar(speed);
      _q.setFromUnitVectors(_fwd, _v);
      _v2.set(pool.x[i], pool.y[i], pool.z[i]);
      // fade out over the last 20% of life
      const t = Math.min(1, pool.life[i] / (pool.maxLife[i] * 0.2));
      _s.set(0.42 * pool.scaleR[i] * t, 0.42 * pool.scaleR[i] * t, 1.5 * pool.scaleL[i]);
      _m.compose(_v2, _q, _s);
      mesh.setMatrixAt(live, _m);

      // billboard halo
      _q.copy(camera.quaternion);
      _s.setScalar(0.85 * pool.scaleR[i] * t);
      _m.compose(_v2, _q, _s);
      halo.setMatrixAt(live++, _m);
    }
    pool.count = mesh.count = halo.count = live;
    for (const object of [mesh, halo]) {
      object.instanceMatrix.clearUpdateRanges();
      if (live) { object.instanceMatrix.addUpdateRange(0, live * 16); object.instanceMatrix.needsUpdate = true; }
    }
  }

  _drawMissiles() {
    const p = this.missile;
    let live = 0;
    for (let i = 0; i < p.capacity; i++) {
      if (p.life[i] <= 0) continue;
      _v.set(p.vx[i], p.vy[i], p.vz[i]).normalize();
      _q.setFromUnitVectors(_fwd, _v);
      _v2.set(p.x[i], p.y[i], p.z[i]);
      _s.setScalar(1);
      _m.compose(_v2, _q, _s);
      this.missileMesh.setMatrixAt(live++, _m);
    }
    p.count = this.missileMesh.count = live;
    this.missileMesh.instanceMatrix.clearUpdateRanges();
    if (live) {
      this.missileMesh.instanceMatrix.addUpdateRange(0, live * 16);
      this.missileMesh.instanceMatrix.needsUpdate = true;
    }
  }

  clear() {
    this.player.clear();
    this.enemy.clear();
    this.missile.clear();
    _m.makeScale(0, 0, 0);
    for (const mesh of [this.playerMesh, this.enemyMesh, this.missileMesh, this.playerHalo, this.enemyHalo]) {
      mesh.count = 0;
    }
  }
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.clear();
    const geometry = new Set();
    for (const mesh of [this.playerMesh, this.enemyMesh, this.missileMesh, this.playerHalo, this.enemyHalo]) {
      mesh.removeFromParent(); mesh.dispose(); geometry.add(mesh.geometry);
    }
    for (const g of geometry) g.dispose();
    this.playerHalo.material.dispose(); this.enemyHalo.material.dispose();
  }

}
