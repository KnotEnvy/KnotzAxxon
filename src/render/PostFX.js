/**
 * Post-processing stack.
 *
 *   RenderPass -> Bloom -> OutputPass (ACES + sRGB) -> Composite -> screen
 *
 * The composite pass is a single fragment shader that folds together
 * chromatic aberration, radial speed blur, vignette, film grain, damage tint,
 * white flash and the optional CRT overlay. One pass instead of six keeps the
 * bandwidth cost down on integrated GPUs.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { clamp01, damp } from '../core/Utils.js';

const CompositeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTexel: { value: new THREE.Vector2(1, 1) },
    uFxaa: { value: 1 },
    uAberration: { value: 1 },
    uVignette: { value: 1 },
    uGrain: { value: 0.05 },
    uScanline: { value: 0 },
    uDamage: { value: 0 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uRadial: { value: 0 },
    uDesat: { value: 0 },
    uEdgePulse: { value: 0 },
    uContrast: { value: 1.04 },
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

    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform vec2 uTexel;
    uniform float uFxaa;
    uniform float uAberration;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uScanline;
    uniform float uDamage;
    uniform float uFlash;
    uniform vec3 uFlashColor;
    uniform float uRadial;
    uniform float uDesat;
    uniform float uEdgePulse;
    uniform float uContrast;

    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(443.897, 441.423));
      p += dot(p, p.yx + 19.19);
      return fract((p.x + p.y) * p.x);
    }

    const vec3 LUMA = vec3(0.299, 0.587, 0.114);

    /**
     * FXAA 3.11, console variant. Eleven taps, edge-directed blend.
     * Runs on the tone-mapped image, which is where FXAA belongs — running
     * it on HDR data makes it chase fireflies instead of edges.
     */
    vec3 fxaa(vec2 uv) {
      vec3 rgbNW = texture2D(tDiffuse, uv + vec2(-1.0, -1.0) * uTexel).rgb;
      vec3 rgbNE = texture2D(tDiffuse, uv + vec2( 1.0, -1.0) * uTexel).rgb;
      vec3 rgbSW = texture2D(tDiffuse, uv + vec2(-1.0,  1.0) * uTexel).rgb;
      vec3 rgbSE = texture2D(tDiffuse, uv + vec2( 1.0,  1.0) * uTexel).rgb;
      vec3 rgbM  = texture2D(tDiffuse, uv).rgb;

      float lNW = dot(rgbNW, LUMA);
      float lNE = dot(rgbNE, LUMA);
      float lSW = dot(rgbSW, LUMA);
      float lSE = dot(rgbSE, LUMA);
      float lM  = dot(rgbM,  LUMA);

      float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
      float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));

      // Flat areas are left completely alone.
      if (lMax - lMin < max(0.0312, lMax * 0.125)) return rgbM;

      vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
      float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
      float rcpMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
      dir = clamp(dir * rcpMin, -8.0, 8.0) * uTexel;

      vec3 rgbA = 0.5 * (
        texture2D(tDiffuse, uv + dir * (1.0 / 3.0 - 0.5)).rgb +
        texture2D(tDiffuse, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
      vec3 rgbB = rgbA * 0.5 + 0.25 * (
        texture2D(tDiffuse, uv + dir * -0.5).rgb +
        texture2D(tDiffuse, uv + dir *  0.5).rgb);

      float lB = dot(rgbB, LUMA);
      return (lB < lMin || lB > lMax) ? rgbA : rgbB;
    }

    void main() {
      vec2 uv = vUv;
      vec2 center = vec2(0.5);
      vec2 toCenter = uv - center;
      float dist = length(toCenter);

      /* --- radial speed blur (afterburner) --------------------------- */
      vec3 col;
      if (uRadial > 0.001) {
        vec3 acc = vec3(0.0);
        float total = 0.0;
        // Taps bunch up near the centre so the middle of the screen stays sharp.
        for (int i = 0; i < 10; i++) {
          float t = float(i) / 9.0;
          float scale = 1.0 - t * uRadial * 0.16 * smoothstep(0.05, 0.85, dist);
          float w = 1.0 - t * 0.55;
          acc += texture2D(tDiffuse, center + toCenter * scale).rgb * w;
          total += w;
        }
        col = acc / total;
      } else {
        col = uFxaa > 0.5 ? fxaa(uv) : texture2D(tDiffuse, uv).rgb;
      }

      /* --- chromatic aberration, stronger toward the edges ------------ */
      if (uAberration > 0.001) {
        float amt = uAberration * (0.0016 + dist * 0.0052);
        vec2 dir = normalize(toCenter + 1e-6);
        col.r = texture2D(tDiffuse, uv + dir * amt).r;
        col.b = texture2D(tDiffuse, uv - dir * amt).b;
      }

      /* --- grade: contrast, desaturation, damage tint ----------------- */
      col = (col - 0.5) * uContrast + 0.5;

      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col, vec3(luma), uDesat);

      if (uDamage > 0.001) {
        vec3 hurt = vec3(luma * 1.15, luma * 0.14, luma * 0.20);
        col = mix(col, hurt, uDamage * 0.75);
      }

      /* --- vignette --------------------------------------------------- */
      float vig = (1.0 - smoothstep(0.24, 0.92, dist));
      col *= mix(1.0, vig, uVignette * 0.85);

      /* --- critical-hull edge pulse ------------------------------------ */
      if (uEdgePulse > 0.001) {
        float edge = smoothstep(0.30, 0.78, dist);
        col = mix(col, vec3(0.85, 0.06, 0.12), edge * uEdgePulse * 0.55);
      }

      /* --- CRT scanlines ---------------------------------------------- */
      if (uScanline > 0.001) {
        float line = sin(uv.y * uResolution.y * 1.5) * 0.5 + 0.5;
        float mask = 0.82 + 0.18 * line;
        vec3 rgbMask = vec3(
          0.92 + 0.08 * sin(uv.x * uResolution.x * 3.14159),
          0.92 + 0.08 * sin(uv.x * uResolution.x * 3.14159 + 2.094),
          0.92 + 0.08 * sin(uv.x * uResolution.x * 3.14159 + 4.188)
        );
        col = mix(col, col * mask * rgbMask, uScanline);
      }

      /* --- film grain -------------------------------------------------- */
      if (uGrain > 0.001) {
        float n = hash(uv * uResolution + fract(uTime) * 719.7);
        // less grain in the highlights, the way real film behaves
        col += (n - 0.5) * uGrain * (1.0 - luma * 0.6);
      }

      /* --- full-screen flash ------------------------------------------- */
      col = mix(col, uFlashColor, clamp(uFlash, 0.0, 1.0));

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

export class PostFX {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   * @param {object} quality preset from Settings
   */
  constructor(renderer, scene, camera, quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    /**
     * Deliberately NOT multisampled.
     *
     * UnrealBloomPass reads `readBuffer.texture` and then blends its result
     * back into `readBuffer`. When that buffer is multisampled, the read
     * forces an MSAA resolve, and drivers are entitled to invalidate the
     * multisample attachment afterwards — so the additive blend lands on
     * discarded contents and the whole frame comes back black. It is
     * driver-dependent, which makes it the worst kind of bug to ship.
     *
     * Anti-aliasing is handled by the FXAA built into the composite pass
     * instead: no extra pass, no resolve, and cheaper than 4x MSAA.
     */
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: 0,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.composer = new EffectComposer(renderer, target);
    this.composer.setPixelRatio(1); // we manage resolution scaling ourselves

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      quality.bloomStrength,
      0.42,   // radius — tight, so glow reads as glow and not as haze
      1.02,   // threshold
    );
    // Anything at or below this is "lit", not "glowing". Emissive materials
    // are authored around it: trim sits just under, hot cores sit above.
    this.bloom.threshold = 1.02;
    this.bloom.enabled = quality.bloom;
    this.composer.addPass(this.bloom);

    this.composer.addPass(new OutputPass());

    this.composite = new ShaderPass(CompositeShader);
    this.composite.renderToScreen = true;
    this.composer.addPass(this.composite);

    /* Live-tunable effect state, driven by the game. */
    this.state = {
      aberration: 0,
      radial: 0,
      damage: 0,
      flash: 0,
      desat: 0,
      shakeBoost: 0,
    };
    this._target = { aberration: 0, radial: 0, damage: 0, desat: 0 };

    this.applyQuality(quality);
  }

  applyQuality(q) {
    this.quality = q;
    this.bloom.enabled = q.bloom;
    this.bloom.strength = q.bloomStrength;
    const u = this.composite.uniforms;
    u.uGrain.value = q.grain ? 0.045 : 0;
    // The low preset already renders below native and upscales; FXAA on top
    // of that just smears it.
    u.uFxaa.value = q.resolution >= 1 ? 1 : 0;
    this._chromaBase = q.chromatic ? 1 : 0;
  }

  resetTransient() {
    for (const key of Object.keys(this.state)) this.state[key] = 0;
    for (const key of Object.keys(this._target)) this._target[key] = 0;
    this.setEdgePulse(0);
    this.update(0, 0);
  }

  setScanlines(on) {
    this.composite.uniforms.uScanline.value = on ? 0.55 : 0;
  }

  /** Trigger a full-screen flash. */
  flash(strength = 1, color = 0xffffff) {
    this.state.flash = Math.max(this.state.flash, strength);
    this.composite.uniforms.uFlashColor.value.setHex(color);
  }

  /** Player took a hit — punchy red pulse. */
  hurt(amount = 1) {
    this._target.damage = Math.min(1, this._target.damage + amount);
    this.state.damage = Math.min(1, this.state.damage + amount * 0.9);
  }

  setBoost(t) {
    this._target.radial = t;
    this._target.aberration = this._chromaBase * (t * 1.4);
  }

  setDesaturation(t) {
    this._target.desat = t;
  }

  /** Red breathing at the frame edge — used for critical hull. */
  setEdgePulse(v) {
    this.composite.uniforms.uEdgePulse.value = Math.max(0, v);
  }

  update(dt, time) {
    const s = this.state;
    const u = this.composite.uniforms;

    s.radial = damp(s.radial, this._target.radial, 7, dt);
    s.aberration = damp(s.aberration, this._target.aberration, 8, dt);
    s.damage = damp(s.damage, 0, 3.4, dt);
    this._target.damage = damp(this._target.damage, 0, 3.4, dt);
    s.desat = damp(s.desat, this._target.desat, 6, dt);
    s.flash = damp(s.flash, 0, 9, dt);
    if (s.flash < 0.002) s.flash = 0;

    u.uTime.value = time;
    u.uRadial.value = s.radial;
    u.uAberration.value = s.aberration + s.damage * this._chromaBase * 2.2;
    u.uDamage.value = clamp01(s.damage);
    u.uDesat.value = s.desat;
    u.uFlash.value = s.flash;
  }

  setSize(width, height) {
    this.composer.setSize(width, height);
    this.bloom.setSize(width, height);
    this.composite.uniforms.uResolution.value.set(width, height);
    this.composite.uniforms.uTexel.value.set(1 / Math.max(1, width), 1 / Math.max(1, height));
  }

  render(dt) {
    this.composer.render(dt);
  }

  dispose() {
    for (const pass of this.composer.passes) pass.dispose?.();
    this.composer.dispose();
  }
}
