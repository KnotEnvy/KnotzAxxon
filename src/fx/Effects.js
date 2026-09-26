/**
 * Effects director.
 *
 * Everything explosive in the game funnels through here, so a single call site
 * gets the whole package: sparks, smoke, debris, shockwave, dynamic light,
 * screen shake and hit-stop, all budgeted by the quality preset.
 *
 * Layering matters more than particle count — a good explosion is a bright
 * flash, a fast fireball, slow smoke that outlives it, and debris that keeps
 * moving after the light has gone.
 */

import * as THREE from 'three';
import { ParticleSystem } from './Particles.js';
import { rand, clamp01, damp, lerp } from '../core/Utils.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();

/* ------------------------------------------------------------------ */
/* Debris                                                              */
/* ------------------------------------------------------------------ */

/**
 * Instanced hull fragments with simple ballistic physics and a ground bounce.
 */
class DebrisField {
  constructor(scene, material, capacity = 400, geometry = null) {
    this.capacity = capacity;
    // A squashed tetra reads as a torn plate far better than a cube does.
    const geo = geometry ?? new THREE.TetrahedronGeometry(0.5, 0).scale(1, 0.55, 1.35);

    this.mesh = new THREE.InstancedMesh(geo, material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.count = 0;
    scene.add(this.mesh);

    this.px = new Float32Array(capacity);
    this.py = new Float32Array(capacity);
    this.pz = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.vz = new Float32Array(capacity);
    this.rx = new Float32Array(capacity);
    this.ry = new Float32Array(capacity);
    this.rz = new Float32Array(capacity);
    this.wx = new Float32Array(capacity);
    this.wy = new Float32Array(capacity);
    this.wz = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.scale = new Float32Array(capacity);
    this.ground = new Float32Array(capacity);

    this.cursor = 0;
    this.active = 0;
    this._hideAll();
  }

  _hideAll() {
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < this.capacity; i++) this.mesh.setMatrixAt(i, _m);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  spawn(x, y, z, vx, vy, vz, scale, life, groundY = 0) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.rx[i] = rand.next() * 6.28; this.ry[i] = rand.next() * 6.28; this.rz[i] = rand.next() * 6.28;
    this.wx[i] = rand.range(-9, 9); this.wy[i] = rand.range(-9, 9); this.wz[i] = rand.range(-9, 9);
    this.life[i] = life;
    this.maxLife[i] = life;
    this.scale[i] = scale;
    this.ground[i] = groundY;
  }

  update(dt) {
    let live = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;

      this.vy[i] -= 26 * dt;
      // mild air drag so fragments settle instead of skating forever
      const d = Math.exp(-0.6 * dt);
      this.vx[i] *= d; this.vz[i] *= d;

      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;

      if (this.py[i] < this.ground[i] + 0.1) {
        this.py[i] = this.ground[i] + 0.1;
        this.vy[i] = Math.abs(this.vy[i]) * 0.34;
        this.vx[i] *= 0.72; this.vz[i] *= 0.72;
        this.wx[i] *= 0.6; this.wy[i] *= 0.6; this.wz[i] *= 0.6;
        if (Math.abs(this.vy[i]) < 1.2) this.vy[i] = 0;
      }

      this.rx[i] += this.wx[i] * dt;
      this.ry[i] += this.wy[i] * dt;
      this.rz[i] += this.wz[i] * dt;

      const t = clamp01(this.life[i] / this.maxLife[i]);
      const sc = this.scale[i] * (t > 0.2 ? 1 : t / 0.2);

      _e.set(this.rx[i], this.ry[i], this.rz[i]);
      _q.setFromEuler(_e);
      _v.set(this.px[i], this.py[i], this.pz[i]);
      _s.setScalar(sc);
      _m.compose(_v, _q, _s);
      this.mesh.setMatrixAt(live++, _m);


    }
    this.active = live;
    this.mesh.count = live;
    if (live > 0 || this._wasLive) this.mesh.instanceMatrix.needsUpdate = true;
    this._wasLive = live > 0;
  }

  clear() {
    this.life.fill(0);
    this.active = this.mesh.count = 0;
  }

  dispose() {
    this.mesh.removeFromParent(); this.mesh.dispose(); this.mesh.geometry.dispose();
  }
}

