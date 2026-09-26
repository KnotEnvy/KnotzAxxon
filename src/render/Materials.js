/**
 * Shared material library.
 *
 * Fortress geometry is merged into a handful of big meshes, so per-block
 * variation comes from vertex colours rather than separate materials — hence
 * `vertexColors: true` on the structural materials.
 */

import * as THREE from 'three';
import * as Tex from './Textures.js';

/**
 * Per-vertex light animation, evaluated in the vertex shader so a whole
 * chunk of fortress lighting still costs one draw call.
 *
 *   aAnim.x  mode  0 steady | 1 strobe | 2 chase | 3 breathe | 4 flicker
 *   aAnim.y  rate  cycles per second
 *   aAnim.z  phase 0..1 (chase lights derive it from world Z)
 */
export const LIGHT_ANIM = { STEADY: 0, STROBE: 1, CHASE: 2, BREATHE: 3, FLICKER: 4 };

const ANIM_GLSL = /* glsl */`
  float lightGain(vec3 anim, float time) {
    float c = fract(time * anim.y + anim.z);
    if (anim.x < 0.5) return 1.0;
    if (anim.x < 1.5) return 0.08 + 1.45 * smoothstep(0.0, 0.03, c) * (1.0 - smoothstep(0.12, 0.2, c));
    if (anim.x < 2.5) return 0.18 + 1.35 * pow(c, 6.0);
    if (anim.x < 3.5) return 0.55 + 0.45 * sin(c * 6.2832);
    float n = fract(sin(floor(time * anim.y * 7.0 + anim.z * 91.0) * 12.9898) * 43758.5453);
    return n > 0.22 ? 1.0 : 0.25;
  }
`;

/** Rodrigues rotation about a per-vertex pivot and axis; w is rad/s. */
const SPIN_GLSL = /* glsl */`
  attribute vec3 aPivot;
  attribute vec4 aSpin;
  uniform float uSpinTime;
  vec3 spinAround(vec3 v, vec3 k, float a) {
    float c = cos(a), s = sin(a);
    return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
  }
`;

export class Materials {
  constructor(aniso = 8) {
    this.aniso = aniso;
    this._neon = new Map();
    this._disposables = [];
    /** Shared clock for every patched (non-ShaderMaterial) animated material. */
    this.clock = { value: 0 };
    this.build();
  }

  track(m) {
    this._disposables.push(m);
    const release = () => {
      const index = this._disposables.indexOf(m);
      if (index !== -1) this._disposables.splice(index, 1);
      m.removeEventListener('dispose', release);
    };
    m.addEventListener('dispose', release);
    return m;
  }

