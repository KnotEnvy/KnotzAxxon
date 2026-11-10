// Peak (dBFS) per bar of a 32-bit float WAV, to find what will hit the limiter.
import { readFileSync } from 'node:fs';
const buf = readFileSync(process.argv[2]);
const sr = buf.readUInt32LE(24), ch = buf.readUInt16LE(22);
let o = 12; while (buf.toString('ascii', o, o + 4) !== 'data') o += 8 + buf.readUInt32LE(o + 4);
const data = new Float32Array(buf.buffer.slice(buf.byteOffset + o + 8, buf.byteOffset + o + 8 + buf.readUInt32LE(o + 4)));
const bar = Math.round(sr * 240 / 144), out = [];
for (let i = 0; i < data.length; i += ch) { const b = Math.floor(i / ch / bar); out[b] = Math.max(out[b] || 0, Math.abs(data[i]), Math.abs(data[i + 1] || 0)); }
console.log(out.map((p, b) => `${b}:${(20 * Math.log10(p + 1e-9)).toFixed(1)}`).join(' '));
