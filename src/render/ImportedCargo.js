import { runCleanups } from '../core/Lifetime.js';
// Adapted frozen cargo recipe: pass the unchanged procedural method at each call.
export function prepareCargoKit({ gltf }) {
  const templates = new Map(), adapters = new WeakMap();
  let disposed = false;
  const importedResources = new Set();
  gltf.scene.traverse(object => {
    if (object.geometry) importedResources.add(object.geometry);
    for (const material of [].concat(object.material ?? [])) {
      importedResources.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) importedResources.add(value);
    }
  });
  const releaseInputs = () => runCleanups([
    ...[...importedResources].map(resource => () => resource.dispose()),
    () => gltf.scene.clear(),
  ]);
  try {
    gltf.scene.updateMatrixWorld(true);
    for (const name of ['CargoCrate_Fitted', 'CargoDrum_Fitted']) {
      const object = gltf.scene.getObjectByName(name);
      if (!object?.isMesh) throw new Error(`Missing cargo template ${name}`);
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      templates.set(name, geometry);
      geometry.applyMatrix4(object.matrixWorld);
      if (!geometry.attributes.normal) throw new Error('Cargo normals are required');
      const color = geometry.attributes.color;
      if (color && Array.from(color.array).some(value => value !== 1)) throw new Error('Batch.stamp ignores COLOR_0; cargo must remain neutral');
      for (const attribute of Object.keys(geometry.attributes)) if (!['position', 'normal'].includes(attribute)) geometry.deleteAttribute(attribute);
      geometry.clearGroups();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      geometry.userData.neutralVertexMultiplier = 1;
    }
  } catch (error) {
    try { runCleanups([...templates.values()].map(geometry => () => geometry.dispose()).concat(releaseInputs)); }
    catch { /* preserve the preparation error */ }
    throw error;
  }
  try { releaseInputs(); }
  catch (error) {
    try { runCleanups([...templates.values()].map(geometry => () => geometry.dispose())); }
    catch { /* preserve the input retirement error */ }
    throw error;
  }
  const crate = templates.get('CargoCrate_Fitted'), drum = templates.get('CargoDrum_Fitted');
  function adapterFor(batch) {
    if (!adapters.has(batch)) adapters.set(batch, {
      box(key, width, height, depth, x, y, z, uvScale, tint, yaw = 0, gain = 1, fx = null) {
        if (batch.captureSurfaces) batch.surfaces.push({ minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2, top: y + height });
        batch.stamp(key, crate, x, y, z, uvScale, tint, { sx: width, sy: height, sz: depth, rotY: yaw, gain, fx });
      },
      stamp(key, ignoredSourceTemplate, x, y, z, uvScale, tint, options) {
        batch.stamp(key, drum, x, y, z, uvScale, tint, options);
      },
    });
    return adapters.get(batch);
  }
  return {
    templates,
    crates(batch, rng, x, z, maxH, originalCrates) {
      if (disposed) throw new Error('Cargo kit is shut down');
      return originalCrates.call(this, adapterFor(batch), rng, x, z, maxH);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const owned = [...templates.values()];
      templates.clear();
      runCleanups(owned.map(template => () => template.dispose()));
    },
  };
}

let kit;
export function prepareImportedCargo(gltf) { kit = prepareCargoKit({ gltf }); }
export function appendImportedCargo(owner, batch, rng, x, z, maxH, originalCrates) {
  if (!kit) return false;
  kit.crates.call(owner, batch, rng, x, z, maxH, originalCrates);
  return true;
}
export function importedCargoTemplates() { return kit ? [...kit.templates.values()] : []; }
export function disposeImportedCargo() { const owned = kit; kit = undefined; owned?.dispose(); }
