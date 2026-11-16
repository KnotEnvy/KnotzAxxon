import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Materials } from '../src/render/Materials.js';
import * as Tex from '../src/render/Textures.js';
globalThis.localStorage = { getItem: () => '{}', setItem() {} };
globalThis.matchMedia = () => ({ matches: false });
const { SettingsStore, SCHEMA, settings } = await import('../src/core/Settings.js');
const { Engine } = await import('../src/core/Engine.js');

test('settings persistence reports the actual payload write before change observers run and recovers', () => {
  const previous = globalThis.localStorage;
  const saved = { camera: 'classic', quality: 'high', music: .33 };
  let rejectPayload = true;
  globalThis.localStorage = {
    getItem: () => JSON.stringify(saved),
    setItem(key, payload) {
      // A small unrelated probe can succeed while the real payload cannot.
      if (key === 'knotzaxxon.settings.v2') {
        if (rejectPayload) throw new DOMException('Quota full', 'QuotaExceededError');
        Object.assign(saved, JSON.parse(payload));
      }
    },
  };
  try {
    const store = new SettingsStore(), observed = [];
    assert.equal(store.persistent, null); assert.equal(store.get('music'), .33);
    assert.equal(store.save(), false); assert.equal(store.persistent, false);
    store.addEventListener('change', () => observed.push(store.persistent));
    store.set('music', .45); assert.deepEqual(observed, [false]);
    assert.equal(store.get('music'), .45); assert.equal(saved.music, .33);
    rejectPayload = false;
    assert.equal(store.save(), true); assert.equal(store.persistent, true);
    assert.equal(saved.music, .45);
    store.set('music', .5); assert.deepEqual(observed, [false, true]);
    assert.equal(new SettingsStore().get('music'), .5);
  } finally { globalThis.localStorage = previous; }
});

test('studio: schema normalizes JSON shapes, invalid types, ranges, choices and toggles without resetting saved preferences', () => {
  for (const raw of ['null','[]','42','true','"hello"','{bad']) {
    localStorage.getItem = () => raw;
    const store = new SettingsStore();
    for (const spec of SCHEMA) assert.equal(store.get(spec.id), spec.def);
  }
  const saved = { camera:'chase',quality:'low',shake:'invalid',master:'0.2',music:.33,sfx:9,scanlines:'false',shadowLine:false,invertY:true,assist:null,perf:true,unknown:7 };
  localStorage.getItem = () => JSON.stringify(saved);
  const store = new SettingsStore();
  assert.equal(store.get('camera'),'chase'); assert.equal(store.get('quality'),'low');
  assert.equal(store.get('shake'),1); assert.equal(store.get('master'),.8); assert.equal(store.get('music'),.33);
  assert.equal(store.get('sfx'),1); assert.equal(store.get('scanlines'),false); assert.equal(store.get('shadowLine'),false);
  assert.equal(store.get('invertY'),true); assert.equal(store.get('assist'),false); assert.equal(store.get('perf'),true);
  assert.equal(store.get('unknown'),undefined);
});

test('studio: setters emit only normalized changes, keep range steps and recover from invalid nonfinite values', () => {
  localStorage.getItem = () => '{}'; const store = new SettingsStore(), events = [];
  store.addEventListener('change',e=>events.push(e.detail));
  store.set('master',.34); assert.equal(store.get('master'),.35);
  store.set('master',.351); assert.equal(events.length,1);
  for (const value of [NaN,Infinity,-Infinity,'invalid',null,{},[]]) {
    store.set('master',value); assert.equal(store.get('master'),.8);
    store.set('quality',value); assert.equal(store.get('quality'),'high');
    store.set('scanlines',value); assert.equal(store.get('scanlines'),false);
  }
  store.set('shake',100); assert.equal(store.get('shake'),1.5); store.set('shake',-100); assert.equal(store.get('shake'),0);
  store.set('camera','modern'); store.cycle('camera'); assert.equal(store.get('camera'),'chase');
  store.cycle('scanlines'); assert.equal(store.display('scanlines'),'ON');
  store.set('unknown',42); assert.equal(store.get('unknown'),undefined);
});

test('studio: blocked storage retains normalized session preferences; absent storage detects device only on first run', () => {
  localStorage.getItem = () => { throw Error('blocked'); }; localStorage.setItem = () => { throw Error('blocked'); };
  const store = new SettingsStore(); store.set('master',.25); assert.equal(store.get('master'),.25);
  const media = globalThis.matchMedia; globalThis.matchMedia = () => ({matches:true});
  localStorage.getItem = () => null; const first = new SettingsStore(); assert.equal(first.get('camera'),'modern');
  localStorage.getItem = () => '{"camera":"classic","quality":"high","shake":0}';
  const upgrade = new SettingsStore(); assert.equal(upgrade.get('camera'),'classic'); assert.equal(upgrade.get('quality'),'high'); assert.equal(upgrade.get('shake'),0);
  globalThis.matchMedia = media; localStorage.setItem = () => {};
});

test('studio: live renderer quality caps all bound map samplers in place, including cached/future textures', () => {
  const originalDocument=globalThis.document;
  globalThis.document={createElement:()=>({getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}})})};
  const cached=Tex.glowSprite(8), maps=Array.from({length:5},()=>new THREE.Texture());
  const material=new THREE.MeshStandardMaterial({map:maps[0],normalMap:maps[1],roughnessMap:maps[2],emissiveMap:maps[3]});
  const shader=new THREE.ShaderMaterial({uniforms:{uMap:{value:maps[4]}}});
  const scene=new THREE.Scene();scene.add(new THREE.Mesh(new THREE.BoxGeometry(),[material,shader]));
  const library=Object.create(Materials.prototype);Object.assign(library,{_disposables:[material],_neon:new Map()});
  let disposals=0; for(const texture of [cached,...maps]) texture.addEventListener('dispose',()=>disposals++);
  const engine=Object.create(Engine.prototype);let cap=6;
  Object.assign(engine,{materials:library,scene,renderer:{capabilities:{getMaxAnisotropy:()=>cap},shadowMap:{}},sky:{setShadowQuality(){},setRange(){}},postfx:{applyQuality(){}},camera:new THREE.PerspectiveCamera(),_onResize(){}});
  const previous=settings.get('quality');let qualityCallbacks=0;engine.onQualityChange=()=>qualityCallbacks++;
  for(const [quality,expected] of [['low',1],['ultra',6],['medium',4],['high',6]]) {
    settings.set('quality',quality);engine._onSettingChange({id:'quality'});
    assert.equal(engine.maxAnisotropy,expected);assert.equal(library.aniso,expected);
    for(const texture of [cached,...maps]) assert.equal(texture.anisotropy,expected);
    assert.equal(Tex.glowSprite(8),cached);assert.equal(material.normalMap,maps[1]);assert.equal(material.roughnessMap,maps[2]);
    assert.equal(Tex.glowSprite(16).anisotropy,expected);assert.equal(disposals,0);
  }
  const versions=maps.map(t=>t.version);engine._onSettingChange({id:'quality'});assert.deepEqual(maps.map(t=>t.version),versions);
  cap=2;engine._refreshTextureQuality();assert.equal(engine.maxAnisotropy,2);assert.equal(material.normalMap.anisotropy,2);
  assert.equal(qualityCallbacks,5);settings.set('quality',previous);
  library.dispose();assert.equal(disposals,0);Tex.disposeTextures();assert.equal(disposals,1);
  scene.children[0].geometry.dispose();shader.dispose();for(const texture of maps)texture.dispose();
  globalThis.document=originalDocument;
});
