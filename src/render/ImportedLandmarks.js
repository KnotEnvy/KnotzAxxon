import * as THREE from 'three';
import { importedTemplate } from './ImportedModels.js';

// Cached CPU records retain template ownership and are released with its root.
export function prepareImportedDreadnought(root) {
  if (root.userData.streamRecords) return root.userData.streamRecords;
  root.updateMatrixWorld(true);
  const modules = [], v = new THREE.Vector3();
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const g = mesh.geometry, normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const vertices = [];
    for (let i = 0; i < (g.index?.count ?? g.attributes.position.count); i++) {
      const index = g.index ? g.index.getX(i) : i;
      const read = name => {
        const a = g.getAttribute(name);
        return Array.from({ length: a.itemSize }, (_, c) => a.getComponent(index, c));
      };
      vertices.push({
        p: v.fromArray(read('position')).applyMatrix4(mesh.matrixWorld).toArray(),
        n: v.fromArray(read('normal')).applyMatrix3(normalMatrix).normalize().toArray(),
        uv: read('uv'), c: read('color').slice(0, 3), a: read('_anim'),
      });
    }
    const zs = vertices.map(v => v.p[2]);
    modules.push({ key: mesh.material.name.replace('DN_', ''), vertices,
      minZ: Math.min(...zs), maxZ: Math.max(...zs) });
  });
  return (root.userData.streamRecords = modules);
}

function clip(vertices, z, greater) {
  const result = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[(i + vertices.length - 1) % vertices.length], b = vertices[i];
    const inside = v => greater ? v.p[2] >= z - 1e-6 : v.p[2] <= z + 1e-6;
    if (inside(a) !== inside(b)) {
      const t = (z - a.p[2]) / (b.p[2] - a.p[2]);
      result.push(Object.fromEntries(Object.keys(a).map(k => [k, a[k].map((v, j) => v + (b[k][j] - v) * t)])));
    }
    if (inside(b)) result.push(b);
  }
  return result;
}

/** Append only intersecting sections to the existing chunk's three shared buckets. */
export function appendImportedDreadnought(batch, z0, sector) {
  const root = importedTemplate('dreadnought');
  if (!root) return false;
  const delta = (sector.zStart ?? 0) - 3200;
  for (const module of prepareImportedDreadnought(root)) {
    if (module.maxZ + delta <= z0 + 1e-6 || module.minZ + delta >= z0 + 96 - 1e-6) continue;
    const bucket = batch._bucket(module.key);
    for (let i = 0; i < module.vertices.length; i += 3) {
      const triangle = module.vertices.slice(i, i + 3).map(v => ({ ...v, p: [v.p[0], v.p[1], v.p[2] + delta] }));
      const polygon = clip(clip(triangle, z0, true), z0 + 96, false);
      for (let j = 1; j < polygon.length - 1; j++) {
        const face = [polygon[0], polygon[j], polygon[j + 1]];
        const a = new THREE.Vector3().fromArray(face[1].p).sub(new THREE.Vector3().fromArray(face[0].p));
        const b = new THREE.Vector3().fromArray(face[2].p).sub(new THREE.Vector3().fromArray(face[0].p));
        if (a.cross(b).lengthSq() < 1e-12) continue;
        bucket.reserve(3);
        for (const v of face) {
          const lift = module.key === 'neon' ? 1 : (v.n[1] > .7 ? 1.1 : 1) *
            (v.n[2] < -.7 ? batch.frontLift : Math.abs(v.n[0]) > .7 ? batch.sideLift : 1);
          batch._vertex(bucket, ...v.p, ...v.n, ...v.uv, ...v.c, lift, { anim: v.a }, 0, 0, 0);
        }
      }
    }
  }
  return true;
}

const ASTEROID_NODES = ['AS_Talus_Basin', 'AS_Keel_DoubleImpact', 'AS_Scar_Cleaved'];

export function prepareImportedAsteroids(root) {
  root.updateMatrixWorld(true);
  root.userData.templateGeometries = ASTEROID_NODES.map(name => {
    const mesh = root.getObjectByName(name);
    return mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  });
}

function asteroidVariant(state, ordinal, chunkIndex) {
  let hash = (state ^ Math.imul(ordinal + 1, 0x9e3779b1) ^ Math.imul(chunkIndex, 0x85ebca6b)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  return ((hash ^ (hash >>> 16)) >>> 0) % 3;
}

/** Replace only decorative void rocks; barrier-owned procedural rocks stay separate. */
export function appendImportedAsteroid(batch, rng, radius, x, y, z, axis, ordinal, chunkIndex) {
  const root = importedTemplate('asteroids');
  if (!root) return false;
  rng.bool(.4); // Retain the original detail branch and all four shape draws.
  const sx = rng.range(.7, 1.3), sy = rng.range(.55, 1), sz = rng.range(.7, 1.4);
  rng.next();
  const variant = asteroidVariant(rng._s, ordinal, chunkIndex);
  const tint = rng.pick([0xb8b0a4, 0x9a928a, 0xc4b8a8, 0xa89c90]);
  const spin = [axis.x, axis.y, axis.z, rng.range(.05, .3)];
  const geometry = root.userData.templateGeometries[variant];
  const bucket = batch._bucket('rock'), start = bucket.col.n;
  batch.stamp('rock', geometry, x, y, z, radius * 2, tint, {
    sx: radius * sx, sy: radius * sy, sz: radius * sz,
    fx: { pivot: [x, y, z], spin },
  });
  const palette = geometry.attributes.color;
  for (let i = 0; i < (geometry.index?.count ?? palette.count); i++) {
    const vertex = geometry.index ? geometry.index.getX(i) : i;
    bucket.col.a[start + i * 3] *= palette.getX(vertex);
    bucket.col.a[start + i * 3 + 1] *= palette.getY(vertex);
    bucket.col.a[start + i * 3 + 2] *= palette.getZ(vertex);
  }
  return true;
}

/** Use the audited identity-space GLB geometry directly as startup-owned templates. */
export function appendImportedBunker(batch, rng, x, z, theme) {
  const root = importedTemplate('bunker');
  if (!root) return false;
  if (!root.userData.bunkerTemplates) {
    root.updateMatrixWorld(true);
    const identity = new THREE.Matrix4();
    root.userData.bunkerTemplates = Object.fromEntries(['hull', 'dark', 'neon'].map(key => {
      const mesh = root.getObjectByName('bunker-' + key);
      if (!mesh?.isMesh || !mesh.matrixWorld.equals(identity)) throw new Error('Bunker template requires audited identity transforms');
      return [key, mesh.geometry];
    }));
  }
  const templates = root.userData.bunkerTemplates, phase = rng.next();
  batch.stamp('hull', templates.hull, x, 0, z, 4, 0x8a929c);
  batch.stamp('neon', templates.neon, x, 0, z, 8, theme.warm, { gain: 1.1, fx: { anim: [3, .3, phase] } });
  batch.stamp('dark', templates.dark, x, 0, z, 3, 0xffffff);
  if (batch.captureSurfaces) {
    batch.surfaces.push({minX:x-3.03-.15/2,maxX:x-3.03+.15/2,minZ:z-2,maxZ:z+2,top:1.8+.4});
    batch.surfaces.push({minX:x-2.4/2,maxX:x+2.4/2,minZ:z-2.4/2,maxZ:z+2.4/2,top:3.2+.8});
  }
  return true;
}
