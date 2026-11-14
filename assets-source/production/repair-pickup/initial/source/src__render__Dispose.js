/** Dispose model resources; textures remain owned by Textures or imported templates. */
export function disposeModel(root, ownMaterials = false) {
  const geometries = new Set(), materials = new Set();
  root.traverse(o => {
    for (const m of o.userData.modelOwnedMaterials ?? []) materials.add(m);
    if (o.geometry && !o.isSprite) geometries.add(o.geometry);
    if (o.isInstancedMesh) o.dispose(); // releases per-instance GPU attributes
    if (ownMaterials && o.material) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
    }
  });
  for (const g of geometries) g.dispose();
  for (const m of materials) m.dispose();
  root.removeFromParent();
}
