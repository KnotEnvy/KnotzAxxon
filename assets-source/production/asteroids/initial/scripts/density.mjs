import fs from 'node:fs';
import path from 'node:path';
import { payload, THREE, saveJson } from './source-loader.mjs';
import { cameraAt } from './cameras.mjs';
const { chunks } = JSON.parse(fs.readFileSync(path.join(payload, 'measurements/baseline.json')));
const rows = [];
for (const distance of [320, 440, 560, 700]) for (const mode of ['classic', 'modern', 'chase']) {
  const samples = [];
  for (const chunk of chunks) {
    const z = chunk.index * 96 + 48;
    const first = Math.floor((z - 90) / 96), last = Math.floor((z + distance) / 96);
    const active = chunks.filter(other => other.seed === chunk.seed && other.index >= first && other.index <= last);
    const { frustum } = cameraAt(mode, z, distance);
    const activeRocks = active.flatMap(other => other.rocks);
    samples.push({ active: activeRocks.length,
      intersects: activeRocks.filter(rock => frustum.intersectsSphere(new THREE.Sphere(new THREE.Vector3(rock.x, rock.y, rock.z), rock.radius))).length });
  }
  const stats = key => ({ min: Math.min(...samples.map(row => row[key])), max: Math.max(...samples.map(row => row[key])), mean: samples.reduce((sum, row) => sum + row[key], 0) / samples.length });
  rows.push({ distance, mode, samples: samples.length, residentSpaceRocks: stats('active'), conservativeFrustumSphereIntersections: stats('intersects') });
}
saveJson('measurements/pre-design-density.json', { method: 'Actual source FlightCamera and CameraRig.snap, 16:9, player center x0 y9, each sampled space chunk midpoint; source geometry radius about shader pivot. Sphere/frustum intersections overestimate visible surface and do not measure occlusion. Includes campaign boundaries. No runtime WebGL.', rows });
console.log(JSON.stringify(rows, null, 2));
