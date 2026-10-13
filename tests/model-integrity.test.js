import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { taperedBox, facetedHull } from '../src/render/GeoUtils.js';
import { Materials } from '../src/render/Materials.js';
globalThis.localStorage = { getItem: () => null };
globalThis.matchMedia = () => ({ matches: false });
const { Boss } = await import('../src/entities/Boss.js');
const { createEnemy, disposeEnemyGeometry } = await import('../src/entities/Enemies.js');
const { Pickup, disposePickupGeometry } = await import('../src/entities/Pickup.js');
function materials() {
  const m = Object.create(Materials.prototype); m._disposables = []; m._neon = new Map();
  for (const key of ['enemyHull', 'darkMetal', 'hazard']) m[key] = m.track(new THREE.MeshStandardMaterial());
  m.glow = new THREE.Texture(); return m;
}
test('tapered armor has outward normals and visible entry faces in all six directions', () => {
  for (const dims of [[7,5,3.2,8,6],[12,17,10,8,10],[4.2,3,9,4.2,3]]) {
    const g=taperedBox(...dims), p=g.attributes.position, n=g.attributes.normal;
    const center=new THREE.Vector3(0,dims[2]/2,0), a=new THREE.Vector3(), b=new THREE.Vector3(), c=new THREE.Vector3();
    for(let i=0;i<p.count;i+=3) {
      a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);
      const normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      assert.ok(normal.dot(a.clone().add(b).add(c).multiplyScalar(1/3).sub(center))>0);
      assert.ok(normal.dot(new THREE.Vector3().fromBufferAttribute(n,i))>.999);
    }
    const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial());mesh.updateMatrixWorld(true);
    for(const xyz of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
      const axis=new THREE.Vector3(...xyz);
      const hit=new THREE.Raycaster(center.clone().addScaledVector(axis,100),axis.clone().negate()).intersectObject(mesh)[0];
      assert.ok(hit,'outside ray sees a front-facing surface');
      assert.ok(hit.point.clone().sub(center).dot(axis)>0,'entry surface, not opposite inner wall');
    }
    g.dispose();mesh.material.dispose();
  }
});
test('lofted airframes have watertight station joins and closed end caps', () => {
  const g=facetedHull([[-2,.3,.2,-.2],[-1,.7,.4,-.3],[1,.4,.25,-.2],[2,.02,.03,-.03]]);
  const p=g.attributes.position, edges=new Map();
  const key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(v=>v.toFixed(5)).join(',');
  for(let i=0;i<p.count;i+=3) for(const [a,b] of [[i,i+1],[i+1,i+2],[i+2,i]]) {
    const edge=[key(a),key(b)].sort().join('|');edges.set(edge,(edges.get(edge)||0)+1);
  }
  assert.ok([...edges.values()].every(n=>n===2),'each edge belongs to exactly two faces');g.dispose();
});
test('closed Sentinel shutters cover the reactor instead of letting it protrude', () => {
  const m=materials(), boss=new Boss(new THREE.Scene(),m,{z:0});boss.group.position.set(0,0,0);boss.group.updateMatrixWorld(true);
  const shutters=boss.shutters.map(s=>s.mesh);
  for(const [x,y] of [[.3,.7],[-.3,.7],[.7,-.3],[-.7,-.3],[1.1,1.4],[-1.1,-1.4]]) {
    const hits=new THREE.Raycaster(new THREE.Vector3(x,1+y,-30),new THREE.Vector3(0,0,1)).intersectObjects([...shutters,boss.core]);
    assert.ok(hits.some(h=>h.object===boss.core),'sample ray intersects the reactor');
    assert.ok(shutters.includes(hits[0]?.object),'closed armor is in front of the reactor');
  }
  boss.dispose();m.dispose();
});
test('radar hit shell follows dish rotation and pickup badges face each flight camera', () => {
  const m=materials(), radar=createEnemy('radar',m,{x:0,y:0,z:0});
  radar.dish.rotation.y=1.3;radar.group.updateMatrixWorld(true);
  const dish=radar.dish.children.find(o=>o.isMesh && o!==radar.flashMesh);
  const visibleDirection=new THREE.Vector3(0,0,1).transformDirection(dish.matrixWorld);
  const flashDirection=new THREE.Vector3(0,0,1).transformDirection(radar.flashMesh.matrixWorld);
  assert.ok(visibleDirection.distanceTo(flashDirection)<1e-6);
  const pickup=new Pickup(new THREE.Scene(),m,'repair',0,5,0);
  for(const eye of [[-30,30,-40],[0,8,-30],[-5,10,-30]]) {
    const camera=new THREE.PerspectiveCamera();camera.position.set(...eye);camera.lookAt(0,5,0);
    pickup.update(.016,{camera,player:{pos:new THREE.Vector3(0,5,0),alive:false}});
    assert.ok(pickup.group.quaternion.angleTo(camera.quaternion)<1e-6);
  }
  pickup.dispose();radar.dispose();disposePickupGeometry();disposeEnemyGeometry();m.dispose();
});
