/** Dispose only resources owned by a model; textures remain owned by Textures. */
export function disposeModel(root, ownMaterials = false) {
  const geometries = new Set(), materials = new Set();
  root.traverse(o => {
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
