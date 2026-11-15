import { runCleanups } from '../core/Lifetime.js';

const retired = new WeakSet();

/** Dispose model resources; textures remain owned by Textures or imported templates. */
export function disposeModel(root, ownMaterials = false) {
  if (retired.has(root)) return;
  retired.add(root);
  const geometries = new Set(), materials = new Set(), instances = [];
  root.traverse(o => {
    for (const m of o.userData.modelOwnedMaterials ?? []) materials.add(m);
    if (o.geometry && !o.isSprite) geometries.add(o.geometry);
    if (o.isInstancedMesh) instances.push(o);
    if (ownMaterials && o.material) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
    }
  });
  runCleanups([
    ...instances.map(o => () => o.dispose()), // per-instance GPU attributes
    ...[...geometries, ...materials].map(resource => () => resource.dispose()),
    () => root.removeFromParent(),
  ]);
}
