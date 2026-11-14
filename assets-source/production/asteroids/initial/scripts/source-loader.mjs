import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const payload = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const repo = process.env.ASTEROID_REPO || '/home/knotzuni/code/KnotzAxxon';
export const threeRoot = process.env.THREE_ROOT || path.join(repo, 'asset-work/parked-fighter/.runtime/three');
export const THREE = await import(pathToFileURL(path.join(threeRoot, 'build/three.module.js')));
const loaded = new Map();

export async function sourceModule(relative, transform = text => text, tag = 'baseline') {
  const key = `${tag}:${relative}`;
  if (loaded.has(key)) return loaded.get(key);
  const captured = path.join(payload, 'reference', relative);
  if (!fs.existsSync(captured)) {
    fs.mkdirSync(path.dirname(captured), { recursive: true });
    fs.copyFileSync(path.join(repo, relative), captured);
  }
  let text = transform(fs.readFileSync(captured, 'utf8'));
  const imports = [...text.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)];
  for (const match of imports) {
    const specifier = match[1];
    let replacement;
    if (specifier === 'three') replacement = pathToFileURL(path.join(threeRoot, 'build/three.module.js')).href;
    else if (specifier.startsWith('three/addons/')) replacement = pathToFileURL(path.join(threeRoot, 'examples/jsm', specifier.slice(13))).href;
    else if (specifier.startsWith('.')) {
      const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(relative), specifier));
      replacement = await sourceModule(dependency, text => text, tag);
    }
    if (replacement) text = text.replaceAll(`'${specifier}'`, `'${replacement}'`).replaceAll(`"${specifier}"`, `"${replacement}"`);
  }
  const url = `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
  loaded.set(key, url);
  return url;
}

export function expose(text) {
  const start = text.indexOf('function rockGeometry');
  const end = text.indexOf('/** Parked enemy', start);
  const rock = text.slice(start, end).replace('g.computeVertexNormals();', 'g.userData.legacyShape = { sx, sy, sz, seed }; g.computeVertexNormals();');
  return text.slice(0, start) + rock + text.slice(end) + '\nexport { Batch, rockGeometry };\n';
}

export function geometryData(geometry) {
  return {
    position: Array.from(geometry.attributes.position.array),
    normal: Array.from(geometry.attributes.normal?.array || []),
    index: geometry.index ? Array.from(geometry.index.array) : null,
  };
}

export function bounds(geometry) {
  geometry.computeBoundingBox();
  return { min: geometry.boundingBox.min.toArray(), max: geometry.boundingBox.max.toArray() };
}

export function saveJson(relative, value) {
  const target = path.join(payload, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(value, null, 2) + '\n');
}
