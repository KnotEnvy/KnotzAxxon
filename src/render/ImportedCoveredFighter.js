import { BufferGeometry, Float32BufferAttribute } from 'three';
import { runCleanups } from '../core/Lifetime.js';
let data;

let templates = null;
let disposed = false;

export function initializeCoveredFighter(THREE) {
  if (disposed) throw new Error('Covered fighter templates already shut down');
  if (templates) return templates;
  const built = [];
  try {
    for (const part of data.parts.filter(part => part.bucket !== 'paint')) {
      const geometry = new THREE.BufferGeometry();
      built.push({ geometry, bucket: part.bucket, tint: part.tint, name: part.name });
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(part.positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(part.normals, 3));
    }
  } catch (error) {
    try { runCleanups(built.map(part => () => part.geometry.dispose())); } catch { /* preserve preparation error */ }
    throw error;
  }
  templates = Object.freeze(built.map(Object.freeze));
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
  const owned = templates ?? [];
  templates = null;
  disposed = true; data = undefined;
  runCleanups(owned.map(part => () => part.geometry.dispose()));
}

export async function loadImportedCoveredFighter(base) {
  const response = await fetch(base + 'covered-fighter.recipe.json');
  if (!response.ok) throw new Error('Covered fighter recipe failed to load');
  data = await response.json(); disposed = false;
  initializeCoveredFighter({ BufferGeometry, Float32BufferAttribute });
}
export function appendImportedCoveredFighter(batch, x, z, rng) {
  if (!templates) return false;
  stampCoveredFighter(batch, x, z, rng);
  return true;
}
export function importedCoveredFighterTemplates() { return templates?.map(p => p.geometry) ?? []; }