/* ------------------------------------------------------------------ */
/* Shockwave rings                                                     */
/* ------------------------------------------------------------------ */

class RingField {
  constructor(scene, texture, capacity = 24) {
    this.capacity = capacity;
    this.items = [];
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < capacity; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
        opacity: 0,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 9;
      scene.add(mesh);
      this.items.push({ mesh, mat, life: 0, maxLife: 1, from: 1, to: 10, billboard: true, spin: 0 });
    }
    this.cursor = 0;
  }

  spawn(pos, { from = 1, to = 18, life = 0.5, color = 0xffffff, billboard = true, normal = null, opacity = 1 } = {}) {
    const it = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.capacity;
    it.mesh.position.copy(pos);
    it.mesh.visible = true;
    it.mat.color.setHex(color);
    it.life = life;
    it.maxLife = life;
    it.from = from;
    it.to = to;
    it.billboard = billboard;
    it.opacity = opacity;
    it.spin = rand.range(-1.5, 1.5);
    if (!billboard && normal) {
      it.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    }
    return it;
  }

  update(dt, camera) {
    for (const it of this.items) {
      if (it.life <= 0) continue;
      it.life -= dt;
      if (it.life <= 0) { it.mesh.visible = false; it.mat.opacity = 0; continue; }
      const t = 1 - it.life / it.maxLife;
      // ease-out expansion: fast on frame one, then decelerating
      const e = 1 - Math.pow(1 - t, 3);
      const s = it.from + (it.to - it.from) * e;
      it.mesh.scale.setScalar(s);
      it.mat.opacity = (1 - t) * (1 - t) * it.opacity;
      if (it.billboard) {
        it.mesh.quaternion.copy(camera.quaternion);
        it.mesh.rotateZ(it.spin * t);
      }
    }
  }

  clear() {
    for (const it of this.items) { it.life = 0; it.mesh.visible = false; }
  }

  dispose() {
    this.items[0]?.mesh.geometry.dispose();
    for (const it of this.items) { it.mesh.removeFromParent(); it.mat.dispose(); }
    this.items.length = 0;
  }
}

/* ------------------------------------------------------------------ */
/* Wrecks                                                              */
/* ------------------------------------------------------------------ */

/**
 * What a destroyed ground target leaves behind: a scorch mark, a few charred
 * slabs, and a smoke column with licking flames that burns out over several
 * seconds. Two instanced draws for the whole field; smoke and fire reuse the
 * shared particle pools.
 */
class WreckField {
  constructor(scene, materials, capacity = 24) {
    this.capacity = capacity;
    const decalGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.decalMat = new THREE.MeshBasicMaterial({
      map: materials.blob, color: 0x000000, transparent: true, opacity: 0.82,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    this.decals = new THREE.InstancedMesh(decalGeo, this.decalMat, capacity);

    const slabGeo = new THREE.DodecahedronGeometry(0.62, 0).scale(1.5, 0.55, 1.1);
    slabGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(slabGeo.attributes.position.count * 3).fill(0.32), 3));
    this.slabs = new THREE.InstancedMesh(slabGeo, materials.darkMetal, capacity * 4);

    for (const mesh of [this.decals, this.slabs]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      scene.add(mesh);
    }
    this.decals.renderOrder = 1;
    this.slabs.castShadow = false;
    this.slabs.receiveShadow = true;
    this.items = [];
    this.cursor = 0;
  }

