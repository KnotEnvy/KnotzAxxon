// Chromium launcher for the trailer captures.
//
// Headless Chromium on this WSL box only gets software WebGL (SwiftShader),
// which is far too slow for a 3D game at 4K. A normal (headed) Chromium on a
// virtual X display (Xvfb :99) gets the real GPU through ANGLE -> OpenGL ->
// Mesa D3D12, and nothing ever appears on the desktop. The page viewport
// (not the window) sets the render size.
import { chromium } from '/home/knotz2/code/Knotz2026/node_modules/playwright/index.mjs';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const LIBS = '/home/knotz2/.local/opt/chromium-libs/root/usr/lib/x86_64-linux-gnu';
process.env.LD_LIBRARY_PATH = [process.env.LD_LIBRARY_PATH, LIBS, '/usr/lib/wsl/lib'].filter(Boolean).join(':');
process.env.GALLIUM_DRIVER ||= 'd3d12';
process.env.MESA_D3D12_DEFAULT_ADAPTER_NAME ||= 'NVIDIA';
const XDISPLAY = process.env.CAPTURE_DISPLAY || ':99';

/** Start the invisible X display once (it outlives the capture; harmless). */
async function ensureXvfb() {
  const sock = `/tmp/.X11-unix/X${XDISPLAY.slice(1)}`;
  if (!existsSync(sock)) {
    spawn('Xvfb', [XDISPLAY, '-screen', '0', '1920x1080x24', '-nolisten', 'tcp'], { detached: true, stdio: 'ignore' }).unref();
    for (let i = 0; i < 50 && !existsSync(sock); i++) await new Promise(r => setTimeout(r, 100));
  }
}

export const ORIGIN = process.env.GAME_URL || 'http://127.0.0.1:5190';
export const ROOT = new URL('../', import.meta.url).pathname;

export async function launch({ gpu = true, extra = [] } = {}) {
  if (gpu) await ensureXvfb();
  return chromium.launch({
    headless: !gpu,
    env: gpu ? { ...process.env, DISPLAY: XDISPLAY, WAYLAND_DISPLAY: '' } : process.env,
    args: [
      '--no-sandbox', '--force-color-profile=srgb', '--hide-scrollbars', '--mute-audio',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
      '--autoplay-policy=no-user-gesture-required',
      ...(gpu ? ['--ozone-platform=x11', '--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist', '--window-size=640,400'] : []),
      ...extra,
    ],
  });
}

const CLOCK = new URL('./clock.js', import.meta.url).pathname;

/** A game page with the virtual clock installed and the trailer harness loaded. */
export async function gamePage(browser, { width = 1920, height = 1080, scale = 2, rng = 20261101, settings = {} } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404|favicon/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript({ path: CLOCK });
  await page.addInitScript((s) => {
    localStorage.setItem('knotzaxxon.settings.v2', JSON.stringify({ quality: 'ultra', camera: 'classic', shake: 0.7, master: 0.8, music: 0.6, sfx: 0.9, ...s }));
    localStorage.removeItem('knotzaxxon.grades.v1');
  }, settings);
  await page.goto(`${ORIGIN}/?rng=${rng}`);
  await page.waitForFunction(() => window.KZ && KZ.game, null, { timeout: 120000 });
  await page.evaluate(async () => { window.T = (await import('/trailer/capture/harness.js')).T; });
  page.errors = errors;
  page.ctx = ctx;
  return page;
}
