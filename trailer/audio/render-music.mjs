// Renders the trailer score to work/audio/music.wav (32-bit float, 48 kHz).
//   --short: the 4:5 short's bar order (cue.js SHORT_MAP) -> work/audio/music-short.wav
import { mkdir, writeFile } from 'node:fs/promises';
import { launch, ORIGIN, ROOT } from '../capture/browser.mjs';
import { BPM, BARS, SHORT_MAP } from './cue.js';

const short = process.argv.includes('--short');
const map = short ? SHORT_MAP : null;
const seconds = (short ? SHORT_MAP.length : BARS) * 240 / BPM + 3;
const name = short ? 'music-short.wav' : 'music.wav';
const out = ROOT + 'work/audio/';
await mkdir(out, { recursive: true });
const browser = await launch({ gpu: false });
const page = await browser.newPage();
page.on('pageerror', e => console.error('pageerror', e.message));
page.on('console', m => { if (m.type() === 'error') console.error(m.text()); });
await page.goto(`${ORIGIN}/trailer/audio/render.html`);
await page.waitForFunction(() => window.A?.ready);
const t0 = Date.now();
const r = await page.evaluate(s => A.music(...s), [seconds, map]);
await writeFile(out + name, Buffer.from(r.wav, 'base64'));
console.log(`${name} ${seconds.toFixed(2)} s, peak ${r.peak.toFixed(3)} (${Date.now() - t0} ms)`);
await browser.close();
