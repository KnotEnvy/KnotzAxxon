/**
 * Procedural texture forge.
 *
 * The game ships zero binary assets — every surface here is painted into a
 * 2D canvas at boot and uploaded as a texture. Height fields are converted to
 * tangent-space normal maps with a Sobel filter so the PBR lighting has
 * something to bite on.
 */

import * as THREE from 'three';
import { Rng, clamp01, lerp, smoothstep } from '../core/Utils.js';

const cache = new Map();

/** Memoise by key so quality changes don't re-forge everything. */
function once(key, build) {
  if (!cache.has(key)) cache.set(key, build());
  return cache.get(key);
}

export function disposeTextures() {
  for (const v of cache.values()) {
    if (v?.isTexture) v.dispose();
    else if (v && typeof v === 'object') for (const t of Object.values(v)) t?.isTexture && t.dispose();
  }
  cache.clear();
}

/* ------------------------------------------------------------------ */
/* Canvas plumbing                                                     */
/* ------------------------------------------------------------------ */

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  return { c, ctx };
}

function finish(c, { srgb = false, repeat = 1, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/**
 * Sobel a grayscale canvas into a tangent-space normal map.
 * Wraps at the edges so tiling stays seamless.
 */
function heightToNormal(srcCanvas, strength = 2.2) {
  const size = srcCanvas.width;
  const sctx = srcCanvas.getContext('2d', { willReadFrequently: true });
  const src = sctx.getImageData(0, 0, size, size).data;

  const { c, ctx } = canvas(size);
  const out = ctx.createImageData(size, size);
  const d = out.data;
  const at = (x, y) => src[((y & (size - 1)) * size + (x & (size - 1))) * 4] / 255;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = at(x - 1, y - 1), t = at(x, y - 1), tr = at(x + 1, y - 1);
      const l = at(x - 1, y), r = at(x + 1, y);
      const bl = at(x - 1, y + 1), b = at(x, y + 1), br = at(x + 1, y + 1);
      const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);
      let nx = -dx * strength;
      let ny = dy * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

/** Fill with soft value-noise blobs — cheap and good enough for grime. */
function noiseFill(ctx, size, rng, { octaves = 4, alpha = 0.5, dark = true } = {}) {
  ctx.save();
  for (let o = 0; o < octaves; o++) {
    const cell = size / (4 << o);
    const a = (alpha / (o + 1)) * 0.9;
    for (let y = 0; y < size; y += cell) {
      for (let x = 0; x < size; x += cell) {
        const v = rng.next();
        const g = dark ? Math.floor(v * 90) : Math.floor(140 + v * 115);
        ctx.fillStyle = `rgba(${g},${g},${g},${a * v})`;
        ctx.fillRect(x, y, cell, cell);
      }
    }
  }
  ctx.restore();
}

/** Streaky vertical wear, the thing that makes metal read as used. */
function streaks(ctx, size, rng, count, color, maxAlpha) {
  for (let i = 0; i < count; i++) {
    const x = rng.next() * size;
    const w = rng.range(0.5, 3.5);
    const y0 = rng.next() * size;
    const h = rng.range(size * 0.08, size * 0.5);
    const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
    g.addColorStop(0, `rgba(${color},0)`);
    g.addColorStop(0.25, `rgba(${color},${maxAlpha * rng.range(0.4, 1)})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x, y0, w, h);
  }
}

/* ------------------------------------------------------------------ */
/* Height fields                                                       */
/* ------------------------------------------------------------------ */

/**
 * Armour plating: a grid of recessed panels with bevels, bolt heads and the
 * occasional vent. Returns the height canvas.
 */
function platingHeight(size, seed, { cells = 4, bevel = 0.055, bolts = true } = {}) {
  const rng = new Rng(seed);
  const { c, ctx } = canvas(size);
  ctx.fillStyle = '#7d7d7d';
  ctx.fillRect(0, 0, size, size);

  const step = size / cells;
  const gap = Math.max(2, size * 0.006);

  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const x = cx * step, y = cy * step;
      // A few panels merge into doubles so the grid doesn't read as a checker.
      const wide = rng.bool(0.18) && cx < cells - 1;
      const w = (wide ? step * 2 : step) - gap;
      const h = step - gap;
      if (wide) cx++;

      const base = 128 + rng.range(-16, 26);
      ctx.fillStyle = `rgb(${base},${base},${base})`;
      ctx.fillRect(x + gap / 2, y + gap / 2, w, h);

      // bevel: light on top-left, dark on bottom-right
      const b = Math.max(1.5, size * bevel * 0.25);
      ctx.fillStyle = `rgba(255,255,255,0.30)`;
      ctx.fillRect(x + gap / 2, y + gap / 2, w, b);
      ctx.fillRect(x + gap / 2, y + gap / 2, b, h);
      ctx.fillStyle = `rgba(0,0,0,0.34)`;
      ctx.fillRect(x + gap / 2, y + gap / 2 + h - b, w, b);
      ctx.fillRect(x + gap / 2 + w - b, y + gap / 2, b, h);

      if (bolts && rng.bool(0.72)) {
        const inset = step * 0.11;
        const r = Math.max(1.6, size * 0.006);
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        for (const [bx, by] of [
          [x + inset, y + inset], [x + w - inset + gap / 2, y + inset],
          [x + inset, y + h - inset], [x + w - inset + gap / 2, y + h - inset],
        ]) {
          ctx.beginPath();
          ctx.arc(bx + gap / 2, by + gap / 2, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // louvre vents
      if (rng.bool(0.16)) {
        const vx = x + w * 0.24, vy = y + h * 0.3, vw = w * 0.5, vh = h * 0.4;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(vx, vy, vw, vh);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        const slats = 4;
        for (let s = 0; s < slats; s++) {
          ctx.fillRect(vx, vy + (vh / slats) * s, vw, Math.max(1, vh / slats / 2.6));
        }
      }
    }
  }

  // welded seams + scratches
  ctx.globalAlpha = 0.5;
  streaks(ctx, size, rng, 26, '30,30,30', 0.5);
  streaks(ctx, size, rng, 12, '210,210,210', 0.28);
  ctx.globalAlpha = 1;
  noiseFill(ctx, size, rng, { octaves: 3, alpha: 0.20 });
  return c;
}

/** Industrial grating / catwalk deck. */
function gratingHeight(size, seed) {
  const rng = new Rng(seed);
  const { c, ctx } = canvas(size);
  ctx.fillStyle = '#202020';
  ctx.fillRect(0, 0, size, size);
  const bar = size / 16;
  ctx.fillStyle = '#c8c8c8';
  for (let i = 0; i < 16; i++) ctx.fillRect(i * bar, 0, bar * 0.55, size);
  ctx.fillStyle = '#8e8e8e';
  for (let i = 0; i < 8; i++) ctx.fillRect(0, i * bar * 2, size, bar * 0.4);
  noiseFill(ctx, size, rng, { octaves: 3, alpha: 0.3 });
  return c;
}

/* ------------------------------------------------------------------ */
/* Public texture sets                                                 */
/* ------------------------------------------------------------------ */

/**
 * Full PBR set for fortress armour.
 * @param {number} aniso renderer max anisotropy
 */
export function hullSet(aniso = 8, tint = [0.30, 0.35, 0.42]) {
  return once(`hull:${aniso}:${tint.join()}`, () => {
    const size = 512;
    const height = platingHeight(size, 0xa5f3, { cells: 4 });

    // albedo — tint the height field and grime it up
    const { c: albedo, ctx } = canvas(size);
    ctx.drawImage(height, 0, 0);
    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;
    const rng = new Rng(0x1234);
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i] / 255;
      const shade = 0.30 + v * 0.55;
      d[i] = clamp01(tint[0] * shade + rng.next() * 0.02) * 255;
      d[i + 1] = clamp01(tint[1] * shade + rng.next() * 0.02) * 255;
      d[i + 2] = clamp01(tint[2] * shade + rng.next() * 0.02) * 255;
    }
    ctx.putImageData(img, 0, 0);
    // rust / scorch streaks on top of the albedo only
    streaks(ctx, size, new Rng(0x77), 18, '92,52,26', 0.30);
    streaks(ctx, size, new Rng(0x99), 10, '10,12,16', 0.35);

    // roughness — panels are satin, seams and grime are rough
    const { c: rough, ctx: rctx } = canvas(size);
    rctx.drawImage(height, 0, 0);
    const rimg = rctx.getImageData(0, 0, size, size);
    const rd = rimg.data;
    for (let i = 0; i < rd.length; i += 4) {
      const v = rd[i] / 255;
      const r = lerp(0.82, 0.34, smoothstep((v - 0.35) / 0.5));
      rd[i] = rd[i + 1] = rd[i + 2] = r * 255;
    }
    rctx.putImageData(rimg, 0, 0);

    return {
      map: finish(albedo, { srgb: true, aniso }),
      normalMap: finish(heightToNormal(height, 2.6), { aniso }),
      roughnessMap: finish(rough, { aniso }),
    };
  });
}

/** Darker, coarser variant for structural blocks and the deck. */
export function deckSet(aniso = 8) {
  return once(`deck:${aniso}`, () => {
    const size = 512;
    const height = platingHeight(size, 0x77c1, { cells: 3, bolts: true });

    const { c: albedo, ctx } = canvas(size);
    ctx.drawImage(height, 0, 0);
    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i] / 255;
      const s = 0.16 + v * 0.34;
      d[i] = s * 0.72 * 255;
      d[i + 1] = s * 0.84 * 255;
      d[i + 2] = s * 1.0 * 255;
    }
    ctx.putImageData(img, 0, 0);
    streaks(ctx, size, new Rng(0xbeef), 30, '8,10,14', 0.5);

    const { c: rough, ctx: rctx } = canvas(size);
    rctx.fillStyle = '#b4b4b4';
    rctx.fillRect(0, 0, size, size);
    rctx.globalAlpha = 0.7;
    rctx.drawImage(height, 0, 0);
    rctx.globalAlpha = 1;

    return {
      map: finish(albedo, { srgb: true, aniso }),
      normalMap: finish(heightToNormal(height, 2.0), { aniso }),
      roughnessMap: finish(rough, { aniso }),
    };
  });
}

export function gratingSet(aniso = 8) {
  return once(`grate:${aniso}`, () => {
    const size = 256;
    const height = gratingHeight(size, 0x4242);
    const { c: albedo, ctx } = canvas(size);
    ctx.drawImage(height, 0, 0);
    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i] / 255;
      d[i] = v * 0.34 * 255;
      d[i + 1] = v * 0.40 * 255;
      d[i + 2] = v * 0.46 * 255;
    }
    ctx.putImageData(img, 0, 0);
    return {
      map: finish(albedo, { srgb: true, aniso }),
      normalMap: finish(heightToNormal(height, 3.4), { aniso }),
    };
  });
}

/** Diagonal hazard chevrons for barrier faces. */
export function hazardTexture(aniso = 8, color = '#ffb43a') {
  return once(`hazard:${color}:${aniso}`, () => {
    const size = 256;
    const { c, ctx } = canvas(size);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, size, size);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = size / 9;
    ctx.beginPath();
    for (let i = -size; i < size * 2; i += size / 4.5) {
      ctx.moveTo(i, 0);
      ctx.lineTo(i + size, size);
    }
    ctx.stroke();
    ctx.restore();
    const rng = new Rng(0x5150);
    ctx.globalAlpha = 0.35;
    noiseFill(ctx, size, rng, { octaves: 2, alpha: 0.4 });
    ctx.globalAlpha = 1;
    return finish(c, { srgb: true, aniso });
  });
}

/** Glowing circuitry, used as an emissive overlay on power structures. */
export function circuitTexture(aniso = 8) {
  return once(`circuit:${aniso}`, () => {
    const size = 512;
    const rng = new Rng(0xc0de);
    const { c, ctx } = canvas(size);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size, size);
    ctx.lineCap = 'square';
    ctx.strokeStyle = '#7cf6ff';
    ctx.shadowColor = '#45e0ff';

    for (let trace = 0; trace < 34; trace++) {
      let x = Math.floor(rng.next() * 16) * (size / 16);
      let y = Math.floor(rng.next() * 16) * (size / 16);
      ctx.lineWidth = rng.bool(0.3) ? 5 : 2.5;
      ctx.shadowBlur = ctx.lineWidth * 2.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      const segs = rng.int(3, 8);
      for (let s = 0; s < segs; s++) {
        const len = Math.floor(rng.range(1, 4)) * (size / 16);
        if (rng.bool()) x += rng.bool() ? len : -len;
        else y += rng.bool() ? len : -len;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      // solder pad at the end
      ctx.fillStyle = '#c8fbff';
      ctx.beginPath();
      ctx.arc(x, y, ctx.lineWidth * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    return finish(c, { srgb: true, aniso });
  });
}

/* ------------------------------------------------------------------ */
/* Sprites                                                             */
/* ------------------------------------------------------------------ */

/** Soft radial glow — the workhorse particle sprite. */
export function glowSprite(size = 128, falloff = 2.2) {
  return once(`glow:${size}:${falloff}`, () => {
    const { c, ctx } = canvas(size);
    const img = ctx.createImageData(size, size);
    const d = img.data;
    const half = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (x - half) / half;
        const dy = (y - half) / half;
        const r = Math.hypot(dx, dy);
        const a = Math.pow(clamp01(1 - r), falloff);
        const i = (y * size + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = 255;
        d[i + 3] = a * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  });
}

/** Four-point starburst for muzzle flashes and pickups. */
export function flareSprite(size = 256) {
  return once(`flare:${size}`, () => {
    const { c, ctx } = canvas(size);
    const half = size / 2;
    const core = ctx.createRadialGradient(half, half, 0, half, half, half);
    core.addColorStop(0, 'rgba(255,255,255,1)');
    core.addColorStop(0.12, 'rgba(255,255,255,0.85)');
    core.addColorStop(0.35, 'rgba(255,255,255,0.16)');
    core.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, size, size);

    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.translate(half, half);
      ctx.rotate((Math.PI / 2) * i + Math.PI / 4 * (i % 2));
      const g = ctx.createLinearGradient(0, 0, half, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      const w = i % 2 ? size * 0.012 : size * 0.02;
      ctx.fillRect(0, -w / 2, half, w);
      ctx.fillRect(-half, -w / 2, half, w);
      ctx.restore();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  });
}

/** Ring gradient used for shockwaves. */
export function ringSprite(size = 256) {
  return once(`ring:${size}`, () => {
    const { c, ctx } = canvas(size);
    const half = size / 2;
    // A thin, soft-shouldered band. Thickness here is the single biggest
    // factor in whether a shockwave reads as an edge or as a smoke ring.
    const g = ctx.createRadialGradient(half, half, 0, half, half, half);
    g.addColorStop(0.00, 'rgba(255,255,255,0)');
    g.addColorStop(0.80, 'rgba(255,255,255,0)');
    g.addColorStop(0.90, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.955, 'rgba(255,255,255,0.28)');
    g.addColorStop(1.00, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  });
}

/** Soft elliptical blob for the ship's ground shadow. */
export function blobShadowSprite(size = 256) {
  return once(`blob:${size}`, () => {
    const { c, ctx } = canvas(size);
    const half = size / 2;
    ctx.save();
    ctx.translate(half, half);
    ctx.scale(1, 0.62);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, half);
    g.addColorStop(0, 'rgba(0,0,0,0.85)');
    g.addColorStop(0.45, 'rgba(0,0,0,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, half, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  });
}
