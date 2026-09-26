import { glowSprite } from './Textures.js';
import { disposeModel } from './Dispose.js';
/**
 * Procedural sky.
 *
 * The gradient, nebula and starfield are rendered once into a cubemap when a
 * sector loads, then reused as both `scene.background` and (via PMREM) as
 * `scene.environment`. That means the sky costs nothing per frame *and* every
 * metal surface in the level reflects it for free.
 *
 * The sun disc and the distant planet stay as real objects so they can be
 * animated and occluded.
 */

import * as THREE from 'three';
import { TAU } from '../core/Utils.js';

const _ambient = new THREE.Color();

const SKY_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */`
  precision highp float;

  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uNebulaA;
  uniform vec3 uNebulaB;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uStarDensity;
  uniform float uNebulaAmount;
  uniform float uSeed;

  varying vec3 vDir;

  /* --- hash / noise ------------------------------------------------- */

  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }

  vec3 hash33(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
             dot(p, vec3(269.5, 183.3, 246.1)),
             dot(p, vec3(113.5, 271.9, 124.6)));
    return fract(sin(p) * 43758.5453123);
  }

  float vnoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
    return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
               mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
  }

  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * vnoise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }

  /* --- stars --------------------------------------------------------- */

  /**
   * Point stars: quantise the direction into cells, jitter one star per cell,
   * and light the pixel by how close it lands. Two layers at different scales
   * give a believable magnitude distribution.
   */
  vec3 stars(vec3 dir, float scale, float density, float brightness) {
    vec3 p = dir * scale;
    vec3 i = floor(p);
    vec3 f = fract(p) - 0.5;
    vec3 acc = vec3(0.0);
    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        for (int z = -1; z <= 1; z++) {
          vec3 o = vec3(float(x), float(y), float(z));
          vec3 h = hash33(i + o + uSeed);
          if (h.x > density) continue;
          vec3 pos = o + (h - 0.5) * 0.9;
          float d = length(f - pos);
          float mag = pow(h.y, 3.0);
          float star = (1.0 - smoothstep(0.0, 0.16, d)) * mag;
          // colour by "temperature"
          vec3 tint = mix(vec3(0.62, 0.76, 1.0), vec3(1.0, 0.82, 0.62), h.z);
          acc += star * tint * brightness;
        }
      }
    }
    return acc;
  }

  void main() {
    vec3 dir = normalize(vDir);
    float up = dir.y;

    /* base gradient: ground haze -> horizon -> zenith */
    vec3 col = mix(uHorizon, uZenith, pow(clamp(up, 0.0, 1.0), 0.62));
    col = mix(col, uGround, pow(clamp(-up, 0.0, 1.0), 0.45));

    /* nebula clouds, denser near the galactic band */
    vec3 np = dir * 2.2 + uSeed;
    float band = exp(-pow((dir.y - 0.05) * 2.6, 2.0));
    float n = fbm(np);
    float n2 = fbm(np * 2.7 + n * 1.4);
    float clouds = smoothstep(0.35, 0.95, n * 0.65 + n2 * 0.45) * band;
    vec3 neb = mix(uNebulaA, uNebulaB, smoothstep(0.2, 0.8, n2));
    col += neb * clouds * uNebulaAmount;

    /* dust lanes cut back into the nebula */
    float dust = smoothstep(0.55, 0.95, fbm(np * 3.6 + 11.0)) * band;
    col *= 1.0 - dust * 0.42 * uNebulaAmount;

    /* stars, dimmed inside bright nebula */
    float occl = 1.0 - clamp(clouds * 1.3, 0.0, 0.85);
    col += stars(dir, 90.0, 0.055, 1.5) * occl;
    col += stars(dir, 240.0, 0.030, 0.7) * occl;

    /* sun bloom in the sky itself */
    float sd = max(dot(dir, normalize(uSunDir)), 0.0);
    col += uSunColor * pow(sd, 340.0) * 6.0;
    col += uSunColor * pow(sd, 12.0) * 0.30;
    col += uSunColor * pow(sd, 3.0) * 0.06;

    gl_FragColor = vec4(col, 1.0);
  }
`;

