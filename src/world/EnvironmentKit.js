/**
 * Authored environment kit: startup-cached stamp templates.
 *
 * One GLB (`models/environment/environment-kit.glb`) holds every architecture
 * module as named mesh nodes (`Module__part`). Vertices are already in game
 * coordinates (+x far wall, +y up, +z flight), so a part is stamped straight
 * into a chunk's existing material buckets with `Batch.stamp`: no Object3D,
 * material, texture or draw call is created per prop, and nothing runs per
 * frame. Bucket, tint, UV scale and emissive gain travel as node extras.
 *
 * When the kit is not loaded every caller falls back to the procedural
 * source geometry, which stays byte-identical to the pre-kit build.
 */

import { runCleanups } from '../core/Lifetime.js';

const templates = new Map();
let ready = false;

/**
 * [parts, template triangles] of the kit file this build's composers were written
 * against. A file that does not match (a stale or partial deploy) is rejected and the
 * game streams the procedural source instead of failing inside a chunk build.
 */
export const ENVIRONMENT_KIT_SIGNATURE = [175, 6262];

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Cache position+normal templates from a parsed glTF; loader-owned resources are released. Returns whether the kit was accepted. */
export function prepareEnvironmentKit(gltf) {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const geometries = new Set(), materials = new Set(), textures = new Set();
  scene.traverse(o => {
    if (!o.isMesh) return;
    geometries.add(o.geometry);
    for (const m of [].concat(o.material ?? [])) {
      materials.add(m);
      for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
    }
  });
  let accepted = false, failure = null;
  try {
    // Inside the guard: a stale kit that fails to release must not strand this file's resources.
    disposeEnvironmentKit();
    scene.traverse((o) => {
      if (!o.isMesh) return;
      const split = o.name.indexOf('__');
      if (split < 0) return;
      const e = o.matrixWorld.elements;
      if (!IDENTITY.every((v, i) => Math.abs(e[i] - v) < 1e-9)) throw new Error(`Environment kit node ${o.name} must keep an identity transform`);
      const meta = o.userData;
      if (typeof meta.rs_bucket !== 'string') throw new Error(`Environment kit node ${o.name} carries no bucket`);
      const geometry = o.geometry.clone();
      for (const name of Object.keys(geometry.attributes)) if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
      geometry.clearGroups();
      geometry.userData.kit = {
        name: `${o.name.slice(0, split)}.${o.name.slice(split + 2)}`,
        bucket: meta.rs_bucket,
        tint: parseInt(meta.rs_tint, 16),
        uvScale: meta.rs_uv,
        gain: meta.rs_gain ?? 1,
        triangles: (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3,
      };
      templates.set(`${o.name.slice(0, split)}.${o.name.slice(split + 2)}`, geometry);
    });
    let triangles = 0;
    for (const t of templates.values()) triangles += t.userData.kit.triangles;
    if (templates.size !== ENVIRONMENT_KIT_SIGNATURE[0] || triangles !== ENVIRONMENT_KIT_SIGNATURE[1]) {
      console.warn(`Environment kit rejected: ${templates.size} parts / ${triangles} triangles, expected ${ENVIRONMENT_KIT_SIGNATURE.join(' / ')}. Using procedural architecture.`);
    } else accepted = ready = true;
  } catch (error) {
    failure = { error };
  }
  // Every loader-owned resource is attempted whatever the others do. A rejected or
  // malformed kit also gives up the templates cloned so far (a part may fail late).
  try {
    runCleanups([
      () => { if (!accepted) disposeEnvironmentKit(); },
      ...[...geometries, ...textures, ...materials].map(resource => () => resource.dispose()),
      () => scene.clear(),
    ]);
  } catch (cleanupError) {
    // A preparation error is the cause; a cleanup failure must not replace it.
    if (!failure) throw cleanupError;
  }
  if (failure) throw failure.error;
  return accepted;
}

/**
 * The kit is decoration: a missing or unreadable file must never stop the game from
 * loading. Any failure leaves the procedural architecture in place.
 */
export async function loadEnvironmentKit(loader, baseUrl) {
  try {
    return prepareEnvironmentKit(await loader.loadAsync(`${baseUrl}environment-kit.glb`));
  } catch (error) {
    console.warn('Environment kit unavailable; using procedural architecture.', error);
    disposeEnvironmentKit();
    return false;
  }
}

/** Release every template exactly once (application shutdown or failed load). */
export function disposeEnvironmentKit() {
  // Ownership ends first: a failing disposer can neither strand the rest nor be revisited.
  const owned = new Set(templates.values());
  templates.clear();
  ready = false;
  runCleanups([...owned].map(template => () => template.dispose()));
}

export const environmentKitReady = () => ready;
export const environmentKitParts = () => templates;

export function kitPart(name) {
  const t = templates.get(name);
  if (!t) throw new Error(`Unknown environment kit part ${name}`);
  return t;
}

/** Stamp one kit part with its authored bucket / tint / UV scale / gain unless overridden. */
export function put(batch, name, x, y, z, o = null) {
  const t = kitPart(name), m = t.userData.kit;
  batch.stamp(o?.bucket ?? m.bucket, t, x, y, z, o?.uv ?? m.uvScale, o?.tint ?? m.tint, {
    sx: o?.sx ?? 1, sy: o?.sy ?? 1, sz: o?.sz ?? 1, s: o?.s ?? 0, rotY: o?.rotY ?? 0, gain: o?.gain ?? m.gain, fx: o?.fx ?? null,
  });
}
