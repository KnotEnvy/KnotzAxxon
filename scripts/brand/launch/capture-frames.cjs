/**
 * Real-engine capture driver for title evidence and marketing source frames.
 * Runs under Windows Node with the installed Windows Chrome so frames come
 * from the actual GPU; Playwright talks to Chrome over its local child-process
 * pipe (no remote-debugging port). Launched from WSL by capture.cjs.
 *
 * Env: KZ_PLAYWRIGHT_PATH, KZ_CHROME_EXE, KZ_CAPTURE_PLAN (JSON), KZ_CAPTURE_OUT.
 * Every shot records the unmasked renderer, browser build, viewport, DPR,
 * drawing-buffer size, quality settings, engine frame count and game state.
 * A software renderer is recorded as such and never labelled hardware.
 */
const fs = require('node:fs');
const path = require('node:path');
const pw = require(process.env.KZ_PLAYWRIGHT_PATH);

const plan = JSON.parse(fs.readFileSync(process.env.KZ_CAPTURE_PLAN, 'utf8'));
const out = process.env.KZ_CAPTURE_OUT;
fs.mkdirSync(out, { recursive: true });
const log = (x) => {
  const line = JSON.stringify({ at: new Date().toISOString(), operator: 'Opus High title/marketing', ...x });
  fs.appendFileSync(path.join(out, 'capture.jsonl'), line + '\n');
  console.log(line.length > 400 ? line.slice(0, 400) + '...' : line);
};

const PROBE = async () => {
  const c = document.createElement('canvas'), g = c.getContext('webgl2');
  if (!g) return { webgl2: false };
  const e = g.getExtension('WEBGL_debug_renderer_info');
  return { webgl2: true, vendor: e && g.getParameter(e.UNMASKED_VENDOR_WEBGL), renderer: e && g.getParameter(e.UNMASKED_RENDERER_WEBGL),
    userAgent: navigator.userAgent, viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio } };
};

/** Capture instrumentation only: hold the engine's adaptive resolution at 1.0
 * so the drawing buffer equals the viewport. The shipped game is unchanged. */
const PIN = () => {
  const e = window.KZ.engine;
  e._adaptResolution = function pinnedForCapture() { this.stats.scale = this._renderScale; };
  e._renderScale = 1; e._onResize();
  const c = e.renderer.domElement;
  return { pinned: true, renderScale: e._renderScale, pixelRatio: e.renderer.getPixelRatio(), buffer: [c.width, c.height],
    method: 'instance _adaptResolution replaced with a no-op in the capture page; _renderScale=1; _onResize()' };
};

/** Pixel proof from the saved PNG itself: size and luminance statistics. */
const PIXELS = async (b64) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let sum = 0, sq = 0, dark = 0, bright = 0; const bins = new Set();
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    sum += y; sq += y * y; if (y < 16) dark++; if (y > 200) bright++;
    bins.add((d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | (d[i + 2] >> 4));
  }
  const n = d.length / 4, mean = sum / n;
  return { width: c.width, height: c.height, meanLuma: +mean.toFixed(2), stdLuma: +Math.sqrt(sq / n - mean * mean).toFixed(2),
    darkFraction: +(dark / n).toFixed(4), brightFraction: +(bright / n).toFixed(4), colorBins12bit: bins.size };
};

const STATE = () => {
  const k = window.KZ, canvas = document.getElementById('viewport');
  const base = { activeScreen: document.querySelector('.screen.is-active')?.id ?? null,
    canvas: canvas ? { width: canvas.width, height: canvas.height, cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight } : null,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, coarse: matchMedia('(pointer: coarse)').matches };
  if (!k) return base;
  const p = k.game.player;
  return { ...base, state: k.game.state, seed: k.game.seed, loop: k.game.loop, sector: k.game.sectorIndex,
    attract: k.game._attract ? { ...k.game._attract } : null, pos: p.pos.toArray().map(v => +v.toFixed(2)),
    enemies: k.game.enemies.length, boss: !!k.game.boss, frame: k.engine.frame, renderScale: k.engine._renderScale,
    fps: k.engine.stats?.fps, settings: { ...k.settings.values } };
};

