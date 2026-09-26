/**
 * The world beneath the flight lane.
 *
 * The classic rig looks down at 35 degrees, so half its frame is whatever
 * lies below the deck edges. Rather than the sky cubemap's dark nadir, a
 * single world-anchored plane far below shows the fortress's lit lower city
 * (or, in open space, a drifting nebula field). In space a faint flight grid
 * at the altitude floor carries the ship's shadow, so the core Zaxxon depth
 * cue never disappears.
 *
 * Two draws, both cheap: one textured plane and one procedural grid.
 */

import * as THREE from 'three';
import { Rng, damp } from '../core/Utils.js';

const DEPTH = 150;          // how far below the deck the underlay sits
const SIZE = 1400;          // plane extent; it follows the ship
const TILE = 360;           // world units per texture repeat

const UNDERLAY_VERT = /* glsl */`
  uniform vec2 uOffset;
  varying vec2 vUv;
  varying vec2 vLocal;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vUv = world.xz / ${TILE.toFixed(1)} + uOffset;
    vLocal = position.xy / ${(SIZE / 2).toFixed(1)};
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const UNDERLAY_FRAG = /* glsl */`
  precision highp float;
  uniform sampler2D uMapA;
  uniform sampler2D uMapB;
  uniform float uMix;
  uniform vec3 uTint;
  uniform float uGain;
  uniform float uTime;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec2 vLocal;
  void main() {
    vec3 a = texture2D(uMapA, vUv).rgb;
    vec3 b = texture2D(uMapB, vUv * 0.7 + vec2(0.0, uTime * 0.002)).rgb;
    vec3 col = mix(a, b, uMix) * uTint * uGain;
    // the rim fades out, so the sky shows through instead of a hard horizon
    float edge = 1.0 - smoothstep(0.45, 0.95, length(vLocal));
    gl_FragColor = vec4(col, edge * uOpacity);
  }
`;

const GRID_FRAG = /* glsl */`
  precision highp float;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform vec3 uFocus;
  varying vec3 vWorld;
  float line(float v, float w) {
    float d = abs(fract(v - 0.5) - 0.5) / fwidth(v);
    return 1.0 - smoothstep(0.0, w, d);
  }
  void main() {
    vec2 p = vWorld.xz / 8.0;
    float g = max(line(p.x, 1.2), line(p.y, 1.2)) * 0.55;
    g = max(g, max(line(vWorld.x / 32.0, 1.6), line(vWorld.z / 32.0, 1.6)));
    // the flight envelope's edges stay bright; the grid fades out around the ship
    float lane = 1.0 - smoothstep(0.0, 0.6, abs(abs(vWorld.x) - 16.9));
    // A local halo around the ship, not a floor: minor lines only up close.
    float d = length((vWorld.xz - uFocus.xz) * vec2(1.0, 0.6)) / 46.0;
    float fade = 1.0 - smoothstep(0.1, 1.0, d);
    gl_FragColor = vec4(uColor, (g * 0.4 * fade + lane * 0.6 * (1.0 - smoothstep(0.3, 1.6, d))) * fade * uOpacity);
  }
`;

const GRID_VERT = /* glsl */`
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/** Per-sky underlay look: which painting, its tint and brightness. */
const LOOKS = {
  dusk: { city: 1, tint: 0xa8b8e0, gain: 1.0 },
  ember: { city: 1, tint: 0xffb088, gain: 1.05 },
  void: { city: 1, tint: 0x8898d8, gain: 0.8 },
  deepspace: { city: 0, tint: 0xffffff, gain: 1.7 },
};

export class Underlay {
  constructor(scene) {
    this.cityMap = cityTexture();
    this.nebulaMap = nebulaTexture();

    this.material = new THREE.ShaderMaterial({
      vertexShader: UNDERLAY_VERT,
      fragmentShader: UNDERLAY_FRAG,
      uniforms: {
        uMapA: { value: this.nebulaMap },
        uMapB: { value: this.cityMap },
        uMix: { value: 1 },
        uTint: { value: new THREE.Color(0xffffff) },
        uGain: { value: 1 },
        uOffset: { value: new THREE.Vector2() },
        uTime: { value: 0 },
        uOpacity: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
    });
    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE).rotateX(-Math.PI / 2), this.material);
    this.plane.frustumCulled = false;
    this.plane.renderOrder = -5;
    scene.add(this.plane);

