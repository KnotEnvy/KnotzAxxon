import { Lifetime } from './Lifetime.js';
import { FlightCamera } from './FlightCamera.js';
/**
 * Engine: owns the renderer, the scene graph root, the frame loop and the
 * adaptive-resolution controller. It knows nothing about gameplay — the game
 * registers `update(dt)` / `lateUpdate(dt)` hooks and the engine drives them.
 */

import * as THREE from 'three';
import { PostFX } from '../render/PostFX.js';
import { Materials } from '../render/Materials.js';
import { Sky } from '../render/Sky.js';
import { Underlay } from '../render/Underlay.js';
import { Input } from './Input.js';
import { settings } from './Settings.js';
import { clamp, damp } from './Utils.js';

/** Physics/logic never advances by more than this in a single step. */
const MAX_STEP = 1 / 60;
/** Guard against tab-switch dt explosions. */
const MAX_FRAME = 1 / 15;

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.running = false;
    this.time = 0;
    this.frame = 0;
    this.timeScale = 1;
    this._targetTimeScale = 1;
    this._hitStop = 0;

    this.stats = { fps: 60, ms: 16.7, calls: 0, tris: 0, entities: 0, scale: 1 };
    this._lifetime = new Lifetime();
    this._raf = null;
    this._disposed = false;
    this._contextLost = false;
    this._resumeAfterRestore = false;
    this._loop = this._loop.bind(this);
    this._msEma = 16.7;
    this._renderScale = 1;
    this._scaleCooldown = 0;

    this._updateHooks = [];
    this._lateHooks = [];

    this._initRenderer();
    this._initScene();

    this.input = new Input();

    this._onResize = this._onResize.bind(this);
    this._lifetime.listen(window, 'resize', this._onResize);
    this._lifetime.listen(window, 'orientationchange', this._onResize);
    this._lifetime.listen(document, 'visibilitychange', () => {
      if (document.hidden) this.dispatchVisibility(false);
      else this.dispatchVisibility(true);
    });

    this._lifetime.listen(settings, 'change', (e) => this._onSettingChange(e.detail));

  }

  /* ------------------------------------------------------------------ */
  /* Setup                                                               */
  /* ------------------------------------------------------------------ */

  _initRenderer() {
    const q = settings.quality;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,          // FXAA runs after tone mapping
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false,
      depth: true,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, q.maxPixelRatio));
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = q.shadows;
    // PCFSoft is deprecated: three swaps it to PCF on the first shadow render,
    // which invalidates every program compiled before that frame.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = true;
    this.renderer.info.autoReset = false;

    this.maxAnisotropy = Math.min(q.anisotropy, this.renderer.capabilities.getMaxAnisotropy());

    this._lifetime.listen(this.canvas, 'webglcontextlost', e => this._onContextLost(e));
    this._lifetime.listen(this.canvas, 'webglcontextrestored', () => this._onContextRestored());
  }

  _onContextLost(e) {
    e.preventDefault();
    const resume = this.running;
    this.stop();
    this._contextLost = true;
    this._resumeAfterRestore = resume;
  }

  _onContextRestored() {
    if (this._disposed) return;
    this._contextLost = false;
    // Render-target contents are lost too: re-bake the environment and shadows.
    this.sky._bake();
    this.renderer.shadowMap.needsUpdate = true;
    this._onResize();
    const resume = this._resumeAfterRestore;
    this._resumeAfterRestore = false;
    if (resume) this.start();
  }

  _initScene() {
    const q = settings.quality;
    const rig = settings.cameraRig;

    this.scene = new THREE.Scene();
    this.scene.matrixWorldAutoUpdate = true;

    this.camera = new FlightCamera(rig.fov, innerWidth / innerHeight, 0.35, q.drawDistance * 2.4);
    this.camera.position.set(0, 18, -26);
    this.scene.add(this.camera);

    this.materials = new Materials(this.maxAnisotropy);
    this.sky = new Sky(this.renderer, this.scene);
    this.sky.setShadowQuality(q.shadows, q.shadowMapSize);
    this.sky.setRange(this.camera.far);
    this.underlay = new Underlay(this.scene);

    this.postfx = new PostFX(this.renderer, this.scene, this.camera, q);
    this.postfx.setScanlines(settings.get('scanlines'));

    this._onResize();
  }

  /* ------------------------------------------------------------------ */
  /* Hooks                                                               */
  /* ------------------------------------------------------------------ */

  onUpdate(fn) { this._updateHooks.push(fn); return this; }
  onLateUpdate(fn) { this._lateHooks.push(fn); return this; }

  dispatchVisibility(visible) {
    this.visible = visible;
    this._last = performance.now();
    this._msEma = 16.7;
    this._scaleCooldown = 1.2;
    for (const fn of this._updateHooks) fn.visibility?.(visible);
    this.onVisibility?.(visible);
  }

  /* ------------------------------------------------------------------ */
  /* Time control                                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Freeze-frame on impact. `strength` is the fraction of normal speed to drop
   * to, `duration` is in real seconds.
   */
  hitStop(strength = 0.06, duration = 0.075) {
    this._hitStop = Math.max(this._hitStop, duration);
    this._hitStopScale = strength;
  }

  /** Cinematic slow motion; call with 1 to release. */
  setTimeScale(scale, immediate = false) {
    this._targetTimeScale = scale;
    if (immediate) { this.timeScale = scale; this._hitStop = 0; }
  }

  /* ------------------------------------------------------------------ */
  /* Resize + adaptive resolution                                        */
  /* ------------------------------------------------------------------ */

  _onResize() {
    const w = innerWidth;
    const h = innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    const q = settings.quality;
    const pr = Math.min(devicePixelRatio, q.maxPixelRatio) * q.resolution * this._renderScale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);

    const dw = Math.floor(w * pr);
    const dh = Math.floor(h * pr);
    this.postfx?.setSize(dw, dh);
  }

  /**
   * Adaptive resolution. If we consistently miss the frame budget we scale the
   * backbuffer down; when there is headroom we creep back up. Changes are rate
   * limited so the image never pumps.
   */
  _adaptResolution(dt) {
    this._scaleCooldown -= dt;
    if (this._scaleCooldown > 0) return;

    const budget = 1000 / 60;
    const prev = this._renderScale;
    if (this._msEma > budget * 1.35) this._renderScale = clamp(this._renderScale - 0.1, 0.55, 1);
    // At 60 Hz cadence cannot fall below ~16.7 ms. Probe upward slowly
    // when delivery is stable; a failed probe downscales after its cooldown.
    else if (this._msEma < budget * 1.05) this._renderScale = clamp(this._renderScale + 0.05, 0.55, 1);

    if (Math.abs(prev - this._renderScale) > 0.001) {
      this._scaleCooldown = this._renderScale > prev ? 5 : 1.2;
      this._onResize();
    } else {
      this._scaleCooldown = 0.35;
    }
    this.stats.scale = this._renderScale;
  }

  _onSettingChange({ id }) {
    if (id === 'quality') {
      const q = settings.quality;
      this.renderer.shadowMap.enabled = q.shadows;
      this.renderer.shadowMap.needsUpdate = true;
      this.sky.setShadowQuality(q.shadows, q.shadowMapSize);
      this.postfx.applyQuality(q);
      this.camera.far = q.drawDistance * 2.4;
      this.camera.updateProjectionMatrix();
      this.sky.setRange(this.camera.far);
      this._renderScale = 1;
      this._onResize();
      this.onQualityChange?.(q);
    } else if (id === 'scanlines') {
      this.postfx.setScanlines(settings.get('scanlines'));
      document.getElementById('scanlines')?.classList.toggle('on', settings.get('scanlines'));
    } else if (id === 'camera') {
      const rig = settings.cameraRig;
      this.camera.fov = rig.fov;
      this.camera.updateProjectionMatrix();
    } else if (id === 'perf') {
      document.getElementById('perf')?.classList.toggle('on', settings.get('perf'));
    }
  }

  /* ------------------------------------------------------------------ */
  /* Loop                                                                */
  /* ------------------------------------------------------------------ */

  start() {
    if (this.running || this._disposed) return;
    if (this._contextLost) { this._resumeAfterRestore = true; return; }
    this.running = true;
    this._last = performance.now();
    this._msEma = 16.7;
    this._scaleCooldown = 1.2;
    this._raf = requestAnimationFrame(this._loop);
  }

  stop() {
    this.running = false;
    this._resumeAfterRestore = false;
    if (this._raf != null) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  _loop(now) {
    if (!this.running) return;
    this._raf = requestAnimationFrame(this._loop);

    const frameMs = now - this._last;
    const rawDt = Math.min(frameMs / 1000, MAX_FRAME);
    this._last = now;
    this.realDelta = rawDt;
    this.frame++;

    /* --- time scaling ------------------------------------------------ */
    if (this._hitStop > 0) {
      this._hitStop -= rawDt;
      this.timeScale = this._hitStopScale;
    } else {
      this.timeScale = damp(this.timeScale, this._targetTimeScale, 9, rawDt);
    }

    const dt = rawDt * this.timeScale;
    this.realTime = (this.realTime || 0) + rawDt;

    /* --- input ------------------------------------------------------- */
    this.input.update();

    /* --- simulate ---------------------------------------------------- */
    const steps = Math.max(1, Math.min(4, Math.ceil(dt / MAX_STEP)));
    const step = dt / steps;
    for (let s = 0; s < steps; s++) {
      this.time += step;
      for (let i = 0; i < this._updateHooks.length; i++) this._updateHooks[i](step, this.time, rawDt / steps);
    }
    for (let i = 0; i < this._lateHooks.length; i++) this._lateHooks[i](dt, this.time);

    /* --- shared shader time ------------------------------------------ */
    this.materials.update(this.time);
    this.postfx.update(rawDt, this.time);

    /* --- draw -------------------------------------------------------- */
    this.renderer.info.reset();
    this.postfx.render(dt);

    this.input.endFrame();

    /* --- stats ------------------------------------------------------- */
    const ms = performance.now() - now;
    this._msEma = this._msEma * 0.92 + Math.min(250, Math.max(ms, frameMs)) * 0.08;
    this.stats.cpuMs = ms;
    this.stats.ms = this._msEma;
    this.stats.fps = 1000 / Math.max(frameMs, 0.1);
    this.stats.calls = this.renderer.info.render.calls;
    this.stats.tris = this.renderer.info.render.triangles;
    this.stats.geometries = this.renderer.info.memory?.geometries ?? 0;
    this.stats.textures = this.renderer.info.memory?.textures ?? 0;
    this._adaptResolution(rawDt);
  }

  dispose() {
    if (this._disposed) return;
    this.stop();
    this._disposed = true;
    this._lifetime.dispose();
    this.input.dispose();
    this._updateHooks.length = this._lateHooks.length = 0;
    this.onQualityChange = this.onVisibility = null;
    this.postfx.dispose();
    this.underlay.dispose();
    this.sky.dispose();
    this.materials.dispose();
    this.renderer.dispose();
  }
}
