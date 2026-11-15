/**
 * Authored environment kit: contracts of the streamer integration.
 *
 * The kit only changes pictures. These tests hold it to that: the procedural
 * source is still reproduced exactly when the kit is absent, the seeded
 * streams and everything gameplay reads are unchanged when it is present, new
 * geometry stays out of the flight corridor and inside the solids it
 * replaces, and startup templates have a single owner.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Fortress } from '../src/world/Fortress.js';
import { Level, CHUNK_LEN, CORRIDOR_HALF, ALT_MAX, SECTOR_KINDS } from '../src/world/Level.js';
import { prepareEnvironmentKit, loadEnvironmentKit, disposeEnvironmentKit, environmentKitReady, environmentKitParts, kitPart, ENVIRONMENT_KIT_SIGNATURE } from '../src/world/EnvironmentKit.js';
import { chunkDigest, stubMaterials, GOLDEN_RUNS } from './fixtures/chunk-digest.js';

const golden = JSON.parse(readFileSync(new URL('./fixtures/fortress-source-golden.json', import.meta.url), 'utf8'));
const kitBytes = readFileSync(new URL('../public/models/environment/environment-kit.glb', import.meta.url));
const parseKit = () => new Promise((ok, fail) => new GLTFLoader().parse(kitBytes.buffer.slice(kitBytes.byteOffset, kitBytes.byteOffset + kitBytes.byteLength), '', ok, fail));
const loadKit = async () => prepareEnvironmentKit(await parseKit());   // true when accepted
const materials = stubMaterials(THREE);
const make = (seed, loop = 0) => { const level = new Level(seed, loop); return { level, fortress: new Fortress(new THREE.Scene(), materials, level, { drawDistance: 560 }) }; };
const chunksOf = (level) => { const out = []; for (let i = 0; i * CHUNK_LEN < level.totalLength; i++) { const s = level.sectorAt(i * CHUNK_LEN + CHUNK_LEN / 2); if (s) out.push([i, s]); } return out; };
const tris = (mesh) => mesh.geometry.attributes.position.count / 3;
const bytesOf = (mesh, name) => { const a = mesh.geometry.attributes[name].array; return Buffer.from(a.buffer, a.byteOffset, a.byteLength); };
const emittersOf = (fortress, group) => JSON.stringify(fortress.emitters.filter((e) => e.owner === group).map(({ owner, ...e }) => e));
/** Chunk-level meshes by bucket; obstacle (feature) groups separately, in feature order. */
const split = (group) => ({ chunk: new Map(group.children.filter((c) => c.isMesh).map((m) => [m.material.name, m])), features: group.children.filter((c) => !c.isMesh) });

/** Triangles (as rounded coordinate keys) with any corner inside a box. */
function trianglesIn(meshes, inside) {
  const out = new Map();
  for (const m of meshes) {
    const p = m.geometry.attributes.position.array;
    for (let i = 0; i < p.length; i += 9) {
      let hit = false;
      for (let k = 0; k < 9; k += 3) if (inside(p[i + k], p[i + k + 1], p[i + k + 2])) { hit = true; break; }
      if (!hit) continue;
      const key = `${m.material.name}:` + Array.from(p.subarray(i, i + 9), (v) => v.toFixed(3)).join(',');
      out.set(key, (out.get(key) ?? 0) + 1);
    }
  }
  return out;
}

test('without the kit every streamed chunk is the pre-kit procedural source, byte for byte', () => {
  assert.equal(environmentKitReady(), false);
  let chunks = 0;
  for (const [seed, loop] of GOLDEN_RUNS) {
    const { level, fortress } = make(seed, loop);
    const hashes = level.sectors.map(() => createHash('sha256'));
    for (const [i, s] of chunksOf(level)) { chunkDigest(fortress._buildChunk(i), fortress, hashes[s.index]); chunks++; }
    assert.deepEqual(hashes.map((h) => h.digest('hex')), golden.runs[`${seed}:${loop}`], `seed ${seed} loop ${loop}`);
    fortress.clear();
  }
  assert.equal(chunks, golden.chunks);
});

