/**
 * Distant operational traffic.
 *
 * The fortress is a working installation, so its fortress sectors carry a few
 * service craft on fixed lanes well outside the fight: low over the near-side
 * roofs, deep beyond the far towers, and high in the sky lanes. Each craft is
 * a running light, a marker lamp and a short engine wake.
 *
 * One draw, 64 quads. Every craft is a pure function of one clock in the
 * vertex shader, so the CPU writes a handful of uniforms per frame and never
 * touches a vertex. The layout comes from a private fixed-seed generator: no
 * level, chunk or shared random stream is read, and nothing here collides,
 * casts, receives or lights.
 *
 * Lanes are chosen by where they land on screen, not only by where they are:
 *
 *  - The Classic rig looks along (+x, -y, +z). A point at (x, y) lies on a
 *    sight line through the flight corridor (x within 17, y 0..26) only when
 *    -17 <= x + y <= 43. Every lane keeps x + y outside that band with a wide
 *    margin, so no craft can be drawn in front of or behind the corridor.
 *  - In the perspective rigs every lane is outside the near parapet or beyond
 *    the far towers, at least 45 units off the centre line (the corridor is
 *    17), and fades with the scene fog.
 *  - Every craft fades out before the outer sixth of the frame on either side,
 *    where the landscape HUD keeps its score, altimeter and tactical blocks.
 *  - Craft exist only inside the current fortress sector; open space and the
 *    boss arena stay empty, because there small moving lights mean threats.
 */

import * as THREE from 'three';
import { Rng, damp } from '../core/Utils.js';

/** Lane window length along Z. Craft speeds are whole units per second, so the clock can wrap at this period. */
export const TRAFFIC_SPAN = 480;
/** How far behind the ship the lane window starts. */
export const TRAFFIC_BACK = 150;
/** Craft never appear within this distance of their sector's ends (bulkheads, open space). */
export const TRAFFIC_EDGE = 30;
const EDGE_FADE = 50;
/** |NDC x| where a craft starts to fade and where it is gone: the HUD's side blocks start near 0.70. */
export const EDGE_START = 0.66, EDGE_END = 0.8;
/** Classic sight lines through the corridor satisfy CLASSIC_BAND[0] <= x + y <= CLASSIC_BAND[1]. */
export const CLASSIC_BAND = [-17, 43];

/**
 * Lanes: [family, x, y, speed (whole units/s, sign = direction), craft].
 *
 * A lane's Classic screen line is fixed by k = x + y alone, so lanes are laid
 * out in k:
 *  near: just outside the near parapet (k -30.8) and above the near roofs
 *        (fixtures top out near y 8), inside the strip the landscape HUD
 *        leaves clear between the parapet and its lower-right block.
 *  deep: beyond and below the far towers; seen over the far-wall crest
 *        (k 61..75) and under the upper-left HUD block.
 *  sky:  lanes for the perspective rigs: above the far towers, and low over
 *        the open near side; off the Classic landscape frame.
 * Lanes of one family differ in k by at least 1.5, so opposing lanes never
 * share a screen line.
 */
export const NEAR_BAND = [-43, -36], DEEP_BAND = [68, 80];
const LANES = [
  ['near', -49.0, 11.5, 46, 5],
  ['near', -51.5, 12.5, -34, 5],
  ['near', -54.0, 13.5, 54, 5],
  ['near', -54.0, 12.0, -40, 5],
  ['deep', 130, -59.5, 36, 4],
  ['deep', 137, -65.0, -28, 4],
  ['deep', 144, -70.5, 48, 4],
  ['deep', 151, -76.0, -40, 4],
  ['deep', 158, -81.5, 30, 4],
  ['deep', 166, -88.0, -24, 4],
  ['sky', 96, 102, 58, 4],
  ['sky', 150, 118, -44, 4],
  ['sky', 205, 96, 66, 4],
  ['sky', -128, 34, -52, 4],
  ['sky', -190, 44, 62, 4],
];

