import * as THREE from 'three';

function tapered(bottomWidth, topWidth, bottomDepth, topDepth) {
  const vertices = [
    [-bottomWidth / 2, 0, -bottomDepth / 2], [bottomWidth / 2, 0, -bottomDepth / 2],
    [bottomWidth / 2, 0, bottomDepth / 2], [-bottomWidth / 2, 0, bottomDepth / 2],
    [-topWidth / 2, 1, -topDepth / 2], [topWidth / 2, 1, -topDepth / 2],
    [topWidth / 2, 1, topDepth / 2], [-topWidth / 2, 1, topDepth / 2],
  ];
  const faces = [[0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0], [4, 7, 6, 5], [0, 1, 2, 3]];
  const positions = [];
  for (const face of faces) for (const index of [face[0], face[1], face[2], face[0], face[2], face[3]]) positions.push(...vertices[index]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function lens() {
  const vertices = [], positions = [];
  for (const height of [0, 1]) for (let side = 0; side < 8; side++) {
    const angle = side * Math.PI / 4;
    vertices.push([.2 * Math.cos(angle), height, .2 * Math.sin(angle)]);
  }
  const triangle = (first, second, third) => positions.push(...vertices[first], ...vertices[second], ...vertices[third]);
  for (let side = 0; side < 8; side++) {
    const next = (side + 1) % 8;
    triangle(side, side + 8, next + 8);
    triangle(side, next + 8, next);
  }
  for (let side = 1; side < 7; side++) {
    triangle(0, side, side + 1);
    triangle(8, side + 9, side + 8);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function createAntennaTemplates() {
  const box = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  box.translate(0, .5, 0);
  return Object.freeze({ box, spine: tapered(.25, .14, .23, .14), shoe: tapered(.36, .26, .34, .25), socket: tapered(.29, .37, .29, .37), lens: lens() });
}

export function disposeAntennaTemplates(templates) {
  for (const geometry of new Set(Object.values(templates))) geometry.dispose();
}

function capture(batch, width, height, depth, x, y, z) {
  if (batch.captureSurfaces) batch.surfaces.push({ minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2, top: y + height });
}

export function emitAntenna(batch, rng, x, z, theme, templates) {
  const height = rng.range(7, 13);
  emitMount(batch, x, z, height, templates);
  capture(batch, .35, height, .35, x, 0, z);
  for (let y = 2; y < height; y += rng.range(1.8, 2.6)) {
    const width = rng.range(1.2, 2.4);
    emitElement(batch, x, y, z, width, templates);
    capture(batch, width, .12, .12, x, y, z);
  }
  const hue = theme.name === 'gauntlet' ? 0xff2a3a : 0xff3d55;
  const animation = [1, rng.range(.6, 1), rng.next()];
  emitLamp(batch, x, height, z, hue, animation, templates);
  capture(batch, .4, .4, .4, x, height, z);
}

export function emitMount(batch, x, z, height, templates) {
  const stamp = (name, geometry, px, py, pz, sx, sy, sz, tint = 0xffffff) => {
    batch.stamp('dark', geometry, x + px, py, z + pz, 3, tint, { sx, sy, sz });
  };
  stamp('continuous_spine', templates.spine, 0, 0, 0, 1, height, 1);
  stamp('mount_flange', templates.box, 0, 0, 0, .52, .07, .36, 0xd1dce6);
  stamp('tapered_mount_shoe', templates.shoe, 0, .07, 0, 1, .50, 1);
  stamp('socket_clamp', templates.box, 0, .49, 0, .31, .11, .30, 0xd1dce6);
  for (const side of [-1, 1]) for (const front of [-1, 1]) stamp(`anchor_bolt_${side}_${front}`, templates.box, side * .195, .07, front * .115, .065, .055, .065, 0xb5c4d5);
  stamp('continuous_rear_conduit', templates.box, 0, .43, -.153, .044, height - .72, .044, 0x8091a5);
  stamp('conduit_lower_elbow', templates.box, 0, .43, -.11, .044, .044, .11, 0x8091a5);
  stamp('conduit_upper_elbow', templates.box, 0, height - .34, -.11, .044, .044, .11, 0x8091a5);
  stamp('sealed_base_terminal', templates.box, .158, .20, -.09, .15, .24, .11, 0xaabbd0);
  stamp('beacon_socket', templates.socket, 0, height - .20, 0, 1, .20, 1, 0xc4d1df);
  stamp('beacon_cap', templates.box, 0, height + .365, 0, .32, .035, .32, 0xe1e9ef);
  stamp('rear_cable_clip', templates.box, 0, 1.02, -.146, .13, .07, .084, 0xc4d1df);
}

export function emitElement(batch, x, y, z, width, templates) {
  batch.stamp('dark', templates.box, x, y, z, 3, 0xf2f6fa, { sx: width, sy: .10, sz: .10 });
  batch.stamp('dark', templates.box, x, y - .055, z, 3, 0xb5c4d5, { sx: .32, sy: .21, sz: .38 });
}

export function emitLamp(batch, x, height, z, hue, animation, templates) {
  batch.stamp('neon', templates.lens, x, height, z, 8, hue, { sy: .4, gain: 1.6, fx: { anim: animation } });
}
