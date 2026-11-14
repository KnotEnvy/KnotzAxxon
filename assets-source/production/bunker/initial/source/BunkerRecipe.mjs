import * as THREE from 'three';

export function createBunkerRecipe(data) {
  const templates = new Map();
  for (const key of ['hull', 'dark', 'neon']) {
    const source = data.buckets[key], geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(source.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(source.normals, 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    templates.set(key, geometry);
  }
  return fromTemplates(templates);
}

export function createBunkerRecipeFromGLTF(root) {
  const templates = new Map(), loaderResources = new Set();
  root.updateMatrixWorld(true);
  const identity = new THREE.Matrix4();
  root.traverse(node => {
    if (!node.isMesh) return;
    const key = node.name.replace(/^bunker-/, '');
    if (!['hull', 'dark', 'neon'].includes(key) || templates.has(key)) throw new Error(`Unexpected bunker GLB node ${node.name}`);
    if (!node.matrixWorld.equals(identity)) throw new Error('Bunker GLB must retain its audited ground-origin identity transforms');
    templates.set(key, node.geometry);
    for (const material of [].concat(node.material ?? [])) {
      loaderResources.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) loaderResources.add(value);
    }
  });
  if (templates.size !== 3) throw new Error('Bunker GLB must provide exactly hull, dark and neon');
  return fromTemplates(templates, loaderResources);
}

function fromTemplates(templates, loaderResources = []) {
  let disposed = false;
  function stamp(batch, rng, x, z, theme) {
    if (disposed) throw new Error('Bunker loader templates already disposed');
    const phase = rng.next();
    batch.stamp('hull', templates.get('hull'), x, 0, z, 4, 0x8a929c);
    batch.stamp('neon', templates.get('neon'), x, 0, z, 8, theme.warm, { gain: 1.1, fx: { anim: [3, .3, phase] } });
    batch.stamp('dark', templates.get('dark'), x, 0, z, 3, 0xffffff);
    if (batch.captureSurfaces) {
      batch.surfaces.push({ minX:x-3.03-.15/2, maxX:x-3.03+.15/2, minZ:z-2, maxZ:z+2, top:1.8+.4 });
      batch.surfaces.push({ minX:x-2.4/2, maxX:x+2.4/2, minZ:z-2.4/2, maxZ:z+2.4/2, top:3.2+.8 });
    }
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const resource of new Set([...templates.values(), ...loaderResources])) resource.dispose();
    templates.clear();
  }
  return { stamp, dispose, templates };
}