/** Per-sector character, indexed like the campaign. Null = no traffic. */
export const TRAFFIC_LOOKS = [
  // Outer Fortress: sparse pattern traffic, steady lamps. The opening stays calm.
  { name: 'pattern traffic', density: 0.55, speed: 0.8, length: 1.0, opacity: 0.5, head: 0xcfeaff, mark: 0x3ad6b0, strobe: 0.2 },
  // Gun Batteries: slow, heavy ammunition haulers.
  { name: 'ammunition haulers', density: 0.8, speed: 0.7, length: 1.35, opacity: 0.55, head: 0xffdcae, mark: 0xffb43a, strobe: 0.45 },
  null,
  // Reactor Spine: coolant tenders working the trench.
  { name: 'coolant tenders', density: 0.7, speed: 0.75, length: 1.15, opacity: 0.55, head: 0xffe2c0, mark: 0xff7a3a, strobe: 0.4 },
  null,
  // Inner Citadel: full, ordered command lanes.
  { name: 'command lanes', density: 1.0, speed: 1.0, length: 1.0, opacity: 0.6, head: 0xfff0d8, mark: 0xffc36a, strobe: 0.3 },
  // The Gauntlet: lanes closed, a few fast patrols. Cold running lights; the
  // sector's alarm red is only their strobing marker, never a bolt-like streak.
  { name: 'lockdown patrols', density: 0.35, speed: 1.45, length: 0.8, opacity: 0.55, head: 0xdfe2ff, mark: 0xff3d55, strobe: 1.0 },
  null,
];

/** Marker gain at rest and at the top of a strobe flash; the wake adds at most WAKE under the marker. */
const MARK_STEADY = 0.8, MARK_FLASH = 1.5, WAKE = 0.3;
/** Brightest value a craft can write: every look stays under the 1.02 bloom gate. */
export const trafficPeak = (look) => look.opacity * Math.max(1, Math.max(MARK_STEADY, MARK_FLASH * look.strobe + MARK_STEADY * (1 - look.strobe)) + WAKE);

const VERT = /* glsl */`
  uniform float uTau;
  uniform float uFocusZ;
  uniform vec2 uWindow;   // (back, span)
  uniform vec2 uRange;    // z extent craft may occupy
  uniform float uDensity;
  uniform float uLength;
  uniform float uStrobe;
  uniform float uOpacity;
  uniform float uFog;
  attribute vec4 aMotion; // speed, wake length, half width, rank
  attribute vec2 aBlink;  // phase, flashes per 8 seconds
  attribute vec2 aCorner; // 0 tail .. 1 head, side
  varying vec4 vShape;    // behind head, lateral, wake length, half width
  varying vec2 vLight;    // alpha, marker gain

  void main() {
    float start = uFocusZ - uWindow.x;
    float w = mod(position.z + aMotion.x * uTau - start, uWindow.y);
    vec3 head = vec3(position.x, position.y, start + w);
    float heading = aMotion.x < 0.0 ? -1.0 : 1.0;
    vec3 tail = head - vec3(0.0, 0.0, heading * aMotion.y * uLength);

    vec4 hv = viewMatrix * vec4(head, 1.0);
    vec4 tv = viewMatrix * vec4(tail, 1.0);
    float depth = -hv.z;
    // Direction of travel on screen. In perspective the two ends sit at
    // different depths, so it is taken after the divide, not in view space.
    vec2 hs = isOrthographic ? hv.xy : hv.xy / max(depth, 1e-3);
    vec2 ts = isOrthographic ? tv.xy : tv.xy / max(-tv.z, 1e-3);
    vec2 axis = hs - ts;
    float seg = length(axis);
    axis = seg > 1e-6 ? axis / seg : vec2(1.0, 0.0);
    if (!isOrthographic) seg *= depth;
    vec2 side = vec2(-axis.y, axis.x);

    // Hold a little over two pixels of half-width in perspective, so a far
    // craft dims with the fog instead of aliasing in and out.
    float r = aMotion.z;
    if (!isOrthographic) r = max(r, depth * 4.8 / (projectionMatrix[1][1] * 900.0));

    // The quad is laid out at the running light's depth: light, marker and wake are one flat picture.
    vec3 p = vec3(hv.xy + axis * (aCorner.x > 0.5 ? r : -seg) + side * (r * aCorner.y), hv.z);
    vShape = vec4(aCorner.x > 0.5 ? -r : seg, r * aCorner.y, max(seg, 1e-3), r);

    float t = w / uWindow.y;
    float alpha = smoothstep(0.0, 0.07, t) * (1.0 - smoothstep(0.9, 1.0, t));
    alpha *= smoothstep(uRange.x, uRange.x + ${EDGE_FADE.toFixed(1)}, head.z)
      * (1.0 - smoothstep(uRange.y - ${EDGE_FADE.toFixed(1)}, uRange.y, head.z));
    alpha *= step(aMotion.w, uDensity);
    float dist = isOrthographic ? depth : length(hv.xyz);
    // Lamps carry through haze further than the unlit hulls around them.
    float f = uFog * dist;
    alpha *= exp(-f * f * 0.5);
    // Fade a craft out before it reaches the camera plane instead of clipping it.
    alpha *= smoothstep(2.0, 16.0, depth);

    // Keep the frame's outer sixth, where the HUD's side blocks sit, dark.
    vec4 clip = projectionMatrix * hv;
    alpha *= 1.0 - smoothstep(${EDGE_START.toFixed(2)}, ${EDGE_END.toFixed(2)}, abs(clip.x / clip.w));

    float beat = fract(uTau * aBlink.y * 0.125 + aBlink.x);
    float flash = smoothstep(0.0, 0.02, beat) * (1.0 - smoothstep(0.07, 0.11, beat));
    vLight = vec2(alpha * uOpacity, mix(${MARK_STEADY.toFixed(2)}, flash * ${MARK_FLASH.toFixed(2)}, uStrobe));
    gl_Position = projectionMatrix * vec4(p, 1.0);
  }
`;

