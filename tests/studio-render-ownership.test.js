import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Materials } from '../src/render/Materials.js';
import { Sky } from '../src/render/Sky.js';
import { Underlay } from '../src/render/Underlay.js';
import { PostFX } from '../src/render/PostFX.js';
import { disposeTextures } from '../src/render/Textures.js';

// Real CPU-side Three owners; canvas drawing is stubbed. No GPU-memory claim.
globalThis.document = { createElement() {
  const c = { width: 1, height: 1 };
  const ctx = new Proxy({
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
  }, { get: (o, k) => k in o ? o[k] : () => {} });
  c.getContext = () => ctx;
  return c;
} };
const renderer = () => ({ compile() {}, getDrawingBufferSize: v => v.set(64, 64), getPixelRatio: () => 1 });
const observe = resources => {
  const counts = new Map([...new Set(resources)].filter(Boolean).map(r => [r, 0]));
  for (const r of counts.keys()) r.addEventListener('dispose', () => counts.set(r, counts.get(r) + 1));
  return counts;
};
const exactlyOnce = counts => { for (const n of counts.values()) assert.equal(n, 1); };

test('studio: failed Sky final apply rolls back private targets, lights and bodies without shared-texture disposal', () => {
  const original = Sky.prototype.apply, fault = Error('sky-final-apply'), scene = new THREE.Scene();
  const sentinel = new THREE.Group(); scene.add(sentinel);
  const background = new THREE.Texture(), environment = new THREE.Texture();
  scene.background = background; scene.environment = environment;
  let partial, counts, sharedDisposals = 0;
  Sky.prototype.apply = function () {
    partial = this;
    this._envRT = new THREE.WebGLRenderTarget(8, 8);
    counts = observe([this._cubeRT, this._envRT, this._material, this._skyMesh.geometry,
      ...this.group.children.flatMap(o => [!o.isSprite && o.geometry, o.material])]);
    this.sunGlow.material.map.addEventListener('dispose', () => sharedDisposals++);
    scene.background = this._cubeRT.texture; scene.environment = this._envRT.texture;
    throw fault;
  };
  try {
    assert.throws(() => new Sky(renderer(), scene), e => e === fault);
    assert.equal(scene.children.length, 1); assert.equal(scene.children[0], sentinel);
    assert.equal(scene.background, background); assert.equal(scene.environment, environment);
    exactlyOnce(counts); partial.dispose(); exactlyOnce(counts);
    assert.equal(sharedDisposals, 0);
  } finally { Sky.prototype.apply = original; partial?.dispose(); disposeTextures(); }
});

test('studio: early Sky PMREM compilation failure retires cube and shader owners', () => {
  const original = THREE.PMREMGenerator.prototype.compileCubemapShader;
  const fault = Error('pmrem-compile'), dispose = THREE.WebGLRenderTarget.prototype.dispose;
  let cubes = 0;
  THREE.PMREMGenerator.prototype.compileCubemapShader = () => { throw fault; };
  THREE.WebGLRenderTarget.prototype.dispose = function () { if (this.isWebGLCubeRenderTarget) cubes++; return dispose.call(this); };
  try { assert.throws(() => new Sky(renderer(), new THREE.Scene()), e => e === fault); assert.equal(cubes, 1); }
  finally { THREE.PMREMGenerator.prototype.compileCubemapShader = original; THREE.WebGLRenderTarget.prototype.dispose = dispose; }
});

test('studio: failed Materials build retires tracked materials, keeps cached textures and original error', () => {
  const original = Materials.prototype.build, fault = Error('materials-build');
  let partial, counts, textureDisposals = 0;
  Materials.prototype.build = function () {
    original.call(this); partial = this; counts = observe(this._disposables);
    this.hull.map.addEventListener('dispose', () => textureDisposals++);
    throw fault;
  };
  try {
    assert.throws(() => new Materials(4), e => e === fault);
    exactlyOnce(counts); partial.dispose(); exactlyOnce(counts); assert.equal(textureDisposals, 0);
  } finally { Materials.prototype.build = original; partial?.dispose(); disposeTextures(); }
});