  spawn(pos, groundY, scale = 1) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    const it = this.items[i] ??= { x: 0, y: 0, z: 0, life: 0, maxLife: 1, smoke: 0, fire: 0, scale: 1 };
    it.x = pos.x; it.y = groundY; it.z = pos.z;
    it.life = it.maxLife = 7 + scale * 3;
    it.scale = scale; it.smoke = 0; it.fire = 0;

    _e.set(0, rand.next() * Math.PI * 2, 0);
    _q.setFromEuler(_e);
    _s.set(5.5 * scale, 1, 5.5 * scale * rand.range(0.7, 1.1));
    _m.compose(_v.set(pos.x, groundY + 0.03, pos.z), _q, _s);
    this.decals.setMatrixAt(i, _m);
    for (let k = 0; k < 4; k++) {
      const a = rand.next() * Math.PI * 2, r = rand.range(0.4, 2.2) * scale;
      _e.set(rand.range(-0.35, 0.35), rand.next() * 6.28, rand.range(-0.35, 0.35));
      _q.setFromEuler(_e);
      _s.setScalar(rand.range(0.6, 1.3) * scale);
      _m.compose(_v.set(pos.x + Math.cos(a) * r, groundY + 0.15, pos.z + Math.sin(a) * r), _q, _s);
      this.slabs.setMatrixAt(i * 4 + k, _m);
    }
    this.decals.count = Math.max(this.decals.count, i + 1);
    this.slabs.count = Math.max(this.slabs.count, (i + 1) * 4);
    this.decals.instanceMatrix.needsUpdate = true;
    this.slabs.instanceMatrix.needsUpdate = true;
  }

  update(dt, fx, playerZ) {
    for (const it of this.items) {
      if (!it || it.life <= 0) continue;
      it.life -= dt;
      if (it.z < playerZ - 40 || it.z > playerZ + 260) continue;
      const t = it.life / it.maxLife;
      it.smoke -= dt;
      if (it.smoke <= 0) {
        it.smoke = lerp(0.3, 0.1, t);
        _v.set(it.x + rand.range(-0.6, 0.6) * it.scale, it.y + 0.6, it.z + rand.range(-0.6, 0.6) * it.scale);
        fx.smoke.burst({
          position: _v, count: 1, direction: UP, spread: 0.25,
          speed: 3.5, speedVar: 0.4, life: 2.4, lifeVar: 0.3,
          size: 3.2 * it.scale, sizeVar: 0.35,
          colorA: 0x2c2a2e, colorB: 0x0c0c10,
          drag: 0.7, gravity: 1.6, grow: 2.4, fade: 1.3, spin: 0.8,
        });
      }
      it.fire -= dt;
      if (t > 0.35 && it.fire <= 0) {
        it.fire = rand.range(0.07, 0.16);
        _v.set(it.x + rand.range(-1, 1) * it.scale, it.y + 0.3, it.z + rand.range(-1, 1) * it.scale);
        fx.sparks.burst({
          position: _v, count: 1, direction: UP, spread: 0.35,
          speed: 2.5, speedVar: 0.5, life: 0.45, lifeVar: 0.4,
          size: 2.4 * it.scale * t, sizeVar: 0.4,
          colorA: 0xffd080, colorB: 0xff3a10,
          drag: 1.5, gravity: 5, grow: 0.3, fade: 1.4,
        });
      }
    }
  }

  clear() {
    for (const it of this.items) if (it) it.life = 0;
    this.decals.count = this.slabs.count = 0;
    this.cursor = 0;
  }

  dispose() {
    for (const mesh of [this.decals, this.slabs]) { mesh.removeFromParent(); mesh.dispose(); mesh.geometry.dispose(); }
    this.decalMat.dispose();
  }
}

/* ------------------------------------------------------------------ */
/* Pooled dynamic lights                                               */
/* ------------------------------------------------------------------ */

/**
 * Every pooled light stays visible at zero intensity when idle. Toggling
 * visibility changes the scene's light count, and each new count recompiles
 * every lit material — a multi-second stall the first time a blast lands.
 */