  build() {
    const hull = Tex.hullSet(this.aniso);
    const deck = Tex.deckSet(this.aniso);
    const grate = Tex.gratingSet(this.aniso);

    /** Main fortress armour. */
    this.hull = this.track(new THREE.MeshStandardMaterial({
      map: hull.map,
      normalMap: hull.normalMap,
      roughnessMap: hull.roughnessMap,
      normalScale: new THREE.Vector2(1.1, 1.1),
      // Mostly dielectric: under the orthographic rig every pixel reflects the
      // same environment direction, so high metalness flattened walls to one tone.
      metalness: 0.36,
      roughness: 1.0,
      vertexColors: true,
      envMapIntensity: 1.5,
    }));

    /** Deck plates and heavy structure. */
    this.deck = this.track(new THREE.MeshStandardMaterial({
      map: deck.map,
      normalMap: deck.normalMap,
      roughnessMap: deck.roughnessMap,
      normalScale: new THREE.Vector2(0.9, 0.9),
      metalness: 0.22,
      roughness: 1.0,
      vertexColors: true,
      envMapIntensity: 1.2,
    }));

    /** Catwalks, grilles, vents. */
    this.grating = this.track(new THREE.MeshStandardMaterial({
      map: grate.map,
      normalMap: grate.normalMap,
      normalScale: new THREE.Vector2(1.6, 1.6),
      metalness: 0.7,
      roughness: 0.5,
      vertexColors: true,
    }));

    /** Hazard chevrons on barrier faces. */
    this.hazard = this.track(new THREE.MeshStandardMaterial({
      map: Tex.hazardTexture(this.aniso),
      emissiveMap: Tex.hazardTexture(this.aniso),
      emissive: new THREE.Color(0xffb43a),
      emissiveIntensity: 0.45,
      metalness: 0.4,
      roughness: 0.65,
      vertexColors: true,
    }));

    /** Unlit dark filler — struts, undersides, greebles. */
    this.darkMetal = this.track(new THREE.MeshStandardMaterial({
      color: 0x3a4a5e,
      metalness: 0.5,
      roughness: 0.46,
      vertexColors: true,
    }));

    /** Enemy chassis: same plating, warmer and more worn. */
    const enemy = Tex.hullSet(this.aniso, [0.42, 0.20, 0.20]);
    this.enemyHull = this.track(new THREE.MeshStandardMaterial({
      map: enemy.map,
      normalMap: enemy.normalMap,
      roughnessMap: enemy.roughnessMap,
      metalness: 0.6,
      roughness: 1.0,
      envMapIntensity: 1.4,
      // Keep enemy armor legible in deep deck shadows without brightening scenery.
      emissive: 0x965448,
      emissiveIntensity: 0.22,
    }));
    this.addRim(this.enemyHull, 0xffaa7d, 0.65, 2.4);

    /**
     * Player chassis.
     *
     * A near-white hull disappeared into its own engine bloom. A mid-dark
     * slate body reads as a silhouette against the bright deck, and the
     * fresnel rim guarantees a lit edge no matter what is behind it — that
     * rim is the ship's readability, not the paint.
     */
    this.playerHull = this.track(new THREE.MeshStandardMaterial({
      color: 0x5c6e84,
      metalness: 0.78,
      roughness: 0.3,
      envMapIntensity: 1.45,
    }));
    this.addRim(this.playerHull, 0x8fecff, 1.25, 2.3);

    this.playerAccent = this.track(new THREE.MeshStandardMaterial({
      color: 0x121b26,
      metalness: 0.88,
      roughness: 0.3,
      envMapIntensity: 1.1,
    }));
    this.addRim(this.playerAccent, 0x3fa8d8, 0.55, 3.0);

    this.glass = this.track(new THREE.MeshPhysicalMaterial({
      color: 0x0a2634,
      metalness: 0.1,
      roughness: 0.06,
      transmission: 0.55,
      thickness: 0.6,
      transparent: true,
      opacity: 0.82,
      envMapIntensity: 2.0,
    }));

    /** Fuel drums: stencilled safety livery, open-ended cylinder capped by geometry. */
    this.fuelDrum = this.track(new THREE.MeshStandardMaterial({
      map: Tex.fuelDrumTexture(this.aniso),
      metalness: 0.25,
      roughness: 0.55,
      side: THREE.DoubleSide,
      emissive: 0x3a2a08,
      emissiveIntensity: 0.5,
    }));

    /** Deck paint: runway lines, chevrons, pad markings. Raised a hair above the plates. */
    this.paint = this.track(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.05,
      roughness: 0.72,
      vertexColors: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }));

    /** Asteroids and rubble: faceted, rough, lit by the sky environment. */
    this.rock = this.track(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: Tex.rockTexture(this.aniso),
      metalness: 0.08,
      roughness: 0.9,
      vertexColors: true,
      flatShading: true,
      envMapIntensity: 1.6,
    }));
    // A cool sky rim keeps dark-side rocks from reading as holes in the nebula.
    this.addSpin(this.addRim(this.rock, 0x6f9cff, 0.55, 2.2));

    /** Rotating machinery: radar dishes, fans, orbiting wreckage. */
    this.spinMetal = this.addSpin(this.track(new THREE.MeshStandardMaterial({
      color: 0x3a4a5e,
      metalness: 0.78,
      roughness: 0.36,
      vertexColors: true,
      envMapIntensity: 1.3,
    })));

    this.circuit = Tex.circuitTexture(this.aniso);
    this.glow = Tex.glowSprite();
    this.flare = Tex.flareSprite();
    this.ring = Tex.ringSprite();
    this.blob = Tex.blobShadowSprite();
  }

  /**
   * Adds a fresnel rim term to a standard material by patching its shader.
   * Cheaper and cleaner than an inverted-hull outline pass: no extra draw
   * calls, and it follows the real surface normal.
   */
  addRim(material, color, strength = 1, power = 3) {
    const uniforms = {
      uRimColor: { value: new THREE.Color(color) },
      uRimStrength: { value: strength },
      uRimPower: { value: power },
    };
    material.userData.rim = uniforms;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {',
          'uniform vec3 uRimColor;\nuniform float uRimStrength;\nuniform float uRimPower;\nvoid main() {')
        .replace('#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           // both normal and vViewPosition are in view space at this point
           vec3 rimView = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);
           float rimFacing = 1.0 - saturate(dot(normal, rimView));
           totalEmissiveRadiance += uRimColor * pow(rimFacing, uRimPower) * uRimStrength;`);
    };
    material.needsUpdate = true;
    return material;
  }

  /**
   * Rotates geometry in the vertex shader around per-vertex `aPivot` and
   * `aSpin` (axis xyz, rad/s w). A merged chunk of dishes and fans keeps
   * spinning at zero CPU cost and no extra draw calls. Spinning meshes do not
   * cast shadows: the depth material would not share the rotation.
   */
  addSpin(material) {
    const clock = this.clock;
    const previous = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      previous?.call(material, shader, renderer);
      shader.uniforms.uSpinTime = clock;
      shader.vertexShader = SPIN_GLSL + shader.vertexShader
        .replace('#include <beginnormal_vertex>',
          '#include <beginnormal_vertex>\n objectNormal = spinAround(objectNormal, aSpin.xyz, aSpin.w * uSpinTime);')
        .replace('#include <begin_vertex>',
          '#include <begin_vertex>\n transformed = aPivot + spinAround(transformed - aPivot, aSpin.xyz, aSpin.w * uSpinTime);');
    };
    material.customProgramCacheKey = () => 'spin';
    material.needsUpdate = true;
    return material;
  }

  /**
   * One shared emissive material for every glowing strip in the level.
   * Hue *and* brightness ride in the vertex colour, which means the whole
   * fortress lighting rig is a single draw call per chunk and each piece can
   * still sit deliberately above or below the bloom threshold. `aAnim` adds
   * strobes, runway chasers and breathing conduits without touching the CPU.
   */
  get neonVertex() {
    if (!this._neonVertex) {
      const m = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: true,
        toneMapped: false,
        fog: true,
      });
      const clock = this.clock;
      m.onBeforeCompile = (shader) => {
        shader.uniforms.uLightTime = clock;
        shader.vertexShader = 'attribute vec3 aAnim;\nuniform float uLightTime;\nvarying float vLightGain;\n'
          + ANIM_GLSL + shader.vertexShader.replace('#include <begin_vertex>',
            '#include <begin_vertex>\n vLightGain = lightGain(aAnim, uLightTime);');
        shader.fragmentShader = 'varying float vLightGain;\n' + shader.fragmentShader.replace('#include <color_fragment>',
          '#include <color_fragment>\n diffuseColor.rgb *= vLightGain;');
      };
      m.customProgramCacheKey = () => 'neon-anim';
      this._neonVertex = this.track(m);
    }
    return this._neonVertex;
  }

  /**
   * Unlit emissive material — bright enough that the bloom pass picks it up.
   * `toneMapped: false` keeps neon from being crushed by ACES.
   */
  neon(color, intensity = 1.6, opts = {}) {
    const key = `${color}:${intensity}:${opts.transparent ? 1 : 0}:${opts.opacity ?? 1}:${opts.depthWrite ?? true}:${!!opts.additive}:${opts.side ?? THREE.FrontSide}`;
    if (this._neon.has(key)) return this._neon.get(key);
    const c = new THREE.Color(color).multiplyScalar(intensity);
    const m = new THREE.MeshBasicMaterial({
      color: c,
      toneMapped: false,
      transparent: !!opts.transparent,
      opacity: opts.opacity ?? 1,
      depthWrite: opts.depthWrite ?? true,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: opts.side ?? THREE.FrontSide,
    });
    this._neon.set(key, m);
    return this.track(m);
  }

  /**
   * Additive textured material for billboards drawn as regular meshes.
   * SpriteMaterial only works on THREE.Sprite — using it on an InstancedMesh
   * throws inside the renderer, so instanced billboards need this instead.
   */
  billboard(texture, color = 0xffffff, opts = {}) {
    return this.track(new THREE.MeshBasicMaterial({
      map: texture,
      color,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
      ...opts,
    }));
  }

  /** Additive sprite material, for real THREE.Sprite objects only. */
  sprite(texture, color = 0xffffff, opts = {}) {
    return this.track(new THREE.SpriteMaterial({
      map: texture,
      color,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      ...opts,
    }));
  }

  /**
   * Animated energy barrier. Scrolling hex-ish interference plus a rim
   * fresnel, additive so it glows without hiding what's behind it.
   */
  forceField(color = 0x45e0ff) {
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: 0.85 },
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        varying vec3 vView;
        varying vec3 vNormalV;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = -mv.xyz;
          vNormalV = normalMatrix * normal;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        varying vec3 vView;
        varying vec3 vNormalV;

        float hexGrid(vec2 p) {
          p.y += 0.5 * mod(floor(p.x), 2.0);
          vec2 f = fract(p) - 0.5;
          return 1.0 - smoothstep(0.30, 0.46, max(abs(f.x), abs(f.y)));
        }

        void main() {
          vec2 p = vUv * vec2(14.0, 8.0);
          p.y -= uTime * 0.55;
          float cells = hexGrid(p);
          float lines = smoothstep(0.86, 1.0, sin((vUv.y * 46.0) - uTime * 5.0) * 0.5 + 0.5);
          vec3 viewDir = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vView);
          float fres = pow(clamp(1.0 - abs(dot(normalize(vNormalV), viewDir)), 0.0, 1.0), 2.0);
          float pulse = 0.72 + 0.28 * sin(uTime * 2.4);

          float a = (0.10 + cells * 0.32 + lines * 0.45 + fres * 0.85) * uOpacity * pulse;
          gl_FragColor = vec4(uColor * (0.9 + fres * 2.4 + lines * 1.6), a);
        }
      `,
    });
    return this.track(m);
  }

  /**
   * Pulsing power core — used for reactors, boss weak points and pickups.
   */
  energyCore(color = 0xff3d55) {
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(color) },
        uIntensity: { value: 1.0 },
      },
      vertexShader: /* glsl */`
        varying vec3 vNormalV;
        varying vec3 vView;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormalV = normalMatrix * normal;
          vView = -mv.xyz;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uIntensity;
        varying vec3 vNormalV;
        varying vec3 vView;
        void main() {
          vec3 viewDir = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vView);
          float fres = pow(clamp(1.0 - abs(dot(normalize(vNormalV), viewDir)), 0.0, 1.0), 1.6);
          float pulse = 0.6 + 0.4 * sin(uTime * 6.0);
          float a = (0.35 + fres * 0.9) * uIntensity;
          gl_FragColor = vec4(uColor * (1.4 + fres * 2.2) * pulse * uIntensity, a);
        }
      `,
    });
    return this.track(m);
  }

  /**
   * Scrolling energy conduit — long emissive strips running along corridors.
   */
  conduit(color = 0x45e0ff, speed = 1.6) {
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(color) },
        uSpeed: { value: speed },
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uSpeed;
        varying vec2 vUv;
        void main() {
          float t = vUv.y * 3.0 - uTime * uSpeed;
          float pulse = pow(fract(t), 6.0);
          float base = 0.22;
          float edge = (1.0 - smoothstep(0.0, 0.5, abs(vUv.x - 0.5)));
          float a = (base + pulse * 0.95) * edge;
          gl_FragColor = vec4(uColor * (1.0 + pulse * 3.0), a);
        }
      `,
    });
    return this.track(m);
  }

  /** Advance every time-driven shader. */
  update(time) {
    this.clock.value = time;
    for (const m of this._disposables) {
      if (m.uniforms?.uTime) m.uniforms.uTime.value = time;
    }
  }

  dispose() {
    for (const m of [...this._disposables]) m.dispose?.();
    this._disposables.length = 0;
    this._neon.clear();
  }
}
