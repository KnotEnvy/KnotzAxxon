/**
 * GPU particle system.
 *
 * Particles are integrated entirely in the vertex shader from their spawn
 * state (origin, velocity, drag, gravity, birth time). The CPU only touches a
 * particle when it is spawned, and only the dirty slice of the buffer is
 * re-uploaded — so a 7000-particle budget costs effectively nothing per frame.
 *
 * The buffer is a ring: the oldest particle is recycled when we wrap, which is
 * the correct behaviour for an effects system under burst load.
 */

import * as THREE from 'three';
import { rand } from '../core/Utils.js';

const _dir = new THREE.Vector3();
const _tmpA = new THREE.Vector3();
const _tmpB = new THREE.Vector3();
const _tmpC = new THREE.Vector3();

const VERT = /* glsl */`
  uniform float uTime;
  uniform float uHeightScale;
  uniform float uOrthographic;

  attribute vec3 aVelocity;
  attribute vec4 aParams;   // x: birth, y: life, z: size, w: drag
  attribute vec4 aExtra;    // x: gravity, y: sizeGrow, z: spin, w: fadePow
  attribute vec3 aColorA;
  attribute vec3 aColorB;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vSpin;

  void main() {
    float age = uTime - aParams.x;
    float life = aParams.y;
    float t = age / life;

    if (age < 0.0 || t > 1.0) {
      // park dead particles behind the camera and give them zero area
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vAlpha = 0.0;
      vColor = vec3(0.0);
      vSpin = 0.0;
      return;
    }

    /* exact solution for linear drag + constant gravity */
    float k = aParams.w;
    vec3 disp;
    if (k > 0.001) {
      float e = (1.0 - exp(-k * age)) / k;
      disp = aVelocity * e;
    } else {
      disp = aVelocity * age;
    }
    disp.y += 0.5 * aExtra.x * age * age;

    vec3 world = position + disp;
    vec4 mv = modelViewMatrix * vec4(world, 1.0);

    float grow = 1.0 + aExtra.y * t;
    float sizePx = aParams.z * grow * (uHeightScale / mix(max(-mv.z, 0.1), 1.0, uOrthographic));
    gl_PointSize = clamp(sizePx, 0.0, 220.0);

    vColor = mix(aColorA, aColorB, t);
    vAlpha = pow(1.0 - t, max(aExtra.w, 0.05));
    vSpin = aExtra.z * age;

    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */`
  precision highp float;
  uniform sampler2D uMap;
  uniform float uIntensity;
  uniform float uPremul;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vSpin;

  void main() {
    if (vAlpha <= 0.001) discard;

    vec2 uv = gl_PointCoord - 0.5;
    float s = sin(vSpin), c = cos(vSpin);
    uv = mat2(c, -s, s, c) * uv + 0.5;

    float a = texture2D(uMap, uv).a;
    if (a < 0.004) discard;

    gl_FragColor = vec4(vColor * uIntensity * mix(1.0, vAlpha, uPremul), a * vAlpha);
  }
