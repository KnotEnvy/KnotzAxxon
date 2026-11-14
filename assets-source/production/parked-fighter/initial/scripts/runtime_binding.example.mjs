export function bindImportedParkedFighter(enemy, importedRoot, mats, buildFlashShell) {
  const required=name=>{
    const found=importedRoot.getObjectByName(name);
    if(!found) throw new Error(`Parked fighter missing node: ${name}`);
    return found;
  };
  const engine=required('engine');
  const beacon=required('beacon');
  const airframe=required('airframe');
  const shared=new Map([
    ['PF_EngineAmber',mats.neon(0xff9a3a,2.2)],
    ['PF_BeaconRed',mats.neon(0xff3d55,3)],
  ]);
  importedRoot.traverse(obj=>{
    if(!obj.material) return;
    const replace=material=>shared.get(material.name)??material;
    obj.material=Array.isArray(obj.material)?obj.material.map(replace):replace(obj.material);
  });
  enemy.group.add(importedRoot);
  enemy._importedRoot=importedRoot;
  enemy.engine=engine;
  enemy.beacon=beacon;
  enemy.engine.scale.setScalar(.3);
  buildFlashShell(enemy,airframe,1.12);
  importedRoot.add(enemy.flashMesh);
  return true;
}
