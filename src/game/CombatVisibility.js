import * as THREE from 'three';
import { segmentBox } from '../core/Collision.js';
import { DECK_HALF, ALT_MAX } from '../world/Level.js';

const clip = new THREE.Vector4();
const origin = new THREE.Vector3();
const colliders = [];
const gateBox = {minX:-DECK_HALF,maxX:DECK_HALF,minY:0,maxY:0,minZ:0,maxZ:0};

/** Require the target center inside the picture, leaving room for hit feedback.
 * Headless simulation callers without a camera retain physical collision rules. */
export function inCombatView(camera, x, y, z) {
  if (!camera?.projectionMatrix) return true;
  clip.set(x, y, z, 1).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
  return clip.w > 0 && Math.abs(clip.x) <= clip.w * 0.96
    && Math.abs(clip.y) <= clip.w * 0.96 && Math.abs(clip.z) <= clip.w;
}

/** Visibility markers never reveal targets through approaching solid barriers.
 * Unprojecting the near plane gives parallel rays in the classic orthographic view.
 * Cleared obstacle pictures retire at playerZ - 4, just as Fortress.update does. */
export function markerVisible(camera, level, gates, playerZ, x, y, z) {
  if (!inCombatView(camera, x, y, z)) return false;
  if (!camera?.projectionMatrix) return true;
  origin.set(clip.x / clip.w, clip.y / clip.w, -1).unproject(camera);
  const cutoff = playerZ - 4;
  for (const c of level.collidersNear(Math.min(origin.z,z), Math.max(origin.z,z), colliders)) {
    if (c.tag !== 'platform' && c.maxZ < cutoff) continue;
    if (segmentBox(origin.x,origin.y,origin.z,x,y,z,c,0) < 0.995) { colliders.length = 0; return false; }
  }
  colliders.length = 0;
  // Read gate faces without changing physics caches or retaining actor references.
  for (const gate of gates ?? []) {
    if (gate.feature?.kind !== 'gate' || gate.feature.z + 1 < cutoff) continue;
    gateBox.minZ = gate.feature.z - 1; gateBox.maxZ = gate.feature.z + 1;
    for (let i=0;i<2;i++) {
      gateBox.minY = i === 0 ? -5 : gate.gapY + gate.gapH;
      gateBox.maxY = i === 0 ? gate.gapY : ALT_MAX + 10;
      if (segmentBox(origin.x,origin.y,origin.z,x,y,z,gateBox,0) < 0.995) return false;
    }
  }
  return true;
}