`;

export class ParticleSystem {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Texture} sprite glow sprite
   * @param {number} capacity max simultaneous particles
   */
  constructor(scene, sprite, capacity = 4000, opts = {}) {
    this.capacity = capacity;
    this.cursor = 0;
    this.live = 0;
    this._dirtyMin = Infinity;
    this._dirtyMax = -Infinity;

    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
    this.aVel = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
    this.aParams = new THREE.BufferAttribute(new Float32Array(capacity * 4), 4);
    this.aExtra = new THREE.BufferAttribute(new Float32Array(capacity * 4), 4);
    this.aColorA = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
    this.aColorB = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);

    for (const a of [this.aPos, this.aVel, this.aParams, this.aExtra, this.aColorA, this.aColorB]) {
      a.setUsage(THREE.DynamicDrawUsage);
    }
    // Everything starts dead: life 0 and birth far in the past.
    for (let i = 0; i < capacity; i++) this.aParams.array[i * 4 + 1] = 0.0001;

    geo.setAttribute('position', this.aPos);
    geo.setAttribute('aVelocity', this.aVel);
    geo.setAttribute('aParams', this.aParams);
    geo.setAttribute('aExtra', this.aExtra);
    geo.setAttribute('aColorA', this.aColorA);
    geo.setAttribute('aColorB', this.aColorB);
    // Culling would be wrong: particles move away from their spawn point.
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uHeightScale: { value: 600 },
        uOrthographic: { value: 0 },
        uMap: { value: sprite },
        uIntensity: { value: opts.intensity ?? 1.6 },
        uPremul: { value: opts.blending === undefined ? 1 : 0 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: opts.blending ?? THREE.AdditiveBlending,
      toneMapped: false,
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = opts.renderOrder ?? 8;
    scene.add(this.points);

    this._time = 0;
    this._c1 = new THREE.Color();
    this._c2 = new THREE.Color();
  }

  /** Point size must track viewport height to stay resolution-independent. */
  setViewport(height, camera) {
    this.material.uniforms.uOrthographic.value = camera.isOrthographicCamera ? 1 : 0;
    this.material.uniforms.uHeightScale.value = camera.isOrthographicCamera
      ? height / (camera.top - camera.bottom)
      : height / (2 * Math.tan((camera.fov * Math.PI) / 360));
  }

  setTime(t) {
    this._time = t;
    this.material.uniforms.uTime.value = t;
  }

  /**
   * Spawn one particle. All the burst helpers funnel through here.
   */
  emit(px, py, pz, vx, vy, vz, opts) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;

    const i3 = i * 3;
    const i4 = i * 4;

    this.aPos.array[i3] = px;
    this.aPos.array[i3 + 1] = py;
    this.aPos.array[i3 + 2] = pz;

    this.aVel.array[i3] = vx;
    this.aVel.array[i3 + 1] = vy;
    this.aVel.array[i3 + 2] = vz;

    this.aParams.array[i4] = this._time;
    this.aParams.array[i4 + 1] = opts.life;
    this.aParams.array[i4 + 2] = opts.size;
    this.aParams.array[i4 + 3] = opts.drag ?? 1.2;

    this.aExtra.array[i4] = opts.gravity ?? 0;
    this.aExtra.array[i4 + 1] = opts.grow ?? 0;
    this.aExtra.array[i4 + 2] = opts.spin ?? 0;
    this.aExtra.array[i4 + 3] = opts.fade ?? 1.4;

    const ca = opts.colorA;
    const cb = opts.colorB ?? opts.colorA;
    this.aColorA.array[i3] = ca.r;
    this.aColorA.array[i3 + 1] = ca.g;
    this.aColorA.array[i3 + 2] = ca.b;
    this.aColorB.array[i3] = cb.r;
    this.aColorB.array[i3 + 1] = cb.g;
    this.aColorB.array[i3 + 2] = cb.b;

    if (i < this._dirtyMin) this._dirtyMin = i;
    if (i > this._dirtyMax) this._dirtyMax = i;
  }

  /**
   * Spherical / conical burst.
   *
   * @param {object} o
   * @param {THREE.Vector3} o.position
   * @param {number} o.count
   * @param {number} o.speed base speed
   * @param {number} [o.speedVar] +/- fraction
   * @param {THREE.Vector3} [o.direction] cone axis; omit for a full sphere
   * @param {number} [o.spread] 0 = laser-tight, 1 = hemisphere, 2 = sphere
   */
  burst(o) {
    const {
      position, count = 12, speed = 10, speedVar = 0.5,
      direction = null, spread = 2,
      life = 0.7, lifeVar = 0.4,
      size = 2.2, sizeVar = 0.5,
      colorA = 0xffffff, colorB = 0x220000,
      drag = 1.6, gravity = -6, grow = 0, spin = 0, fade = 1.4,
      inherit = null, inheritAmount = 1,
    } = o;

    const c1 = this._c1.set(colorA);
    const c2 = this._c2.set(colorB);
    const opts = { life: 1, size: 1, drag, gravity, grow, spin, fade, colorA: c1, colorB: c2 };

    // Build the cone basis once per burst rather than once per particle.
    let ux = null, uy = null;
    if (direction) {
      _dir.copy(direction).normalize();
      _tmpA.set(Math.abs(_dir.x) < 0.9 ? 1 : 0, Math.abs(_dir.x) < 0.9 ? 0 : 1, 0);
      ux = _tmpB.crossVectors(_tmpA, _dir).normalize();
      uy = _tmpC.crossVectors(_dir, ux);
    }

    for (let i = 0; i < count; i++) {
      let dx, dy, dz;
      if (direction) {
        const a = rand.next() * Math.PI * 2;
        const z = 1 - rand.next() * spread;
        const r = Math.sqrt(Math.max(0, 1 - z * z));
        const ca = Math.cos(a) * r;
        const sa = Math.sin(a) * r;
        dx = ux.x * ca + uy.x * sa + _dir.x * z;
        dy = ux.y * ca + uy.y * sa + _dir.y * z;
        dz = ux.z * ca + uy.z * sa + _dir.z * z;
      } else {
        const th = rand.next() * Math.PI * 2;
        const ph = Math.acos(2 * rand.next() - 1);
        dx = Math.sin(ph) * Math.cos(th);
        dy = Math.sin(ph) * Math.sin(th);
        dz = Math.cos(ph);
      }

      const sp = speed * (1 + (rand.next() * 2 - 1) * speedVar);
      let vx = dx * sp, vy = dy * sp, vz = dz * sp;
      if (inherit) {
        vx += inherit.x * inheritAmount;
        vy += inherit.y * inheritAmount;
        vz += inherit.z * inheritAmount;
      }

      opts.life = life * (1 + (rand.next() * 2 - 1) * lifeVar);
      opts.size = size * (1 + (rand.next() * 2 - 1) * sizeVar);
      this.emit(position.x, position.y, position.z, vx, vy, vz, opts);
    }
  }

  /** Single streaked spark — cheap, used for impacts and thruster grit. */
  spark(position, velocity, opts = {}) {
    const c1 = this._c1.set(opts.colorA ?? 0xffffff);
    const c2 = this._c2.set(opts.colorB ?? 0xff6a00);
    this.emit(position.x, position.y, position.z, velocity.x, velocity.y, velocity.z, {
      life: opts.life ?? 0.4,
      size: opts.size ?? 1.6,
      drag: opts.drag ?? 2.2,
      gravity: opts.gravity ?? -4,
      grow: opts.grow ?? 0,
      spin: opts.spin ?? 0,
      fade: opts.fade ?? 1.6,
      colorA: c1,
      colorB: c2,
    });
  }

  /** Upload only what changed. */
  flush() {
    if (this._dirtyMax < this._dirtyMin) return;
    const start = this._dirtyMin;
    const count = this._dirtyMax - this._dirtyMin + 1;
    for (const [a, size] of [
      [this.aPos, 3], [this.aVel, 3], [this.aParams, 4],
      [this.aExtra, 4], [this.aColorA, 3], [this.aColorB, 3],
    ]) {
      a.clearUpdateRanges?.();
      a.addUpdateRange?.(start * size, count * size);
      a.needsUpdate = true;
    }
    this._dirtyMin = Infinity;
    this._dirtyMax = -Infinity;
  }

  /** Wipe everything (level restart). */
  clear() {
    for (let i = 0; i < this.capacity; i++) {
      this.aParams.array[i * 4] = -1e6;
      this.aParams.array[i * 4 + 1] = 0.0001;
    }
    this.aParams.needsUpdate = true;
    this.cursor = 0;
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
    this.points.parent?.remove(this.points);
  }
}
