/** CPU-only source inventory. Does not render, load imported templates or change gameplay. */
import * as THREE from 'three';
import { Level } from '../../src/world/Level.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Settings initializes at import time; provide a stable desktop CPU-only host.
globalThis.matchMedia = () => ({ matches:false });
globalThis.navigator ??= { hardwareConcurrency:8 };
globalThis.localStorage = { getItem:() => '{}', setItem:() => {} };
const { createEnemy, disposeEnemyGeometry } = await import('../../src/entities/Enemies.js');
const { Pickup, disposePickupGeometry } = await import('../../src/entities/Pickup.js');

const fallback = new THREE.MeshStandardMaterial();
const mats = new Proxy({ _pickupHalos:new Map(), neon: color => new THREE.MeshBasicMaterial({ color }),
  sprite: () => new THREE.SpriteMaterial(), glow: null }, {
  get: (o, key) => key in o ? o[key] : fallback,
});
function measure(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  let triangles = 0, visibleTriangles = 0, meshes = 0, visiblePrimitives = 0;
  root.traverse(o => {
    if (!o.isMesh) return;
    meshes++;
    const n = (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
    triangles += n;
    let visible = true;
    for (let p = o; p; p = p.parent) visible &&= p.visible;
    if (visible) { visibleTriangles += n; visiblePrimitives += Array.isArray(o.material) ? o.geometry.groups.length : 1; }
  });
  return { transformedRestBounds: {min:box.min.toArray(), max:box.max.toArray()},
    trianglesIncludingHidden:triangles, visibleTriangles, meshNodes:meshes, visiblePrimitives };
}
const models = {};
for (const kind of ['heavyTurret','mine','drone','interceptor','parked']) {
  const e = createEnemy(kind, mats, { x:0,y:0,z:0,seed:1 });
  models[kind] = { ...measure(e.group), hp:e.hp, radius:e.radius, score:e.score };
  e.dispose();
}
const scene = new THREE.Scene();
for (const kind of ['shield','spread','repair','fuel']) {
  const p = new Pickup(scene,mats,kind,0,0,0);
  // Sprite halo is deliberately excluded from geometric bounds and counts.
  p.halo.visible = false; p.group.remove(p.halo);
  models[`pickup:${kind}`] = { ...measure(p.group), radius:p.radius, color:p.color };
  p.dispose();
}
const peaks = {}, totals = {};
for (let seed = 1; seed <= 100; seed++) for (const loop of [0,1,3]) {
  const level = new Level(seed,loop);
  const kinds = [...new Set(level.features.map(f=>f.kind))];
  for (const kind of kinds) {
    const zs = level.features.filter(f=>f.kind===kind).map(f=>f.z);
    totals[kind] = Math.max(totals[kind]??0,zs.length);
    for (let start=0,end=0; end<zs.length; end++) {
      while (zs[end]-zs[start]>355) start++;
      const count = end-start+1;
      if(count>(peaks[kind]?.count??0)) peaks[kind]={count,seed,loop,fromZ:zs[start],toZ:zs[end]};
    }
  }
}
const references = {};
for (const kind of ['player','sentinel','turret','radar','silo','fuel']) {
  const buf = readFileSync(`public/models/${kind}.glb`);
  const gltf = JSON.parse(buf.subarray(20,20+buf.readUInt32LE(12)).toString());
  let triangles=0, primitives=0;
  for(const node of gltf.nodes??[]) if(node.mesh!==undefined) for(const p of gltf.meshes[node.mesh].primitives){
    if((p.mode??4)!==4) throw Error('Nontriangle reference');
    primitives++; triangles += gltf.accessors[p.indices??p.attributes.POSITION].count/3;
  }
  references[kind]={bytes:buf.length,triangleInstances:triangles,primitiveInstances:primitives,materials:gltf.materials?.length??0};
}
const out={schemaVersion:1,revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
 method:'Actual procedural Three.js geometry at seed 1, root world origin; all rest geometry bounds including hidden hit shell; sprites excluded. Stub materials, no rendering. Primitive counts respect single versus array material; no shadow passes. GLB reference counts are per node instance.',
 densityCaveat:'355-unit static feature window (SPAWN_AHEAD 300 + DESPAWN_BEHIND 55), 100 seeds x loops 0,1,3. This is a layout proxy, NOT a measured live maximum: moving flyers, carrier launches, boss spawns and dropped pickups need runtime batch profiling.',
 models,references,layoutWindowPeaks:peaks,maxCampaignFeatures:totals};
writeFileSync('docs/asset-production/baseline.json',JSON.stringify(out,null,2)+'\n');
disposeEnemyGeometry();disposePickupGeometry();fallback.dispose();
console.log('Wrote docs/asset-production/baseline.json');
