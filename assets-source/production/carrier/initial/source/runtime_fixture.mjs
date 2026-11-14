import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';

const folder = path.dirname(fileURLToPath(import.meta.url));
const assetRoot = path.resolve(folder, '..');
const gameRoot = path.resolve(assetRoot, '../../..');
const CHUNK = 96;
const WIDTHS = { position: 3, normal: 3, uv: 2, color: 3, aAnim: 3, aPivot: 3, aSpin: 4 };

function runtimeNeonGain(record) {
  if (record.role === 'catapult-effect') return 1.3;
  if (record.role === 'stern-effect') return 1.1;
  if (record.name.includes('red-strobe')) return 1.6;
  if (record.role === 'island-effect') return 1.05;
  if (record.name.includes('cyan-depth')) return 0.8;
  if (record.role === 'hangar-effect') return 1.15;
  return 1;
}

export function consumeCarrierRng(rng, z0, sector) {
  const start = (sector.zStart ?? 0) + 160;
  const lower = Math.max(z0, start), upper = Math.min(z0 + CHUNK, start + 980);
  for (let station = lower; station < upper; station += 16) {
    const center = station + Math.min(16, upper - station) / 2;
    if (Math.floor(center / 16) % 3 === 0) {
      for (let window = 0; window < 4; window++) {
        rng.range(-4, 4);
        rng.bool(0.7);
      }
    }
  }
}

export function loadTemplate(directory = assetRoot) {
  const document = JSON.parse(fs.readFileSync(path.join(directory, 'carrier-template.json')));
  const bytes = fs.readFileSync(path.join(directory, document.binary));
  const buckets = new Map();
  for (const bucket of document.buckets) {
    const arrays = {};
    for (const [name, attribute] of Object.entries(bucket.attributes)) {
      arrays[name] = new Float32Array(attribute.count);
      for (let index = 0; index < attribute.count; index++) arrays[name][index] = bytes.readFloatLE(attribute.byteOffset + index * 4);
    }
    const period = new Float32Array(bucket.vertices);
    const runtimeGain = new Float32Array(bucket.vertices).fill(1);
    for (const record of document.parts.filter(record => record.bucket === bucket.key && record.phase_period)) period.fill(record.phase_period, record.firstVertex, record.firstVertex + record.vertexCount);
    if (bucket.key === 'neon') {
      for (const record of document.parts.filter(record => record.bucket === 'neon')) runtimeGain.fill(runtimeNeonGain(record), record.firstVertex, record.firstVertex + record.vertexCount);
    }
    buckets.set(bucket.key, { arrays, period, runtimeGain });
  }
  return { document, buckets };
}

function interpolate(first, second, fraction) {
  return Object.fromEntries(Object.keys(first).map(key => [key, first[key].map((value, index) => value + (second[key][index] - value) * fraction)]));
}

function clipPlane(polygon, plane, above) {
  const result = [];
  if (!polygon.length) return result;
  for (let index = 0; index < polygon.length; index++) {
    const first = polygon[index], second = polygon[(index + 1) % polygon.length];
    const firstDistance = first.position[2] - plane, secondDistance = second.position[2] - plane;
    const firstInside = above ? firstDistance >= 0 : firstDistance <= 0;
    const secondInside = above ? secondDistance >= 0 : secondDistance <= 0;
    if (firstInside) result.push(first);
    if (firstInside !== secondInside) {
      const vertex = interpolate(first, second, firstDistance / (firstDistance - secondDistance));
      vertex.position[2] = plane;
      result.push(vertex);
    }
  }
  return result;
}

function areaSquared(triangle) {
  const edgeA = triangle[1].position.map((value, index) => value - triangle[0].position[index]);
  const edgeB = triangle[2].position.map((value, index) => value - triangle[0].position[index]);
  return (edgeA[1] * edgeB[2] - edgeA[2] * edgeB[1]) ** 2 + (edgeA[2] * edgeB[0] - edgeA[0] * edgeB[2]) ** 2 + (edgeA[0] * edgeB[1] - edgeA[1] * edgeB[0]) ** 2;
}