const FRAG = /* glsl */`
  precision highp float;
  uniform vec3 uHead;
  uniform vec3 uMark;
  varying vec4 vShape;
  varying vec2 vLight;
  void main() {
    float a = vShape.x, b = vShape.y, r = vShape.w;
    float lat = (b * b) / (r * r);
    float head = exp(-(a * a / (r * r) + lat) * 3.5);
    float back = a - r * 1.9;
    float mark = exp(-(back * back / (r * r) + lat) * 9.0);
    float fall = max(0.0, 1.0 - a / vShape.z);
    float wake = exp(-lat * 5.0) * step(0.0, a) * fall * fall;
    gl_FragColor = vec4(uHead * head + uMark * (mark * vLight.y + wake * ${WAKE.toFixed(2)}), vLight.x);
  }
`;

/**
 * The craft table: one entry per craft, in buffer order. Deterministic.
 * @returns {{family:string,x:number,y:number,z:number,speed:number,length:number,radius:number,rank:number,phase:number,rate:number}[]}
 */
export function trafficCraft() {
  const rng = new Rng(0x7afc1c);
  const craft = [];
  for (const [family, x, y, speed, count] of LANES) {
    const slot = TRAFFIC_SPAN / count;
    const offset = rng.next() * slot;
    for (let i = 0; i < count; i++) {
      craft.push({
        family,
        // Lane mates share one speed and keep station, so they never overtake.
        x: x + rng.range(-0.3, 0.3), y: y + rng.range(-0.25, 0.25),
        z: offset + i * slot + rng.range(-0.22, 0.22) * slot,
        speed,
        length: rng.range(7, 10.5) * (family === 'sky' ? 1.5 : 1),
        radius: rng.range(0.7, 0.95) * (family === 'sky' ? 1.4 : 1),
        rank: 0,
        phase: rng.next(), rate: rng.int(5, 9),
      });
    }
  }
  // Density thins every family evenly: ranks are spread within each family.
  for (const family of ['near', 'deep', 'sky']) {
    const members = craft.filter(c => c.family === family);
    const order = members.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    members.forEach((c, i) => { c.rank = (order[i] + 0.5) / members.length; });
  }
  return craft;
}

/** World Z of a craft's running light, exactly as the vertex shader places it. */
export function trafficZ(craft, tau, focusZ) {
  const start = focusZ - TRAFFIC_BACK;
  const m = (craft.z + craft.speed * tau - start) % TRAFFIC_SPAN;
  return start + (m < 0 ? m + TRAFFIC_SPAN : m);
}

let shared = null;

