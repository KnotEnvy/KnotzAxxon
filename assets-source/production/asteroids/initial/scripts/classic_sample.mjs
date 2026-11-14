import fs from 'node:fs';
import path from 'node:path';
import { payload, THREE, saveJson } from './source-loader.mjs';
import { cameraAt } from './cameras.mjs';

const baseline = JSON.parse(fs.readFileSync(path.join(payload, 'measurements/baseline.json')));
const worldFile = path.join(payload, 'measurements/world-scene.json');
const world = JSON.parse(fs.readFileSync(worldFile));
const chunks = baseline.chunks.filter(chunk => chunk.seed === 42);
const samples = [];
for (const chunk of chunks) for (const phase of [0, 24, 48, 72]) {
  const z = chunk.index * 96 + phase;
  const first = Math.floor((z - 90) / 96), last = Math.floor((z + 700) / 96);
  const { frustum } = cameraAt('classic', z, 700);
  const rocks = chunks.filter(other => other.index >= first && other.index <= last).flatMap(other => other.rocks);
  let verticesInside = 0, rockVertexIntersections = 0;
  for (const rock of rocks) {
    let inside = 0;
    for (let offset = 0; offset < rock.geometry.position.length; offset += 3) {
      const point = new THREE.Vector3(rock.x + rock.geometry.position[offset], rock.y + rock.geometry.position[offset + 1], rock.z + rock.geometry.position[offset + 2]);
      if (frustum.containsPoint(point)) inside++;
    }
    verticesInside += inside;
    if (inside) rockVertexIntersections++;
  }
  samples.push({ z, rockVertexIntersections, verticesInside });
}
samples.sort((first, second) => second.rockVertexIntersections - first.rockVertexIntersections || second.verticesInside - first.verticesInside || first.z - second.z);
const selected = samples[0];
world.classicDensityCamera = { ...cameraAt('classic', selected.z, 700).data, sampleTag: 'density' };
fs.writeFileSync(worldFile, JSON.stringify(world, null, 2) + '\n');
saveJson('measurements/classic-density-sample.json', {
  method: 'Additional honest visibility evidence: scan 116 seed42 source-camera positions, select by SOURCE rest geometry vertex/frustum intersection count, then vertex count; no camera/rock scaling or source placement changes. Not an unbiased density average or triangle clipping/occlusion test.',
  selected, samples,
});
console.log('CLASSIC_DENSITY_SOURCE_SAMPLE', selected);
