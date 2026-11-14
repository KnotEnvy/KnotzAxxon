const world = new Float32Array(9);

export function prepareWreckage(document) {
  if (document.schema !== 'wreckage-cached-templates-v1') throw new Error('Unsupported wreckage templates');
  return document.variants.map(variant => ({
    name: variant.name,
    buckets: Object.fromEntries(Object.entries(variant.buckets).map(([key, data]) => [key, {
      p: new Float32Array(data.p), n: new Float32Array(data.n), c: new Float32Array(data.c), slots: new Int8Array(data.slots),
    }])),
  }));
}

export function consumeOriginalWreckDraws(rng, z0) {
  const entryState = rng._s;
  const side = rng.bool() ? 1 : -1;
  const x = side * rng.range(60, 150);
  const y = rng.range(-50, 70);
  const z = z0 + rng.range(10, 86);
  const size = rng.range(10, 22);
  const yaw = rng.range(-.8, .8);
  const bank = rng.range(-.6, .6);
  const embers = [];
  for (let slot = 0; slot < 4; slot++) {
    const legacyWidth = rng.range(1, 3);
    const legacyX = x + rng.range(-size * .2, size * .2);
    const legacyY = y + rng.range(-size * .2, size * .2);
    const legacyZ = z + rng.range(-size * .6, size * .6);
    const rate = rng.range(.8, 1.6);
    const phase = rng.next();
    embers.push({ legacyWidth, legacyX, legacyY, legacyZ, anim: [4, rate, phase] });
  }
  let hash = (entryState ^ Math.imul(Math.floor(z0 / 96), 0x9E3779B1)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x85EBCA6B);
  hash = Math.imul(hash ^ (hash >>> 13), 0xC2B2AE35);
  const variant = ((hash ^ (hash >>> 16)) >>> 0) & 1;
  return { x, y, z, size, yaw, bank, embers, variant };
}

export function appendWreckage(batch, templates, placement) {
  const { x, y, z, size, yaw, bank, embers, variant } = placement;
  const cosBank = Math.cos(bank), sinBank = Math.sin(bank);
  const cosYaw = Math.cos(yaw), sinYaw = Math.sin(yaw);
  for (const [key, template] of Object.entries(templates[variant].buckets)) {
    const bucket = batch._bucket(key);
    const { p, n, c, slots } = template;
    bucket.reserve(p.length / 3);
    const ao = key === 'dark';
    let minY = Infinity, maxY = -Infinity;
    if (ao) for (let offset = 0; offset < p.length; offset += 3) {
      const up = size * (p[offset] * sinBank + p[offset + 1] * cosBank);
      minY = Math.min(minY, up); maxY = Math.max(maxY, up);
    }
    const span = maxY - minY;
    const inverseUV = 1 / (ao ? 12 : 8);
    for (let offset = 0; offset < p.length; offset += 9) {
      for (let corner = 0; corner < 3; corner++) {
        const index = offset + corner * 3;
        const across = size * (p[index] * cosBank - p[index + 1] * sinBank);
        const up = size * (p[index] * sinBank + p[index + 1] * cosBank);
        const forward = p[index + 2] * size;
        world[corner * 3] = across * cosYaw + forward * sinYaw + x;
        world[corner * 3 + 1] = up + y;
        world[corner * 3 + 2] = -across * sinYaw + forward * cosYaw + z;
      }
      const firstX = world[3] - world[0], firstY = world[4] - world[1], firstZ = world[5] - world[2];
      const secondX = world[6] - world[0], secondY = world[7] - world[1], secondZ = world[8] - world[2];
      const faceX = Math.abs(firstY * secondZ - firstZ * secondY);
      const faceY = Math.abs(firstZ * secondX - firstX * secondZ);
      const faceZ = Math.abs(firstX * secondY - firstY * secondX);
      const plane = faceX >= faceY && faceX >= faceZ ? 0 : faceY >= faceZ ? 1 : 2;
      for (let corner = 0; corner < 3; corner++) {
        const index = offset + corner * 3;
        const acrossNormal = n[index] * cosBank - n[index + 1] * sinBank;
        const upNormal = n[index] * sinBank + n[index + 1] * cosBank;
        const normalX = acrossNormal * cosYaw + n[index + 2] * sinYaw;
        const normalZ = -acrossNormal * sinYaw + n[index + 2] * cosYaw;
        const worldX = world[corner * 3], worldY = world[corner * 3 + 1], worldZ = world[corner * 3 + 2];
        let shade = 1;
        if (ao) {
          if (span > .6) shade = .58 + .42 * Math.sqrt(Math.max(0, worldY - y - minY) / span);
          if (upNormal > .7) shade *= 1.1;
          if (normalZ < -.7) shade *= batch.frontLift;
          else if (Math.abs(normalX) > .7) shade *= batch.sideLift;
        }
        const gain = ao ? 1 : 1.4;
        const fx = ao ? null : embers[slots[index / 3]];
        const u = (plane === 0 ? worldZ : worldX) * inverseUV;
        const v = (plane === 1 ? worldZ : worldY) * inverseUV;
        batch._vertex(bucket, worldX, worldY, worldZ, normalX, upNormal, normalZ, u, v, c[index] * gain, c[index + 1] * gain, c[index + 2] * gain, shade, fx, x, y, z);
      }
    }
  }
}

export function emitReplacement(batch, rng, z0, templates, capture = null) {
  const placement = consumeOriginalWreckDraws(rng, z0);
  appendWreckage(batch, templates, placement);
  if (capture) capture(placement);
  return placement;
}

export function releaseWreckageTemplates(templates) {
  templates.length = 0;
}