class LightPool {
  constructor(scene, count = 6) {
    this.lights = [];
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 60, 2);
      scene.add(l);
      this.lights.push({ light: l, life: 0, maxLife: 1, peak: 0 });
    }
    this.cursor = 0;
  }

  flash(pos, color, intensity, radius, life = 0.35) {
    if (!this.lights.length) return;
    const it = this.lights[this.cursor];
    this.cursor = (this.cursor + 1) % this.lights.length;
    it.light.position.copy(pos);
    it.light.color.setHex(color);
    it.light.distance = radius;
    it.peak = intensity;
    it.life = life;
    it.maxLife = life;
  }

  update(dt) {
    for (const it of this.lights) {
      if (it.life <= 0) continue;
      it.life -= dt;
      if (it.life <= 0) { it.light.intensity = 0; continue; }
      const t = it.life / it.maxLife;
      // sharp attack, exponential decay
      it.light.intensity = it.peak * t * t;
    }
  }

  resize(scene, count) {
    while (this.lights.length > count) {
      const it = this.lights.pop();
      scene.remove(it.light);
      it.light.dispose?.();
    }
    while (this.lights.length < count) {
      const l = new THREE.PointLight(0xffffff, 0, 60, 2);
      scene.add(l);
      this.lights.push({ light: l, life: 0, maxLife: 1, peak: 0 });
    }
    this.cursor = 0;
  }

  clear() {
    for (const it of this.lights) { it.life = 0; it.light.intensity = 0; }
  }
}

/* ------------------------------------------------------------------ */
/* Director                                                            */
/* ------------------------------------------------------------------ */