test('with the kit the seeded streams, emitters, guide surfaces and untouched layers are unchanged', async () => {
  const stats = { chunks: 0, gateHull: 0 };
  for (const [seed, loop] of [[7, 0], [42, 1]]) {
    disposeEnvironmentKit();
    const a = make(seed, loop);
    const source = new Map();
    for (const [i] of chunksOf(a.level)) { const g = a.fortress._buildChunk(i); source.set(i, { g, emitters: emittersOf(a.fortress, g) }); }
    await loadKit();
    const b = make(seed, loop);
    assert.deepEqual(b.level.features.map(({ runtime, ...f }) => f), a.level.features.map(({ runtime, ...f }) => f), 'level plan is independent of the kit');
    for (const [i, sector] of chunksOf(b.level)) {
      const g = b.fortress._buildChunk(i), ref = source.get(i);
      const where = `seed ${seed} loop ${loop} chunk ${i} (${sector.name})`;
      // Every emitter record carries a fresh seeded draw, so equality proves the stream never diverged.
      assert.equal(emittersOf(b.fortress, g), ref.emitters, `${where}: emitters`);
      assert.deepEqual(g.userData.deckSurfaces, ref.g.userData.deckSurfaces, `${where}: guide surfaces`);
      const k = split(g), s = split(ref.g);
      // Layers the kit never writes: painted markings everywhere; the deck in fortress and boss sectors;
      // chunk lighting in open space (platform, truss and wreck lights follow the rock and prop draws).
      const same = sector.kind === SECTOR_KINDS.SPACE ? ['paint', 'neon', 'hull'] : ['paint', 'deck'];
      for (const key of same) {
        assert.equal(k.chunk.has(key), s.chunk.has(key), `${where}: ${key} presence`);
        if (k.chunk.has(key)) for (const attr of ['position', 'color']) assert.ok(bytesOf(k.chunk.get(key), attr).equals(bytesOf(s.chunk.get(key), attr)), `${where}: ${key}.${attr}`);
      }
      // Debris gates: plates and burning edges are drawn after the rocks, so they prove draw order through the rock swap.
      assert.equal(k.features.length, s.features.length, `${where}: obstacle count`);
      const feats = b.level.features.filter((f) => f.z >= i * CHUNK_LEN && f.z < (i + 1) * CHUNK_LEN && ['wall', 'arch', 'gate', 'fence'].includes(f.kind));
      feats.forEach((f, n) => {
        if (!(f.kind === 'wall' && f.debris)) return;
        const pick = (grp, name) => grp.children.find((m) => m.material.name === name);
        for (const key of ['hull', 'neon']) assert.ok(bytesOf(pick(k.features[n], key), 'position').equals(bytesOf(pick(s.features[n], key), 'position')), `${where}: debris gate ${key}`);
        assert.ok(tris(pick(k.features[n], 'rock')) < tris(pick(s.features[n], 'rock')) * 0.6, `${where}: debris rocks are cheaper`);
        stats.gateHull++;
      });
      stats.chunks++;
    }
    a.fortress.clear(); b.fortress.clear();
  }
  assert.ok(stats.chunks > 200 && stats.gateHull > 0);
  disposeEnvironmentKit();
});

