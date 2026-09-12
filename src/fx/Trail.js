/**
 * Camera-facing ribbon trail.
 *
 * The engine flame is shape, not brightness. A ribbon that tapers and fades
 * along its length reads as thrust at a fraction of the screen energy a pile
 * of additive sprites needs — which matters here because the exhaust spawns a
 * few metres from the camera, where anything bright washes out the frame.
 *
 * The strip is rebuilt each frame from a ring buffer of world-space samples,
 * oriented so its width always faces the camera.
 */

import * as THREE from 'three';

const _dir = new THREE.Vector3();
const _toCam = new THREE.Vector3();
const _side = new THREE.Vector3();

const VERT = /* glsl */`
  varying vec2 vUv;
  varying float vFade;
  attribute float aFade;
  void main() {
    vUv = uv;
    vFade = aFade;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */`
  precision highp float;
  uniform vec3 uColorHot;
  uniform vec3 uColorCool;
  uniform float uIntensity;
  varying vec2 vUv;
  varying float vFade;

  void main() {
    // soft across the width, hot in the middle
    float edge = 1.0 - abs(vUv.x * 2.0 - 1.0);
    float core = pow(edge, 2.2);
    float body = pow(edge, 0.6);

    float along = 1.0 - vUv.y;
    vec3 col = mix(uColorCool, uColorHot, core * along);
    float a = body * vFade * uIntensity;

    gl_FragColor = vec4(col * (0.55 + core * 1.5), a);
  }
`;

export class Trail {
  /**
   * @param {THREE.Scene} scene
   * @param {object} o
   * @param {number} [o.samples] ribbon resolution
   * @param {number} [o.width] width at the nozzle, in world units
   */
  constructor(scene, o = {}) {
    this.samples = o.samples ?? 16;
    this.width = o.width ?? 0.5;
    this.interval = o.interval ?? 1 / 90;
    this.intensity = 0;
    this._acc = 0;
    this._filled = false;

    this.points = [];
    for (let i = 0; i < this.samples; i++) this.points.push(new THREE.Vector3());

    const n = this.samples;
    const pos = new Float32Array(n * 2 * 3);
    const uv = new Float32Array(n * 2 * 2);
    const fade = new Float32Array(n * 2);
    const idx = [];
    for (let i = 0; i < n; i++) {
      const v = i / (n - 1);
      uv[(i * 2) * 2] = 0; uv[(i * 2) * 2 + 1] = v;
      uv[(i * 2 + 1) * 2] = 1; uv[(i * 2 + 1) * 2 + 1] = v;
      if (i < n - 1) {
        const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
        idx.push(a, b, c, b, d, c);
      }
    }

    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aFade = new THREE.BufferAttribute(fade, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('aFade', this.aFade);
    geo.setIndex(idx);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uColorHot: { value: new THREE.Color(o.hot ?? 0xdff4ff) },
        uColorCool: { value: new THREE.Color(o.cool ?? 0x2b7fd0) },
        uIntensity: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /** Collapse the ribbon onto a point — used on respawn so it doesn't streak. */
  reset(at) {
    for (const p of this.points) p.copy(at);
    this._filled = true;
    this._acc = 0;
  }

  /**
   * @param {number} dt
   * @param {THREE.Vector3} head current nozzle position, world space
   * @param {THREE.Vector3} camPos
   * @param {number} intensity 0..1
   */
  update(dt, head, camPos, intensity) {
    this.intensity = intensity;
    this.material.uniforms.uIntensity.value = intensity;
    this.mesh.visible = intensity > 0.01;
    if (!this.mesh.visible) return;

    if (!this._filled) this.reset(head);

    // Advance the ring buffer on a fixed cadence so ribbon length does not
    // depend on framerate.
    this._acc += dt;
    while (this._acc >= this.interval) {
      this._acc -= this.interval;
      for (let i = this.points.length - 1; i > 0; i--) this.points[i].copy(this.points[i - 1]);
    }
    this.points[0].copy(head);

    const n = this.samples;
    const arr = this.aPos.array;
    const fade = this.aFade.array;

    for (let i = 0; i < n; i++) {
      const p = this.points[i];
      const prev = this.points[Math.max(0, i - 1)];
      const next = this.points[Math.min(n - 1, i + 1)];

      _dir.copy(next).sub(prev);
      if (_dir.lengthSq() < 1e-8) _dir.set(0, 0, -1);
      _dir.normalize();

      _toCam.copy(camPos).sub(p).normalize();
      _side.crossVectors(_dir, _toCam);
      if (_side.lengthSq() < 1e-8) _side.set(1, 0, 0);
      _side.normalize();

      const t = i / (n - 1);
      // slight bulge just behind the nozzle, then a taper to nothing
      const taper = Math.sin((1 - t) * Math.PI * 0.5) * (1 - t * 0.85);
      _side.multiplyScalar(this.width * taper);

      const a = i * 2 * 3;
      arr[a] = p.x - _side.x; arr[a + 1] = p.y - _side.y; arr[a + 2] = p.z - _side.z;
      arr[a + 3] = p.x + _side.x; arr[a + 4] = p.y + _side.y; arr[a + 5] = p.z + _side.z;

      const f = (1 - t) * (1 - t);
      fade[i * 2] = f;
      fade[i * 2 + 1] = f;
    }

    this.aPos.needsUpdate = true;
    this.aFade.needsUpdate = true;
  }

  setColors(hot, cool) {
    this.material.uniforms.uColorHot.value.setHex(hot);
    this.material.uniforms.uColorCool.value.setHex(cool);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.parent?.remove(this.mesh);
  }
}