/** Per-sector sky palettes. */
export const SKY_PRESETS = {
  dusk: {
    zenith: 0x111f4d, horizon: 0x6b4478, ground: 0x18101f,
    nebulaA: 0xb5589c, nebulaB: 0x4a7fd0, nebulaAmount: 1.05,
    sunColor: 0xffbc86, sunDir: [-0.46, 0.64, 0.62], sunIntensity: 3.4,
    fog: 0x2a2c48, fogDensity: 0.0034,
    ambient: 0x5a6f95, ambientIntensity: 1.9,
  },
  deepspace: {
    zenith: 0x05091c, horizon: 0x0e1c3a, ground: 0x03050e,
    nebulaA: 0x2f9ae8, nebulaB: 0x8a45d8, nebulaAmount: 1.6,
    sunColor: 0xd6ecff, sunDir: [0.52, 0.70, 0.49], sunIntensity: 2.9,
    fog: 0x0a1224, fogDensity: 0.0020,
    ambient: 0x3a5680, ambientIntensity: 1.6,
  },
  ember: {
    zenith: 0x2e0a18, horizon: 0x9c2c12, ground: 0x2c0d06,
    nebulaA: 0xff7a30, nebulaB: 0xc11a42, nebulaAmount: 1.15,
    sunColor: 0xff8f4a, sunDir: [0.34, 0.60, -0.72], sunIntensity: 3.8,
    fog: 0x4a1810, fogDensity: 0.0046,
    ambient: 0x8a4430, ambientIntensity: 1.9,
  },
  void: {
    zenith: 0x03061a, horizon: 0x0a1430, ground: 0x02040c,
    nebulaA: 0x1c6f9e, nebulaB: 0x5a2090, nebulaAmount: 0.85,
    sunColor: 0xe6f4ff, sunDir: [-0.22, 0.76, -0.61], sunIntensity: 2.8,
    fog: 0x08101f, fogDensity: 0.0026,
    ambient: 0x30446a, ambientIntensity: 1.55,
  },
};

export class Sky {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene main scene (receives background/environment)
   */
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;

