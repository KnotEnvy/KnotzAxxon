export function attachImportedFuel(pickup, importedRoot, mats) {
  if (pickup.kind !== 'fuel') throw new Error('Fuel-only adapter');
  if (!pickup.halo || !pickup.velocity || !Number.isFinite(pickup.phase) || !Number.isFinite(pickup.baseY)) {
    throw new Error('Run the complete existing Pickup constructor before replacing visuals');
  }
  if (pickup._importedRoot) throw new Error('Already attached');
  if (!importedRoot?.userData.modelOwnedMaterials) throw new Error('Use per-instance ImportedModels.instantiate clones');
  const root = importedRoot.getObjectByName('fuel_pickup_root');
  const handles = Object.fromEntries(['shell', 'core', 'shape'].map(name => [name, importedRoot.getObjectByName(name)]));
  if (!root || Object.values(handles).some(handle => !handle?.isMesh)) throw new Error('Missing fuel handles');
  for (const [name, strength] of [['shell', 1.15], ['shape', 1.35]]) {
    const previous = handles[name].material;
    const replacement = mats.neon(0xffd76a, strength).clone();
    replacement.name = `fuel_${name}_source_neon_${strength}`;
    replacement.vertexColors = true;
    replacement.toneMapped = false;
    handles[name].material = replacement;
    importedRoot.userData.modelOwnedMaterials.push(replacement);
    if (!Array.isArray(previous)) {
      importedRoot.userData.modelOwnedMaterials = importedRoot.userData.modelOwnedMaterials.filter(material => material !== previous);
      previous.dispose();
    }
  }
  for (const name of ['shell', 'core', 'shape']) pickup.group.remove(pickup[name]);
  pickup.group.add(importedRoot);
  pickup._importedRoot = importedRoot;
  Object.assign(pickup, handles);
  return pickup;
}

export function releaseImportedFuel(pickup, disposeModel) {
  if (pickup._importedRoot) {
    disposeModel(pickup._importedRoot);
    pickup._importedRoot = null;
  }
  pickup.group.removeFromParent();
}
