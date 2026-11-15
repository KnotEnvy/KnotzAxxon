// Content digest of one streamed chunk: every mesh (material, flags, all vertex attributes),
// its guide surfaces and the ambience emitters it owns. Shared by tests/environment-kit.test.js
// and the tool that recorded tests/fixtures/fortress-source-golden.json from the pre-kit source.
import { createHash } from 'node:crypto';

export function chunkDigest(group, fortress, hash = createHash('sha256')) {
  const visit = (o, depth) => {
    for (const c of o.children) {
      if (c.isMesh) {
        const g = c.geometry;
        hash.update(`mesh:${depth}:${c.material.name}:${c.castShadow}:${c.receiveShadow}:${c.frustumCulled}|`);
        for (const name of Object.keys(g.attributes).sort()) { const a = g.attributes[name].array; hash.update(name); hash.update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)); }
      } else hash.update(`group:${depth}|`);
      visit(c, depth + 1);
    }
  };
  visit(group, 0);
  hash.update(JSON.stringify(group.userData.deckSurfaces ?? null));
  hash.update(JSON.stringify(fortress.emitters.filter((e) => e.owner === group).map(({ owner, ...e }) => e)));
  return hash;
}

/** Named stand-ins for the shared materials: one identity per bucket, as the streamer expects. */
export function stubMaterials(THREE) {
  const make = (name) => { const m = new THREE.MeshBasicMaterial(); m.name = name; return m; };
  return {
    hull: make('hull'), deck: make('deck'), darkMetal: make('dark'), grating: make('grate'),
    hazard: make('hazard'), neonVertex: make('neon'), paint: make('paint'), rock: make('rock'), spinMetal: make('spin'),
    forceField(color) { const f = make('forceField'); f.userData.color = color; return f; },
  };
}

export const GOLDEN_RUNS = [[1, 0], [7, 0], [42, 1], [1234567, 1]];
