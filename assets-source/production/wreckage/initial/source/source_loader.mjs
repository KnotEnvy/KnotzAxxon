import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export async function loadSource(root, threeRoot) {
  const require = createRequire(path.join(threeRoot, 'package.json'));
  const THREE = require(path.join(threeRoot, 'build/three.cjs'));
  const { mergeGeometries } = await import(pathToFileURL(path.join(threeRoot, 'examples/jsm/utils/BufferGeometryUtils.js')));
  const utils = await import(pathToFileURL(path.join(root, 'src/core/Utils.js')));
  const level = await import(pathToFileURL(path.join(root, 'src/world/Level.js')));
  const geoText = fs.readFileSync(path.join(root, 'src/render/GeoUtils.js'), 'utf8');
  const geo = new Function('THREE', geoText.replace(/^import .*$/gm, '').replaceAll('export ', '') + '\nreturn {taperedBox,facetedHull,airframePanel,reflectorGeometry};')(THREE);
  const materialText = fs.readFileSync(path.join(root, 'src/render/Materials.js'), 'utf8');
  const LIGHT_ANIM = new Function(`return ${materialText.match(/export const LIGHT_ANIM = (\{[^;]+\});/)[1]}`)();
  const fortressText = fs.readFileSync(path.join(root, 'src/world/Fortress.js'), 'utf8');
  const names = ['THREE', 'mergeGeometries', ...Object.keys(geo), 'LIGHT_ANIM', 'Rng', 'clamp', 'lerp', 'TAU', 'CHUNK_LEN', 'DECK_HALF', 'CORRIDOR_HALF', 'ALT_MAX', 'SECTOR_KINDS', 'emitReplacement'];
  const values = [THREE, mergeGeometries, ...Object.values(geo), LIGHT_ANIM, utils.Rng, utils.clamp, utils.lerp, utils.TAU, level.CHUNK_LEN, level.DECK_HALF, level.CORRIDOR_HALF, level.ALT_MAX, level.SECTOR_KINDS];
  const evaluate = (text, replacement = null) => new Function(...names, text.replace(/^import .*$/gm, '').replaceAll('export ', '') + '\nreturn {Batch,Fortress,rockGeometry};')(...values, replacement);
  return { THREE, ...utils, ...level, ...geo, LIGHT_ANIM, fortressText, evaluate, ...evaluate(fortressText) };
}