test('kit geometry stays out of the flight corridor and off the far shoulder', async () => {
  const lane = (x, y) => Math.abs(x) <= CORRIDOR_HALF + 1 && y >= 0.3 && y <= ALT_MAX + 1;
  // Between the corridor and the far wall line: props only. The kit's own wall structure starts at x 25.7.
  const farShoulder = (x, y) => x > CORRIDOR_HALF + 1 && x < 25.69 && y >= 0.3;
  const nearSide = (x, y) => x < -(CORRIDOR_HALF + 1) && y >= 0.3;
  for (const [seed, loop] of [[7, 0], [3, 1]]) {
    disposeEnvironmentKit();
    const a = make(seed, loop);
    const source = new Map(chunksOf(a.level).map(([i]) => [i, a.fortress._buildChunk(i)]));
    await loadKit();
    const b = make(seed, loop);
    for (const [i, sector] of chunksOf(b.level)) {
      if (sector.kind === SECTOR_KINDS.SPACE) continue;     // open space: containment is checked on the templates below
      const g = b.fortress._buildChunk(i);
      const all = (grp) => { const out = []; grp.traverse((o) => { if (o.isMesh && o.material.name !== 'forceField') out.push(o); }); return out; };
      const where = `seed ${seed} loop ${loop} chunk ${i} (${sector.name})`;
      const kLane = trianglesIn(all(g), lane), sLane = trianglesIn(all(source.get(i)), lane);
      for (const key of kLane.keys()) assert.ok(sLane.has(key), `${where}: new triangle in the corridor: ${key}`);
      if (sector.kind !== SECTOR_KINDS.FORTRESS) continue;
      const chunkMeshes = (grp) => grp.children.filter((c) => c.isMesh);
      const coords = (key) => key.slice(key.indexOf(':') + 1).split(',').map(Number);
      // Sector-edge launch pylons are re-cut inside their source 3 x h x 3 boxes (x +-23.5..26.5, 3 m in from the lip).
      const z0 = i * CHUNK_LEN, z1 = z0 + CHUNK_LEN, space = (z) => b.level.sectorAt(z)?.kind === SECTOR_KINDS.SPACE;
      const pylonZ = [space(z1 + CHUNK_LEN / 2) ? z1 - 3 : null, z0 > 0 && space(z0 - CHUNK_LEN / 2) ? z0 + 3 : null].filter((z) => z !== null);
      const inPylon = (key) => { const v = coords(key); return [0, 3, 6].every((n) => Math.abs(Math.abs(v[n]) - 25) <= 1.501 && pylonZ.some((z) => Math.abs(v[n + 2] - z) <= 1.501)); };
      const sFar = trianglesIn(chunkMeshes(source.get(i)), farShoulder);
      // Reactor Spine reuses the approved cooling stack beside its bastion (x 21.2..25.4, as the source places stacks).
      if (sector.index !== 3) for (const key of trianglesIn(chunkMeshes(g), farShoulder).keys()) assert.ok(sFar.has(key) || inPylon(key), `${where}: new triangle on the far shoulder: ${key}`);
      // Near side: anything new is the parapet, carved inside the source box x -34..-27, y 0..3.2.
      const sNear = trianglesIn(chunkMeshes(source.get(i)), nearSide);
      for (const key of trianglesIn(chunkMeshes(g), nearSide).keys()) {
        if (sNear.has(key) || inPylon(key)) continue;
        const v = coords(key);
        for (let n = 0; n < 9; n += 3) assert.ok(v[n] >= -34.001 && v[n] <= -26.999 && v[n + 1] >= -0.001 && v[n + 1] <= 3.201, `${where}: near parapet leaves the source box: ${key}`);
      }
    }
    a.fortress.clear(); b.fortress.clear();
  }
  disposeEnvironmentKit();
});

