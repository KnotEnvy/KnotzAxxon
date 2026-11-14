import { pathToFileURL } from 'node:url';

export const NODE_ORDER = ['AS_Talus_Basin', 'AS_Keel_DoubleImpact', 'AS_Scar_Cleaved'];
const TINTS = [0xb8b0a4, 0x9a928a, 0xc4b8a8, 0xa89c90];

export function variantIndex(state, ordinal, chunkIndex) {
  let hash = (state ^ Math.imul(ordinal + 1, 0x9e3779b1) ^ Math.imul(chunkIndex, 0x85ebca6b)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  return ((hash ^ (hash >>> 16)) >>> 0) % NODE_ORDER.length;
}

export async function loadKit(THREE, threeRoot, bytes) {
  const { GLTFLoader } = await import(pathToFileURL(`${threeRoot}/examples/jsm/loaders/GLTFLoader.js`));
  const array = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await new GLTFLoader().parseAsync(array, '');
  gltf.scene.updateMatrixWorld(true);
  const resources = new Set();
  const templates = NODE_ORDER.map(name => {
    const mesh = gltf.scene.getObjectByName(name);
    if (!mesh?.isMesh || Array.isArray(mesh.material)) throw new Error(`Missing single-material template: ${name}`);
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    geometry.computeBoundingBox();
    resources.add(geometry);
    return { name, geometry, triangles: (geometry.index?.count || geometry.attributes.position.count) / 3 };
  });
  gltf.scene.traverse(object => {
    if (object.geometry) resources.add(object.geometry);
    for (const material of [].concat(object.material || [])) {
      resources.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
    }
  });
  let shutDown = false;
  return { templates, importedRoot: gltf.scene, shutdown() {
    if (shutDown) return;
    shutDown = true;
    for (const resource of resources) resource.dispose();
  } };
}

export function appendAsteroid(batch, rng, radius, x, y, z, axis, ordinal, chunkIndex, templates, onStamp = null) {
  const detail = rng.bool(.4) ? 2 : 1;
  const sx = rng.range(.7, 1.3), sy = rng.range(.55, 1), sz = rng.range(.7, 1.4);
  const erosionSeed = rng.next() * 10;
  const state = rng._s;
  const tint = rng.pick(TINTS);
  const spin = [axis.x, axis.y, axis.z, rng.range(.05, .3)];
  const template = templates[variantIndex(state, ordinal, chunkIndex)];
  const bucket = batch._bucket('rock');
  const colorStart = bucket.col.n;
  batch.stamp('rock', template.geometry, x, y, z, radius * 2, tint, {
    sx: radius * sx, sy: radius * sy, sz: radius * sz,
    fx: { pivot: [x, y, z], spin },
  });
  const palette = template.geometry.attributes.color;
  const indices = template.geometry.index;
  const count = indices?.count || template.geometry.attributes.position.count;
  for (let corner = 0; corner < count; corner++) {
    const vertex = indices ? indices.getX(corner) : corner;
    bucket.col.a[colorStart + corner * 3] *= palette.getX(vertex);
    bucket.col.a[colorStart + corner * 3 + 1] *= palette.getY(vertex);
    bucket.col.a[colorStart + corner * 3 + 2] *= palette.getZ(vertex);
  }
  onStamp?.({ ordinal, x, y, z, s: radius, tint, spin, shape: { sx, sy, sz, seed: erosionSeed },
    legacyDetail: detail, node: template.name, triangles: template.triangles, callsAtAdd: rng.calls, stateAtAdd: rng._s });
}

const retired = new WeakSet();
export function retireChunk(group, parent) {
  if (retired.has(group)) return;
  retired.add(group);
  const owned = new Set();
  group.traverse(object => { if (object.isMesh) owned.add(object.geometry); });
  for (const geometry of owned) geometry.dispose();
  parent?.remove(group);
}

export function prototypeTransform(text, adapterUrl, templatesExpression = 'globalThis.__asteroidKit.templates') {
  const original = `batch.add('rock', rockGeometry(rng, s), x, y, z, s * 2, rng.pick([0xb8b0a4, 0x9a928a, 0xc4b8a8, 0xa89c90]), 0, 1,\n        { pivot: [x, y, z], spin: [axis.x, axis.y, axis.z, rng.range(0.05, 0.3)] });`;
  if (text.split(original).length !== 2) throw new Error('Source asteroid callsite differs; stop rather than alter RNG or gates.');
  return `import { appendAsteroid } from '${adapterUrl}';\n` + text.replace(original,
    `appendAsteroid(batch, rng, s, x, y, z, axis, i, Math.floor(z0 / CHUNK_LEN), ${templatesExpression}, globalThis.__asteroidStamp);`);
}
