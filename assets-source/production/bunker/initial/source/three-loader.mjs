import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  const directory = process.env.THREE_ROOT;
  if (directory && (specifier === 'three' || specifier.startsWith('three/addons/'))) {
    const suffix = specifier === 'three' ? 'build/three.module.js' : `examples/jsm/${specifier.slice(13)}`;
    return { url: pathToFileURL(path.resolve(directory, suffix)).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