test('gate, fence, platform, arena and rock parts fit inside the source solids they replace', async () => {
  await loadKit();
  const box = (name) => { const g = kitPart(name); g.computeBoundingBox(); return g.boundingBox; };
  const within = (name, lo, hi) => {
    const b = box(name), e = 1e-3;
    assert.ok(b.min.x >= lo[0] - e && b.min.y >= lo[1] - e && b.min.z >= lo[2] - e && b.max.x <= hi[0] + e && b.max.y <= hi[1] + e && b.max.z <= hi[2] + e,
      `${name} ${JSON.stringify([b.min.toArray(), b.max.toArray()])} outside ${JSON.stringify([lo, hi])}`);
  };
  // coolant gate ornament: source coil rings (x 24.15..27.45, 0.7 tall, z +-1.95) and lintel (x +-27, y 35..36.6, z +-1.7)
  within('RS_GateHousing.collar', [24.15, 0, -1.95], [27.45, 0.7, 1.95]);
  within('RS_GateHousing.emitter', [24.15, 0, -1.95], [27.45, 0.7, 1.95]);
  within('RS_GateHousing.truss', [-27, 35, -1.7], [27, 36.6, 1.7]);
  within('RS_GateHousing.manifold', [-27, 35, -1.7], [27, 36.6, 1.7]);
  within('RS_GateHousing.lamp_arm', [-0.3, 35, -1.7], [0.3, 36.6, 1.7]);
  // electric fence pylon: column 2.6 square, base 3.6 x 1.2 x 3.6, coil plate 3.4 x 0.5 x 3.4, glow 3.5 x 0.2 x 3.5 at +0.15
  within('SK_Fence.column', [-1.3, 0, -1.3], [1.3, 1, 1.3]);
  within('SK_Fence.base', [-1.8, 0, -1.8], [1.8, 1.2, 1.8]);
  within('SK_Fence.insulator', [-1.7, 0, -1.7], [1.7, 0.5, 1.7]);
  within('SK_Fence.insulator_glow', [-1.75, 0.15, -1.75], [1.75, 0.35, 1.75]);
  // floating platform: deck 16 x 2.4 x 16, skirt 17.5 x 0.5 x 17.5, strut 2 x 6 x 2, thruster 1.6 x 1.2 x 1.6
  within('SP_Platform.deck', [-8, 0, -8], [8, 2.4, 8]);
  within('SP_Platform.skirt', [-8.75, -0.5, -8.75], [8.75, 0, 8.75]);
  within('SP_Platform.strut', [-1, -6.2, -1], [1, -0.2, 1]);
  within('SP_Platform.nacelle', [-0.8, -1.6, -0.8], [0.8, -0.4, 0.8]);
  assert.ok(Math.abs(box('SP_Platform.deck').max.y - 2.4) < 1e-5, 'platform top face is the source plane');
  within('SP_Truss.bay', [-1.5, 0, -8], [1.5, 3, 8]);
  // boss arena: buttress 8 square, coil plate 9 x 0.6 x 9, near block 8 x 3.2 x 8, throat wall face x 41
  for (const name of ['pier_base', 'pier_shaft', 'pier_fins', 'pier_crown']) within(`BA_Arena.${name}`, [-4, 0, -4], [4, 5, 4]);
  within('BA_Arena.coil', [-4.5, 0, -4.5], [4.5, 0.6, 4.5]);
  within('BA_Arena.near_block', [-4, 0, -4], [4, 3.2, 4]);
  within('BA_Arena.throat_rib', [41, 0, -1], [41.5, 1, 1]);
  within('BA_Arena.throat_band', [41, -0.5, -0.5], [41.5, 0.5, 0.5]);
  // sector-edge launch pylons 3 x h x 3; everything else on the bulkhead is below deck level
  within('SE_Bulkhead.pylon_shaft', [-1.5, 0, -1.5], [1.5, 1, 1.5]);
  within('SE_Bulkhead.pylon_band', [-1.5, 0, -1.5], [1.5, 0.5, 1.5]);
  for (const name of ['ribs', 'corbel', 'catwalk', 'launch_rail', 'rail_lamp']) assert.ok(box(`SE_Bulkhead.${name}`).max.y <= -1.35, `${name} stays under the deck lip`);
  // debris rocks: the eroded source rock reaches 1.07 r before its seeded axis scales
  for (const letter of 'abcdef') {
    const p = kitPart(`SK_Rock.rock_${letter}`).attributes.position.array;
    let r = 0; for (let i = 0; i < p.length; i += 3) r = Math.max(r, Math.hypot(p[i], p[i + 1], p[i + 2]));
    assert.ok(r <= 1.0001 && r > 0.8, `rock_${letter} radius ${r}`);
  }
  // far-wall structure never comes nearer the lane than the source ledge (x 25.7)
  for (const [name, g] of environmentKitParts()) {
    if (!/^(RS_(WallFrame|Gallery|ServiceBay|ExhaustTrunk|ReactorCore)|AF_|GB_|IC_|TG_)/.test(name)) continue;
    g.computeBoundingBox();
    if (g.boundingBox.min.x < 20) continue;       // local-origin parts (spinners, beacons) are stamped at x >= 28
    assert.ok(g.boundingBox.min.x >= 25.7, `${name} reaches x ${g.boundingBox.min.x}`);
  }
  disposeEnvironmentKit();
});

