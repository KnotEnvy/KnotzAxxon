// Fly the whole campaign on one seed with the trailer autopilot and save a
// still every N frames plus the event log: the map for picking shots.
//   node capture/survey.mjs --seed=19403 --every=30 --camera=classic
import { launch, gamePage, ROOT } from './browser.mjs';
import { mkdir, writeFile, rm } from 'node:fs/promises';
const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const seed = Number(args.seed || 19403), every = Number(args.every || 30), camera = args.camera || 'classic';
const max = Number(args.frames || 60 * 330);
const dir = `${ROOT}work/survey/${args.name || seed + '-' + camera}/`;
await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true });
const browser = await launch();
const page = await gamePage(browser, { width: 1920, height: 1080, scale: 1 });
await page.evaluate(s => T.setup(s), { seed, camera, crt: false, pilot: JSON.parse(args.pilot || '{}') });
const states = [];
let f = 0;
while (f < max) {
  const st = await page.evaluate(n => T.run(n), every);
  f += every;
  const name = String(f).padStart(6, '0');
  await page.screenshot({ path: `${dir}${name}.jpg`, type: 'jpeg', quality: 80 });
  states.push(st);
  if (st.state !== 'playing') { console.log('state', st.state, 'at', f); if (st.state === 'victory' || st.state === 'over') break; }
  if (f % 1800 === 0) console.log(JSON.stringify(st));
}
const log = await page.evaluate(() => T.audioLog);
const absorbed = await page.evaluate(() => T.absorbed);
await writeFile(`${dir}log.json`, JSON.stringify({ seed, camera, states, absorbed, log }));
const counts = {}; for (const e of log) counts[e.n] = (counts[e.n] || 0) + 1;
console.log('absorbed', absorbed.length, JSON.stringify(absorbed.slice(0, 40)));
console.log('audio', JSON.stringify(counts));
console.log('errors', page.errors.slice(0, 5));
await browser.close();
