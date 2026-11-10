// Encodes filmed frames (work/frames/<id>/<variant>/) to public/footage, the same
// way capture.mjs does: 1080p60 lanczos from the 2x frames, plus the 2x master
// for keep4k shots. Used after glitch-scan --repair.
//   node capture/encode.mjs --only=a,b
//   node capture/encode.mjs --only=a,b --4k   -> only the 2x masters (<id>-4k.mp4), for the 4:5 short's crops
import { spawnSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { ROOT } from './browser.mjs';
const ONLY = process.argv.find(a => a.startsWith('--only='))?.slice(7).split(',');
const ONLY4K = process.argv.includes('--4k');
const { SHOTS } = await import('./shots.mjs');
const enc = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-pix_fmt', 'yuv420p', '-x264-params', 'keyint=30', '-movflags', '+faststart'];
for (const shot of SHOTS.filter(s => !ONLY || ONLY.includes(s.id))) {
  const base = `${ROOT}work/frames/${shot.id}/`;
  if (!existsSync(base)) continue;
  const vp = shot.viewport || { width: 1920, height: 1080 };
  for (const v of readdirSync(base)) {
    const src = `${base}${v}/%05d.jpg`, out = `${ROOT}public/footage/${shot.id}${v === 'main' ? '' : v.replace('@', '_')}`;
    if (!ONLY4K) spawnSync('ffmpeg', ['-y', '-v', 'error', '-framerate', '60', '-i', src, '-vf', `scale=${vp.width}:${vp.height}:flags=lanczos`, ...enc, `${out}.mp4`], { stdio: 'inherit' });
    if (shot.keep4k || ONLY4K) spawnSync('ffmpeg', ['-y', '-v', 'error', '-framerate', '60', '-i', src, ...enc, `${out}-4k.mp4`], { stdio: 'inherit' });
    console.log(`encoded ${shot.id} ${v}`);
  }
}