function appendTriangle(output, triangle) {
  if (areaSquared(triangle) < 1e-14) return;
  for (const vertex of triangle) {
    for (const [name, values] of Object.entries(vertex)) output[name].push(...values);
  }
}

export function prepareModules(template, landmarkStart) {
  const modules = new Map();
  for (const [key, bucket] of template.buckets) {
    const count = bucket.arrays.position.length / 3;
    for (let vertexOffset = 0; vertexOffset < count; vertexOffset += 3) {
      const triangle = [];
      for (let corner = 0; corner < 3; corner++) {
        const vertexIndex = vertexOffset + corner;
        const vertex = {};
        for (const [name, values] of Object.entries(bucket.arrays)) vertex[name] = Array.from(values.subarray(vertexIndex * WIDTHS[name], (vertexIndex + 1) * WIDTHS[name]));
        vertex.position[2] += landmarkStart;
        if (vertex.aPivot) vertex.aPivot[2] += landmarkStart;
        if (vertex.aAnim && bucket.period[vertexIndex]) vertex.aAnim[2] = ((vertex.aAnim[2] - landmarkStart / bucket.period[vertexIndex]) % 1 + 1) % 1;
        if (vertex.aAnim) vertex.color = vertex.color.map(value => value * bucket.runtimeGain[vertexIndex]);
        triangle.push(vertex);
      }
      const minimum = Math.min(...triangle.map(vertex => vertex.position[2]));
      const maximum = Math.max(...triangle.map(vertex => vertex.position[2]));
      const first = Math.floor(minimum / CHUNK), last = Math.floor(maximum / CHUNK);
      for (let chunkIndex = first; chunkIndex <= last; chunkIndex++) {
        const polygon = clipPlane(clipPlane(triangle, chunkIndex * CHUNK, true), (chunkIndex + 1) * CHUNK, false);
        if (polygon.length < 3) continue;
        if (!modules.has(chunkIndex)) modules.set(chunkIndex, new Map());
        const module = modules.get(chunkIndex);
        if (!module.has(key)) module.set(key, Object.fromEntries(Object.keys(bucket.arrays).map(name => [name, []])));
        const output = module.get(key);
        for (let index = 1; index < polygon.length - 1; index++) appendTriangle(output, [polygon[0], polygon[index], polygon[index + 1]]);
      }
    }
  }
  for (const [index, module] of modules) {
    for (const [key, arrays] of module) {
      if (!arrays.position.length) { module.delete(key); continue; }
      module.set(key, Object.fromEntries(Object.entries(arrays).map(([name, values]) => [name, new Float32Array(values)])));
    }
    if (!module.size) modules.delete(index);
  }
  return modules;
}

export function appendPreparedModule(batch, module) {
  if (!module) return;
  const fields = { position: 'pos', normal: 'nrm', uv: 'uv', color: 'col', aAnim: 'anim', aPivot: 'pivot', aSpin: 'spin' };
  for (const [key, arrays] of module) {
    const count = arrays.position.length / 3;
    const target = batch._bucket(key);
    target.reserve(count);
    for (const [name, values] of Object.entries(arrays)) {
      const buffer = target[fields[name]];
      assert(buffer);
      buffer.a.set(values, buffer.n);
      buffer.n += values.length;
    }
  }
}

function geometryFromArrays(arrays) {
  const geometry = new THREE.BufferGeometry();
  for (const [name, values] of Object.entries(arrays)) geometry.setAttribute(name, new THREE.BufferAttribute(values.slice(), WIDTHS[name]));
  geometry.computeBoundingSphere();
  return geometry;
}

