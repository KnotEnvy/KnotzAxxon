// Scans filmed frames for presentation glitches: blank frames and black tiles
// (a WebGL layer the compositor failed to present). Each frame is reduced to a
// 96x54 grey grid; a frame is flagged when it has many more pure-black cells
// than the frames around it, or is almost entirely black.
//   node capture/glitch-scan.mjs [--only=a,b]     -> prints flagged frames per shot/variant
//   node capture/glitch-scan.mjs --repair          -> also replaces each isolated glitched frame
//     (a black block of 10%+ of the picture, 1-2 frames long) with the frame before it,
//     keeps the original as <frame>.glitch.jpg, and lists the shots to re-encode
//     (node capture/encode.mjs --only=...).
import { readdirSync, existsSync, copyFileSync, renameSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { ROOT } from './browser.mjs';

const args = process.argv.slice(2);
const ONLY = args.find(a => a.startsWith('--only='))?.slice(7).split(',');
const REPAIR = args.includes('--repair');
const repaired = new Set();
const W = 96, H = 54, N = W * H;
const base = `${ROOT}work/frames/`;
let bad = 0;
for (const id of readdirSync(base).sort()) {
  if (ONLY && !ONLY.includes(id)) continue;
  for (const v of readdirSync(base + id).sort()) {
    const dir = `${base}${id}/${v}/`;
    if (!existsSync(dir + '00001.jpg')) continue;
    const r = spawnSync('ffmpeg', ['-v', 'error', '-i', dir + '%05d.jpg', '-vf', `scale=${W}:${H}:flags=area,format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 30 });
    const buf = r.stdout, frames = buf.length / N;
    const black = [];
    for (let f = 0; f < frames; f++) {
      let n = 0;
      for (let i = f * N; i < (f + 1) * N; i++) if (buf[i] <= 2) n++;
      black.push(n / N);
    }
    const flagged = [];
    for (let f = 0; f < frames; f++) {
      const around = [black[f - 2], black[f - 1], black[f + 1], black[f + 2]].filter(x => x != null).sort((a, b) => a - b);
      const ref = around.length ? around[Math.floor(around.length / 2)] : 0;
      if (black[f] > 0.9 || black[f] - ref > 0.03) flagged.push(f + 1);
    }
    if (REPAIR) {
      for (const f of flagged) {
        const i = f - 1;
        const around = [black[i - 2], black[i - 1], black[i + 1], black[i + 2]].filter(x => x != null).sort((a, b) => a - b);
        const ref = around[Math.floor(around.length / 2)] ?? 0;
        const isolated = !flagged.includes(f - 2) && !(flagged.includes(f - 1) && flagged.includes(f + 1));
        if (i > 0 && black[i] - ref > 0.1 && isolated) {
          const name = (n) => `${dir}${String(n).padStart(5, '0')}.jpg`;
          renameSync(name(f), name(f).replace('.jpg', '.glitch.jpg'));
          copyFileSync(name(f - 1), name(f));
          console.log(`  repaired ${id}/${v}/${f} (black ${black[i].toFixed(3)} vs ${ref.toFixed(3)})`);
          repaired.add(id);
        }
      }
    }
    if (flagged.length) { bad++; console.log(`${id}/${v}: ${flagged.length} flagged of ${frames}: ${flagged.slice(0, 20).join(',')}${flagged.length > 20 ? ' ...' : ''}`); }
  }
}
console.log(bad ? `${bad} shot variant(s) with glitches` : 'clean');
if (repaired.size) console.log(`re-encode: node capture/encode.mjs --only=${[...repaired].join(',')}`);
