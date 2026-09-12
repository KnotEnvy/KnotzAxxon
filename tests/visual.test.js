import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Materials } from '../src/render/Materials.js';
import { Sky } from '../src/render/Sky.js';
import * as Textures from '../src/render/Textures.js';
globalThis.matchMedia=()=>({matches:false});
globalThis.localStorage={getItem:()=>null};
const { createEnemy, disposeEnemyGeometry } = await import('../src/entities/Enemies.js');

// CPU tests inspect real geometry/materials; they do not compile GLSL or render WebGL.
function materials() {
  const m=Object.create(Materials.prototype);
  m._neon=new Map(); m._disposables=[];
  m.enemyHull=m.track(new THREE.MeshStandardMaterial());
  m.darkMetal=m.track(new THREE.MeshStandardMaterial());
  return m;
}
function skyFixture() {
  // Retain generated pixels to inspect radial alpha without a renderer.
  globalThis.document={};
  let pixels;
  document.createElement=()=>({getContext:()=>({
    createImageData(w,h){return pixels={data:new Uint8ClampedArray(w*h*4),width:w,height:h};},
    putImageData(){},
  })});
  const s=Object.create(Sky.prototype);s.scene=new THREE.Scene();s.group=new THREE.Group();
  s.sunLight=new THREE.DirectionalLight();s.rimLight=new THREE.DirectionalLight();s.ambient=new THREE.HemisphereLight();
  s.scene.add(s.group,s.sunLight,s.sunLight.target,s.rimLight,s.rimLight.target,s.ambient);
  s._sunDir=new THREE.Vector3(-.46,.64,.62).normalize();s._buildBodies();
  s._material=new THREE.ShaderMaterial();s._skyMesh=new THREE.Mesh(new THREE.BoxGeometry());
  s._cubeRT={dispose(){}};s._envRT={dispose(){}};s._pmrem={dispose(){}};
  return {s,get pixels(){return pixels;}};
}

test('corona has radial alpha and foreground depth occlusion; shared texture survives sky disposal',()=>{
  const {s,pixels}=skyFixture(),tex=s.sunGlow.material.map;
  assert.ok(tex?.isTexture);assert.equal(s.sunGlow.material.depthTest,true);
  assert.equal(s.sunGlow.material.depthWrite,false);
  const alpha=(x,y)=>pixels.data[(y*pixels.width+x)*4+3],h=pixels.width/2;
  assert.equal(alpha(h,h),255);assert.equal(alpha(0,0),0);assert.equal(alpha(0,h),0);
  assert.ok(alpha(h+h/4,h)>alpha(h+h/2,h));
  let disposed=0;tex.addEventListener('dispose',()=>disposed++);
  s.dispose();s.dispose();assert.equal(s.scene.children.length,0);assert.equal(disposed,0);
  Textures.disposeTextures();assert.equal(disposed,1);
});

test('directional lighting and shadow targets stay invariant across distant travel positions',()=>{
  const {s}=skyFixture();
  const direction=light=>light.target.position.clone().sub(light.position).normalize();
  s.update(.016,0,new THREE.Vector3(0,9,0));
  const rim=direction(s.rimLight),sun=direction(s.sunLight);
  for(const z of [100,3000,100000]) {
    s.update(.016,1,new THREE.Vector3(17,21,z));
    assert.ok(direction(s.rimLight).distanceTo(rim)<1e-12);
    assert.ok(direction(s.sunLight).distanceTo(sun)<1e-12);
    assert.equal(s.rimLight.target.matrixWorld.elements[14],z);
  }
  s.dispose();Textures.disposeTextures();
});

