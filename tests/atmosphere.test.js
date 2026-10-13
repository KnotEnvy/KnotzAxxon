import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { smokeSprite, disposeTextures } from '../src/render/Textures.js';
import { AmbientDust } from '../src/fx/Ambience.js';
import { ParticleSystem } from '../src/fx/Particles.js';

test('smoke has a transparent border, asymmetric billows and a single cached texture owner', () => {
  let pixels;
  globalThis.document = { createElement: () => ({ getContext: () => ({
    createImageData(w,h) { return pixels = { data:new Uint8ClampedArray(w*h*4),width:w,height:h }; },
    putImageData() {},
  }) }) };
  const texture = smokeSprite(64);
  assert.equal(smokeSprite(64),texture);
  const alpha=(x,y)=>pixels.data[(y*64+x)*4+3];
  for(let i=0;i<64;i++) for(const [x,y] of [[0,i],[63,i],[i,0],[i,63]]) assert.equal(alpha(x,y),0);
  assert.ok(alpha(32,32)>80);
  assert.ok(Math.abs(alpha(20,32)-alpha(44,32))>10);
  assert.ok(pixels.data.every(Number.isFinite));
  let disposed=0; texture.addEventListener('dispose',()=>disposed++);
  disposeTextures();disposeTextures();assert.equal(disposed,1);
});

test('ambient fields are repeatable, keep one fixed GPU buffer and dispose their resources', () => {
  const scene = new THREE.Scene(), a = new AmbientDust(scene,32), b = new AmbientDust(scene,32);
  assert.deepEqual(a.mesh.geometry.attributes.aSeed.array,b.mesh.geometry.attributes.aSeed.array);
  const positions=a.mesh.geometry.attributes.position;
  for(const sky of ['dusk','deepspace','ember','void']) {
    a.setPreset(sky,true);
    for(const classic of [true,false]) a.update(1/60,100,new THREE.Vector3(10,12,100000),70,classic);
    assert.ok(a.material.uniforms.uOpacity.value>=0 && a.material.uniforms.uOpacity.value<1);
    assert.equal(a.mesh.geometry.attributes.position,positions);
    assert.ok(a.material.uniforms.uTail.value.toArray().every(Number.isFinite));
  }
  let released=0;a.mesh.geometry.addEventListener('dispose',()=>released++);a.material.addEventListener('dispose',()=>released++);
  a.dispose();b.dispose();assert.equal(scene.children.length,0);assert.equal(released,2);
});

test('smoke fades in while sparks stay immediate and both respect foreground depth', () => {
  const scene=new THREE.Scene(), texture=new THREE.Texture();
  const smoke=new ParticleSystem(scene,texture,4,{fadeIn:0.16,blending:THREE.NormalBlending});
  const sparks=new ParticleSystem(scene,texture,4);
  assert.equal(smoke.material.uniforms.uFadeIn.value,0.16);
  assert.equal(sparks.material.uniforms.uFadeIn.value,0);
  for(const system of [smoke,sparks]) {
    assert.equal(system.material.depthTest,true);assert.equal(system.material.depthWrite,false);
    system.setViewport(720,new THREE.OrthographicCamera(-32,32,18,-18,.1,1000));
    assert.equal(system.material.uniforms.uHeightScale.value,20);
    system.dispose();
  }
  assert.equal(scene.children.length,0);texture.dispose();
});
