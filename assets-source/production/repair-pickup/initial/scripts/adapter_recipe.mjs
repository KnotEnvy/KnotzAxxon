export function attachImportedRepair(pickup, importedRoot) {
  if (pickup.kind !== 'repair') throw new Error('Repair-only adapter');
  if (!pickup.halo || !pickup.velocity || !Number.isFinite(pickup.phase) || !Number.isFinite(pickup.baseY)) {
    throw new Error('Call only AFTER the full normal Pickup constructor initializes state and shared halo');
  }
  if (!importedRoot?.userData.modelOwnedMaterials) throw new Error('Use ImportedModels.js per-instance instantiate clone ownership');
  const root = importedRoot.getObjectByName('repair_pickup_root');
  const handles = Object.fromEntries(['shell', 'core', 'shape'].map(name => [name, importedRoot.getObjectByName(name)]));
  if (!root || Object.values(handles).some(handle => !handle?.isMesh)) throw new Error('Missing repair mesh handles');
  for (const name of ['shell', 'shape']) {
    for (const material of [].concat(handles[name].material)) material.toneMapped = false;
  }
  for (const name of ['shell', 'core', 'shape']) pickup.group.remove(pickup[name]);
  pickup.group.add(importedRoot);
  pickup._importedRoot = importedRoot;
  Object.assign(pickup, handles);
  return pickup;
}

export function releaseImportedRepair(pickup, disposeModel) {
  if (pickup._importedRoot) {
    disposeModel(pickup._importedRoot);
    pickup._importedRoot = null;
  }
  pickup.group.removeFromParent();
}