function sharedResources() {
  if (shared) return shared;
  const craft = trafficCraft();
  const n = craft.length;
  const position = new Float32Array(n * 4 * 3), motion = new Float32Array(n * 4 * 4);
  const blink = new Float32Array(n * 4 * 2), corner = new Float32Array(n * 4 * 2);
  const index = new Uint16Array(n * 6);
  craft.forEach((c, i) => {
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      position.set([c.x, c.y, c.z], v * 3);
      motion.set([c.speed, c.length, c.radius, c.rank], v * 4);
      blink.set([c.phase, c.rate], v * 2);
      corner.set([k >> 1, k & 1 ? 1 : -1], v * 2);
    }
    index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('aMotion', new THREE.BufferAttribute(motion, 4));
  geometry.setAttribute('aBlink', new THREE.BufferAttribute(blink, 2));
  geometry.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uTau: { value: 0 },
      uFocusZ: { value: 0 },
      uWindow: { value: new THREE.Vector2(TRAFFIC_BACK, TRAFFIC_SPAN) },
      uRange: { value: new THREE.Vector2(0, 0) },
      uDensity: { value: 0 },
      uLength: { value: 1 },
      uStrobe: { value: 0 },
      uOpacity: { value: 0 },
      uFog: { value: 0.003 },
      uHead: { value: new THREE.Color() },
      uMark: { value: new THREE.Color() },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  material.name = 'ambientTraffic';
  return (shared = { geometry, material, craft: n });
}

/** Release the shared geometry and program. Called with the fortress templates at shutdown. */
export function disposeAmbientTraffic() {
  const s = shared;
  shared = null;
  s?.geometry.dispose();
  s?.material.dispose();
}

export class AmbientTraffic {
  /** @param {THREE.Scene} scene the mesh is attached here while a level is streaming */
  constructor(scene) {
    this.scene = scene;
    const { geometry, material } = sharedResources();
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'ambientTraffic';
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.castShadow = this.mesh.receiveShadow = false;
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
    this._sector = null;
    this._look = null;
    this._opacity = 0;
    this._tau = 0;
    scene.add(this.mesh);
  }

  /** The look the sector under the ship asks for, or null. */
  static lookFor(sector) {
    return sector?.kind === 'fortress' && Number.isFinite(sector.zStart) && Number.isFinite(sector.zEnd)
      ? TRAFFIC_LOOKS[sector.index] ?? null : null;
  }

  /**
   * @param {object} level `sectorAt(z)` decides which lanes are open
   * @param {number} playerZ
   * @param {number} dt simulation step: traffic slows with the world
   */
  update(level, playerZ, dt) {
    const mesh = this.mesh;
    // A shutdown released the shared program: rebuild lazily if streaming resumes.
    if (mesh.material !== shared?.material) {
      const s = sharedResources();
      mesh.geometry = s.geometry; mesh.material = s.material;
    }
    if (mesh.parent !== this.scene) this.scene.add(mesh);
    const u = mesh.material.uniforms;

    const sector = level?.sectorAt?.(playerZ) ?? null;
    const look = AmbientTraffic.lookFor(sector);
    // Lanes change only while dark: fade out, swap the sector, fade in.
    if (sector !== this._sector && this._opacity < 0.02) {
      this._sector = sector;
      this._look = look;
      this._opacity = 0;
      if (look) {
        u.uRange.value.set(sector.zStart + TRAFFIC_EDGE, sector.zEnd - TRAFFIC_EDGE);
        u.uDensity.value = look.density;
        u.uLength.value = look.length;
        u.uStrobe.value = look.strobe;
        u.uHead.value.setHex(look.head);
        u.uMark.value.setHex(look.mark);
      }
    }
    const open = sector === this._sector && this._look;
    this._opacity = damp(this._opacity, open ? this._look.opacity : 0, open ? 1.2 : 5, dt);
    this._tau = (this._tau + dt * (this._look?.speed ?? 1)) % TRAFFIC_SPAN;

    u.uTau.value = this._tau;
    u.uFocusZ.value = playerZ;
    u.uOpacity.value = this._opacity;
    u.uFog.value = this.scene.fog?.density ?? 0.003;
    mesh.visible = this._opacity > 0.01;
  }

  /** Leave the scene and forget the sector: the next level fades its own lanes in. */
  detach() {
    this.mesh.removeFromParent();
    this.mesh.visible = false;
    this._sector = null;
    this._look = null;
    this._opacity = 0;
  }
}
