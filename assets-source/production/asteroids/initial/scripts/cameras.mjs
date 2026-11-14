import { THREE, sourceModule } from './source-loader.mjs';
globalThis.matchMedia ??= () => ({ matches: false });
if (!globalThis.navigator) globalThis.navigator = { hardwareConcurrency: 4, deviceMemory: 4 };
const { settings } = await import(await sourceModule('src/core/Settings.js'));
const { CameraRig } = await import(await sourceModule('src/game/CameraRig.js'));
const { FlightCamera } = await import(await sourceModule('src/core/FlightCamera.js'));

export function cameraAt(mode, z, distance = 700, x = 0, y = 9) {
  settings.values.camera = mode;
  const camera = new FlightCamera(58, 16 / 9, 0.35, distance * 2.4);
  const rig = new CameraRig(camera);
  rig.snap({ pos: new THREE.Vector3(x, y, z), velocity: new THREE.Vector3() });
  camera.updateMatrixWorld(true);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  return { camera, rig, frustum, data: { mode, player: [x, y, z], eye: camera.position.toArray(), target: rig.lookAt.toArray(), fov: camera.fov,
    orthographic: camera.isOrthographicCamera, halfHeight: camera.halfHeight || null, aspect: camera.aspect, near: camera.near, far: camera.far } };
}
