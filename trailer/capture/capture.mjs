// Films the trailer's gameplay shots frame by frame from the real game.
//
//   node capture/capture.mjs                  every shot in shots.mjs
//   node capture/capture.mjs --only=a,b       some shots
//   node capture/capture.mjs --probe=20       a still every 20 frames (work/probe/<id>/), no video
//   node capture/capture.mjs --jobs=2         parallel browsers (default 1: see README)
//
// A shot is a deterministic scene (harness.js + pilot.js). `alts` re-renders
// every frame through other camera rigs from the same simulation, so a
// classic/modern comparison is the same instant, frame for frame.
// Output: public/footage/<id>[_alt].mp4 (1080p60 from 2x supersampled
// frames; `keep4k` also writes <id>[_alt]-4k.mp4) and work/events/<id>.json.
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { launch, gamePage, ROOT } from './browser.mjs';

const args = process.argv.slice(2);
const opt = n => args.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const ONLY = opt('only')?.split(',');
const PROBE = Number(opt('probe') || 0);
const JOBS = Number(opt('jobs') || 1);
const { SHOTS } = await import(new URL(opt('file') || './shots.mjs', import.meta.url).href);
const shots = SHOTS.filter(s => !ONLY || ONLY.includes(s.id));
if (!shots.length) { console.error('no shots match', ONLY); process.exit(1); }

export function speedAt(shot, f) {
  const k = shot.speed;
  if (!k) return 1;
  if (typeof k === 'number') return k;
  if (f <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) if (f <= k[i][0]) {
    const [f0, s0] = k[i - 1], [f1, s1] = k[i];
    const u = (f - f0) / Math.max(1, f1 - f0), e = u * u * (3 - 2 * u);
    return s0 + (s1 - s0) * e;
  }
  return k[k.length - 1][1];
}

function run(cmd, argv) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = ''; p.stderr.on('data', d => { err += d; });
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`${cmd} ${code}: ${err.slice(-800)}`)));
  });
}

// Share of pure-black cells in a 96x54 grey reduction of a frame.
function blackShare(path) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', path, '-vf', 'scale=96:54:flags=area,format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 24 });
  const b = r.stdout; let n = 0;
  for (let i = 0; i < b.length; i++) if (b[i] <= 2) n++;
  return n / Math.max(1, b.length);
}

/**
 * Screenshot one frame and check it: a frame with far more pure black than the
 * recent good frames (a blank or a black tile: the compositor read a canvas the
 * GPU had not finished) is drawn again and re-shot. A frame that will not come
 * good fails the shot rather than slipping into the footage.
 */
async function shoot(page, path, quality, hist) {
  const seen = [];
  for (let attempt = 0; ; attempt++) {
    const jpg = await page.screenshot({ path, type: 'jpeg', quality });
    // A frozen compositor keeps returning the last picture: the game never
    // produces two identical frames in a row, so treat that as a failure.
    if (hist.prevJpg && jpg.equals(hist.prevJpg)) {
      if (attempt >= 4) throw new Error(`compositor frozen (identical frames) at ${path}`);
      await page.waitForTimeout(100 * (attempt + 1));
      await page.evaluate(() => T.redraw());
      continue;
    }
    const k = blackShare(path);
    const ref = hist.length >= 3 ? [...hist].sort((a, b) => a - b)[Math.floor(hist.length / 2)] : null;
    const bad = k > 0.9 || (ref != null && k - ref > 0.03);
    seen.push(k);
    // The same picture three draws running is content, not a presentation glitch.
    const steady = seen.length >= 3 && Math.max(...seen.slice(-3)) - Math.min(...seen.slice(-3)) < 0.002;
    if (!bad || steady) {
      if (bad) console.warn(`  accepted as content (same on redraw): ${path} black ${k.toFixed(3)} vs ${ref?.toFixed(3)}`);
      hist.push(k); if (hist.length > 9) hist.shift();
      hist.prevJpg = jpg;
      return { retakes: attempt };
    }
    if (attempt >= 8) throw new Error(`frame stays glitched after retakes: ${path} (black ${k.toFixed(3)} vs ${ref?.toFixed(3)})`);
    await page.waitForTimeout(40 * (attempt + 1));
    await page.evaluate(() => T.redraw());
  }
}

