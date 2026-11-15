/**
 * Node harness: load one source tree's actual Level + Fortress (+ every scenery
 * template that loads without Vite) as an isolated module graph. CPU only.
 * Two trees (frozen input, working fixture) can be loaded side by side.
 */
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const BASE = resolve(HERE, '..');
export const FROZEN = resolve(process.env.KZ_FROZEN_TREE ?? '/tmp/knotzaxxon-environment-pre-kit');
export const WORK = resolve(process.env.KZ_WORK_TREE ?? resolve(BASE, '../..'));
export const KIT_GLB = resolve(WORK, 'public/models/environment/environment-kit.glb');

let fetchRoot = null;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, ...rest) => {
  const s = String(url);
  if (/^https?:/.test(s)) return originalFetch(url, ...rest);
  const p = s.startsWith('file:') ? fileURLToPath(s) : resolve(fetchRoot, s.replace(/^\//, ''));
  const bytes = readFileSync(p);
  return { ok: true, json: async () => JSON.parse(bytes.toString('utf8')), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
};

const arrayBuffer = (p) => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
export const parseGlb = (p) => new Promise((ok, fail) => new GLTFLoader().parse(arrayBuffer(p), '', ok, fail));

export function stubMaterials() {
  const make = (name) => { const m = new THREE.MeshBasicMaterial(); m.name = name; return m; };
  return {
    hull: make('hull'), deck: make('deck'), darkMetal: make('dark'), grating: make('grate'),
    hazard: make('hazard'), neonVertex: make('neon'), paint: make('paint'), rock: make('rock'), spinMetal: make('spin'),
    forceField(color) { const f = make('forceField'); f.userData.color = color; return f; },
  };
}

/** Load a source tree. `tag` keeps the Fortress data-URL module distinct per tree. */
export async function loadTree(root, { templates = true } = {}) {
  const file = (...p) => resolve(root, ...p);
  const url = (...p) => pathToFileURL(file(...p)).href;
  const fortressFile = file('src/world/Fortress.js');
  const source = readFileSync(fortressFile, 'utf8');
  const rewritten = source.replace(/from (['"])([^'"]+)\1/g, (_, q, s) =>
    `from ${q}${s.startsWith('.') ? pathToFileURL(resolve(dirname(fortressFile), s)).href : import.meta.resolve(s)}${q}`)
    + `\nexport { Batch, TPL, THEMES };\n// tree: ${root}`;
  const mod = await import('data:text/javascript;base64,' + Buffer.from(rewritten).toString('base64'));
  const Level = await import(url('src/world/Level.js'));
  const Utils = await import(url('src/core/Utils.js'));
  const loaded = {};
  let carrier = null;
  if (templates) {
    fetchRoot = root;
    const B = 'public/models/production/';
    const tryLoad = async (name, fn) => { try { await fn(); loaded[name] = true; } catch (e) { loaded[name] = String(e.message ?? e); } };
    await tryLoad('coolingStack', async () => (await import(url('src/render/ImportedCoolingStack.js'))).loadImportedCoolingStack(B));
    await tryLoad('cargoKit', async () => (await import(url('src/render/ImportedCargo.js'))).prepareImportedCargo(await parseGlb(file(B, 'cargo-kit.glb'))));
    await tryLoad('coveredFighter', async () => (await import(url('src/render/ImportedCoveredFighter.js'))).loadImportedCoveredFighter(B));
    await tryLoad('fuelDepot', async () => (await import(url('src/render/ImportedFuelDepot.js'))).loadImportedFuelDepot(B));
    await tryLoad('flakGun', async () => (await import(url('src/render/ImportedFlakGun.js'))).loadImportedFlakGun(B));
    await tryLoad('antenna', async () => (await import(url('src/render/ImportedAntenna.js'))).prepareImportedAntenna());
    await tryLoad('wreckage', async () => (await import(url('src/render/ImportedWreckage.js'))).loadImportedWreckage(B));
    carrier = await import(url('src/render/ImportedCarrier.js'));
    await tryLoad('carrier', async () => carrier.loadImportedCarrier(B));
  }
  const materials = stubMaterials();
  return {
    root, url, file, loaded, ...mod, Level, Utils, materials,
    sha: createHash('sha256').update(source).digest('hex'),
    make(seed, loop = 0) {
      const level = new Level.Level(seed, loop);
      if (loaded.carrier === true) carrier.prepareImportedCarrier(level);
      const fortress = new mod.Fortress(new THREE.Scene(), materials, level, { drawDistance: 560 });
      return { level, fortress };
    },
  };
}

/** Content hash + stats of one built chunk group: every mesh, attribute, emitter and guide surface. */
export function chunkDigest(group, fortress) {
  const h = createHash('sha256');
  let triangles = 0, bytes = 0, draws = 0;
  const byMaterial = {};
  const visit = (o, depth) => {
    for (const c of o.children) {
      if (c.isMesh) {
        const g = c.geometry;
        h.update(`mesh:${depth}:${c.material.name}:${c.castShadow}:${c.receiveShadow}:${c.frustumCulled}|`);
        h.update(Float32Array.from(c.matrix.elements));
        for (const name of Object.keys(g.attributes).sort()) { const a = g.attributes[name].array; h.update(name); h.update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)); bytes += a.byteLength; }
        const t = (g.index ? g.index.count : g.attributes.position.count) / 3;
        triangles += t; draws++;
        const key = (depth ? 'feature:' : '') + c.material.name;
        byMaterial[key] = (byMaterial[key] ?? 0) + t;
      } else { h.update(`group:${depth}|`); }
      visit(c, depth + 1);
    }
  };
  visit(group, 0);
  h.update(JSON.stringify(group.userData.deckSurfaces ?? null));
  if (fortress) h.update(JSON.stringify(fortress.emitters.filter((e) => e.owner === group).map(({ owner, ...e }) => e)));
  return { hash: h.digest('hex'), triangles, bytes, draws, byMaterial };
}

export function chunkIndices(level, CHUNK_LEN, filter = () => true) {
  const out = [];
  for (let i = 0; i * CHUNK_LEN < level.totalLength; i++) {
    const s = level.sectorAt(i * CHUNK_LEN + CHUNK_LEN / 2);
    if (s && filter(s)) out.push(i);
  }
  return out;
}

export { THREE };
