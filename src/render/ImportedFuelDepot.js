import * as THREE from 'three';
import { runCleanups } from '../core/Lifetime.js';

export function createFuelDepotRecipe(document) {
  const templates = [];
  try {
    for (const bucket of document.buckets) {
      const geometry = new THREE.BufferGeometry();
      const template = { key: bucket.key, geometry }; templates.push(template);
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.position, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.normal, 3));
      template.color = new Float32Array(bucket.color);
    }
  } catch (error) {
    try { runCleanups(templates.map(template => () => template.geometry.dispose())); } catch { /* preserve preparation error */ }
    throw error;
  }
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
    runCleanups(templates.map(template => () => template.geometry.dispose()));
  }
  return { stamp, dispose, templates };
}

let recipe;
export async function loadImportedFuelDepot(base) {
  const response = await fetch(base + 'fuel-depot.template.json');
  if (!response.ok) throw new Error('Fuel depot template failed to load');
  recipe = createFuelDepotRecipe(await response.json());
}
export function appendImportedFuelDepot(batch, rng, x, z) {
  if (!recipe) return false;
  recipe.stamp(batch, rng, x, z);
  return true;
}
export function importedFuelDepotTemplates() { return recipe?.templates.map(t => t.geometry) ?? []; }
export function disposeImportedFuelDepot() { const owned = recipe; recipe = undefined; owned?.dispose(); }
