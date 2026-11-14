import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadSource } from './source_loader.mjs';

const [root, threeRoot, output] = process.argv.slice(2);
const source = await loadSource(root, threeRoot);
const { THREE, Batch, Rng, taperedBox } = source;
const branch = source.fortressText.split('    // drifting wreck:')[1].split('    // distant orbital')[0].split('\n').slice(1).join('\n');
const run = new Function('rng', 'batch', 'taperedBox', 'CHUNK_LEN', 'FLICKER', 'z0', 'CORRIDOR_HALF', `const clearX=CORRIDOR_HALF+14;const place=(minR,maxR)=>{const side=rng.bool()?1:-1;return [side*rng.range(Math.max(clearX,minR),maxR),rng.range(-50,70)]};${branch}`);
const rng = new Rng(7);
let draws = 0;
const next = rng.next.bind(rng);
rng.next = () => { draws++; return next(); };
const batch = new Batch();
run(rng, batch, taperedBox, 96, 4, 0, 16);
const parts = Object.fromEntries([...batch.buckets].map(([key, bucket]) => [key, { triangles: bucket.pos.n / 9, vertices: bucket.pos.n / 3 }]));
const hull = taperedBox(.6, .35, 1.8, .5, .3).rotateX(Math.PI / 2);
hull.computeBoundingBox();
const samples = [];
for (const size of [10, 22]) for (const bank of [-.6, 0, .6]) for (const yaw of [-.8, 0, .8]) {
  const geometry = hull.clone().scale(size, size, size).rotateZ(bank).rotateY(yaw);
  geometry.computeBoundingBox();
  samples.push({ size, bank, yaw, min: geometry.boundingBox.min.toArray(), max: geometry.boundingBox.max.toArray() });
  geometry.dispose();
}
const support = 22 * (Math.hypot(.175, .15) * Math.cos(.8) + 1.8 * Math.sin(.8));
const result = {
  baseline: 'ee221ad', source_sha256: crypto.createHash('sha256').update(source.fortressText).digest('hex'),
  source_branch: branch.trim(), branch_probability: .5,
  random_draws: { absent: 1, present_including_branch: draws, present_after_branch: draws - 1, ordering: ['branch bool', 'side bool', 'abs X', 'Y', 'Z', 'size', 'yaw', 'bank', '4 x (ember width, X offset, Y offset, Z offset, flicker rate, phase)'] },
  parts, triangles_total: Object.values(parts).reduce((sum, value) => sum + value.triangles, 0),
  placement: { absX: [60, 150], Y: [-50, 70], localChunkZ: [10, 86], size: [10, 22], yaw: [-.8, .8], bank: [-.6, .6], static_geometry: true },
  source_hull_unit_bounds: { min: hull.boundingBox.min.toArray(), max: hull.boundingBox.max.toArray() },
  source_hull_transform_samples: samples,
  continuous_clearance: { method: 'Convex source hull containment; per-endpoint radial XY support bounds bank continuously, then exact maximum yaw support over [-0.8,0.8]. Ribs and embers are smaller in X.', hull_absX_offset_upper: support, nearest_possible_absX_lower: 60 - support, flight_absX_limit: 16, clearance_lower: 44 - support, no_flight_or_aim_changes: true },
  streaming: { chunkLength: 96, ahead: [320, 440, 560, 700], behind: 90 },
  material_correction: 'At ee221ad darkMetal has no texture map/normal/roughness maps. Retain the exact shared MeshStandardMaterial (color 0x3a4a5e, metalness .5, roughness .46, vertexColors true), source AO and world box-projected UVs. Do not claim a source texture exists.',
  neon: { bucket: 'neon', color: '0xff7a2a', gain: 1.4, aAnim: ['FLICKER=4', 'original rng.range(.8,1.6)', 'original rng.next()'], clock: 'existing Materials.uLightTime; no new clock' },
  asteroid_loop_note: 'rng.int(5,9) is reevaluated for every loop condition, including the terminating test. Replacement leaves the entire loop and rockGeometry untouched.'
};
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ draws, parts, support, clearance: 44 - support }));
