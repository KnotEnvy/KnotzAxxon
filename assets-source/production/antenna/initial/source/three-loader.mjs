import { pathToFileURL } from 'node:url';
import path from 'node:path';

const threeRoot = process.env.THREE_ROOT ?? path.resolve('asset-work/antenna/.runtime/node_modules/three');
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'three') return { url: pathToFileURL(path.join(threeRoot, 'build/three.module.js')).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: pathToFileURL(path.join(threeRoot, 'examples/jsm', specifier.slice(13))).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