export class Effects {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../render/Materials.js').Materials} materials
   * @param {object} quality
   */
  constructor(scene, materials, quality) {
    this.scene = scene;
    this.materials = materials;

    this.sparks = new ParticleSystem(scene, materials.glow, quality.particleBudget, { intensity: 1.25 });
    this.smoke = new ParticleSystem(scene, materials.glow, Math.floor(quality.particleBudget * 0.35), {
      blending: THREE.NormalBlending,
      intensity: 0.85,
      renderOrder: 7,
    });

    this.debris = new DebrisField(scene, materials.darkMetal, quality.debrisBudget);
    this.rings = new RingField(scene, materials.ring, 26);
    this.lights = new LightPool(scene, quality.lights);
    this.wrecks = new WreckField(scene, materials, 24);
    // Big named pieces: turret domes and radar dishes that pop off and tumble.
    const dome = new THREE.SphereGeometry(1.1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    this.chunks = new DebrisField(scene, materials.enemyHull, 16, dome);
    this._timers = [];

    /** Camera trauma, consumed by the camera rig. Squared for a punchier curve. */
    this.trauma = 0;
    /** Set by explosions; the game reads and clears it. */
    this.pendingHitStop = 0;

    this._c = new THREE.Color();
  }

  applyQuality(q) {
    this.lights.resize(this.scene, q.lights);
    if (this.sparks.capacity !== q.particleBudget) {
      this.sparks.dispose(); this.smoke.dispose();
      this.sparks = new ParticleSystem(this.scene, this.materials.glow, q.particleBudget, { intensity: 1.25 });
      this.smoke = new ParticleSystem(this.scene, this.materials.glow, Math.floor(q.particleBudget * 0.35), {
        blending: THREE.NormalBlending, intensity: 0.85, renderOrder: 7,
      });
      if (this._viewportCamera) this.setViewport(this._viewportHeight, this._viewportCamera);
      this.sparks.setTime(this._time ?? 0); this.smoke.setTime(this._time ?? 0);
    }
    if (this.debris.capacity !== q.debrisBudget) {
      this.debris.dispose();
      this.debris = new DebrisField(this.scene, this.materials.darkMetal, q.debrisBudget);
    }
  }

  setViewport(height, camera) {
    this._viewportHeight = height; this._viewportCamera = camera;
    this.sparks.setViewport(height, camera);
    this.smoke.setViewport(height, camera);
  }

  /* ---------------------------------------------------------------- */
  /* Semantic effects                                                  */
  /* ---------------------------------------------------------------- */

  /**
   * General-purpose explosion.
   * @param {THREE.Vector3} pos
   * @param {number} scale 0.5 = small turret, 1 = fighter, 3 = boss core
   */
  explosion(pos, scale = 1, opts = {}) {
    const {
      colorHot = 0xfff0c0,
      colorMid = 0xff9030,
      colorCool = 0x501008,
      smokeColor = 0x1a1a20,
      groundY = 0,
      debris = true,
      shake = 1,
    } = opts;

    const s = scale;
    // Blasts close to the ship trade flash for body: a white sheet over the
    // hero reads as glare, a longer orange fireball reads as fire.
    const near = this.focus ? Math.max(0, 1 - this.focus.distanceTo(pos) / 40) : 0;
    const flash = 1 - near * 0.55;

    // fireball core — bright, gone fast
    this.sparks.burst({
      position: pos,
      count: Math.round(14 * s),
      speed: 8 * s, speedVar: 0.6,
      life: 0.26 * (0.7 + s * 0.4), lifeVar: 0.35,
      size: 6 * s * flash, sizeVar: 0.45,
      colorA: colorHot, colorB: colorMid,
      drag: 6.0, gravity: 2 * s, grow: 1.6, fade: 1.2,
    });

    // fire body — orange, slower, rolling upward after the flash is gone
    this.sparks.burst({
      position: pos,
      count: Math.round(12 * s),
      speed: 5 * s, speedVar: 0.5,
      life: 0.55 * (0.8 + s * 0.3), lifeVar: 0.3,
      size: 5.2 * s, sizeVar: 0.4,
      colorA: colorMid, colorB: 0x6a1c08,
      drag: 3.2, gravity: 5, grow: 1.4, fade: 1.6,
    });

    // sparks — thin, fast, long-lived
    this.sparks.burst({
      position: pos,
      count: Math.round(22 * s),
      speed: 20 * s, speedVar: 0.85,
      life: 0.85, lifeVar: 0.55,
      size: 1.5 * Math.sqrt(s), sizeVar: 0.6,
      colorA: 0xffffff, colorB: colorCool,
      drag: 1.1, gravity: -16, fade: 2.2,
    });

    // smoke — slow, expanding, outlives the fire
    this.smoke.burst({
      position: pos,
      count: Math.round(8 * s),
      speed: 4.0 * s, speedVar: 0.7,
      life: 1.25 * (0.8 + s * 0.3), lifeVar: 0.4,
      size: 5.5 * s, sizeVar: 0.4,
      colorA: smokeColor, colorB: 0x05060a,
      drag: 2.6, gravity: 2.4, grow: 1.9, fade: 1.0, spin: 1.2,
    });

    // Fast, thin and gone. A shockwave that outlives the fireball stops
    // reading as a blast and starts reading as a prop.
    this.rings.spawn(pos, {
      from: 1.0 * s, to: 9.5 * s, life: 0.26 + s * 0.05,
      color: colorMid, billboard: true, opacity: 0.5,
    });

    if (debris) {
      const n = Math.round(6 * s);
      for (let i = 0; i < n; i++) {
        const sp = rand.range(5, 15) * Math.sqrt(s);
        const th = rand.next() * Math.PI * 2;
        const ph = Math.acos(rand.range(-0.2, 1));
        this.debris.spawn(
          pos.x, pos.y, pos.z,
          Math.sin(ph) * Math.cos(th) * sp,
          Math.abs(Math.cos(ph)) * sp * 1.2,
          Math.sin(ph) * Math.sin(th) * sp,
          rand.range(0.5, 1.5) * Math.sqrt(s),
          rand.range(1.6, 3.4),
          groundY,
        );
      }
    }

    this.lights.flash(pos, colorMid, 200 * s * s * flash, 46 * s, 0.3 + s * 0.08);
    this.addTrauma(0.28 * s * shake);
    this.pendingHitStop = Math.max(this.pendingHitStop, Math.min(0.09, 0.02 * s));
  }

  /** Small directional impact — bullet on armour. */
  impact(pos, normal, color = 0x9fe8ff, scale = 1) {
    this.sparks.burst({
      position: pos,
      count: Math.round(7 * scale),
      direction: normal,
      spread: 1.1,
      speed: 13 * scale, speedVar: 0.7,
      life: 0.3, lifeVar: 0.5,
      size: 1.6 * scale, sizeVar: 0.5,
      colorA: 0xffffff, colorB: color,
      drag: 3.2, gravity: -10, fade: 1.8,
    });
    this.rings.spawn(pos, {
      from: 0.4, to: 4.5 * scale, life: 0.22, color, billboard: false, normal, opacity: 0.7,
    });
  }

  /** Muzzle flash at a weapon port. `light: false` skips the pooled light. */
  muzzle(pos, dir, color = 0x8ff0ff, scale = 1, light = true) {
    this.sparks.burst({
      position: pos,
      count: Math.round(4 * scale),
      direction: dir,
      spread: 0.55,
      speed: 16 * scale, speedVar: 0.6,
      life: 0.13, lifeVar: 0.4,
      size: 4.5 * scale, sizeVar: 0.4,
      colorA: 0xffffff, colorB: color,
      drag: 7, gravity: 0, grow: 1.4, fade: 1.0,
    });
    if (light) this.lights.flash(pos, color, 26 * scale, 16 * scale, 0.07);
  }

  /**
   * Ship thruster grit.
   *
   * Deliberately small and short-lived: these spawn a few metres from the
   * camera, so anything generous here stacks additively into a floodlight
   * rather than reading as exhaust. The flame shape comes from the ribbon
   * trail; this is just the sparks coming off it.
   */
  thruster(pos, dir, color, intensity, inherit) {
    if (intensity <= 0.01) return;
    this.sparks.burst({
      position: pos,
      count: 1,
      direction: dir,
      spread: 0.4,
      speed: 9 + intensity * 22, speedVar: 0.5,
      life: 0.16 + intensity * 0.1, lifeVar: 0.4,
      size: 1.3 + intensity * 1.3, sizeVar: 0.35,
      colorA: 0xcfefff, colorB: color,
      drag: 5.5, gravity: 0, grow: 0.9, fade: 1.8,
      inherit, inheritAmount: 0.5,
    });
  }

  /** Pickup / powerup collected. */
  pickup(pos, color = 0x52ffa8) {
    this.sparks.burst({
      position: pos,
      count: 20,
      speed: 11, speedVar: 0.6,
      life: 0.6, lifeVar: 0.4,
      size: 2.6, sizeVar: 0.5,
      colorA: 0xffffff, colorB: color,
      drag: 3.4, gravity: 6, fade: 1.6,
    });
    this.rings.spawn(pos, { from: 0.5, to: 12, life: 0.42, color, opacity: 0.85 });
    this.lights.flash(pos, color, 55, 26, 0.28);
  }

  /** Shield absorbed a hit. */
  shieldHit(pos, color = 0x45e0ff) {
    this.rings.spawn(pos, { from: 2, to: 13, life: 0.36, color, opacity: 1 });
    this.sparks.burst({
      position: pos,
      count: 16,
      speed: 14, speedVar: 0.6,
      life: 0.35, lifeVar: 0.4,
      size: 2.0, sizeVar: 0.5,
      colorA: 0xffffff, colorB: color,
      drag: 4, gravity: 0, fade: 2,
    });
    this.lights.flash(pos, color, 90, 30, 0.22);
    this.addTrauma(0.32);
  }

  /** The player died — everything at once. */
  playerDeath(pos) {
    this.explosion(pos, 2.6, { shake: 2.2 });
    for (let i = 0; i < 3; i++) {
      const p = _v.copy(pos).add(
        new THREE.Vector3(rand.range(-2, 2), rand.range(-2, 2), rand.range(-2, 2)),
      );
      this.rings.spawn(p, { from: 2, to: 40 + i * 14, life: 0.7 + i * 0.15, color: 0xffd9a0, opacity: 0.7 });
    }
    this.addTrauma(1.5);
  }

  addTrauma(t) {
    this.trauma = Math.min(1.6, this.trauma + t);
  }

  /** A large named fragment: a dome blown off its ring, a dish sheared from its mast. */
  chunk(pos, vx, vy, vz, scale = 1, groundY = 0) {
    this.chunks.spawn(pos.x, pos.y, pos.z, vx, vy, vz, scale, 3.2, groundY);
  }

  /** Fuel ignition: a column of fire with a couple of secondary pops. */
  fireColumn(pos, groundY = 0) {
    this.sparks.burst({
      position: pos, count: 28, direction: UP, spread: 0.24,
      speed: 30, speedVar: 0.4, life: 1.1, lifeVar: 0.3, size: 5.5, sizeVar: 0.4,
      colorA: 0xffd890, colorB: 0xff4a10, drag: 1.8, gravity: -8, grow: 1.5, fade: 1.3,
    });
    this.smoke.burst({
      position: pos, count: 6, direction: UP, spread: 0.3,
      speed: 9, speedVar: 0.4, life: 1.8, lifeVar: 0.3, size: 5, sizeVar: 0.3,
      colorA: 0x3a2a22, colorB: 0x0c0a0a, drag: 1.4, gravity: 2, grow: 2.2, fade: 1.2, spin: 0.8,
    });
    const at = pos.clone();
    for (let k = 1; k <= 2; k++) {
      this.after(0.14 * k, () => this.explosion(
        _v.set(at.x + rand.range(-2.5, 2.5), at.y + 1.5 + k, at.z + rand.range(-2.5, 2.5)),
        0.55, { colorHot: 0xfff0a0, colorMid: 0xffa030, groundY, shake: 0.4 },
      ));
    }
  }

  /** Run `fn` after `seconds` of effect time (pauses and hit-stops included). */
  after(seconds, fn) {
    this._timers.push({ t: seconds, fn });
  }

  /** A destroyed ground target keeps burning where it fell. */
  wreck(pos, groundY, scale = 1) {
    this.wrecks.spawn(pos, groundY, scale);
  }

  /**
   * Fortress ambience: steam vents, chimney smoke, reactor heat and flak
   * batteries. Only sources near the flight path emit, and each kind is a
   * trickle into the shared pools, never a burst that could starve combat.
   */
  ambient(emitters, dt, playerZ) {
    for (const e of emitters) {
      if (e.z < playerZ - 20 || e.z > playerZ + 210) continue;
      e.t -= dt * e.rate;
      if (e.kind === 'flak' && e.burst > 0) {
        e.burst -= dt;
        if (e.burst <= 0) this._flakBurst(e);
      }
      if (e.t > 0) continue;
      _v.set(e.x, e.y, e.z);
      switch (e.kind) {
        case 'steam':
          e.t = 0.22;
          this.smoke.burst({
            position: _v, count: 1, direction: e.dir ?? UP, spread: 0.3,
            speed: 5, speedVar: 0.4, life: 1.6, lifeVar: 0.3, size: 2.6, sizeVar: 0.3,
            colorA: 0xb8c4cc, colorB: 0x3a4048, drag: 1.2, gravity: 2.2, grow: 2.2, fade: 1.5, spin: 0.6,
          });
          break;
        case 'stack':
          e.t = 0.4;
          this.smoke.burst({
            position: _v, count: 1, direction: UP, spread: 0.2,
            speed: 3, speedVar: 0.3, life: 3.2, lifeVar: 0.3, size: 5, sizeVar: 0.3,
            colorA: 0x26242a, colorB: 0x08080a, drag: 0.5, gravity: 1.2, grow: 2.6, fade: 1.2, spin: 0.4,
          });
          break;
        case 'heat':
          e.t = rand.range(0.25, 0.5);
          this.sparks.burst({
            position: _v, count: 1, direction: UP, spread: 0.4,
            speed: 3, speedVar: 0.5, life: 0.9, lifeVar: 0.3, size: 1.1, sizeVar: 0.4,
            colorA: 0xffc070, colorB: 0xff3a10, drag: 0.8, gravity: 3, fade: 1.2,
          });
          break;
        case 'flak': {
          e.t = rand.range(2.2, 4.2);
          const dir = e.dir ?? UP;
          this.sparks.burst({
            position: _v, count: 3, direction: dir, spread: 0.35,
            speed: 10, speedVar: 0.5, life: 0.12, lifeVar: 0.3, size: 2.6, sizeVar: 0.3,
            colorA: 0xffffff, colorB: 0xc8d0dc, drag: 6, gravity: 0, grow: 1.2, fade: 1,
          });
          // Tracers climb away from the lane in steel-white, never in the
          // orange that means enemy fire.
          for (let k = 0; k < 3; k++) {
            _v2.copy(dir).multiplyScalar(70 + k * 6);
            _v2.y += rand.range(-3, 3);
            this.sparks.spark(_v, _v2, { colorA: 0xf2f6ff, colorB: 0x8090a8, life: 0.75, size: 1.2, drag: 0.1, gravity: -6, fade: 1.2 });
          }
          e.burst = 0.7;
          e.burstAt = (e.burstAt ?? new THREE.Vector3()).copy(_v).addScaledVector(dir, 48);
          break;
        }
      }
    }
  }

  _flakBurst(e) {
    const p = e.burstAt;
    this.sparks.burst({
      position: p, count: 5, speed: 7, speedVar: 0.5, life: 0.18, lifeVar: 0.3,
      size: 4, sizeVar: 0.4, colorA: 0xffffff, colorB: 0xb0b8c8, drag: 5, gravity: 0, grow: 1.4, fade: 1.1,
    });
    this.smoke.burst({
      position: p, count: 3, speed: 3, speedVar: 0.5, life: 1.8, lifeVar: 0.3,
      size: 5.5, sizeVar: 0.3, colorA: 0x2a2626, colorB: 0x0a0a0c, drag: 1.4, gravity: 0.3, grow: 1.8, fade: 1.2, spin: 0.7,
    });
  }

  /* ---------------------------------------------------------------- */

  update(dt, time, camera) {
    this._time = time;
    this.focus = this.focusPoint ?? null;
    this.sparks.setTime(time);
    this.smoke.setTime(time);
    this.sparks.flush();
    this.smoke.flush();
    this.debris.update(dt);
    this.rings.update(dt, camera);
    this.lights.update(dt);
    this.wrecks.update(dt, this, this.focusZ ?? 0);
    this.chunks.update(dt);
    for (let i = this._timers.length - 1; i >= 0; i--) {
      const timer = this._timers[i];
      timer.t -= dt;
      if (timer.t <= 0) { this._timers.splice(i, 1); timer.fn(); }
    }
    this.trauma = Math.max(0, damp(this.trauma, 0, 3.2, dt) - dt * 0.15);
  }

  clear() {
    this.sparks.clear();
    this.smoke.clear();
    this.debris.clear();
    this.rings.clear();
    this.lights.clear();
    this.wrecks.clear();
    this.chunks.clear();
    this._timers.length = 0;
    this.trauma = 0;
    this.pendingHitStop = 0;
  }
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.sparks.dispose(); this.smoke.dispose(); this.debris.dispose(); this.rings.dispose(); this.wrecks.dispose(); this.chunks.dispose();
    this.lights.resize(this.scene, 0);
  }

}