test('coolant gates keep their source planes, posts, motion and runtime state under the authored housing', async () => {
  disposeEnvironmentKit();
  const a = make(7, 0);
  const gates = a.level.features.filter((f) => f.kind === 'gate');
  assert.ok(gates.length >= 4);
  const describe = (fortress, level) => gates.map((_, n) => {
    const f = level.features.filter((x) => x.kind === 'gate')[n];
    const group = fortress._buildChunk(Math.floor(f.z / CHUNK_LEN));
    const obstacle = group.children.filter((c) => !c.isMesh).find((o) => o.children.some((m) => m.material.name === 'forceField'));
    f.runtime.update(1 / 60, 2.5);
    return {
      planes: obstacle.children.filter((m) => m.material.name === 'forceField').map((m) => [m.position.toArray(), m.scale.toArray()]),
      posts: obstacle.children.filter((m) => m.geometry.type === 'BoxGeometry').map((m) => m.position.toArray()),
      gap: [f.runtime.gapY, f.runtime.gapH], animated: fortress.animated.length, rear: fortress.rearObstacles.length,
      lamps: [...new Set(Array.from(obstacle.children.find((m) => m.material.name === 'neon').geometry.attributes.aAnim.array).map((v) => v.toFixed(4)))].sort().join(' '),
    };
  });
  const source = describe(a.fortress, a.level);
  await loadKit();
  const b = make(7, 0);
  const kit = describe(b.fortress, b.level);
  for (let n = 0; n < gates.length; n++) {
    assert.deepEqual(kit[n].planes, source[n].planes); assert.deepEqual(kit[n].posts, source[n].posts);
    assert.deepEqual(kit[n].gap, source[n].gap); assert.equal(kit[n].animated, source[n].animated); assert.equal(kit[n].rear, source[n].rear);
    assert.equal(kit[n].lamps, source[n].lamps, 'emitter and chase-lamp animation tuples are the source tuples');
  }
  a.fortress.clear(); b.fortress.clear(); disposeEnvironmentKit();
});

test('fans keep source pivots and spin rates; authored spinners are the only additions', async () => {
  disposeEnvironmentKit();
  const tuples = (fortress, level, index) => {
    const out = new Set();
    for (const [i, s] of chunksOf(level)) {
      if (s.index !== index) continue;
      const mesh = fortress._buildChunk(i).children.find((c) => c.isMesh && c.material.name === 'spin');
      if (!mesh) continue;
      const P = mesh.geometry.attributes.aPivot.array, S = mesh.geometry.attributes.aSpin.array;
      for (let v = 0; v < P.length / 3; v++) out.add([P[v * 3], P[v * 3 + 1], P[v * 3 + 2], S[v * 4], S[v * 4 + 1], S[v * 4 + 2], S[v * 4 + 3]].map((n) => n.toFixed(4)).join(','));
    }
    return out;
  };
  for (const index of [0, 1, 3, 5, 6]) {
    disposeEnvironmentKit();
    const a = make(11, 0); const source = tuples(a.fortress, a.level, index);
    await loadKit();
    const b = make(11, 0); const kit = tuples(b.fortress, b.level, index);
    let fans = 0, extra = 0;
    for (const t of kit) {
      if (source.has(t)) { fans++; continue; }
      const rate = Math.abs(Number(t.split(',')[6]));
      assert.ok([0.9, 0.25, 1.6].some((r) => Math.abs(rate - r) < 1e-3) && Number(t.split(',')[4]) === 1, `sector ${index}: unexpected spinner ${t}`);
      assert.ok(Number(t.split(',')[0]) >= 28, 'landmark spinners turn behind the wall line');
      extra++;
    }
    assert.ok(fans > 20 && extra <= 1, `sector ${index}: ${fans} source tuples kept, ${extra} landmark spinner`);
    a.fortress.clear(); b.fortress.clear();
  }
  disposeEnvironmentKit();
});