test('energy shaders use inverse-transpose view normals and projection-aware unnormalized view vectors',()=>{
  const m=materials();
  for(const shader of [m.forceField(),m.energyCore()]) {
    assert.match(shader.vertexShader,/vNormalV = normalMatrix \* normal/);
    assert.match(shader.vertexShader,/vView = -mv.xyz/);
    assert.match(shader.fragmentShader,/isOrthographic \? vec3\(0.0, 0.0, 1.0\) : normalize\(vView\)/);
    assert.match(shader.fragmentShader,/abs\(dot\(normalize\(vNormalV\), viewDir\)\)/);
  }
  const patched={uniforms:{},fragmentShader:'void main() {\n#include <emissivemap_fragment>\n}'};
  m.addRim(m.enemyHull,0xffffff);m.enemyHull.onBeforeCompile(patched);
  assert.match(patched.fragmentShader,/isOrthographic \? vec3\(0.0, 0.0, 1.0\)/);
  // Nonuniform scale: transformed normal must stay perpendicular to transformed tangent.
  const matrix=new THREE.Matrix4().makeRotationY(.7).scale(new THREE.Vector3(4,.3,2));
  const normal=new THREE.Vector3(1,1,0).normalize();
  const tangent=new THREE.Vector3(1,-1,0).normalize().transformDirection(matrix);
  const corrected=normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(matrix)).normalize();
  assert.ok(Math.abs(corrected.dot(tangent))<1e-12);
  assert.ok(Math.abs(normal.clone().transformDirection(matrix).dot(tangent))>.5);
  // Parallel orthographic rays cannot vary the rim across a large screen-space span.
  const normalV=new THREE.Vector3(.6,0,.8),ortho=new THREE.Vector3(0,0,1);
  const fres=positions=>positions.map(()=>1-Math.abs(normalV.dot(ortho)));
  assert.deepEqual(fres([[-40,0,-20],[40,0,-20]]),[.19999999999999996,.19999999999999996]);
  m.dispose();
});

test('manufactured enemies reuse bounded geometry and keep collision radii and telegraph meshes',()=>{
  const m=materials();
  const budgets={turret:[7,2000,2.4],heavyTurret:[8,2400,3.4],silo:[6,2200,3.2],fuel:[5,2200,2.2],drone:[8,2200,2.2],interceptor:[8,2200,2.2]};
  for(const [kind,[drawLimit,triangleLimit,radius]] of Object.entries(budgets)) {
    const first=createEnemy(kind,m,{x:0,y:0,z:0,seed:1}),second=createEnemy(kind,m,{x:0,y:0,z:0,seed:2});
    const meshes=[];first.group.traverse(o=>{if(o.isMesh)meshes.push(o);});
    const peers=[];second.group.traverse(o=>{if(o.isMesh)peers.push(o);});
    assert.ok(meshes.length<=drawLimit,`${kind}: ${meshes.length} meshes`);
    const triangles=meshes.reduce((n,o)=>n+(o.geometry.index?.count??o.geometry.attributes.position.count)/3,0);
    assert.ok(triangles<=triangleLimit,`${kind}: ${triangles} triangles`);
    assert.equal(first.radius,radius);
    meshes.forEach((o,i)=>{
      assert.equal(o.geometry,peers[i].geometry);
      const a=o.geometry.attributes.position.array;assert.ok(a.every(Number.isFinite));
      o.geometry.computeBoundingBox();
      assert.ok(o.geometry.boundingBox.getSize(new THREE.Vector3()).length()<10,kind);
    });
    if(kind.includes('Turret')||kind==='turret')assert.ok(first.eye&&first.barrels.length);
    if(kind==='silo')assert.ok(first.hatch&&first.glow);
    if(kind==='drone'||kind==='interceptor') {
      assert.notEqual(first.body.geometry.type,'OctahedronGeometry');
      assert.ok(first.eye&&first.engine);
    }
    first.dispose();second.dispose();
  }
  disposeEnemyGeometry();m.dispose();
});

test('enemy geometry cache owns merged details until global shutdown and rebuilds cleanly',()=>{
  const m=materials(),first=createEnemy('interceptor',m,{x:0,y:8,z:10});
  const owned=new Set();first.group.traverse(o=>{if(o.isMesh)owned.add(o.geometry);});
  let releases=0;for(const g of owned)g.addEventListener('dispose',()=>releases++);
  first.dispose();assert.equal(releases,0);
  disposeEnemyGeometry();assert.equal(releases,owned.size);
  disposeEnemyGeometry();assert.equal(releases,owned.size);
  const next=createEnemy('interceptor',m,{x:0,y:8,z:10});
  assert.ok(!owned.has(next.body.geometry));next.dispose();disposeEnemyGeometry();m.dispose();
});