test('studio: failed Underlay scene attachment retires its own textures, materials and geometry only', () => {
  const scene = new THREE.Scene(), sentinel = new THREE.Group(); scene.add(sentinel);
  const add = scene.add, fault = Error('underlay-grid-attachment');
  const resources = []; let count = 0;
  scene.add = function (mesh) {
    add.call(this, mesh); resources.push(mesh.geometry, mesh.material);
    if (++count === 1) resources.push(...Object.values(mesh.material.uniforms).map(u => u.value).filter(v => v?.isTexture));
    if (count === 2) { this.counts = observe(resources); throw fault; }
    return this;
  };
  assert.throws(() => new Underlay(scene), e => e === fault);
  assert.equal(scene.children.length, 1); assert.equal(scene.children[0], sentinel); exactlyOnce(scene.counts);
});

test('studio: failed PostFX quality application retires passes and composer, then disposal is idempotent', () => {
  const original = PostFX.prototype.applyQuality, fault = Error('postfx-quality');
  let partial, counts, composerDisposals = 0, passDisposals = 0;
  PostFX.prototype.applyQuality = function () {
    partial = this; counts = observe([this.composer.renderTarget1, this.composer.renderTarget2]);
    const dispose = this.composer.dispose.bind(this.composer);
    this.composer.dispose = () => { composerDisposals++; dispose(); };
    for (const pass of this.composer.passes) {
      const release = pass.dispose.bind(pass);
      pass.dispose = () => { passDisposals++; release(); };
    }
    throw fault;
  };
  try {
    assert.throws(() => new PostFX(renderer(), new THREE.Scene(), new THREE.PerspectiveCamera(), {}), e => e === fault);
    exactlyOnce(counts); assert.equal(composerDisposals, 1); assert.equal(passDisposals, 4);
    partial.dispose(); assert.equal(composerDisposals, 1); exactlyOnce(counts);
  } finally { PostFX.prototype.applyQuality = original; partial?.dispose(); }
});

test('studio: rendering cleanup attempts later owners when an earlier disposal throws', () => {
  const m = Object.create(Materials.prototype); m._neon = new Map(); m._disposables = [];
  const first = m.track(new THREE.MeshBasicMaterial()), second = m.track(new THREE.MeshBasicMaterial());
  let later = 0; first.addEventListener('dispose', () => { throw Error('dispose'); });
  second.addEventListener('dispose', () => later++);
  assert.throws(() => m.dispose(), AggregateError); assert.equal(later, 1);
  m.dispose(); assert.equal(later, 1);
});

test('studio: failed sky bake restores renderer state and retains a usable previous environment', () => {
  const sky=Object.create(Sky.prototype), previousTarget={}, originalEnv=new THREE.WebGLRenderTarget(8,8);
  const originalBackground=new THREE.Texture(), fault=Error('cube-render');
  const r={toneMapping:THREE.ACESFilmicToneMapping,xr:{enabled:true},getRenderTarget:()=>previousTarget,
    getActiveCubeFace:()=>3,getActiveMipmapLevel:()=>2,setRenderTarget(...args){this.restored=args;}};
  Object.assign(sky,{renderer:r,scene:new THREE.Scene(),_envRT:originalEnv,_cubeRT:new THREE.WebGLCubeRenderTarget(8),
    _cubeCam:{update(){r.xr.enabled=false;throw fault;}}});
  sky.scene.background=originalBackground;sky.scene.environment=originalEnv.texture;
  assert.throws(()=>sky._bake(),e=>e===fault);
  assert.equal(r.toneMapping,THREE.ACESFilmicToneMapping);assert.equal(r.xr.enabled,true);
  assert.deepEqual(r.restored,[previousTarget,3,2]);assert.equal(sky.scene.environment,originalEnv.texture);
  r.setRenderTarget=()=>{throw Error('restore');};assert.throws(()=>sky._bake(),e=>e===fault);
  originalEnv.dispose();sky._cubeRT.dispose();originalBackground.dispose();
});

test('studio: partial PostFX cleanup attempts remaining passes/composer despite one throwing disposer', () => {
  const fx=Object.create(PostFX.prototype);let later=0;
  Object.assign(fx,{_passes:[{dispose(){throw Error('pass');}},{dispose(){later++;}}],composer:{dispose(){later++;}}});
  assert.throws(()=>fx.dispose(),AggregateError);assert.equal(later,2);fx.dispose();assert.equal(later,2);
});
