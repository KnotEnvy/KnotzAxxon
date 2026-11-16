// QA-only module: Vite resolves the same installed Three.js graph as the game.
// Direct /node_modules URLs bypass dependency transformation for addon imports.
export { Vector3, Scene, Matrix4, Quaternion, Box3 } from 'three';
export { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
