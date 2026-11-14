import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';

const folder = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(folder, '../../../..');
globalThis.localStorage = { getItem: () => '{}', setItem: () => {} };
const { CameraRig } = await import(pathToFileURL(path.join(root, 'src/game/CameraRig.js')));
const { FlightCamera } = await import(pathToFileURL(path.join(root, 'src/core/FlightCamera.js')));
const { CAMERA_MODES } = await import(pathToFileURL(path.join(root, 'src/core/Settings.js')));
const points = [[0, 13, 300], [16, 1.3, 330], [-16, 25, 330], [58, 0, 324], [94, 39, 420]];
const records = [];
for (const [mode, preset] of Object.entries(CAMERA_MODES)) {
  const rig = Object.create(CameraRig.prototype);
  rig.camera = new FlightCamera(preset.fov, 1280 / 720, 0.35, 560 * 2.4);
  rig.position = new THREE.Vector3();
  rig.lookAt = new THREE.Vector3();
  rig.fovBase = preset.fov;
  rig.extraDist = 0;
  rig.dist = preset.dist;
  rig.height = preset.height;
  rig.yaw = preset.yaw * Math.PI / 180;
  rig.classic = mode === 'classic';
  rig.snap({ pos: new THREE.Vector3(0, 13, 300), velocity: new THREE.Vector3(0, 0, 40) });
  records.push({ mode, sourceMethod: 'actual CameraRig.snap + FlightCamera at steady zero boost/trauma/framing', eye: rig.camera.position.toArray(), target: rig.lookAt.toArray(), projectionMatrix: rig.camera.projectionMatrix.toArray(), points: points.map(position => { const projected = new THREE.Vector3(...position).project(rig.camera); return { game: position, ndc: projected.toArray(), viewport: [(projected.x + 1) / 2, (projected.y + 1) / 2] }; }) });
}
fs.writeFileSync(path.join(folder, '../checks/camera-source.json'), JSON.stringify(records, null, 2));
console.log(JSON.stringify(records.map(({ mode, eye, target }) => ({ mode, eye, target })), null, 2));
