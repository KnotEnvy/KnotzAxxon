/** Real-page loss/recovery regression. Owns and closes its local QA server/browser. */
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { chromium } = require(process.env.KZ_PLAYWRIGHT_PATH || 'playwright');
const {startEvidence,finishEvidence} = require('./launch/browser-evidence.cjs');
const assert = require('node:assert/strict');
const out = process.env.KZ_OUT || 'artifacts/context-recovery';
const report = { status: 'running', cases: [], errors: [], renderer: 'SwiftShader software; no hardware-FPS claim' };
let server, browser;
(async () => {
 fs.mkdirSync(out, { recursive: true });
 try {
  let url = process.env.KZ_TEST_URL;
  if (!url) {
   const listener = require('node:net').createServer();
   await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
   const port = listener.address().port;
   await new Promise(resolve => listener.close(resolve));
   url = `http://127.0.0.1:${port}`;
   server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
  }
  let ready = false;
  for (let n = 0; n < 100; n++) {
   try { ready = (await fetch(url)).ok; } catch {}
   if (ready) break;
   await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'QA server readiness');
  browser = await chromium.launch({ headless: true, ...(process.env.KZ_CHROME_EXE ? {
   executablePath:process.env.KZ_CHROME_EXE,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']
  } : {args:['--use-angle=swiftshader','--enable-unsafe-swiftshader'],env:{...process.env,DISPLAY:'',WAYLAND_DISPLAY:''}}) });
  const page = await browser.newPage({ viewport: { width: 800, height: 450 }, hasTouch: true });
  page.setDefaultTimeout(90000);
  page.on('pageerror', error => report.errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('knotzaxxon.settings.v2', JSON.stringify({ quality: 'low', camera: 'classic', shake: 0, master: 0 })));
  await page.goto(url);
  await page.waitForFunction(() => !!window.KZ, undefined, { timeout: 90000 });
  report.rendering = await startEvidence(page);
  report.renderer = report.rendering.renderer;
  await page.locator('#screen-title [data-action="start"]').click();
  await page.waitForFunction(() => KZ.game.state === 'playing');
  await page.evaluate(() => { window.__lossExtension = KZ.engine.renderer.getContext().getExtension('WEBGL_lose_context'); });
  assert.ok(await page.evaluate(() => !!window.__lossExtension), 'WEBGL_lose_context is supported');
  const state = () => page.evaluate(() => ({ game: KZ.game.state, lost: KZ.engine._contextLost, running: KZ.engine.running, frame: KZ.engine.frame, suspended: KZ.engine.input._suspended }));
  for (const route of ['Escape', 'p', 'resume-button']) {
   await page.evaluate(() => window.__lossExtension.loseContext());
   await page.waitForFunction(() => KZ.engine._contextLost && KZ.game.state === 'paused');
   const lost = await state();
   const activate = () => route === 'resume-button'
    ? page.locator('#screen-pause [data-action="resume"]').click()
    : page.keyboard.press(route);
   await activate();
   assert.equal((await state()).game, 'paused', route + ' cannot resume during context loss');
   // Script actual touch handlers while rendering is stopped; these are queued input probes.
   await page.evaluate(() => {
    for (const id of ['tb-fire', 'tb-roll']) {
     document.getElementById(id).dispatchEvent(new Event('touchstart', { cancelable: true }));
     document.getElementById(id).dispatchEvent(new Event('touchend', { cancelable: true }));
    }
   });
   if (route === 'resume-button') await page.screenshot({ path: out + '/lost-paused.png' });
   await page.evaluate(() => window.__lossExtension.restoreContext());
   await page.waitForFunction(() => !KZ.engine._contextLost && KZ.engine.running, undefined, { timeout: 90000 });
   const restored = await state();
   assert.equal(restored.game, 'paused', route + ' restoration requires a fresh resume');
   assert.equal(await page.evaluate(() => KZ.engine.input._touchRollQueued || KZ.engine.input.justPressed('roll') || KZ.engine.input.justPressed('fire')), false, 'no stale touch edge');
   await page.waitForFunction(frame => KZ.engine.frame > frame, restored.frame);
   if (route === 'resume-button') await page.screenshot({ path: out + '/restored-paused.png' });
   await activate();
   await page.waitForFunction(() => KZ.game.state === 'playing');
   report.cases.push({ route, lost, restored, manuallyResumed: await state(), touchEdgesCleared: true });
  }
  await page.waitForFunction(() => getComputedStyle(document.getElementById('screen-pause')).opacity === '0');
  await page.evaluate(() => new Promise(resolve => {
   let frames = 0;
   function tick() { if (++frames === 8) resolve(); else requestAnimationFrame(tick); }
   requestAnimationFrame(tick);
  }));
  await page.screenshot({ path: out + '/manual-resume.png' });
  report.rendering = await finishEvidence(page,browser);
  assert.deepEqual(report.errors, []);
  report.status = 'passed';
 } catch (error) { report.status = 'failed'; report.failure = error.stack; process.exitCode = 1; }
 finally {
  await browser?.close(); server?.kill();
  fs.writeFileSync(out + '/report.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
 }
})();
