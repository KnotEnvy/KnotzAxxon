#!/usr/bin/env node
/**
 * Compare each before/after pair in a capture directory. Node stdlib only.
 *
 * Prints, per pair, how many pixels the traffic draw changed, the largest change and the
 * separate lights it found (centre, size, peak change).
 *   --json FILE   write the same table as JSON
 *   --crops DIR   save an enlarged before | after crop around each light
 *   --mark DIR    save the after frame with a thin box around each light (review aid only)
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import zlib from 'node:zlib';

export function decodePng(file) {
  const b = readFileSync(file);
  let o = 8, w = 0, h = 0, type = 0; const idat = [];
  while (o < b.length) {
    const len = b.readUInt32BE(o), name = b.toString('latin1', o + 4, o + 8), data = b.subarray(o + 8, o + 8 + len);
    if (name === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); type = data[9]; if (data[8] !== 8 || data[12] !== 0) throw Error('8-bit non-interlaced PNG expected'); }
    if (name === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  const bpp = type === 6 ? 4 : type === 2 ? 3 : 0;
  if (!bpp) throw Error(`unsupported colour type ${type}`);
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, px = new Uint8Array(w * h * 3);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = Uint8Array.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, up = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let add = 0;
      if (f === 1) add = a; else if (f === 2) add = up; else if (f === 3) add = (a + up) >> 1;
      else if (f === 4) { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); add = pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      line[i] = (line[i] + add) & 255;
    }
    for (let x = 0; x < w; x++) { px[(y * w + x) * 3] = line[x * bpp]; px[(y * w + x) * 3 + 1] = line[x * bpp + 1]; px[(y * w + x) * 3 + 2] = line[x * bpp + 2]; }
    prev = line;
  }
  return { w, h, px };
}

export function encodePng({ w, h, px }) {
  const raw = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) Buffer.from(px.buffer, px.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  const chunk = (name, data) => { const out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length, 0); out.write(name, 4, 'latin1'); data.copy(out, 8); out.writeUInt32BE(zlib.crc32(out.subarray(4, 8 + data.length)), 8 + data.length); return out; };
  const head = Buffer.alloc(13); head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const crop = (img, x0, y0, cw, ch, scale) => {
  const out = { w: cw * scale, h: ch * scale, px: new Uint8Array(cw * scale * ch * scale * 3) };
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) {
    const s = ((y0 + Math.floor(y / scale)) * img.w + x0 + Math.floor(x / scale)) * 3, d = (y * out.w + x) * 3;
    out.px[d] = img.px[s]; out.px[d + 1] = img.px[s + 1]; out.px[d + 2] = img.px[s + 2];
  }
  return out;
};
const beside = (a, b, gap = 6) => {
  const out = { w: a.w + gap + b.w, h: a.h, px: new Uint8Array((a.w + gap + b.w) * a.h * 3).fill(40) };
  for (let y = 0; y < a.h; y++) { out.px.set(a.px.subarray(y * a.w * 3, (y + 1) * a.w * 3), y * out.w * 3); out.px.set(b.px.subarray(y * b.w * 3, (y + 1) * b.w * 3), (y * out.w + a.w + gap) * 3); }
  return out;
};

function compare(dir, name) {
  const after = decodePng(join(dir, `${name}--after.png`)), before = decodePng(join(dir, `${name}--before.png`));
  const { w, h } = after, mask = new Uint8Array(w * h), delta = new Uint8Array(w * h);
  let changed = 0, max = 0;
  for (let i = 0; i < w * h; i++) {
    const d = Math.max(Math.abs(after.px[i * 3] - before.px[i * 3]), Math.abs(after.px[i * 3 + 1] - before.px[i * 3 + 1]), Math.abs(after.px[i * 3 + 2] - before.px[i * 3 + 2]));
    delta[i] = d; if (d > max) max = d; if (d > 6) { mask[i] = 1; changed++; }
  }
  const lights = [], seen = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || seen[i]) continue;
    const stack = [i]; seen[i] = 1; let n = 0, sx = 0, sy = 0, x0 = w, x1 = 0, y0 = h, y1 = 0, peak = 0;
    while (stack.length) {
      const k = stack.pop(), x = k % w, y = (k - x) / w;
      n++; sx += x; sy += y; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); peak = Math.max(peak, delta[k]);
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const xx = x + dx, yy = y + dy, j = yy * w + xx;
        if (xx >= 0 && xx < w && yy >= 0 && yy < h && mask[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
    if (n >= 4) lights.push({ x: Math.round(sx / n), y: Math.round(sy / n), w: x1 - x0 + 1, h: y1 - y0 + 1, pixels: n, peak });
  }
  return { pair: name, size: [w, h], changedPixels: changed, share: +(changed / (w * h)).toFixed(5), maxDelta: max, lights, after, before };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2], opt = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const crops = opt('--crops'), mark = opt('--mark'), json = opt('--json'), rows = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith('--after.png')).sort()) {
    const r = compare(dir, f.replace('--after.png', ''));
    console.log(`${r.pair.padEnd(44)} changed ${String(r.changedPixels).padStart(6)} px (${(r.share * 100).toFixed(3)}%) max ${String(r.maxDelta).padStart(3)} lights ${r.lights.length}: ` + r.lights.slice(0, 8).map((l) => `(${l.x},${l.y} ${l.w}x${l.h} +${l.peak})`).join(' '));
    if (crops) {
      mkdirSync(crops, { recursive: true });
      r.lights.slice(0, 6).forEach((l, i) => {
        const cw = Math.min(200, r.size[0]), ch = Math.min(130, r.size[1]);
        const x0 = Math.max(0, Math.min(r.size[0] - cw, l.x - cw / 2)) | 0, y0 = Math.max(0, Math.min(r.size[1] - ch, l.y - ch / 2)) | 0;
        writeFileSync(join(crops, `${r.pair}--light${i}.png`), encodePng(beside(crop(r.before, x0, y0, cw, ch, 3), crop(r.after, x0, y0, cw, ch, 3))));
      });
    }
    if (mark) {
      mkdirSync(mark, { recursive: true });
      const img = { w: r.after.w, h: r.after.h, px: Uint8Array.from(r.after.px) };
      const dot = (x, y) => { if (x >= 0 && x < img.w && y >= 0 && y < img.h) img.px.set([255, 255, 0], (y * img.w + x) * 3); };
      for (const l of r.lights) { const x0 = l.x - l.w / 2 - 8 | 0, x1 = l.x + l.w / 2 + 8 | 0, y0 = l.y - l.h / 2 - 8 | 0, y1 = l.y + l.h / 2 + 8 | 0; for (let x = x0; x <= x1; x++) { dot(x, y0); dot(x, y1); } for (let y = y0; y <= y1; y++) { dot(x0, y); dot(x1, y); } }
      writeFileSync(join(mark, `${r.pair}--marked.png`), encodePng(img));
    }
    delete r.after; delete r.before; rows.push(r);
  }
  if (json) writeFileSync(json, JSON.stringify(rows, null, 1));
}
