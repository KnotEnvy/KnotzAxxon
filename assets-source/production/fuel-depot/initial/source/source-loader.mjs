import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const three = process.env.FUEL_THREE_ROOT ?? path.join(repo, 'node_modules/three');
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'three') return { url: pathToFileURL(path.join(three, 'build/three.module.js')).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: pathToFileURL(path.join(three, 'examples/jsm', specifier.slice(13))).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (url === pathToFileURL(path.join(repo, 'src/world/Fortress.js')).href) return { ...result, source: `${result.source}\nexport { Batch, themeFor };\n` };
  return result;
}