async function film(browser, shot) {
  const scale = PROBE ? 1 : (shot.scale || 2);
  const vp = shot.viewport || { width: 1920, height: 1080 };
  const page = await gamePage(browser, { ...vp, scale, rng: shot.rng || 20261101 });
  const start = await page.evaluate(s => T.setup(s), shot.spec);
  const variants = [{ key: '', alt: null }, ...(shot.alts || []).map(a => (typeof a === 'string' ? { key: '@' + a, alt: a, crt: false } : { key: '@' + a.id, alt: a.rig, crt: !!a.crt }))];
  const base = PROBE ? `${ROOT}work/probe/${shot.id}/` : `${ROOT}work/frames/${shot.id}/`;
  await rm(base, { recursive: true, force: true });
  for (const v of variants) await mkdir(base + (v.key || 'main') + '/', { recursive: true });
  const t0 = Date.now();
  const states = [];
  const last = {};
  let retakes = 0;
  for (let f = 0; f < shot.frames; f++) {
    await page.evaluate(([sp]) => T.frame(sp), [speedAt(shot, f)]);
    const name = String(f + 1).padStart(5, '0');
    const want = !PROBE || (f + 1) % PROBE === 0 || f === 0;
    if (!want) continue;
    for (const v of variants) {
      if (v.alt) await page.evaluate(([a, c]) => T.renderAlt(a, c), [v.alt, v.crt]);
      const r = await shoot(page, `${base}${v.key || 'main'}/${name}.jpg`, PROBE ? 85 : 95, (last[v.key] ??= []));
      retakes += r.retakes;
      if (v.alt) await page.evaluate(() => T.restoreAlt());
    }
    if (PROBE) states.push(await page.evaluate(() => T.state()));
  }
  const log = await page.evaluate(() => T.audioLog);
  const absorbed = await page.evaluate(() => T.absorbed);
  const end = await page.evaluate(() => T.state());
  const errors = page.errors;
  await page.ctx.close();
  await mkdir(`${ROOT}work/events`, { recursive: true });
  if (!PROBE) await writeFile(`${ROOT}work/events/${shot.id}.json`, JSON.stringify({ id: shot.id, frames: shot.frames, speed: shot.speed ?? 1, start, end, absorbed, log }));
  if (PROBE) {
    await writeFile(`${base}states.json`, JSON.stringify(states, null, 1));
    await writeFile(`${base}log.json`, JSON.stringify({ absorbed, log }));
  } else {
    await mkdir(`${ROOT}public/footage`, { recursive: true });
    for (const v of variants) {
      const src = `${base}${v.key || "main"}/%05d.jpg`, out = `${ROOT}public/footage/${shot.id}${v.key.replace("@", "_")}`;
      const enc = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-pix_fmt', 'yuv420p', '-x264-params', 'keyint=30', '-movflags', '+faststart'];
      const W = Math.round(vp.width), H = Math.round(vp.height);
      await run('ffmpeg', ['-y', '-v', 'error', '-framerate', '60', '-i', src, '-vf', `scale=${W}:${H}:flags=lanczos`, ...enc, `${out}.mp4`]);
      if (shot.keep4k) await run('ffmpeg', ['-y', '-v', 'error', '-framerate', '60', '-i', src, ...enc, `${out}-4k.mp4`]);
    }
  }
  const counts = {}; for (const e of log) counts[e.n] = (counts[e.n] || 0) + 1;
  delete counts.setEngine; delete counts.setProximity;
  console.log(`${shot.id}: absorbed ${absorbed.length} ${JSON.stringify(absorbed.slice(0, 8))} | ${shot.frames} frames x${variants.length} in ${((Date.now() - t0) / 1000).toFixed(0)} s | retakes ${retakes} | end ${JSON.stringify(end)}${errors.length ? ' | ERRORS ' + errors.slice(0, 3).join(' / ') : ''}`);
  if (PROBE) console.log(`  events ${JSON.stringify(counts)}`);
}

// A fresh browser per shot: a GPU process that dies (it happens on this
// driver stack) can then only cost that one attempt, and the shot is retried.
const queue = [...shots];
let failures = 0;
await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, async () => {
  while (queue.length) {
    const shot = queue.shift();
    for (let attempt = 1; ; attempt++) {
      const browser = await launch();
      try { await film(browser, shot); break; }
      catch (e) {
        console.error(`${shot.id} attempt ${attempt} FAILED: ${(e.message || String(e)).split('\n')[0]}`);
        if (attempt >= 3) { failures++; break; }
      } finally { await browser.close().catch(() => {}); }
    }
  }
}));
if (failures) { console.error(`${failures} shot(s) failed`); process.exitCode = 1; }
