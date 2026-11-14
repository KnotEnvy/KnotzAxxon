import { pathToFileURL } from 'node:url';
import path from 'node:path';

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'three' || specifier.startsWith('three/')) {
    const root = process.env.CARRIER_THREE_ROOT;
    if (!root) throw new Error('Set CARRIER_THREE_ROOT to the existing three package directory');
    const suffix = specifier === 'three' ? 'build/three.module.js' : specifier.slice(6).replace(/^addons\//, 'examples/jsm/');
    return { url: pathToFileURL(path.join(root, suffix)).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
