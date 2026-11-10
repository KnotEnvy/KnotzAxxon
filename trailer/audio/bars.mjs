// Per-bar loudness (LUFS, momentary energy averaged over each bar) of a WAV/video.
//   node audio/bars.mjs <file> [--offset=seconds] [--compare=<file>]
import { spawnSync } from 'node:child_process';
const BAR = 240 / 144;
const args = process.argv.slice(2);
const opt = n => args.find(a => a.startsWith(`--${n}=`))?.split('=')[1];
const files = [args.find(a => !a.startsWith('--')), opt('compare')].filter(Boolean);
const offset = Number(opt('offset') || 0);
function bars(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const rows = [...r.stderr.matchAll(/t:\s*([\d.]+)\s+TARGET.*?M:\s*(-?[\d.]+|-inf)/g)].map(m => [Number(m[1]), m[2] === '-inf' ? -120 : Number(m[2])]);
  const I = r.stderr.match(/I:\s+(-?[\d.]+) LUFS/g)?.pop();
  const peak = r.stderr.match(/Peak:\s+(-?[\d.]+) dBFS/g)?.pop();
  const out = [];
  for (const [t, m] of rows) { const b = Math.floor((t - 0.4 / 2 - offset) / BAR); if (b < 0) continue; (out[b] ||= []).push(Math.pow(10, m / 10)); }
  return { per: out.map(v => v ? 10 * Math.log10(v.reduce((a, x) => a + x, 0) / v.length) : null), I, peak };
}
const res = files.map(bars);
res.forEach((r, i) => console.log(files[i], r.I, r.peak));
const n = Math.max(...res.map(r => r.per.length));
let line = '';
for (let b = 0; b < n; b++) {
  line += `${String(b).padStart(2)}:${res.map(r => (r.per[b] == null ? '  -  ' : r.per[b].toFixed(1).padStart(6))).join('/')}  `;
  if (b % 8 === 7) { console.log(line); line = ''; }
}
if (line) console.log(line);