(async () => {
  const browser = await pw.chromium.launch({ executablePath: process.env.KZ_CHROME_EXE, headless: true,
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=user-gesture-required'] });
  log({ op: 'browser', version: browser.version(), plan: plan.name });
  try {
    for (const job of plan.jobs) {
      const context = await browser.newContext({ viewport: job.viewport, deviceScaleFactor: job.dpr ?? 1,
        hasTouch: !!job.touch, isMobile: !!job.touch, reducedMotion: job.reducedMotion ? 'reduce' : 'no-preference' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.addInitScript(({ settings }) => {
        // Only Vite's localhost HMR socket is disabled; game code is untouched.
        const Native = window.WebSocket;
        window.WebSocket = class extends Native { constructor(u, p) { super(p === 'vite-hmr' ? 'ws://127.0.0.1:1' : u, p); } };
        if (settings) try { localStorage.setItem('knotzaxxon.settings.v2', JSON.stringify(settings)); } catch {}
      }, { settings: job.settings ?? null });
      await page.goto(job.url, { waitUntil: 'load', timeout: 60000 });
      await page.waitForSelector('.screen.is-active:not(#screen-boot)', { timeout: 120000 });
      const probe = await page.evaluate(PROBE);
      const software = !probe.renderer || /swiftshader|llvmpipe|software|basic render/i.test(probe.renderer);
      log({ op: 'job', job: job.name, url: job.url, probe, renderClass: software ? 'software-diagnostic' : 'hardware' });
      for (const step of job.steps) {
        if (step.wait) await page.waitForTimeout(step.wait);
        if (step.pin) log({ op: 'instrumentation', job: job.name, pin: await page.evaluate(PIN) });
        if (step.eval) await page.evaluate(step.eval);
        if (step.down) for (const k of step.down) await page.keyboard.down(k);
        if (step.up) for (const k of step.up) await page.keyboard.up(k);
        if (step.press) await page.keyboard.press(step.press);
        if (step.tap) await page.locator(step.tap).tap();
        if (step.shot) {
          if (step.hideUi) await page.addStyleTag({ content: '.screen,#hud,.hud,#touch,.attract-cut,.perf{visibility:hidden!important}' }).then(h => (step._style = h));
          const state = await page.evaluate(STATE);
          const file = `${step.shot}.png`;
          const png = await page.screenshot({ path: path.join(out, file), type: 'png', timeout: 120000 });
          const after = await page.evaluate(() => window.KZ?.engine.frame ?? null);
          const pixels = step.proof ? await page.evaluate(PIXELS, png.toString('base64')) : null;
          const sha256 = require('node:crypto').createHash('sha256').update(png).digest('hex');
          if (step.expectBuffer && (state.canvas?.width !== step.expectBuffer[0] || state.canvas?.height !== step.expectBuffer[1]))
            throw Error(`${file}: drawing buffer ${state.canvas?.width}x${state.canvas?.height}, expected ${step.expectBuffer.join('x')}`);
          if (step._style) await step._style.evaluate(n => n.remove());
          log({ op: 'shot', job: job.name, file, hideUi: !!step.hideUi, viewport: job.viewport, dpr: job.dpr ?? 1, touch: !!job.touch,
            reducedMotion: !!job.reducedMotion, renderer: probe.renderer, renderClass: software ? 'software-diagnostic' : 'hardware',
            browser: browser.version(), state, frameAfterShot: after, sha256, bytes: png.length, pixels, note: step.note ?? null });
        }
        if (step.measure) log({ op: 'measure', job: job.name, name: step.measure, value: await page.evaluate(step.fn) });
      }
      log({ op: 'job-end', job: job.name, errors });
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
