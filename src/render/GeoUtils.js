/**
 * Geometry helpers used by the fortress builder.
 */

import * as THREE from 'three';

/**
 * Tapered tower/pylon: a box that narrows toward the top.
 */
export function taperedBox(wBottom, wTop, h, dBottom = wBottom, dTop = wTop) {
  const g = new THREE.BufferGeometry();
  const hb = wBottom / 2, ht = wTop / 2, db = dBottom / 2, dt = dTop / 2;
  const v = [
    // bottom quad
    [-hb, 0, -db], [hb, 0, -db], [hb, 0, db], [-hb, 0, db],
    // top quad
    [-ht, h, -dt], [ht, h, -dt], [ht, h, dt], [-ht, h, dt],
  ];
  const faces = [
    [0, 1, 5, 4], // -Z
    [1, 2, 6, 5], // +X
    [2, 3, 7, 6], // +Z
    [3, 0, 4, 7], // -X
    [4, 5, 6, 7], // top
    [3, 2, 1, 0], // bottom
  ];
  const pos = [];
  const nrm = [];
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3();
  for (const f of faces) {
    const quad = f.map((i) => v[i]);
    for (const [x, y, z] of [quad[0], quad[1], quad[2], quad[0], quad[2], quad[3]]) pos.push(x, y, z);
    A.fromArray(quad[0]); B.fromArray(quad[1]); C.fromArray(quad[2]);
    N.copy(B).sub(A).cross(C.clone().sub(A)).normalize();
    for (let i = 0; i < 6; i++) nrm.push(N.x, N.y, N.z);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  return g;
}
