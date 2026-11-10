// Sound pass: each shot's game sound, from the audio calls logged while it
// was filmed (work/events/<id>.json), replayed through the game's own Audio
// offline. Calls are stamped with the frame they happened on, so the sound
// matches the picture by construction; the pass checks that every logged
// call was played.
//   node capture/sfx-pass.mjs [--only=a,b] [--jobs=6]
// Output: public/audio/sfx/<id>.wav (48 kHz, 24-bit).
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { launch, ORIGIN, ROOT } from './browser.mjs';

const args = process.argv.slice(2);
const opt = n => args.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const ONLY = opt('only')?.split(',');
const JOBS = Number(opt('jobs') || 6);
const SKY = ['dusk', 'dusk', 'deepspace', 'ember', 'deepspace', 'ember', 'void', 'void'];
const ENV = ['fortress', 'fortress', 'space', 'fortress', 'space', 'fortress', 'fortress', 'arena'];
const SKIP = new Set(['init', 'dispose', 'startMusic', 'stopMusic', 'setIntensity', 'setPaused', 'duckMusic', 'jingle', 'sting']);

const run = (cmd, argv) => new Promise((res, rej) => {
  const p = spawn(cmd, argv, { stdio: ['ignore', 'ignore', 'pipe'] }); let e = '';
  p.stderr.on('data', d => { e += d; }); p.on('close', c => (c ? rej(new Error(e.slice(-500))) : res()));
});

const ids = (await readdir(`${ROOT}work/events`)).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).filter(id => !ONLY || ONLY.includes(id)).sort();
await mkdir(`${ROOT}public/audio/sfx`, { recursive: true });
await mkdir(`${ROOT}work/sfx`, { recursive: true });
const browser = await launch({ gpu: false });
const queue = [...ids];
await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, async () => {
  while (queue.length) {
    const id = queue.shift();
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    try {
      const ev = JSON.parse(await readFile(`${ROOT}work/events/${id}.json`, 'utf8'));
      await page.goto(`${ORIGIN}/trailer/audio/render.html`);
      await page.waitForFunction(() => window.A?.ready);
      const sector = Math.max(0, ev.start.sector);
      const r = await page.evaluate(o => A.sfx(o), { log: ev.log, frames: ev.frames, env: ENV[sector], flavor: SKY[sector], bossPhase: ev.start.boss ? ev.start.boss.phase : null });
      const raw = `${ROOT}work/sfx/${id}.f32.wav`;
      await writeFile(raw, Buffer.from(r.wav, 'base64'));
      await run('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-c:a', 'pcm_s24le', `${ROOT}public/audio/sfx/${id}.wav`]);
      const want = {}; for (const e of ev.log) if (!SKIP.has(e.n)) want[e.n] = (want[e.n] || 0) + 1;
      const diff = Object.keys({ ...want, ...r.counts }).filter(k => want[k] !== r.counts[k]).map(k => `${k} ${want[k] || 0}/${r.counts[k] || 0}`);
      const shown = Object.entries(r.counts).filter(([k]) => !['setEngine', 'setProximity'].includes(k)).map(([k, v]) => `${k}:${v}`).join(' ');
      console.log(`${id}: peak ${r.peak.toFixed(2)} | ${diff.length ? 'MISSED ' + diff.join(', ') : 'all events played'} | ${shown}${errors.length ? ' | ERR ' + errors[0] : ''}`);
    } catch (e) { console.error(`${id} FAILED ${e.message}`); }
    await page.close();
  }
}));
await browser.close();
