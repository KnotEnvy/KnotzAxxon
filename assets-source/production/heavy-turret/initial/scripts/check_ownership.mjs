// Executes actual ImportedModels.instantiate and Dispose.disposeModel using a
// structural GLB scene and tracked CPU resource objects. No Three/WebGL claim.
import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';import {fileURLToPath} from 'node:url';
const P=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),repo=process.env.KNOTZ_REPO??path.resolve(P,'../../..');
const b=fs.readFileSync(path.join(P,'heavy-turret.glb')),len=b.readUInt32LE(12),g=JSON.parse(b.subarray(20,20+len).toString());
class Resource{constructor(name){this.name=name;this.disposals=0;}clone(){return new Resource(this.name);}dispose(){this.disposals++;}}
class Node{constructor(name){this.name=name;this.children=[];this.userData={};}add(c){c.parent=this;this.children.push(c);}traverse(f){f(this);this.children.forEach(c=>c.traverse(f));}clone(){let n=new Node(this.name);Object.assign(n,{geometry:this.geometry,material:this.material,isMesh:this.isMesh});this.children.forEach(c=>n.add(c.clone()));return n;}removeFromParent(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);this.parent=null;}}
const materials=g.materials.map(m=>new Resource(m.name)),geometry=g.meshes.map((m,i)=>new Resource('mesh-'+i));
const nodes=g.nodes.map((n,i)=>{let a=new Node(n.name);if(n.mesh!==undefined){a.isMesh=true;a.geometry=geometry[n.mesh];a.material=materials[g.meshes[n.mesh].primitives[0].material];}return a;});
g.nodes.forEach((n,i)=>n.children?.forEach(c=>nodes[i].add(nodes[c])));const template=new Node('Scene');g.scenes[0].nodes.forEach(i=>template.add(nodes[i]));
const code=fs.readFileSync(path.join(repo,'src/render/ImportedModels.js'),'utf8');const start=code.indexOf('function instantiate('),end=code.indexOf('\nfunction node(',start);let sandbox=vm.createContext({templates:new Map([['heavy-turret',template]])});vm.runInContext(code.slice(start,end)+'\nglobalThis.make=instantiate;',sandbox);
const dispose=fs.readFileSync(path.join(repo,'src/render/Dispose.js'),'utf8').replace('export ','');vm.runInContext(dispose+'\nglobalThis.dispose=disposeModel;',sandbox);
const a=sandbox.make('heavy-turret'),c=sandbox.make('heavy-turret');
const resources=r=>{let gs=new Set(),ms=new Set();r.traverse(o=>{if(o.geometry)gs.add(o.geometry);if(o.material)ms.add(o.material)});return {gs:[...gs],ms:[...ms]};};
const ar=resources(a),cr=resources(c);if(ar.gs.some(g=>cr.gs.includes(g)||geometry.includes(g)))throw Error('Shared cloned geometry');if(ar.ms.some(m=>cr.ms.includes(m)||materials.includes(m)))throw Error('Shared cloned materials');
// Match integration: generated flash geometry is a descendant; flash material
// remains Enemy-owned and must be disposed once explicitly by Enemy.dispose.
const sharedNeon=new Resource('Materials.neon(ff3d55,3)');a.traverse(o=>{if(o.name==='charge-lens')o.material=sharedNeon;});
const fm=new Resource('Enemy.flashMat'),fg=new Resource('generated-flash-geometry'),flash=new Node('runtime-flash');flash.geometry=fg;flash.material=fm;flash.isMesh=true;a.add(flash);
sandbox.dispose(a);fm.dispose();
const result={method:'Unmodified instantiate/disposeModel functions, tracked CPU resources and structural GLB hierarchy; no live WebGL lifecycle assertion.',cloneGeometries:ar.gs.length,cloneMaterials:ar.ms.length,independentInstances:true,originalTemplateUnchanged:geometry.concat(materials).every(r=>r.disposals===0),firstCloneDisposedOnce:ar.gs.concat(ar.ms).every(r=>r.disposals===1),secondCloneSurvives:cr.gs.concat(cr.ms).every(r=>r.disposals===0),sharedSourceNeonNotDisposed:sharedNeon.disposals===0,generatedFlashGeometryDisposedOnce:fg.disposals===1,enemyOwnedFlashMaterialDisposedOnce:fm.disposals===1};
if(Object.values(result).some(v=>v===false))throw Error(JSON.stringify(result));fs.writeFileSync(path.join(P,'verification/ownership.json'),JSON.stringify(result,null,2));console.log(result);
