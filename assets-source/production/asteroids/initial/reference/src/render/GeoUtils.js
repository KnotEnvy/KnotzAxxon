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
    [4, 5, 1, 0], // -Z
    [5, 6, 2, 1], // +X
    [6, 7, 3, 2], // +Z
    [7, 4, 0, 3], // -X
    [7, 6, 5, 4], // top
    [0, 1, 2, 3], // bottom
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

/** Closed eight-sided airframe with continuous width/height stations along Z. */
export function facetedHull(stations) {
  const vertices = [], indices = [];
  for (const [z, w, top, bottom] of stations) {
    for (const [x, y] of [[0, top], [-w * .72, top], [-w, (top + bottom) / 2], [-w * .7, bottom],
      [0, bottom], [w * .7, bottom], [w, (top + bottom) / 2], [w * .72, top]]) vertices.push(x, y, z);
  }
  for (let s = 0; s < stations.length - 1; s++) for (let j = 0; j < 8; j++) {
    const a = s * 8 + j, b = s * 8 + (j + 1) % 8;
    indices.push(a, b, a + 8, b, b + 8, a + 8);
  }
  const end = (stations.length - 1) * 8;
  for (let j = 1; j < 7; j++) indices.push(0, j + 1, j, end, end + j, end + j + 1);
  const source = new THREE.BufferGeometry();
  source.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); source.setIndex(indices);
  const g = source.toNonIndexed(); source.dispose(); g.computeVertexNormals();
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) * .2; uv[i * 2 + 1] = p.getZ(i) * .2; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
}

/** Extruded X/Z panel with its upper skin at y. Mirrored outlines stay valid. */
export function airframePanel(points, y, depth = .10, bevel = .02) {
  return new THREE.ExtrudeGeometry(new THREE.Shape(points.map(p => new THREE.Vector2(...p))), {
    depth, steps: 1, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1,
  }).rotateX(Math.PI / 2).translate(0, y, 0);
}

/** Thick concave reflector, facing +Z. The rim belongs to the shell. */
export function reflectorGeometry(radius, segments = 20) {
  const profile = [[0, 0], [.25, .015], [.60, .08], [.97, .27], [1, .31], [.98, .35],
    [.94, .32], [.60, .13], [.25, .07], [0, .06]].map(([r, z]) => new THREE.Vector2(r * radius, z * radius));
  return new THREE.LatheGeometry(profile, segments).rotateX(Math.PI / 2);
}

/** Mechanical strut between arbitrary endpoints. */
export function strut(a, b, radius = .06, segments = 6) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
  const g = new THREE.CylinderGeometry(radius, radius, delta.length(), segments);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
  return g.translate(...start.add(end).multiplyScalar(.5).toArray());
}