test('kit cost stays inside the measured budgets and adds no draw calls', async () => {
  const BUDGET = { 0: 2000, 1: 2000, 3: 3500, 5: 2500, 6: 2500, 7: 5000 };   // added triangles per chunk, mean
  const count = (fortress, level) => {
    const by = {};
    for (const [i, s] of chunksOf(level)) {
      const g = fortress._buildChunk(i); let t = 0, d = 0;
      g.traverse((o) => { if (o.isMesh) { t += tris(o); d++; } });
      const r = (by[s.index] ??= { chunks: 0, triangles: 0, draws: 0, max: 0 }); r.chunks++; r.triangles += t; r.draws += d; r.max = Math.max(r.max, t);
    }
    return by;
  };
  disposeEnvironmentKit();
  const a = make(5, 0); const source = count(a.fortress, a.level);
  await loadKit();
  const b = make(5, 0); const kit = count(b.fortress, b.level);
  for (const [index, budget] of Object.entries(BUDGET)) {
    const added = (kit[index].triangles - source[index].triangles) / kit[index].chunks;
    assert.ok(added > 0 && added <= budget, `sector ${index}: +${added.toFixed(0)} triangles per chunk (budget ${budget})`);
    assert.ok(kit[index].draws <= source[index].draws, `sector ${index}: draw objects ${kit[index].draws} vs ${source[index].draws}`);
  }
  for (const index of [2, 4]) {
    // open space: platforms and truss bays add a little, debris gates (proved cheaper above) take far more away
    const added = (kit[index].triangles - source[index].triangles) / kit[index].chunks;
    assert.ok(added <= 700, `space sector ${index}: +${added.toFixed(0)} triangles per chunk`);
    assert.ok(kit[index].draws <= source[index].draws);
  }
  a.fortress.clear(); b.fortress.clear(); disposeEnvironmentKit();
});

test('kit templates have one owner: chunk retirement never disposes them, shutdown disposes each once', async () => {
  await loadKit();
  const counts = new Map();
  for (const [name, g] of environmentKitParts()) { counts.set(name, 0); g.addEventListener('dispose', () => counts.set(name, counts.get(name) + 1)); }
  assert.ok(counts.size > 150);
  const { level, fortress } = make(9, 0);
  const chunkGeometry = new Map();
  let built = 0;
  for (const [i] of chunksOf(level)) {
    const g = fortress._buildChunk(i); fortress.chunks.set(i, g); built++;
    g.traverse((o) => {
      if (!o.isMesh || chunkGeometry.has(o.geometry)) return;
      chunkGeometry.set(o.geometry, 0);
      o.geometry.addEventListener('dispose', () => chunkGeometry.set(o.geometry, chunkGeometry.get(o.geometry) + 1));
    });
  }
  fortress.clear();
  assert.ok(chunkGeometry.size > 500 && [...chunkGeometry.values()].every((n) => n >= 1), 'every chunk geometry is released on retirement');
  assert.ok(![...environmentKitParts().values()].some((g) => chunkGeometry.has(g)), 'no chunk mesh borrows a template geometry');
  assert.equal(fortress.root.children.length, 0);
  assert.ok([...counts.values()].every((n) => n === 0), 'no template disposed by chunk retirement');
  assert.equal(fortress.emitters.length + fortress.animated.length + fortress.rearObstacles.length, 0);
  disposeEnvironmentKit();
  assert.ok([...counts.values()].every((n) => n === 1), 'each template disposed exactly once');
  assert.equal(environmentKitReady(), false);
  disposeEnvironmentKit();
  assert.ok([...counts.values()].every((n) => n === 1), 'disposal is idempotent');
  assert.throws(() => kitPart('RS_WallFrame.plinth'), /Unknown environment kit part/);
  // the procedural source streams again once the kit is gone
  const again = make(9, 0);
  assert.ok(again.fortress._buildChunk(Math.floor((again.level.sectors[3].zStart + 400) / CHUNK_LEN)).children.length > 0);
  again.fortress.clear();
  assert.ok(built > 100);
});

