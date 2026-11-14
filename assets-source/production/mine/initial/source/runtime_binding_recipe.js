/** Integration recipe only. This file is NOT wired into production.
 * Pass the result of ImportedModels.js instantiate('mine') (per-instance cloned
 * geometry/materials), plus THREE and the existing Enemy instance.
 * Call as the replacement for procedural construction after Enemy fields are set.
 * Do not call Enemy._addFlashShell: a 20-triangle shell is already authored.
 */
export function bindMineInitial(enemy, importedRoot, THREE) {
  const node = name => {
    const result = importedRoot.getObjectByName(name);
    if (!result) throw new Error(`Mine INITIAL missing ${name}`);
    return result;
  };
  enemy.group.add(importedRoot);
  enemy._importedRoot = importedRoot;
  enemy.core = node('core');
  enemy.lamp = node('lamp');
  // mats.neon is shared and remains Materials-owned. Keep the replaced cloned
  // MN_Danger in importedRoot.userData.modelOwnedMaterials for disposal.
  enemy.lamp.material = enemy.mats.neon(0xff3d55, 3.2);
  enemy.lamp.castShadow = false;
  enemy.lamp.receiveShadow = false;
  enemy.flashMesh = node('flashMesh');
  enemy.flashMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
    toneMapped: false, blending: THREE.AdditiveBlending,
  });
  enemy.flashMesh.material = enemy.flashMat;
  enemy.flashMesh.visible = false;
  enemy.flashMesh.renderOrder = 5;
  enemy.flashMesh.castShadow = false;
  enemy.flashMesh.receiveShadow = false;
  // Scale 1.2 is already authored. Do not multiply again.
  // flashMat stays outside modelOwnedMaterials: Enemy.dispose owns it.
  // Preserve Mine.update, hit, score, collider, warning and Game._killEnemy.
  return importedRoot;
}
