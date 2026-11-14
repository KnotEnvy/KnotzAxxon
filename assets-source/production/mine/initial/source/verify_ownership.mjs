// Structural ownership/binding test of the delivered recipe, without Three/WebGL.
// Exercises exact source disposeModel and Enemy.dispose with minimal CPU fixtures.
import fs from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
const root=process.env.KX_REPO||process.cwd();
const asset=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const {bindMineInitial}=await import(new URL('./runtime_binding_recipe.js',import.meta.url));
const {disposeModel}=await import(pathToFileURL(path.join(root,'src/render/Dispose.js')));
const text=fs.readFileSync(path.join(root,'src/entities/Enemies.js'),'utf8');
const body=text.match(/  dispose\(\) \{\n    if \(this\._importedRoot\)[\s\S]*?\n  \}/)[0];
const disposeEnemy=new Function('disposeModel',`return ({${body}}).dispose;`)(disposeModel);
let counts={geometries:0,clonedMaterials:0,flash:0,sharedNeon:0};
const resource=kind=>({dispose(){counts[kind]++}});
const nodes={};
for(const name of ['core','contacts','lamp','flashMesh'])nodes[name]={name,isMesh:true,geometry:resource('geometries'),material:resource('clonedMaterials'),userData:{},scale:{x:1,y:1,z:1}};
nodes.flashMesh.scale={x:1.2,y:1.2,z:1.2};
const owned=Object.values(nodes).map(n=>n.material);
const imported={userData:{modelOwnedMaterials:owned},getObjectByName:n=>nodes[n],traverse(fn){fn(this);Object.values(nodes).forEach(fn)},removeFromParent(){this.removed=true}};
const neon=resource('sharedNeon');
const enemy={group:{add(o){this.child=o},parent:{remove(o){o.removed=true}}},mats:{neon:(c,i)=>{if(c!==0xff3d55||i!==3.2)throw Error('cue mismatch');return neon}}};
class Flash {constructor(opts){Object.assign(this,opts)}dispose(){counts.flash++}}
bindMineInitial(enemy,imported,{MeshBasicMaterial:Flash,AdditiveBlending:'AdditiveBlending'});
if(enemy.lamp!==nodes.lamp||enemy.core!==nodes.core||enemy.flashMesh.visible||enemy.flashMesh.scale.x!==1.2)throw Error('bindings');
if(owned.includes(enemy.flashMat)||owned.includes(neon))throw Error('wrong material owner');
disposeEnemy.call(enemy);
if(JSON.stringify(counts)!==JSON.stringify({geometries:4,clonedMaterials:4,flash:1,sharedNeon:0}))throw Error('disposal mismatch '+JSON.stringify(counts));
const report={passed:true,method:'CPU fixture exercises delivered binding recipe and exact current source disposeModel / Enemy.dispose; NOT a real GLTFLoader integration test',disposalCounts:counts,noDoubleDispose:true,sharedNeonPreserved:true,flashScalePreserved:1.2,adapterIntegrated:false};
fs.writeFileSync(path.join(asset,'measurements/ownership-verification.json'),JSON.stringify(report,null,2));console.log(report);
