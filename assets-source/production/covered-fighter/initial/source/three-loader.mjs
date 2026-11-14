import { pathToFileURL } from 'node:url';
import { resolve as pathResolve } from 'node:path';

const dependency = process.env.COVERED_THREE_ROOT ?? pathResolve('asset-work/carrier/.runtime/node_modules/three');

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'three') return { url: pathToFileURL(`${dependency}/build/three.module.js`).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: pathToFileURL(`${dependency}/examples/jsm/${specifier.slice(13)}`).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
