/**
 * Shared material library.
 *
 * Fortress geometry is merged into a handful of big meshes, so per-block
 * variation comes from vertex colours rather than separate materials — hence
 * `vertexColors: true` on the structural materials.
 */

import * as THREE from 'three';
import * as Tex from './Textures.js';

export class Materials {
  constructor(aniso = 8) {
    this.aniso = aniso;
    this._neon = new Map();
    this._disposables = [];
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
      metalness: 0.62,
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
      metalness: 0.48,
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
      color: 0x2a3646,
      metalness: 0.75,
      roughness: 0.4,
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
   * One shared emissive material for every glowing strip in the level.
   * Hue *and* brightness ride in the vertex colour, which means the whole
   * fortress lighting rig is a single draw call per chunk and each piece can
   * still sit deliberately above or below the bloom threshold.
   */
  get neonVertex() {
    if (!this._neonVertex) {
      this._neonVertex = this.track(new THREE.MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: true,
        toneMapped: false,
        fog: true,
      }));
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
