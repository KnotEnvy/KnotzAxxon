/**
 * Distant operational traffic: contracts.
 *
 * The traffic layer only adds background light. These tests hold it to that:
 * one small draw outside every chunk, a fixed layout that reads no seeded
 * stream, lanes that cannot cross a Classic sight line through the corridor
 * or sit inside the skyline band, no craft outside its own fortress sector,
 * nothing bright enough to bloom, and a single owner for the shared program.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Fortress, disposeFortressTemplates } from '../src/world/Fortress.js';
import { Level, CHUNK_LEN, CORRIDOR_HALF, ALT_MAX, DECK_HALF, SECTOR_KINDS } from '../src/world/Level.js';
import { CAMERA_MODES, QUALITY_PRESETS } from '../src/core/Settings.js';
import { SKY_PRESETS } from '../src/render/Sky.js';
import {
  AmbientTraffic, disposeAmbientTraffic, trafficCraft, trafficZ, trafficPeak,
  TRAFFIC_LOOKS, TRAFFIC_SPAN, TRAFFIC_BACK, TRAFFIC_EDGE, CLASSIC_BAND, NEAR_BAND, DEEP_BAND,
} from '../src/world/AmbientTraffic.js';
import { chunkDigest, stubMaterials } from './fixtures/chunk-digest.js';

const materials = stubMaterials(THREE);
const make = (seed = 7, loop = 0) => {
  const level = new Level(seed, loop), scene = new THREE.Scene();
  return { level, scene, fortress: new Fortress(scene, materials, level, QUALITY_PRESETS.high) };
};
const settle = (fortress, z, seconds = 4) => { for (let i = 0; i < seconds * 60; i++) fortress.traffic.update(fortress.level, z, 1 / 60); };

test('traffic is one indexed draw of 64 quads with a fixed, private layout', () => {
  const craft = trafficCraft();
  assert.equal(craft.length, 64);
  assert.deepEqual(trafficCraft(), craft, 'layout is a constant: no shared or level stream feeds it');
  const { fortress, scene } = make();
  const mesh = fortress.traffic.mesh, g = mesh.geometry;
  assert.equal(g.index.count / 3, 128, 'two triangles per craft');
  assert.equal(g.attributes.position.count, 256);
  const bytes = Object.values(g.attributes).reduce((n, a) => n + a.array.byteLength, 0) + g.index.array.byteLength;
  assert.ok(bytes <= 12 * 1024, `static buffers stay small (${bytes} B)`);
  assert.equal(mesh.parent, scene, 'the mesh is a scene child, never a chunk');
  assert.equal(fortress.root.children.length, 0);
  assert.equal(mesh.castShadow || mesh.receiveShadow, false);
  assert.equal(mesh.material.depthWrite, false);
  assert.equal(mesh.material.blending, THREE.AdditiveBlending);
  assert.ok(craft.every(c => Number.isInteger(c.speed) && c.speed !== 0), 'whole speeds let the clock wrap at the span');
  fortress.clear(); disposeFortressTemplates();
});

test('no lane can cross a Classic sight line through the flight corridor', () => {
  // The rule in the module header, re-derived from the shipped rig constants.
  const rig = CAMERA_MODES.classic;
  const eye = new THREE.Vector3(0, rig.height, -rig.dist).applyAxisAngle(new THREE.Vector3(0, 1, 0), rig.yaw * Math.PI / 180);
  const d = eye.clone().negate().normalize();
  assert.ok(Math.abs(d.x + d.y) < 1e-3 && Math.abs(d.x - d.z) < 1e-3, 'Classic looks along (+x, -y, +z)');
  assert.deepEqual(CLASSIC_BAND, [-(CORRIDOR_HALF + 1), CORRIDOR_HALF + 1 + ALT_MAX + 1]);
  const MARGIN = 18;
  for (const c of trafficCraft()) {
    // widest reach of the picture: light radius plus lateral jitter is already in x/y
    const k = c.x + c.y, r = c.radius * 2;
    assert.ok(k + r < CLASSIC_BAND[0] - MARGIN || k - r > CLASSIC_BAND[1] + MARGIN, `${c.family} lane at ${c.x.toFixed(0)},${c.y.toFixed(0)}`);
    // exact ray test against the corridor box grown by 8 units, for the real view direction
    let hit = false;
    for (let s = -400; s <= 400 && !hit; s += 0.5) {
      const x = c.x + d.x * s, y = c.y + d.y * s;
      hit = Math.abs(x) <= CORRIDOR_HALF + 9 && y >= -8 && y <= ALT_MAX + 9;
    }
    assert.equal(hit, false, `${c.family} craft stays off every corridor sight line`);
  }
});

test('lanes stay outside the playfield, the skyline masses and the landscape HUD blocks', () => {
  const craft = trafficCraft();
  for (const c of craft) {
    const k = c.x + c.y;
    assert.ok(Math.abs(c.x) > DECK_HALF + 7 + 12, 'outside the deck and both trench walls');
    if (c.family === 'near') {
      // near-side roofs and their beacons top out near y 8.1; the parapet at 3.2
      assert.ok(c.y - c.radius > 10, 'clear of the low near-side roofs');
      // k -30.8 is the near parapet's outer edge on the Classic screen; below k -43.3 a
      // lane would run under the lower-right HUD block of a 16:10 or 16:9 landscape frame
      assert.ok(k >= NEAR_BAND[0] && k <= NEAR_BAND[1], `near lane k ${k.toFixed(1)}`);
      assert.ok(k + c.radius * 1.5 < -30.8 - 3, 'drawn beyond the near parapet edge in Classic');
    } else if (c.family === 'deep') {
      // far towers end at y -60 and x 125 at their widest; nothing is built beyond
      assert.ok(c.x > 126 && c.y < -55);
      // above the lowest far-wall crest (k 61), under the upper-left HUD block (k 81.8)
      assert.ok(k >= DEEP_BAND[0] && k <= DEEP_BAND[1], `deep lane k ${k.toFixed(1)}`);
    } else {
      assert.ok(c.y > (c.x > 0 ? 90 : 30), 'sky lanes ride above the tallest towers on the far side, the low roofs on the near side');
      assert.ok(Math.abs(c.x) >= 90);
      if (c.x < 0) assert.ok(k < -34 - 12);
    }
  }
  // opposing lanes of one family never share a Classic screen line
  for (const family of ['near', 'deep']) {
    const ks = [...new Set(craft.filter(c => c.family === family).map(c => c.speed))]
      .map(speed => craft.filter(c => c.family === family && c.speed === speed).map(c => c.x + c.y));
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
      assert.ok(Math.min(...ks[i].flatMap(a => ks[j].map(b => Math.abs(a - b)))) > 0.4, `${family} lanes ${i} and ${j} keep apart`);
    }
  }
});

test('craft keep station through the clock wrap and never leave the lane window', () => {
  const craft = trafficCraft();
  for (const c of craft) {
    for (const focus of [0, 777.25, 11000]) {
      const before = trafficZ(c, TRAFFIC_SPAN - 1e-6, focus), after = trafficZ(c, 0, focus);
      const gap = Math.abs(before - after);
      assert.ok(Math.min(gap, TRAFFIC_SPAN - gap) < 1e-3, 'wrap is continuous');
      for (const tau of [0, 13.37, 241, 479.9]) {
        const z = trafficZ(c, tau, focus);
        assert.ok(z >= focus - TRAFFIC_BACK && z < focus - TRAFFIC_BACK + TRAFFIC_SPAN);
      }
    }
  }
  // lane mates share one speed: spacing inside a lane never changes
  const lanes = new Map();
  for (const c of craft) lanes.set(`${c.family}:${c.speed}`, [...(lanes.get(`${c.family}:${c.speed}`) ?? []), c]);
  assert.equal(lanes.size, 15);
  for (const mates of lanes.values()) {
    const n = mates.length;
    assert.ok(n === 4 || n === 5);
    const gaps = mates.map((c, i) => (mates[(i + 1) % n].z - c.z + TRAFFIC_SPAN) % TRAFFIC_SPAN);
    assert.ok(gaps.every(g => g > TRAFFIC_SPAN / n * 0.5), 'lane mates never bunch');
  }
});

test('only fortress sectors carry traffic; every look stays under the bloom gate', () => {
  const { level, fortress } = make();
  assert.equal(TRAFFIC_LOOKS.length, level.sectors.length);
  for (const s of level.sectors) {
    const look = AmbientTraffic.lookFor(s);
    assert.equal(!!look, s.kind === SECTOR_KINDS.FORTRESS, s.name);
    if (!look) continue;
    assert.ok(trafficPeak(look) < 1.02, `${s.name} cannot bloom`);
    assert.ok(look.density > 0 && look.density <= 1 && look.opacity <= 0.6);
  }
  // The opening sector is the calmest: fewest steady craft, no real strobe.
  const opening = TRAFFIC_LOOKS[0];
  assert.ok(trafficPeak(opening) <= 0.65 && opening.strobe <= 0.25 && opening.speed < 1);
  assert.ok(TRAFFIC_LOOKS.filter(Boolean).every(l => l === opening || l.density >= opening.density || l.strobe === 1));
  assert.equal(AmbientTraffic.lookFor({ kind: 'fortress' }), null, 'a sector without an extent gets none');
  assert.equal(AmbientTraffic.lookFor(null), null);
  fortress.clear(); disposeFortressTemplates();
});

test('lanes follow the sector under the ship and change only while dark', () => {
  const { level, fortress, scene } = make();
  const t = fortress.traffic, u = t.mesh.material.uniforms;
  const [outer, guns, gap] = level.sectors;
  scene.fog = new THREE.FogExp2(SKY_PRESETS.dusk.fog, SKY_PRESETS.dusk.fogDensity);
  assert.equal(t.mesh.visible, false);
  settle(fortress, outer.zStart + 400);
  assert.ok(Math.abs(u.uOpacity.value - TRAFFIC_LOOKS[0].opacity) < 0.01 && t.mesh.visible);
  assert.deepEqual(u.uRange.value.toArray(), [outer.zStart + TRAFFIC_EDGE, outer.zEnd - TRAFFIC_EDGE]);
  assert.equal(u.uFog.value, SKY_PRESETS.dusk.fogDensity);
  assert.equal(u.uDensity.value, TRAFFIC_LOOKS[0].density);

  // crossing into the next fortress sector: the old lanes fade before the new ones are set
  let swappedAt = null, last = u.uOpacity.value;
  for (let i = 0; i < 240; i++) {
    t.update(level, guns.zStart + 5, 1 / 60);
    if (swappedAt === null && u.uDensity.value === TRAFFIC_LOOKS[1].density) swappedAt = last;
    last = u.uOpacity.value;
  }
  assert.ok(swappedAt !== null && swappedAt < 0.02, 'sector swap happens below 2% opacity');
  assert.ok(Math.abs(u.uOpacity.value - TRAFFIC_LOOKS[1].opacity) < 0.02);
  assert.deepEqual(u.uRange.value.toArray(), [guns.zStart + TRAFFIC_EDGE, guns.zEnd - TRAFFIC_EDGE]);

  // open space: gone, and the range still belongs to the last fortress sector
  settle(fortress, gap.zStart + 300);
  assert.equal(t.mesh.visible, false);
  assert.ok(u.uOpacity.value < 0.01);
  assert.ok(u.uRange.value.y <= guns.zEnd - TRAFFIC_EDGE, 'no craft can be placed in open space');

  // the clock is bounded however long the session runs
  for (let i = 0; i < 2000; i++) t.update(level, outer.zStart + 400, 1);
  assert.ok(u.uTau.value >= 0 && u.uTau.value < TRAFFIC_SPAN);
  fortress.clear(); disposeFortressTemplates();
});

test('traffic changes no chunk, emitter, animation or obstacle', () => {
  const a = make(11), b = make(11);
  // b streams with traffic running hard; a never updates it
  for (let i = 0; i < 600; i++) b.fortress.traffic.update(b.level, i * 7, 1 / 60);
  for (const index of [0, 3, 12, 20, 40, 70]) {
    const ga = a.fortress._buildChunk(index), gb = b.fortress._buildChunk(index);
    assert.equal(chunkDigest(gb, b.fortress).digest('hex'), chunkDigest(ga, a.fortress).digest('hex'), `chunk ${index}`);
    a.fortress.chunks.set(index, ga); b.fortress.chunks.set(index, gb);
  }
  const strip = (f) => JSON.stringify(f.emitters.map(({ owner, ...e }) => e));
  assert.equal(strip(b.fortress), strip(a.fortress));
  assert.equal(b.fortress.animated.length, a.fortress.animated.length);
  assert.equal(b.fortress.rearObstacles.length, a.fortress.rearObstacles.length);
  assert.equal(b.fortress.root.children.length, a.fortress.root.children.length);
  a.fortress.clear(); b.fortress.clear(); disposeFortressTemplates();
});

test('streaming attaches the mesh, a reset detaches it, shutdown disposes the program once', () => {
  const { level, fortress, scene } = make();
  const mesh = fortress.traffic.mesh, { geometry, material } = mesh;
  let disposed = 0;
  geometry.addEventListener('dispose', () => disposed++);
  material.addEventListener('dispose', () => disposed++);

  fortress.update(200, 1 / 60, 1, 1);
  assert.equal(mesh.parent, scene);
  assert.equal(scene.children.filter(o => o === mesh).length, 1);
  fortress.clear();
  assert.equal(mesh.parent, null, 'a cleared fortress leaves nothing of its own in the scene but its root');
  assert.deepEqual(scene.children, [fortress.root]);
  assert.equal(mesh.visible, false);
  assert.equal(disposed, 0, 'a reset keeps the compiled program');

  fortress.update(200, 1 / 60, 2, 2);
  assert.equal(mesh.parent, scene, 'the next run re-attaches the same mesh');
  assert.equal(mesh.material, material);
  fortress.clear();

  disposeFortressTemplates();
  assert.equal(disposed, 2, 'geometry and material released with the fortress templates');
  disposeFortressTemplates(); disposeAmbientTraffic();
  assert.equal(disposed, 2, 'disposal is idempotent');

  // streaming after a shutdown rebuilds rather than drawing a disposed program
  fortress.update(200, 1 / 60, 3, 3);
  assert.notEqual(mesh.material, material);
  assert.equal(mesh.geometry.index.count, 384);
  fortress.clear(); disposeFortressTemplates();
});

test('a frame of traffic costs a few uniform writes and no allocation-heavy work', () => {
  const { level, fortress } = make();
  const t = fortress.traffic, before = t.mesh.geometry.attributes.position.version;
  const t0 = performance.now();
  const N = 20000;
  for (let i = 0; i < N; i++) t.update(level, 300 + i * 0.6, 1 / 60);
  const perCall = (performance.now() - t0) / N;
  assert.ok(perCall < 0.05, `update stays far below a frame slice (${(perCall * 1000).toFixed(2)} us)`);
  assert.equal(t.mesh.geometry.attributes.position.version, before, 'no vertex buffer is ever re-uploaded');
  fortress.clear(); disposeFortressTemplates();
});
