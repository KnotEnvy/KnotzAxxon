import data from '../asset/covered-fighter.recipe.json' with { type: 'json' };

let templates = null;
let disposed = false;

export function initializeCoveredFighter(THREE) {
  if (disposed) throw new Error('Covered fighter templates already shut down');
  if (templates) return templates;
  templates = Object.freeze(data.parts.filter(part => part.bucket !== 'paint').map(part => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(part.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(part.normals, 3));
    return Object.freeze({ geometry, bucket: part.bucket, tint: part.tint, name: part.name });
  }));
  return templates;
}

export function stampCoveredFighter(batch, x, z, rng) {
  if (!templates || disposed) throw new Error('Initialize covered fighter before chunk construction');
  const rot = rng.range(-0.25, 0.25);
  for (const part of templates) batch.stamp(part.bucket, part.geometry, x, 0, z, 3, part.tint, { rotY: rot });
  batch.box('paint', 7.5, 0.02, 0.3, x, 0.006, z - 3.6, 4, 0x9aa4ae);
  batch.box('paint', 7.5, 0.02, 0.3, x, 0.006, z + 3.6, 4, 0x9aa4ae);
}

export function disposeCoveredFighterTemplates() {
  if (disposed) return;
  for (const part of templates ?? []) part.geometry.dispose();
  templates = null;
  disposed = true;
}