function boundarySegments(module, plane) {
  const segments = new Set();
  for (const [key, arrays] of module) {
    const positions = arrays.position;
    for (let offset = 0; offset < positions.length; offset += 9) {
      for (const [begin, end] of [[0, 1], [1, 2], [2, 0]]) {
        const first = Array.from(positions.subarray(offset + begin * 3, offset + begin * 3 + 3));
        const second = Array.from(positions.subarray(offset + end * 3, offset + end * 3 + 3));
        if (Math.abs(first[2] - plane) > 0.002 || Math.abs(second[2] - plane) > 0.002) continue;
        if (first.every((value, index) => Math.abs(value - second[index]) < 0.00001)) continue;
        const label = [first, second].map(point => point.map(value => Math.round(value * 1000)).join(',')).sort().join('|');
        segments.add(key + ':' + label);
      }
    }
  }
  return segments;
}

function gain(anim, time) {
  const cycle = ((time * anim[1] + anim[2]) % 1 + 1) % 1;
  const smooth = (minimum, maximum, value) => { const level = Math.min(1, Math.max(0, (value - minimum) / (maximum - minimum))); return level * level * (3 - 2 * level); };
  if (anim[0] < 0.5) return 1;
  if (anim[0] < 1.5) return 0.08 + 1.45 * smooth(0, 0.03, cycle) * (1 - smooth(0.12, 0.2, cycle));
  if (anim[0] < 2.5) return 0.18 + 1.35 * cycle ** 6;
  if (anim[0] < 3.5) return 0.55 + 0.45 * Math.sin(cycle * 6.2832);
  const raw = Math.sin(Math.floor(time * anim[1] * 7 + anim[2] * 91) * 12.9898) * 43758.5453;
  return raw - Math.floor(raw) > 0.22 ? 1 : 0.25;
}

function spinPosition(position, pivot, spin, time) {
  return new THREE.Vector3(...position).sub(new THREE.Vector3(...pivot)).applyAxisAngle(new THREE.Vector3(...spin.slice(0, 3)), spin[3] * time).add(new THREE.Vector3(...pivot)).toArray();
}

function ranges(modules, drawDistance) {
  let maxVisibleTriangles = 0, maxRetainedTriangles = 0, maxVisiblePrimitives = 0, maxRetainedPrimitives = 0;
  let worstVisible = null, worstRetained = null;
  for (let playerZ = 6300; playerZ <= 7650; playerZ += 0.5) {
    const first = Math.floor((playerZ - 90) / CHUNK), last = Math.floor((playerZ + drawDistance) / CHUNK);
    const count = (low, high) => {
      let triangles = 0, primitives = 0, chunks = 0;
      for (const [index, module] of modules) {
        if (index < low || index > high) continue;
        chunks++;
        primitives += module.size;
        for (const arrays of module.values()) triangles += arrays.position.length / 9;
      }
      return { triangles, primitives, chunks, low, high, playerZ };
    };
    const visible = count(first, last);
    const retained = count(first - 1, last + 2);
    if (visible.triangles > maxVisibleTriangles) { maxVisibleTriangles = visible.triangles; worstVisible = visible; }
    if (retained.triangles > maxRetainedTriangles) { maxRetainedTriangles = retained.triangles; worstRetained = retained; }
    maxVisiblePrimitives = Math.max(maxVisiblePrimitives, visible.primitives);
    maxRetainedPrimitives = Math.max(maxRetainedPrimitives, retained.primitives);
  }
  return { drawDistance, nominalRequestedSpan: drawDistance + 90, requestedChunkEnvelopeMax: (Math.ceil((drawDistance + 90) / CHUNK) + 1) * CHUNK, retentionExtra: { behind: CHUNK, ahead: 2 * CHUNK }, maxVisibleTriangles, maxVisiblePrimitives, maxRetentionEnvelopeTriangles: maxRetainedTriangles, maxRetentionEnvelopePrimitives: maxRetainedPrimitives, worstVisible, worstRetained, note: 'Requested chunks are a conservative rendered/span proxy, not camera-frustum/live GPU measurement. Retention envelope is an upper bound: forward +2 are not eagerly built in monotonic flight.' };
}