    this._skyScene = new THREE.Scene();
    this._material = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        uZenith: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uGround: { value: new THREE.Color() },
        uNebulaA: { value: new THREE.Color() },
        uNebulaB: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 0.3, 1) },
        uSunColor: { value: new THREE.Color() },
        uStarDensity: { value: 0.05 },
        uNebulaAmount: { value: 1 },
        uSeed: { value: 0 },
      },
    });
    this._skyMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), this._material);
    this._skyScene.add(this._skyMesh);

    this._cubeRT = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType });
    this._cubeCam = new THREE.CubeCamera(0.1, 100, this._cubeRT);
    this._pmrem = new THREE.PMREMGenerator(renderer);
    this._pmrem.compileCubemapShader();
    this._envRT = null;

    /* --- sun + celestial bodies ------------------------------------- */

    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = false;
    scene.add(this.group);

    this.sunLight = new THREE.DirectionalLight(0xffffff, 3);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 260;
    this.sunLight.shadow.bias = -0.0006;
    this.sunLight.shadow.normalBias = 0.04;
    // Tight frustum: the playfield is only ~60 units wide, so a huge shadow
    // camera just wasted texels and dragged extra geometry into the depth pass.
    const cam = this.sunLight.shadow.camera;
    cam.left = -58; cam.right = 58; cam.top = 58; cam.bottom = -58;
    cam.updateProjectionMatrix();
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    this.ambient = new THREE.HemisphereLight(0x33507a, 0x100c14, 1.0);
    scene.add(this.ambient);

    /** Rim light from the opposite side — separates silhouettes from the sky. */
    this.rimLight = new THREE.DirectionalLight(0x4fd8ff, 1.1);
    scene.add(this.rimLight, this.rimLight.target);

    this._buildBodies();
    this.apply('dusk', 1);
  }

  /**
   * Celestial bodies are placed just inside the camera's far plane and scaled
   * to keep a fixed angular size. Parking them at a "realistic" distance would
   * put them outside the frustum, where they simply never draw.
   */
  setRange(far) {
    this.bodyDist = far * 0.72;
  }

  _buildBodies() {
    this.bodyDist = 900;
    // angular sizes, as a fraction of the placement distance
    this.sunRatio = 0.011;
    this.glowRatio = 0.145;
    this.planetRatio = 0.13;

    // sun disc (unlit, blooms hard)
    const sunGeo = new THREE.SphereGeometry(1, 24, 16);
    this.sunDisc = new THREE.Mesh(sunGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false }));
    this.group.add(this.sunDisc);

    // corona sprite
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowSprite(), color: 0xffc98a, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: true, toneMapped: false, fog: false, opacity: 0.55,
    }));
    this.group.add(this.sunGlow);

    // a big moody planet hanging off to one side
    const planetGeo = new THREE.SphereGeometry(1, 48, 32);
    this.planetMat = new THREE.MeshStandardMaterial({
      color: 0x33506e, roughness: 0.95, metalness: 0.0, fog: false,
      emissive: 0x050a14, emissiveIntensity: 1,
    });
    this.planet = new THREE.Mesh(planetGeo, this.planetMat);
    this.planetDir = new THREE.Vector3(-0.48, 0.16, 0.86).normalize();
    this.group.add(this.planet);

    const ringGeo = new THREE.RingGeometry(1.45, 2.3, 96, 1);
    this.planetRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: 0x7ea8cc, transparent: true, opacity: 0.30, side: THREE.DoubleSide,
      depthWrite: false, fog: false, toneMapped: false,
    }));
    this.planetRing.rotation.set(-1.15, 0.35, 0.2);
    this.group.add(this.planetRing);
  }

  /**
   * Switch to a sky preset. Re-bakes the cubemap and the environment map.
   * @param {string} name key in SKY_PRESETS
   * @param {number} seed varies the nebula and star layout per run
   */
  apply(name, seed = 1, blend = false) {
    const p = SKY_PRESETS[name] ?? SKY_PRESETS.dusk;
    // Crossfade fog and light over a couple of seconds instead of cutting.
    const from = blend && this.scene.fog ? {
      fog: this.scene.fog.color.clone(), density: this.scene.fog.density,
      sun: this.sunLight.color.clone(), sunI: this.sunLight.intensity,
      amb: this.ambient.color.clone(), ambI: this.ambient.intensity, ground: this.ambient.groundColor.clone(),
    } : null;
    this.preset = p;
    this.presetName = name;

    const u = this._material.uniforms;
    u.uZenith.value.setHex(p.zenith);
    u.uHorizon.value.setHex(p.horizon);
    u.uGround.value.setHex(p.ground);
    u.uNebulaA.value.setHex(p.nebulaA);
    u.uNebulaB.value.setHex(p.nebulaB);
    u.uNebulaAmount.value = p.nebulaAmount;
    u.uSunColor.value.setHex(p.sunColor);
    u.uSunDir.value.fromArray(p.sunDir).normalize();
    u.uSeed.value = (seed % 997) * 0.37;

    this._bake();

    // fog: one instance, mutated, so blends and materials keep their reference
    if (!this.scene.fog) this.scene.fog = new THREE.FogExp2(p.fog, p.fogDensity);
    this.scene.fog.color.setHex(p.fog);
    this.scene.fog.density = p.fogDensity;

    // lights
    const dir = new THREE.Vector3().fromArray(p.sunDir).normalize();
    this.sunLight.color.setHex(p.sunColor);
    this.sunLight.intensity = p.sunIntensity;
    this._sunDir = dir;
    this.rimLight.position.copy(dir).multiplyScalar(-140).setY(60);
    this.ambient.color.setHex(p.ambient);
    this.ambient.intensity = p.ambientIntensity;
    // Bounce light off the deck: lift the ground term above the fog colour.
    this.ambient.groundColor.setHex(p.fog).lerp(_ambient.setHex(p.ambient), 0.45);
    this._blendTo = {
      fog: this.scene.fog.color.clone(), density: p.fogDensity,
      sun: this.sunLight.color.clone(), sunI: p.sunIntensity,
      amb: this.ambient.color.clone(), ambI: p.ambientIntensity, ground: this.ambient.groundColor.clone(),
    };
    this._blendFrom = from;
    this._blend = from ? 0 : 1;
    if (from) this._applyBlend(0);

    // celestial placement
    this.sunDisc.material.color.setHex(p.sunColor);
    this.sunGlow.material.color.setHex(p.sunColor);
    this.planetMat.color.setHex(p.nebulaB);
  }

  _applyBlend(t) {
    const a = this._blendFrom, b = this._blendTo;
    if (!a || !b) return;
    const k = t * t * (3 - 2 * t);
    this.scene.fog.color.copy(a.fog).lerp(b.fog, k);
    this.scene.fog.density = a.density + (b.density - a.density) * k;
    this.sunLight.color.copy(a.sun).lerp(b.sun, k);
    this.sunLight.intensity = a.sunI + (b.sunI - a.sunI) * k;
    this.ambient.color.copy(a.amb).lerp(b.amb, k);
    this.ambient.intensity = a.ambI + (b.ambI - a.ambI) * k;
    this.ambient.groundColor.copy(a.ground).lerp(b.ground, k);
  }

  _bake() {
    const r = this.renderer;
    const prevRT = r.getRenderTarget();
    const prevTone = r.toneMapping;
    r.toneMapping = THREE.NoToneMapping;
    this._cubeCam.update(r, this._skyScene);
    r.toneMapping = prevTone;
    r.setRenderTarget(prevRT);

    this.scene.background = this._cubeRT.texture;
    this.scene.backgroundIntensity = 1;

    this._envRT?.dispose();
    this._envRT = this._pmrem.fromCubemap(this._cubeRT.texture);
    this.scene.environment = this._envRT.texture;
    this.scene.environmentIntensity = 1.0;
  }

  /**
   * Keep the sky rig anchored to the camera and the shadow frustum centred on
   * the action. Called every frame.
   */
  update(dt, time, focus) {
    if (this._blend < 1) {
      this._blend = Math.min(1, this._blend + dt / 2.4);
      this._applyBlend(this._blend);
    }
    // celestial bodies ride along with the player so they stay "infinitely" far
    this.group.position.set(focus.x, 0, focus.z);
    this.group.updateMatrix();

    const R = this.bodyDist;
    const d = this._sunDir;
    this.sunDisc.position.set(d.x * R, d.y * R + R * 0.08, d.z * R);
    this.sunDisc.scale.setScalar(R * this.sunRatio);
    this.sunGlow.position.copy(this.sunDisc.position);
    this.sunGlow.scale.setScalar(R * this.glowRatio);

    const pd = this.planetDir;
    this.planet.position.set(pd.x * R, pd.y * R, pd.z * R);
    this.planet.scale.setScalar(R * this.planetRatio);
    this.planetRing.position.copy(this.planet.position);
    this.planetRing.scale.setScalar(R * this.planetRatio);

    this.planet.rotation.y += dt * 0.008;
    this.planetRing.rotation.z += dt * 0.004;

    // directional light follows the player, offset back along its own direction
    this.sunLight.position.set(
      focus.x + d.x * 140,
      d.y * 140 + 90,
      focus.z + d.z * 140,
    );
    this.sunLight.target.position.set(focus.x, 0, focus.z + 24);
    this.sunLight.target.updateMatrixWorld();

    this.rimLight.position.set(focus.x - d.x * 120, 70, focus.z - d.z * 120);
    this.rimLight.target.position.set(focus.x, 0, focus.z);
    this.rimLight.target.updateMatrixWorld();
  }

  setShadowQuality(enabled, mapSize) {
    this.sunLight.castShadow = enabled;
    if (this.sunLight.shadow.mapSize.width !== mapSize) {
      this.sunLight.shadow.mapSize.set(mapSize, mapSize);
      this.sunLight.shadow.map?.dispose();
      this.sunLight.shadow.map = null;
    }
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    disposeModel(this.group, true);
    for (const light of [this.sunLight, this.rimLight, this.ambient]) {
      light.removeFromParent(); light.dispose?.();
    }
    this.sunLight.target.removeFromParent();
    this.rimLight.target.removeFromParent();
    this.scene.background = this.scene.environment = null;
    this._material.dispose();
    this._skyMesh.geometry.dispose();
    this._cubeRT.dispose();
    this._envRT?.dispose();
    this._pmrem.dispose();
  }
}