    this.gridMaterial = new THREE.ShaderMaterial({
      vertexShader: GRID_VERT,
      fragmentShader: GRID_FRAG,
      uniforms: {
        uColor: { value: new THREE.Color(0x2f86c8) },
        uOpacity: { value: 0 },
        uFocus: { value: new THREE.Vector3() },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.grid = new THREE.Mesh(new THREE.PlaneGeometry(260, 420).rotateX(-Math.PI / 2), this.gridMaterial);
    this.grid.frustumCulled = false;
    this.grid.renderOrder = 1;
    scene.add(this.grid);

    this._mix = 1;
    this._opacity = 1;
    this._space = false;
    this._gridOpacity = 0;
    this._look = LOOKS.dusk;
    this._grid = false;
    this.material.uniforms.uTint.value.setHex(this._look.tint);
  }

  /** @param {string} sky preset name @param {boolean} space open-space sector */
  setEnvironment(sky, space, immediate = false) {
    this._look = LOOKS[sky] ?? LOOKS.dusk;
    this._grid = space;
    this._space = space;
    if (immediate) {
      this._mix = this._look.city;
      this._gridOpacity = space ? 1 : 0;
      this.material.uniforms.uTint.value.setHex(this._look.tint);
    }
  }

  /** @param {boolean} classic the orthographic rig is active */
  update(dt, time, focus, classic = true) {
    const u = this.material.uniforms;
    // Perspective rigs see a real horizon in open space: keep their sky clear.
    this._opacity = damp(this._opacity, this._space && !classic ? 0 : 1, 2, dt);
    u.uOpacity.value = this._opacity;
    this.plane.visible = this._opacity > 0.01;
    this._mix = damp(this._mix, this._look.city, 1.2, dt);
    u.uMix.value = this._mix;
    u.uTint.value.lerp(_tint.setHex(this._look.tint), 1 - Math.exp(-1.2 * dt));
    u.uGain.value = this._look.gain;
    u.uTime.value = time;
    // Follow the ship in XZ; the texture stays world-anchored through uv.
    this.plane.position.set(focus.x, -DEPTH, focus.z + 120);

    this._gridOpacity = damp(this._gridOpacity, this._grid ? 1 : 0, 2, dt);
    this.gridMaterial.uniforms.uOpacity.value = this._gridOpacity * 0.36;
    this.gridMaterial.uniforms.uFocus.value.copy(focus);
    this.grid.visible = this._gridOpacity > 0.01;
    this.grid.position.set(0, 0.02, focus.z + 80);
  }

  dispose() {
    for (const m of [this.plane, this.grid]) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); }
    this.cityMap.dispose();
    this.nebulaMap.dispose();
  }
}

const _tint = new THREE.Color();

/* ------------------------------------------------------------------ */
/* Paintings                                                           */
/* ------------------------------------------------------------------ */

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return { c, ctx: c.getContext('2d') };
}

function finish(c) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Night-side industrial city: block grid, lit avenues, window speckle, glowing stacks. */
function cityTexture(size = 1024) {
  const rng = new Rng(0xc17e);
  const { c, ctx } = canvas(size);
  ctx.fillStyle = '#0b0e16';
  ctx.fillRect(0, 0, size, size);
  const cell = size / 16;
  for (let gy = 0; gy < 16; gy++) {
    for (let gx = 0; gx < 16; gx++) {
      const x = gx * cell, y = gy * cell;
      // city block roofs in varied greys, subdivided
      const subs = rng.int(1, 3);
      for (let s = 0; s < subs * subs; s++) {
        const sx = x + 3 + (s % subs) * (cell - 6) / subs, sy = y + 3 + Math.floor(s / subs) * (cell - 6) / subs;
        const w = (cell - 6) / subs - 2, h = (cell - 6) / subs - 2;
        const g = 18 + rng.int(0, 22);
        ctx.fillStyle = `rgb(${g},${g + 3},${g + 10})`;
        ctx.fillRect(sx, sy, w, h);
        // lit windows
        for (let k = 0; k < rng.int(2, 10); k++) {
          ctx.fillStyle = rng.bool(0.7) ? 'rgba(255,190,110,0.85)' : 'rgba(130,220,255,0.8)';
          ctx.fillRect(sx + rng.next() * w, sy + rng.next() * h, 1.6, 1.6);
        }
      }
    }
  }
  // avenues: bright sodium lines with occasional cyan transit lines
  for (let i = 0; i <= 16; i++) {
    const p = i * cell;
    const warm = i % 4 === 0;
    ctx.fillStyle = warm ? 'rgba(255,170,80,0.75)' : 'rgba(255,170,80,0.28)';
    ctx.fillRect(p - 1, 0, warm ? 3 : 1.5, size);
    ctx.fillStyle = i % 5 === 2 ? 'rgba(90,220,255,0.7)' : 'rgba(255,170,80,0.22)';
    ctx.fillRect(0, p - 1, size, i % 5 === 2 ? 2.5 : 1.2);
  }
  // furnace glows and beacon clusters
  for (let k = 0; k < 40; k++) {
    const x = rng.next() * size, y = rng.next() * size, r = rng.range(6, 26);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const hot = rng.bool(0.75);
    g.addColorStop(0, hot ? 'rgba(255,150,60,0.7)' : 'rgba(80,200,255,0.6)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let k = 0; k < 60; k++) {
    ctx.fillStyle = 'rgba(255,60,80,0.9)';
    ctx.fillRect(rng.next() * size, rng.next() * size, 2, 2);
  }
  return finish(c);
}

/** Nebula clouds with a dense star layer, painted once. */
function nebulaTexture(size = 1024) {
  const rng = new Rng(0x7eb);
  const { c, ctx } = canvas(size);
  ctx.fillStyle = '#04060f';
  ctx.fillRect(0, 0, size, size);
  const blob = (x, y, r, color) => {
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  };
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 70; k++) {
    const hue = rng.pick(['rgba(70,120,255,0.16)', 'rgba(150,70,220,0.16)', 'rgba(40,180,230,0.12)', 'rgba(220,80,160,0.11)']);
    blob(rng.next() * size, rng.next() * size, rng.range(80, 260), hue);
  }
  for (let k = 0; k < 2600; k++) {
    const b = rng.next() ** 3;
    const a = 0.25 + b * 0.75;
    ctx.fillStyle = rng.bool(0.8) ? `rgba(220,232,255,${a})` : `rgba(255,220,180,${a})`;
    const s = b > 0.85 ? 2.4 : b > 0.5 ? 1.6 : 1;
    ctx.fillRect(rng.next() * size, rng.next() * size, s, s);
  }
  ctx.globalCompositeOperation = 'source-over';
  return finish(c);
}