async function main() {
  const template = loadTemplate();
  const hashTemplate = () => {
    const hash = crypto.createHash('sha256');
    for (const bucket of template.buckets.values()) for (const values of Object.values(bucket.arrays)) hash.update(new Uint8Array(values.buffer, values.byteOffset, values.byteLength));
    return hash.digest('hex');
  };
  const templateHashBefore = hashTemplate();
  const modules = prepareModules(template, 6510);
  const chunks = [];
  const materials = new Map(template.document.buckets.map(bucket => [bucket.key, new THREE.MeshBasicMaterial({ vertexColors: true })]));
  const { Materials } = await import(pathToFileURL(path.join(gameRoot, 'src/render/Materials.js')));
  const shaderSourceFixture = Object.create(Materials.prototype);
  shaderSourceFixture.clock = { value: 0 };
  shaderSourceFixture._disposables = [];
  shaderSourceFixture._neon = new Map();
  const sourceNeon = shaderSourceFixture.neonVertex;
  const sourceSpin = shaderSourceFixture.addSpin(new THREE.MeshStandardMaterial({ vertexColors: true }));
  const neonShader = { uniforms: {}, vertexShader: '#include <begin_vertex>', fragmentShader: '#include <color_fragment>' };
  const spinShader = { uniforms: {}, vertexShader: '#include <beginnormal_vertex>\n#include <begin_vertex>', fragmentShader: '' };
  sourceNeon.onBeforeCompile(neonShader);
  sourceSpin.onBeforeCompile(spinShader);
  shaderSourceFixture.update(1.3);
  assert.equal(neonShader.uniforms.uLightTime, shaderSourceFixture.clock);
  assert.equal(spinShader.uniforms.uSpinTime, shaderSourceFixture.clock);
  assert.equal(neonShader.uniforms.uLightTime.value, 1.3);
  assert(neonShader.vertexShader.includes('attribute vec3 aAnim;'));
  assert(spinShader.vertexShader.includes('attribute vec3 aPivot;') && spinShader.vertexShader.includes('attribute vec4 aSpin;'));
  assert(spinShader.vertexShader.includes('objectNormal = spinAround'));
  const shaderProbe = { actualSourcePatchInvoked: true, sharedClockIdentity: true, sampleClockSeconds: 1.3, normalsAndPositionsRotate: true, gpuCompile: false, proceduralTexturesConstructed: false, note: 'Prototype-created Materials receiver intentionally bypasses DOM texture build; invokes the original getter/addSpin/update methods. This is shader-string/uniform evidence, not WebGL compilation.' };
  let geometryDisposals = 0, materialDisposals = 0;
  for (const material of materials.values()) material.addEventListener('dispose', () => { materialDisposals++; });
  for (const [index, module] of [...modules].sort((first, second) => first[0] - second[0])) {
    const bucketTriangles = Object.fromEntries([...module].map(([key, arrays]) => [key, arrays.position.length / 9]));
    const triangles = Object.values(bucketTriangles).reduce((sum, count) => sum + count, 0);
    assert(triangles <= 6000);
    assert(module.size <= 6);
    for (const [key, arrays] of module) {
      const geometry = geometryFromArrays(arrays);
      geometry.addEventListener('dispose', () => { geometryDisposals++; });
      const duplicate = geometryFromArrays(arrays);
      assert.notEqual(geometry.attributes.position.array.buffer, duplicate.attributes.position.array.buffer);
      const count = arrays.position.length / 3;
      for (const [name, values] of Object.entries(arrays)) assert.equal(values.length / WIDTHS[name], count);
      for (let offset = 0; offset < arrays.position.length; offset += 3) assert(arrays.position[offset + 2] >= index * CHUNK - 0.002 && arrays.position[offset + 2] <= (index + 1) * CHUNK + 0.002);
      for (let offset = 0; offset < arrays.position.length / 3; offset += 3) {
        const triangle = [0, 1, 2].map(corner => ({ position: Array.from(arrays.position.subarray((offset + corner) * 3, (offset + corner + 1) * 3)) }));
        assert(areaSquared(triangle) >= 1e-14);
      }
      if (key === 'neon') assert(geometry.hasAttribute('aAnim'));
      if (key === 'spin') assert(geometry.hasAttribute('aPivot') && geometry.hasAttribute('aSpin'));
      geometry.dispose();
      duplicate.dispose();
    }
    chunks.push({ index, z0: index * CHUNK, triangles, primitives: module.size, bucketTriangles });
  }
  assert.equal(materialDisposals, 0);
  const seams = [];
  for (const [index, module] of modules) {
    const next = modules.get(index + 1);
    if (!next) continue;
    const left = boundarySegments(module, (index + 1) * CHUNK), right = boundarySegments(next, (index + 1) * CHUNK);
    const leftOnly = [...left].filter(segment => !right.has(segment));
    const rightOnly = [...right].filter(segment => !left.has(segment));
    assert.equal(leftOnly.length + rightOnly.length, 0, `unmatched seam at ${(index + 1) * CHUNK}`);
    seams.push({ z: (index + 1) * CHUNK, matchedSegments: left.size, unmatched: 0 });
  }
  const { Rng } = await import(pathToFileURL(path.join(gameRoot, 'src/core/Utils.js')));
  const measured = JSON.parse(fs.readFileSync(path.join(assetRoot, 'checks/source-measurement.json')));
  let replayCases = 0;
  for (const record of measured.records) {
    for (const chunk of record.chunks) {
      const rng = new Rng((chunk.index * 2654435761 + record.seed) >>> 0);
      consumeCarrierRng(rng, chunk.z0, { zStart: record.sectorStart });
      assert.equal(rng._s, chunk.stateAfter);
      replayCases++;
    }
  }
  const source = fs.readFileSync(path.join(gameRoot, 'src/world/Fortress.js'), 'utf8').replace(/from '(\.\.?\/[^']+)'/g, (_, target) => `from '${pathToFileURL(path.resolve(gameRoot, 'src/world', target)).href}'`);
  const { Batch } = await import(`data:text/javascript;base64,${Buffer.from(source + '\nexport { Batch };').toString('base64')}`);
  const realBatchChecks = [];
  for (const [index, module] of modules) {
    const batch = new Batch();
    appendPreparedModule(batch, module);
    const group = new THREE.Group();
    batch.merge(key => materials.get(key), group);
    assert.equal(group.children.length, module.size);
    let triangles = 0;
    for (const mesh of group.children) {
      const key = [...materials].find(([, material]) => material === mesh.material)[0];
      for (const [name, expected] of Object.entries(module.get(key))) assert.deepEqual(mesh.geometry.attributes[name].array, expected);
      triangles += mesh.geometry.attributes.position.count / 3;
      if (mesh.material === materials.get('neon')) assert(mesh.geometry.hasAttribute('aAnim'));
      if (mesh.material === materials.get('spin')) { assert(mesh.geometry.hasAttribute('aPivot')); assert(mesh.geometry.hasAttribute('aSpin')); assert.equal(mesh.frustumCulled, false); }
      mesh.geometry.dispose();
    }
    realBatchChecks.push({ index, triangles, primitives: group.children.length });
  }
  const spin = template.buckets.get('spin').arrays;
  const sampledSpinBounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (let time = 0; time <= Math.PI * 2 / 0.6; time += Math.PI * 2 / 0.6 / 120) {
    for (let offset = 0; offset < spin.position.length / 3; offset++) {
      const position = spinPosition(Array.from(spin.position.subarray(offset * 3, offset * 3 + 3)), Array.from(spin.aPivot.subarray(offset * 3, offset * 3 + 3)), Array.from(spin.aSpin.subarray(offset * 4, offset * 4 + 4)), time);
      for (let axis = 0; axis < 3; axis++) { sampledSpinBounds.min[axis] = Math.min(sampledSpinBounds.min[axis], position[axis]); sampledSpinBounds.max[axis] = Math.max(sampledSpinBounds.max[axis], position[axis]); }
    }
  }
  const cues = [];
  for (const anim of [[0, 0, 0], [1, 0.7, 0], [2, 1.4, 0], [2, 0.8, 0], [3, 0.8, 8 / 30], [3, 0.8, 24 / 30]]) {
    const values = Array.from({ length: 2001 }, (_, index) => gain(anim, index / 100));
    cues.push({ aAnim: anim, sampledSeconds: [0, 20], min: Math.min(...values), max: Math.max(...values) });
  }
  const alternatePlacements = [0, 6377.25, 6511, 6527, 6559, 6589].map(start => {
    const alternate = prepareModules(template, start);
    const totals = [...alternate.values()].map(module => [...module.values()].reduce((sum, arrays) => sum + arrays.position.length / 9, 0));
    assert(Math.max(...totals) <= 6000);
    return { start, modules: alternate.size, maxChunkTriangles: Math.max(...totals) };
  });
  assert.equal(hashTemplate(), templateHashBefore);
  const report = { kind: 'CPU source-compatible prototype; no production integration, browser or GPU validation', fullUncutTriangles: template.document.triangles, partitionedTriangles: chunks.reduce((sum, chunk) => sum + chunk.triangles, 0), maxChunkTriangles: Math.max(...chunks.map(chunk => chunk.triangles)), maxChunkPrimitives: Math.max(...chunks.map(chunk => chunk.primitives)), chunks, seams, qualitySpans: [320, 440, 560, 700].map(distance => ranges(modules, distance)), alternatePlacements, realBatchChecks, rngReplayCases: replayCases, rngSourceMatch: true, lifecycle: { uniqueBuffers: true, chunkGeometryDisposals: geometryDisposals, sharedMaterialDisposalsBeforeShutdown: materialDisposals, templatesUnmodified: true }, shaderProbe, runtimeNeonGains: { catapult: 1.3, amberHeader: 1.15, cyanDepth: 0.8, bridge: 1.05, strobe: 1.6, bell: 1.1 }, cueRanges: cues, radarSampledLocalBounds: sampledSpinBounds, zeroAreaAfterFloat32Partition: 0, collisionDamageDetachRetraction: 'N/A: no gameplay geometry or mechanics' };
  if (process.env.CARRIER_FIXTURE_WORK) {
    const directory = process.env.CARRIER_FIXTURE_WORK;
    fs.mkdirSync(directory, { recursive: true });
    const document = [];
    const buffers = [];
    let byteOffset = 0;
    for (const [index, module] of modules) {
      for (const [key, arrays] of module) {
        const attributes = {};
        for (const [name, values] of Object.entries(arrays)) {
          const bytes = Buffer.alloc(values.length * 4);
          for (let offset = 0; offset < values.length; offset++) bytes.writeFloatLE(values[offset], offset * 4);
          attributes[name] = { byteOffset, count: values.length, itemSize: WIDTHS[name] };
          buffers.push(bytes);
          byteOffset += bytes.length;
        }
        document.push({ index, key, attributes });
      }
    }
    fs.writeFileSync(path.join(directory, 'modules.json'), JSON.stringify(document));
    fs.writeFileSync(path.join(directory, 'modules.bin'), Buffer.concat(buffers));
  }
  fs.writeFileSync(path.join(assetRoot, 'checks/runtime-fixture.json'), JSON.stringify(report, null, 2));
  const overview = { ...report, chunks: undefined, seams: undefined, realBatchChecks: undefined, cueRanges: undefined };
  console.log(JSON.stringify(overview, null, 2));
  for (const material of materials.values()) material.dispose();
  shaderSourceFixture.dispose();
  sourceSpin.dispose();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
