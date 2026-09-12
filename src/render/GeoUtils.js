/**
 * Geometry helpers used by the fortress builder.
 */

import * as THREE from 'three';

const _n = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

/**
 * Rewrite a geometry's UVs from object-space position, choosing the plane by
 * dominant face normal (a cheap box/triplanar projection).
 *
 * This is what keeps texel density uniform across a fortress made of boxes of
 * wildly different sizes — without it, a 40-unit wall and a 2-unit strut would
 * show the same number of panel tiles.
 *
 * @param {THREE.BufferGeometry} geo non-indexed or indexed geometry
 * @param {number} scale world units per texture tile
 * @param {THREE.Matrix4} [xf] optional transform applied before projecting
 */
export function applyBoxUV(geo, scale = 8, xf = null) {
  if (!geo.attributes.uv) {
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((geo.attributes.position.count) * 2), 2));
  }
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const index = geo.index;
  const triCount = index ? index.count / 3 : pos.count / 3;
  const inv = 1 / scale;

  for (let t = 0; t < triCount; t++) {
    const i0 = index ? index.getX(t * 3) : t * 3;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;

    _a.fromBufferAttribute(pos, i0);
    _b.fromBufferAttribute(pos, i1);
    _c.fromBufferAttribute(pos, i2);
    if (xf) { _a.applyMatrix4(xf); _b.applyMatrix4(xf); _c.applyMatrix4(xf); }

    _n.copy(_b).sub(_a).cross(_c.clone().sub(_a));
    const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);

    for (const [idx, v] of [[i0, _a], [i1, _b], [i2, _c]]) {
      let u, w;
      if (ax >= ay && ax >= az) { u = v.z; w = v.y; }        // facing X
      else if (ay >= ax && ay >= az) { u = v.x; w = v.z; }   // facing Y
      else { u = v.x; w = v.y; }                             // facing Z
      uv.setXY(idx, u * inv, w * inv);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * A box with chamfered vertical edges — reads far more "engineered" than a
 * plain cube and costs almost nothing extra.
 */
export function chamferBox(w, h, d, chamfer = 0.15) {
  const c = Math.min(chamfer, w * 0.4, d * 0.4);
  const shape = new THREE.Shape();
  const hw = w / 2, hd = d / 2;
  shape.moveTo(-hw + c, -hd);
  shape.lineTo(hw - c, -hd);
  shape.lineTo(hw, -hd + c);
  shape.lineTo(hw, hd - c);
  shape.lineTo(hw - c, hd);
  shape.lineTo(-hw + c, hd);
  shape.lineTo(-hw, hd - c);
  shape.lineTo(-hw, -hd + c);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 1 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, h, 0);
  return geo;
}

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

/** Dispose a whole subtree's geometries and materials. */
export function disposeTree(obj) {
  obj.traverse((o) => {
    o.geometry?.dispose?.();
    const m = o.material;
    if (Array.isArray(m)) m.forEach((x) => x?.dispose?.());
    else m?.dispose?.();
  });
}
