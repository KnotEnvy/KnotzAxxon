import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const repo = path.resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const three = process.env.COOLING_THREE_ROOT ?? path.join(repo, 'asset-work/carrier/.runtime/node_modules/three');

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'three') return { url: pathToFileURL(path.join(three, 'build/three.module.js')).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: pathToFileURL(path.join(three, 'examples/jsm', specifier.slice(13))).href, shortCircuit: true };
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (url === pathToFileURL(path.join(repo, 'src/world/Fortress.js')).href) {
    return { ...result, source: `${result.source}\nexport { Batch };\n` };
  }
  return result;
}
