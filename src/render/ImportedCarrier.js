// Adapted from the frozen carrier initial's editable runtime prototype.
const CHUNK = 96;
const WIDTHS = { position: 3, normal: 3, uv: 2, color: 3, aAnim: 3, aPivot: 3, aSpin: 4 };
let template, preparedStart, modules;

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

export async function loadImportedCarrier(base) {
  const [json, binary] = await Promise.all([fetch(base + 'carrier-template.json'), fetch(base + 'carrier-template.bin')]);
  if (!json.ok || !binary.ok) throw new Error('Carrier runtime template failed to load');
  const document = await json.json();
  const bytes = new DataView(await binary.arrayBuffer());
  const buckets = new Map();
  for (const bucket of document.buckets) {
    const arrays = {};
    for (const [name, attribute] of Object.entries(bucket.attributes)) {
      arrays[name] = new Float32Array(attribute.count);
      for (let index = 0; index < attribute.count; index++) arrays[name][index] = bytes.getFloat32(attribute.byteOffset + index * 4, true);
    }
    const period = new Float32Array(bucket.vertices);
    const runtimeGain = new Float32Array(bucket.vertices).fill(1);
    for (const record of document.parts.filter(record => record.bucket === bucket.key && record.phase_period)) period.fill(record.phase_period, record.firstVertex, record.firstVertex + record.vertexCount);
    if (bucket.key === 'neon') {
      for (const record of document.parts.filter(record => record.bucket === 'neon')) runtimeGain.fill(runtimeNeonGain(record), record.firstVertex, record.firstVertex + record.vertexCount);
    }
    buckets.set(bucket.key, { arrays, period, runtimeGain });
  }
  template = { document, buckets };
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
      if (!buffer) throw new Error('Carrier attribute does not match bucket: ' + name);
      buffer.a.set(values, buffer.n);
      buffer.n += values.length;
    }
  }
}


/** Partition once during level preparation, before gameplay streaming begins. */
export function prepareImportedCarrier(level) {
  if (!template) return;
  const start = level.sectors[4].zStart + 160;
  if (start === preparedStart) return;
  modules = prepareModules(template, start);
  preparedStart = start;
}

export function appendImportedCarrier(batch, rng, z0, sector) {
  if (!template) return false;
  const start = (sector.zStart ?? 0) + 160;
  if (start !== preparedStart) throw new Error('Carrier must be prepared before streaming');
  consumeCarrierRng(rng, z0, sector);
  appendPreparedModule(batch, modules.get(Math.floor(z0 / CHUNK)));
  return true;
}

export function disposeImportedCarrier() {
  template = modules = undefined;
  preparedStart = undefined;
}