test('the shipped kit file is well formed: named parts, identity transforms, buckets the streamer owns', async () => {
  const gltf = await parseKit();
  const names = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => { if (o.isMesh) names.push(o.name); });
  assert.equal(new Set(names).size, names.length, 'part names are unique');
  assert.ok(names.every((n) => /^[A-Z]{2}_[A-Za-z]+__[a-z0-9_]+$/.test(n)), 'Module__part naming');
  await loadKit();
  const BUCKETS = new Set(['hull', 'deck', 'dark', 'grate', 'hazard', 'neon', 'spin', 'rock']);
  let triangles = 0;
  for (const [name, g] of environmentKitParts()) {
    const k = g.userData.kit;
    assert.ok(BUCKETS.has(k.bucket), `${name}: bucket ${k.bucket}`);
    assert.ok(Number.isFinite(k.tint) && k.uvScale > 0 && k.gain > 0, `${name}: metadata`);
    assert.deepEqual(Object.keys(g.attributes).sort(), ['normal', 'position'], `${name}: position + normal only`);
    assert.ok(Array.from(g.attributes.position.array).every(Number.isFinite), `${name}: finite positions`);
    triangles += k.triangles;
  }
  assert.equal(environmentKitParts().size, names.length);
  assert.deepEqual([names.length, triangles], ENVIRONMENT_KIT_SIGNATURE, 'the shipped file is the kit the composers were written against');
  disposeEnvironmentKit();
});

test('a stale or partial kit file is rejected and the procedural source streams instead', async () => {
  const gltf = await parseKit();
  const victim = gltf.scene.getObjectByName('RS_WallFrame__plinth');
  victim.parent.remove(victim); victim.geometry.dispose();
  const warn = console.warn; const warnings = [];
  console.warn = (m) => warnings.push(String(m));
  let accepted;
  try { accepted = prepareEnvironmentKit(gltf); } finally { console.warn = warn; }
  assert.equal(accepted, false);
  assert.equal(environmentKitReady(), false);
  assert.equal(environmentKitParts().size, 0, 'rejected templates are released');
  assert.match(warnings[0], /Environment kit rejected/);
  const { level, fortress } = make(7, 0);
  const hash = createHash('sha256'), ref = createHash('sha256');
  const i = Math.floor((level.sectors[3].zStart + 400) / CHUNK_LEN);
  chunkDigest(fortress._buildChunk(i), fortress, hash);
  fortress.clear();
  chunkDigest(fortress._buildChunk(i), fortress, ref);
  assert.equal(hash.digest('hex'), ref.digest('hex'));
  fortress.clear();
  // a file that cannot be fetched or parsed is a warning, never a failed boot
  console.warn = (m) => warnings.push(String(m));
  let loaded;
  try { loaded = await loadEnvironmentKit({ loadAsync: async () => { throw new Error('404'); } }, '/models/environment/'); } finally { console.warn = warn; }
  assert.equal(loaded, false);
  assert.equal(environmentKitReady(), false);
  assert.match(warnings.at(-1), /Environment kit unavailable/);
  assert.equal(await loadKit(), true, 'the real file is accepted afterwards');
  disposeEnvironmentKit();
});

test('a malformed kit releases loader resources and partial templates before falling back', async () => {
  const gltf = await parseKit();
  const geometries = new Map(), materials = new Map();
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    if (!geometries.has(o.geometry)) {
      geometries.set(o.geometry, 0);
      o.geometry.addEventListener('dispose', () => geometries.set(o.geometry, geometries.get(o.geometry) + 1));
    }
    for (const m of [].concat(o.material ?? [])) if (!materials.has(m)) {
      materials.set(m, 0);
      m.addEventListener('dispose', () => materials.set(m, materials.get(m) + 1));
    }
  });
  const victim = gltf.scene.children.at(-1);
  victim.position.x += 1;
  const original = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await loadEnvironmentKit({ loadAsync: async () => gltf }, '/models/'), false);
    assert.equal(environmentKitReady(), false);
    assert.equal(environmentKitParts().size, 0);
    assert.ok([...geometries.values()].every(n => n === 1), 'all original geometries released exactly once');
    assert.ok([...materials.values()].every(n => n === 1), 'all original materials released exactly once');
    assert.equal(gltf.scene.children.length, 0);
  } finally { console.warn = original; disposeEnvironmentKit(); }
});
