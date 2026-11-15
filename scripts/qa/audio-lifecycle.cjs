/** Actual Chromium AudioContext checks; not an audition or physical-device proof. */
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const out = process.env.KZ_OUT || 'artifacts/audio-lifecycle';
const report = { status: 'running', checks: [], errors: [], limitations: ['Software-rendered Chromium; no audible mix, mobile OS interruption or hardware performance verdict.'] };
let server, browser;
(async () => {
 fs.mkdirSync(out, { recursive: true });
 try {
  const listener = require('node:net').createServer();
  await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const url = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
  let ready = false;
  for (let n = 0; n < 100; n++) {
   try { ready = (await fetch(url)).ok; } catch {}
   if (ready) break;
   await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'local QA server readiness');
  browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'], env: { ...process.env, DISPLAY: '', WAYLAND_DISPLAY: '' } });
  const page = await browser.newPage({ viewport: { width: 800, height: 450 }, hasTouch: true });
  page.setDefaultTimeout(90000);
  page.on('pageerror', error => report.errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('knotzaxxon.settings.v2', JSON.stringify({ quality: 'low', camera: 'classic', shake: 0, master: 0 })));
  await page.goto(url);
  await page.waitForFunction(() => !!window.KZ);
  await page.evaluate(async () => { window.__qaAudio = (await import('/src/audio/Audio.js')).audio; });
  await page.keyboard.press('Escape');
  report.escapeFirstState = await page.evaluate(() => window.__qaAudio.ctx?.state ?? null);
  await page.locator('#screen-title [data-action="howto"]').tap();
  await page.waitForFunction(() => window.__qaAudio.ready && window.__qaAudio.ctx.state === 'running');
  await page.evaluate(() => { window.__qaAudioContext = window.__qaAudio.ctx; });
  report.checks.push('trusted touch gesture unlocks the actual audio context');
  await page.evaluate(() => window.__qaAudio.ctx.suspend());
  assert.equal(await page.evaluate(() => window.__qaAudio.ctx.state), 'suspended');
  await page.locator('#screen-howto [data-action="back"]').tap();
  await page.waitForFunction(() => window.__qaAudio.ctx.state === 'running');
  assert.equal(await page.evaluate(() => window.__qaAudio.ctx === window.__qaAudioContext), true);
  report.checks.push('trusted touch restores a suspended context without replacing it');
  await page.evaluate(() => window.__qaAudio.ctx.suspend());
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => window.__qaAudio.ctx.state === 'running');
  report.checks.push('trusted key restores a suspended context');
  const other = await browser.newPage();
  await other.goto('about:blank');
  await other.bringToFront();
  const hidden = await page.waitForFunction(() => document.hidden, undefined, { timeout: 3000 }).then(() => true, () => false);
  if (hidden) {
   await page.waitForFunction(() => window.__qaAudio.ctx.state === 'suspended');
   report.checks.push('actual background-tab visibility suspends the audio context');
   await page.bringToFront();
   await page.waitForFunction(() => !document.hidden);
   // A fresh trusted gesture is valid even on engines that require activation on return.
   await page.keyboard.press('ArrowUp');
   await page.waitForFunction(() => window.__qaAudio.ctx.state === 'running');
   report.checks.push('audio recovers on return and fresh activation');
  } else {
   report.limitations.push('This headless browser keeps tabs visible; actual hidden-tab behavior was not established here. CPU fixtures cover the visibility handler.');
  }
  await other.close();
  await page.screenshot({ path: out + '/after-recovery.png' });
  assert.deepEqual(report.errors, []);
  report.status = 'passed';
 } catch (error) { report.status = 'failed'; report.failure = error.stack; process.exitCode = 1; }
 finally {
  await browser?.close(); server?.kill();
  fs.writeFileSync(out + '/report.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
 }
})();
