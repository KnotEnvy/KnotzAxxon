import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// All stations use travel space: X across, Y up, nose +Z. Shared stations
// eliminate the mismatched cylinder/cone caps of the original airframe.
function loft(stations) {
  const vertices = [], indices = [];
  for (const [z, width, top, bottom] of stations) {
    const middle = (top + bottom) / 2;
    for (const [x, y] of [
      [0, top], [-width * .72, top], [-width, middle], [-width * .7, bottom],
      [0, bottom], [width * .7, bottom], [width, middle], [width * .72, top],
    ]) vertices.push(x, y, z);
  }
  for (let s = 0; s < stations.length - 1; s++) {
    for (let j = 0; j < 8; j++) {
      const a = s * 8 + j, b = s * 8 + (j + 1) % 8;
      indices.push(a, b, a + 8, b, b + 8, a + 8);
    }
  }
  for (let j = 1; j < 7; j++) {
    indices.push(0, j + 1, j);
    const end = (stations.length - 1) * 8;
    indices.push(end, end + j, end + j + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  g.setIndex(indices);
  const flat = g.toNonIndexed(); g.dispose(); flat.computeVertexNormals();
  return flat;
}

/** Procedural hero interceptor. Four static batches plus two engine cores. */
export function buildShip(mats) {
  const group = new THREE.Group(); group.name = 'hero-interceptor';
  const buckets = { hull: [], accent: [], glass: [], neon: [] };
  const transform = new THREE.Object3D();
  const silver = 0x91acbd, ivory = 0xd6e1e4, slate = 0x47637b, gold = 0xeeb369;
  // Each geometry is consumed here, including temporary construction buffers.
  function add(geometry, bucket, position = [0, 0, 0], rotation = [0, 0, 0], color = silver) {
    transform.position.set(...position); transform.rotation.set(...rotation); transform.updateMatrix();
    const part = geometry.index ? geometry.toNonIndexed() : geometry.clone(); geometry.dispose();
    part.applyMatrix4(transform.matrix);
    // Only these streams are needed; custom lofts and primitives batch alike.
    for (const key of Object.keys(part.attributes)) if (!['position', 'normal'].includes(key)) part.deleteAttribute(key);
    part.clearGroups();
    const c = new THREE.Color(color), colors = new Float32Array(part.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
    part.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    buckets[bucket].push(part);
  }
  function plate(outline, top, depth, bucket, color = silver, wing = false) {
    const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, z)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth, steps: 1, bevelEnabled: false });
    geo.rotateX(Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + top + (wing ? Math.abs(p.getX(i)) * .045 : 0));
    geo.computeVertexNormals(); add(geo, bucket, undefined, undefined, color);
  }
  function cylinder(radiusFront, radiusRear, length, x, y, z, bucket = 'accent', color = silver, open = false) {
    add(new THREE.CylinderGeometry(radiusFront, radiusRear, length, 16, 1, open), bucket, [x, y, z], [Math.PI / 2, 0, 0], color);
  }

  add(loft([
    [-2.34, .44, .22, -.30], [-1.65, .69, .46, -.43], [-.55, .78, .56, -.48],
    [.5, .65, .52, -.39], [1.3, .49, .35, -.28], [2.35, .24, .12, -.15], [3.18, .018, -.01, -.035],
  ]), 'hull');
  // Dorsal shoulder and ventral keel have designed joins, not exposed end caps.
  add(loft([[-2.15, .28, .31, .18], [-1.35, .42, .59, .36], [-.62, .39, .62, .43]]), 'hull', undefined, undefined, slate);
  add(loft([[-1.9, .24, -.28, -.40], [-.4, .36, -.36, -.57], [1.65, .14, -.18, -.25]]), 'accent');

  // Opaque coated glass avoids transmission sorting against the overlapping
  // hull and stays readable at gameplay scale. The dark sill frames it.
  add(loft([[-.72, .36, .62, .49], [-.38, .46, .83, .50], [.55, .39, .80, .49], [1.44, .20, .40, .28]]), 'accent');
  add(loft([[-.58, .30, .65, .57], [-.30, .395, .99, .64], [.48, .33, .90, .61], [1.30, .15, .43, .36]]), 'glass');
  // Small cockpit centre seam and aft armor; no luminous bar through glass.
  add(loft([[-.58, .032, .666, .64], [-.30, .032, 1.006, .98], [.48, .027, .916, .89], [1.30, .015, .446, .43]]), 'hull', undefined, undefined, ivory);
  add(loft([[1.55, .12, .307, .282], [2.27, .06, .149, .124]]), 'hull', undefined, undefined, gold);

  const engines = [];
  for (const side of [-1, 1]) {
    const mirror = points => points.map(([x, z]) => [x * side, z]);
    const wing = [[.55, 1.10], [3.95, -1.40], [3.80, -2.02], [2.74, -1.86], [.60, -.90]];
    plate(mirror(wing), .055, .18, 'hull', silver, true);
    plate(mirror([[.84, .59], [3.66, -1.48], [2.82, -1.53], [1.12, -.71]]), .078, .025, 'accent', silver, true);
    plate(mirror([[1.02, .53], [3.63, -1.40], [3.53, -1.57], [1.02, .27]]), .11, .024, 'hull', ivory, true);
    plate(mirror([[1.36, -.44], [2.78, -1.22], [2.59, -1.39], [1.36, -.75]]), .11, .024, 'hull', slate, true);
    plate(mirror([[2.77, -.98], [2.95, -1.12], [2.70, -1.59], [2.51, -1.49]]), .14, .024, 'hull', gold, true);
    // Inlaid leading-edge light lies within the wing's outline and dihedral.
    plate(mirror([[1.54, .23], [3.24, -1.02], [3.16, -1.12], [1.54, .07]]), .125, .018, 'neon', 0x52bdcf, true);
    plate(mirror([[3.70, -1.47], [3.84, -1.53], [3.77, -1.85], [3.65, -1.81]]), .095, .025, 'neon', side < 0 ? 0xff4563 : 0x65dfac, true);

    // Armored nacelles with fitted intake lips, recessed throats and exhausts.
    const x = side * 1.05;
    cylinder(.36, .46, 2.15, x, -.10, -1.15, 'hull', slate);
    cylinder(.36, .35, .24, x, -.10, .04, 'accent', silver, true);
    add(new THREE.CircleGeometry(.295, 20), 'accent', [x, -.10, .065]);
    add(new THREE.TorusGeometry(.34, .047, 6, 24), 'hull', [x, -.10, .17], undefined, ivory);
    for (let j = 0; j < 4; j++) {
      add(new THREE.BoxGeometry(.48, .04, .09), 'accent', [x, .335, -.65 - j * .24]);
    }
    cylinder(.43, .38, .31, x, -.10, -2.34, 'accent', silver, true);
    for (const z of [-2.22, -2.45]) add(new THREE.TorusGeometry(.405, .047, 6, 24), 'hull', [x, -.10, z], undefined, silver);
    add(new THREE.TorusGeometry(.305, .038, 6, 24), 'accent', [x, -.10, -2.50]);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(.255, 24), mats.neon(0x8fe4ff, 1.35));
    glow.position.set(x, -.10, -2.515); glow.rotation.y = Math.PI; glow.renderOrder = 6;
    glow.name = `engine-core-${side}`; group.add(glow); engines.push(glow);

    // Fins are authored in Z/Y and extruded across X, then canted outward.
    const shape = new THREE.Shape([new THREE.Vector2(-2.03, .24), new THREE.Vector2(-2.02, 1.31), new THREE.Vector2(-1.65, 1.47), new THREE.Vector2(-.58, .29)]);
    const fin = new THREE.ExtrudeGeometry(shape, { depth: .09, bevelEnabled: true, bevelSize: .025, bevelThickness: .025, bevelSegments: 1 });
    fin.translate(0, 0, -.045); fin.rotateY(-Math.PI / 2);
    add(fin, 'hull', [side * .79, 0, 0], [0, 0, -side * .18], slate);
    // Paired receiver housings and barrels retain the existing muzzle stations.
    add(loft([[-.25, .18, .11, -.25], [.72, .18, .11, -.25], [1.3, .115, .025, -.20]]), 'hull', [side * 1.6, 0, 0], undefined, slate);
    cylinder(.075, .095, 1.15, side * 1.6, -.10, 1.825);
    add(new THREE.TorusGeometry(.079, .025, 6, 16), 'hull', [side * 1.6, -.10, 2.40], undefined, ivory);
    add(new THREE.CircleGeometry(.056, 12), 'accent', [side * 1.6, -.10, 2.412]);
    // Two livery ticks and a service hatch make the upper body feel manufactured.
    for (let j = 0; j < 2; j++) add(new THREE.BoxGeometry(.09, .025, .22), 'hull', [side * (.34 + j * .15), .543, -.85], undefined, ivory);
  }

  const materials = {
    hull: mats.playerHull, accent: mats.playerAccent, glass: mats.glass,
    neon: (mats._playerNeon ??= mats.track(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }))),
  };
  // Draw the occluded silhouette AFTER world depth but BEFORE the airframe.
  // Keeping it in the opaque queue with explicit alpha blending prevents the
  // ship's own depth from revealing hidden panels through its visible surfaces.
  const silhouette = new THREE.Mesh(mergeGeometries([...buckets.hull, ...buckets.accent, ...buckets.glass], false),
    (mats._playerSilhouette ??= mats.track(new THREE.MeshBasicMaterial({
      color: 0x7fe8ff, opacity: .32, depthWrite: false, depthFunc: THREE.GreaterDepth,
      blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation, toneMapped: false,
    }))));
  silhouette.name = 'occluded-airframe'; silhouette.renderOrder = 5; silhouette.visible = false;
  group.add(silhouette);
  for (const [key, parts] of Object.entries(buckets)) {
    const mesh = new THREE.Mesh(mergeGeometries(parts, false), materials[key]);
    parts.forEach(p => p.dispose()); mesh.geometry.computeBoundingSphere();
    mesh.name = `airframe-${key}`; mesh.castShadow = key !== 'neon'; mesh.renderOrder = 6;
    group.add(mesh);
  }
  group.userData.engines = engines; group.userData.silhouette = silhouette;
  return group;
}
