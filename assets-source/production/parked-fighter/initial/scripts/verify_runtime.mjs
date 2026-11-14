import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bindImportedParkedFighter} from './runtime_binding.example.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const findRepo=directory=>fs.existsSync(path.join(directory,'src/entities/Enemies.js'))?directory:path.dirname(directory)===directory?null:findRepo(path.dirname(directory));
const repo=process.env.PARKED_FIGHTER_REPO??findRepo(root);
const THREE=await import(path.join(root,'.runtime/three/build/three.module.js'));
const {GLTFLoader}=await import(path.join(root,'.runtime/three/examples/jsm/loaders/GLTFLoader.js'));
const {mergeGeometries}=await import(path.join(root,'.runtime/Merge.js'));
const buffer=fs.readFileSync(path.join(root,'build/parked-fighter.glb'));
const gltf=await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'');
const source=fs.readFileSync(path.join(repo,'src/render/ImportedModels.js'),'utf8');
const instantiateText=source.slice(source.indexOf('function instantiate('),source.indexOf('\nfunction node('));
const templates=new Map([['parked',gltf.scene]]);
const instantiate=new Function('templates',instantiateText+'\nreturn instantiate;')(templates);
const disposeText=fs.readFileSync(path.join(repo,'src/render/Dispose.js'),'utf8').replace('export ','');
const disposeModel=new Function(disposeText+'\nreturn disposeModel;')();
const first=instantiate('parked'),second=instantiate('parked');
let firstGeometry,secondGeometry;
first.traverse(obj=>{if(obj.isMesh && !firstGeometry)firstGeometry=obj.geometry;});
second.traverse(obj=>{if(obj.isMesh && !secondGeometry)secondGeometry=obj.geometry;});
assert.notEqual(firstGeometry,secondGeometry);
assert.notEqual(first.userData.modelOwnedMaterials[0],second.userData.modelOwnedMaterials[0]);
let ownedDisposed=0,geometryDisposed=0,sharedDisposed=0;
for(const mat of first.userData.modelOwnedMaterials) mat.addEventListener('dispose',()=>ownedDisposed++);
const geometries=new Set();
first.traverse(obj=>{if(obj.geometry)geometries.add(obj.geometry);});
for(const geometry of geometries)geometry.addEventListener('dispose',()=>geometryDisposed++);
const sharedAmber=new THREE.MeshBasicMaterial({color:new THREE.Color(0xff9a3a).multiplyScalar(2.2),toneMapped:false});
const sharedRed=new THREE.MeshBasicMaterial({color:new THREE.Color(0xff3d55).multiplyScalar(3),toneMapped:false});
for(const mat of [sharedAmber,sharedRed])mat.addEventListener('dispose',()=>sharedDisposed++);
const enemy={group:new THREE.Group(),_addFlashShell(geometry,scale){this.flashMat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending});this.flashMesh=new THREE.Mesh(geometry,this.flashMat);this.flashMesh.scale.setScalar(scale);this.flashMesh.visible=false;this.group.add(this.flashMesh);}};
function buildFlashShell(enemy,airframe,scale){
  enemy.group.updateMatrixWorld(true);
  const inverse=enemy.group.matrixWorld.clone().invert(),parts=[];
  airframe.traverse(obj=>{
    if(!obj.isMesh)return;
    const geometry=obj.geometry.index?obj.geometry.toNonIndexed():obj.geometry.clone();
    geometry.applyMatrix4(inverse.clone().multiply(obj.matrixWorld));
    for(const name of Object.keys(geometry.attributes))if(!['position','normal'].includes(name))geometry.deleteAttribute(name);
    geometry.clearGroups();parts.push(geometry);
  });
  const geometry=mergeGeometries(parts,false);
  parts.forEach(part=>part.dispose());
  enemy._addFlashShell(geometry,scale);
  enemy._parkedFlashGeometry=geometry;
}
bindImportedParkedFighter(enemy,first,{neon:hex=>hex===0xff9a3a?sharedAmber:sharedRed},buildFlashShell);
assert.equal(enemy.engine.name,'engine');
assert.equal(enemy.beacon.name,'beacon');
assert.deepEqual(enemy.engine.position.toArray().map(value=>+value.toFixed(6)),[0,1,2.3]);
assert.deepEqual(enemy.beacon.position.toArray().map(value=>+value.toFixed(6)),[0,2.4,1.6]);
assert.equal(enemy.flashMesh.visible,false);
assert.equal(enemy.flashMesh.scale.x,1.12);
assert.equal(enemy.engine.children[0].material,sharedAmber);
assert.equal(enemy.beacon.children[0].material,sharedRed);
const flashTriangles=enemy.flashMesh.geometry.attributes.position.count/3;
let flashDisposed=0;
enemy.flashMesh.geometry.addEventListener('dispose',()=>flashDisposed++);
const expected=JSON.parse(fs.readFileSync(path.join(root,'evidence/glb_binary_report.json')));
assert.equal(flashTriangles,expected.primitives.filter(primitive=>primitive.node==='airframe').reduce((sum,primitive)=>sum+primitive.triangles,0));
const contract=JSON.parse(fs.readFileSync(path.join(root,'source/source_contract.json')));
const points=[];
for(const sample of contract.samples){
  enemy.group.position.fromArray(sample.pos);
  enemy.group.rotation.set(sample.pitch,sample.yaw,0,'XYZ');
  enemy.engine.scale.setScalar(sample.engineScale);
  enemy.beacon.visible=sample.beaconVisible;
  enemy.group.updateMatrixWorld(true);
  const bounds=new THREE.Box3();
  first.traverse(obj=>{
    if(!obj.isMesh || !obj.visible || !obj.parent.visible)return;
    const positions=obj.geometry.attributes.position;
    for(let index=0;index<positions.count;index++)bounds.expandByPoint(new THREE.Vector3().fromBufferAttribute(positions,index).applyMatrix4(obj.matrixWorld));
  });
  const binarySample=expected.sourceMotionTransformedBounds.find(entry=>entry.label===sample.label);
  for(let axis=0;axis<3;axis++){
    assert.ok(Math.abs(bounds.min.getComponent(axis)-binarySample.bounds.min[axis])<2e-5);
    assert.ok(Math.abs(bounds.max.getComponent(axis)-binarySample.bounds.max[axis])<2e-5);
  }
  points.push({label:sample.label,min:bounds.min.toArray(),max:bounds.max.toArray()});
}
const enemySource=fs.readFileSync(path.join(repo,'src/entities/Enemies.js'),'utf8');
const disposeStart=enemySource.indexOf('  dispose() {');
const disposeEnd=enemySource.indexOf('\n}',disposeStart);
const enemyClass=new Function('disposeModel','return class {\n'+enemySource.slice(disposeStart,disposeEnd)+'\n};')(disposeModel);
enemyClass.prototype.dispose.call(enemy);
assert.equal(ownedDisposed,5);
assert.equal(geometryDisposed,5);
assert.equal(sharedDisposed,0);
assert.equal(flashDisposed,1);
assert.ok(second.getObjectByName('engine'));
const report={GLTFLoaderParse:true,actualInstantiateSourceExecuted:true,actualDisposeModelSourceExecuted:true,actualEnemyDisposeSourceExecuted:true,clonedGeometryAndMaterialsIndependent:true,namedBindingVerified:true,sourceMotionSamplesVerified:points.length,flash:{triangles:flashTriangles,primitives:1,initiallyHidden:true,scale:1.12,parent:'importedRoot',cleanedByExistingEnemyDispose:true},disposed:{ownedMaterials:ownedDisposed,clonedGeometries:geometryDisposed,sharedNeonMaterials:sharedDisposed,flashGeometry:flashDisposed},status:'candidate binding example and isolated source execution only; production adapter not installed; flash parent must be importedRoot for existing lifecycle ownership',samples:points};
fs.writeFileSync(path.join(root,'evidence/runtime_verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,samples:undefined},null,2));
