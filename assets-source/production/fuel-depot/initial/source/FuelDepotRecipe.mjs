import * as THREE from 'three';

export function createFuelDepotRecipe(document) {
  const templates = document.buckets.map(bucket => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.position, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.normal, 3));
    return { key: bucket.key, geometry, color: new Float32Array(bucket.color) };
  });
  let disposed = false;
  function stamp(batch, rng, worldX, worldZ) {
    if (disposed) throw new Error('Fuel depot templates disposed at application shutdown');
    if (batch.captureSurfaces) {
      for (const offset of [-1.6, 1.6]) {
        const tankX = worldX + offset;
        for (const deltaZ of [-2.6, 2.6]) batch.surfaces.push({ minX: tankX - 2.2 / 2, maxX: tankX + 2.2 / 2, minZ: worldZ + deltaZ - .6 / 2, maxZ: worldZ + deltaZ + .6 / 2, top: .9 });
      }
    }
    for (const template of templates) {
      const bucket = batch._bucket(template.key), first = bucket.col.n;
      batch.stamp(template.key, template.geometry, worldX, 0, worldZ, 3, 0xffffff);
      for (let index = 0; index < template.color.length; index++) bucket.col.a[first + index] *= template.color[index];
    }
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const template of templates) template.geometry.dispose();
  }
  return { stamp, dispose, templates };
}
