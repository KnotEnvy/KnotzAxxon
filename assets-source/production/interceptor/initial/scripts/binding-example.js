/** Integration recipe ONLY. Not imported by production. Call in Flyer constructor
 * after original gameplay state setup, before procedural geometry allocation.
 * Loader must cache interceptor.glb first. Keep all existing Flyer.update logic.
 */
export function bindInterceptor(enemy, template, THREE) {
  const root=template.clone(true), geometryCopies=new Map(), materialCopies=new Map();
  root.traverse(o=>{
    if(!o.isMesh)return;
    if(!geometryCopies.has(o.geometry))geometryCopies.set(o.geometry,o.geometry.clone());
    o.geometry=geometryCopies.get(o.geometry);
    const copy=m=>{
      if(!materialCopies.has(m))materialCopies.set(m,m.clone());
      return materialCopies.get(m);
    };
    o.material=Array.isArray(o.material)?o.material.map(copy):copy(o.material);
    o.castShadow=true;o.receiveShadow=true;
  });
  const node=name=>{const n=root.getObjectByName(name);if(!n)throw Error(`Missing interceptor node ${name}`);return n;};
  const owned=new Set(materialCopies.values());
  const replace=(name,replacement)=>{
    const removed=new Set();root.traverse(o=>{
      if(!o.isMesh)return;
      const swap=m=>{if(m.name!==name)return m;removed.add(m);return replacement;};
      o.material=Array.isArray(o.material)?o.material.map(swap):swap(o.material);
    });
    for(const m of removed){owned.delete(m);m.dispose();}owned.add(replacement);
  };
  // Match Materials.neon exactly without taking shared material ownership.
  const cue=(name,color)=>new THREE.MeshBasicMaterial({name,color:new THREE.Color(color).multiplyScalar(3),toneMapped:false});
  replace('INT_Cue',cue('INT_Cue',0xff3d55));
  replace('INT_Emission',cue('INT_Emission',0xff5a3a));
  enemy.body=node('body');enemy.eye=node('eye');enemy.engine=node('engine');
  const flash=new THREE.MeshBasicMaterial({name:'INT_HitFlash',color:0xffffff,transparent:true,opacity:0,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending});
  replace('INT_HitFlash',flash);
  enemy.flashMat=flash;enemy.flashMesh=node('hit-flash-shell');
  enemy.flashMesh.scale.setScalar(1.018);enemy.flashMesh.visible=false;enemy.flashMesh.renderOrder=5;enemy.flashMesh.castShadow=false;enemy.flashMesh.receiveShadow=false;
  root.userData.modelOwnedMaterials=[...owned];enemy._importedRoot=root;enemy.group.add(root);
  return root;
}
