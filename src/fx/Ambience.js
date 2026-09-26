/**
 * Ambient motes.
 *
 * A single LineSegments draw of world-anchored streaks that wrap around the
 * ship in the vertex shader: the CPU never touches a vertex after boot. In
 * open space they are the only thing telling you how fast you are moving;
 * over the reactor they become rising embers, over the outer fortress a thin
 * drift of dust.
 */

import * as THREE from 'three';
import { damp } from '../core/Utils.js';

const VERT = /* glsl */`
  uniform vec3 uCenter;
  uniform vec3 uBox;
  uniform vec3 uTail;
  uniform vec3 uDrift;
  uniform float uTime;
  attribute vec3 aSeed;
  attribute float aTail;
  varying float vAlpha;
  void main() {
    vec3 base = aSeed * uBox + uDrift * uTime * (0.6 + aSeed.x * 0.8);
    // nearest copy of this mote's tile to the ship; head and tail share it
    vec3 wp = base + floor((uCenter - base) / uBox + 0.5) * uBox;
    vec3 d = abs(wp - uCenter) / (uBox * 0.5);
    wp += uTail * aTail * (0.5 + aSeed.y);
    vAlpha = (1.0 - smoothstep(0.55, 1.0, max(d.x, max(d.y, d.z)))) * (1.0 - aTail * 0.85);
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }
`;

const FRAG = /* glsl */`
  precision highp float;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(uColor, vAlpha * uOpacity);
  }
`;

/** Streaks in the classic rig: dimmer and blue, so white stays with the bolts. */
const CLASSIC_STREAK = { opacity: 0.5, color: new THREE.Color(0x8fb0ff) };

/** Per-sky presets: colour, opacity, tail vector per unit speed, drift. */
const PRESETS = {
  dusk: { color: 0xc8d6e6, opacity: 0.22, tail: [0, 0, -0.035], drift: [0.4, -0.2, 0] },
  deepspace: { color: 0xcfe2ff, opacity: 0.62, tail: [0, 0, -0.11], drift: [0, 0, 0] },
  ember: { color: 0xff9a4a, opacity: 0.7, tail: [0, -0.02, -0.01], drift: [0.3, 3.2, 0] },
  void: { color: 0x9fb4ff, opacity: 0.4, tail: [0, 0, -0.07], drift: [0, 0, 0] },
};

export class AmbientDust {
  constructor(scene, count = 480) {
    const seeds = new Float32Array(count * 2 * 3);
    const tails = new Float32Array(count * 2);
    const positions = new Float32Array(count * 2 * 3);
    for (let i = 0; i < count; i++) {
      const sx = Math.random(), sy = Math.random(), sz = Math.random();
      for (let k = 0; k < 2; k++) {
        seeds.set([sx, sy, sz], (i * 2 + k) * 3);
        tails[i * 2 + k] = k;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    geo.setAttribute('aTail', new THREE.BufferAttribute(tails, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uCenter: { value: new THREE.Vector3() },
        uBox: { value: new THREE.Vector3(150, 90, 280) },
        uTail: { value: new THREE.Vector3() },
        uDrift: { value: new THREE.Vector3() },
        uTime: { value: 0 },
        uColor: { value: new THREE.Color() },
        uOpacity: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.mesh = new THREE.LineSegments(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    scene.add(this.mesh);

    this._preset = PRESETS.dusk;
    this._opacity = 0;
    this.setPreset('dusk', true);
  }

  setPreset(name, immediate = false) {
    const p = PRESETS[name] ?? PRESETS.dusk;
    this._preset = p;
    this._color = new THREE.Color(p.color);
    const u = this.material.uniforms;
    u.uColor.value.copy(this._color);
    u.uDrift.value.fromArray(p.drift);
    if (immediate) this._opacity = p.opacity;
  }

  /**
   * @param {THREE.Vector3} focus ship position
   * @param {number} speed forward speed, stretches streaks in open space
   * @param {boolean} [classic] the orthographic rig, where long streaks run
   *   parallel to the player's bolts
   */
  update(dt, time, focus, speed, classic = false) {
    const u = this.material.uniforms;
    // Only the long-tailed (open space) presets read as bolts.
    const streaky = classic && this._preset.tail[2] < -0.05;
    const target = this._preset.opacity * (streaky ? CLASSIC_STREAK.opacity : 1);
    this._opacity = damp(this._opacity, target, 2.5, dt);
    if (this._color) u.uColor.value.copy(this._color).lerp(CLASSIC_STREAK.color, streaky ? 0.7 : 0);
    u.uOpacity.value = this._opacity;
    u.uTime.value = time;
    u.uCenter.value.set(focus.x, focus.y, focus.z + 90);
    u.uTail.value.fromArray(this._preset.tail).multiplyScalar(Math.max(8, speed));
    this.mesh.visible = this._opacity > 0.01;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
