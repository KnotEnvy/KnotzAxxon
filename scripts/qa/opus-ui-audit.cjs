/**
 * Non-spatial UI audit: menus, HUD feedback, focus, viewport fit, reduced motion.
 *
 * Captures every screen at desktop, touch portrait, touch landscape and a short
 * desktop viewport, and records layout/focus/contrast metrics. Frames come from
 * headless Chromium with SwiftShader WebGL: they are SOFTWARE frames, useful for
 * layout and legibility only. Nothing here measures physical frame rate.
 *
 *   KZ_TEST_URL=http://127.0.0.1:5291 KZ_OUT=<dir> [KZ_CHROME=<exe>] \
 *     node scripts/qa/opus-ui-audit.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.KZ_PLAYWRIGHT_PATH || 'playwright');

const URL = process.env.KZ_TEST_URL || 'http://127.0.0.1:5291';
const OUT = process.env.KZ_OUT || 'artifacts/opus-ui';
const ONLY = process.env.KZ_ONLY ? process.env.KZ_ONLY.split(',') : null;
fs.mkdirSync(OUT, { recursive: true });

const VIEWS = [
  { id: 'desk', viewport: { width: 1280, height: 720 } },
  { id: 'portrait', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { id: 'landscape', viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { id: 'short', viewport: { width: 1280, height: 440 } },
  { id: 'laptop', viewport: { width: 1366, height: 768 }, hudOnly: true },
  { id: 'laptop800', viewport: { width: 1280, height: 800 }, hudOnly: true },
  { id: 'fullhd', viewport: { width: 1920, height: 1080 }, hudOnly: true },
];

/** Runs in the page: geometry, focus and contrast facts for the active screen. */
function metrics() {
  const lum = (c) => {
    const m = c.match(/[\d.]+/g); if (!m) return null;
    const [r, g, b] = m.slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (fg, bg) => { const a = lum(fg), b = lum(bg); if (a == null || b == null) return null; return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
  const screen = document.querySelector('.screen.is-active:not(#screen-sector)') ?? document.querySelector('.screen.is-active');
  const vw = innerWidth, vh = innerHeight;
  const out = { current: window.KZ?.screens?.current, vw, vh, scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight };
  const active = document.activeElement;
  out.focus = active && active !== document.body ? { tag: active.tagName, text: (active.textContent || active.getAttribute('aria-label') || '').trim().slice(0, 40), outline: getComputedStyle(active).outlineStyle + ' ' + getComputedStyle(active).outlineWidth, sel: active.classList.contains('sel') || !!active.closest('.sel'), rect: active.getBoundingClientRect().toJSON() } : null;
  if (active && active !== document.body) {
    const r = active.getBoundingClientRect();
    out.focus.inViewport = r.top >= -1 && r.bottom <= vh + 1 && r.left >= -1 && r.right <= vw + 1;
  }
  const offscreen = [], tiny = [], lowContrast = [], clipped = [];
  if (screen) {
    for (const el of screen.querySelectorAll('*')) {
      const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('[hidden]')) continue;
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      const scroller = el.closest('.panel, #screen-title');
      const sr = scroller ? scroller.getBoundingClientRect() : { left: 0, right: vw, top: 0, bottom: vh };
      if (r.right > vw + 1 || r.left < -1) offscreen.push({ el: el.className || el.tagName, l: Math.round(r.left), r: Math.round(r.right) });
      if (!scroller && (r.bottom > vh + 1 || r.top < -1)) offscreen.push({ el: el.className || el.tagName, t: Math.round(r.top), b: Math.round(r.bottom) });
      const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (!own) continue;
      const fs = parseFloat(cs.fontSize); if (fs < 11) tiny.push({ el: el.className || el.tagName, fs, text: el.textContent.trim().slice(0, 30) });
      if (el.scrollWidth > el.clientWidth + 1 && cs.overflow === 'hidden') clipped.push({ el: el.className || el.tagName, text: el.textContent.trim().slice(0, 30) });
      // effective background: nearest ancestor with an opaque-ish colour, else the page ink
      let bg = 'rgb(6,14,22)';
      for (let p = el; p; p = p.parentElement) { const c = getComputedStyle(p).backgroundColor; const a = c.match(/[\d.]+/g); if (a && (a.length < 4 || Number(a[3]) > 0.5)) { bg = c; break; } }
      const cr = ratio(cs.color, bg); const op = Number(cs.opacity);
      if (cr != null && cr < 4.5) lowContrast.push({ el: el.className || el.tagName, cr: +cr.toFixed(2), op, color: cs.color, text: el.textContent.trim().slice(0, 30) });
    }
    const panel = screen.querySelector('.panel');
    if (panel) out.panel = { scrollH: panel.scrollHeight, clientH: panel.clientHeight, scrolls: panel.scrollHeight > panel.clientHeight + 1, top: panel.getBoundingClientRect().top, bottom: panel.getBoundingClientRect().bottom };
    const items = [...screen.querySelectorAll('.mi, .setting, .pilot-entry input')].filter(n => n.offsetParent);
    out.items = items.map(n => { const r = n.getBoundingClientRect(); return { t: (n.dataset.action || n.dataset.id || n.tagName), h: Math.round(r.height), w: Math.round(r.width), sel: n.classList.contains('sel') }; });
    out.status = [...screen.querySelectorAll('[role=status], [aria-live]')].map(n => ({ id: n.id, text: n.textContent.trim().slice(0, 80) }));
  }
  // HUD instruments that intersect each other (only visible ones count)
  const parts = { tl: '.hud-tl', tr: '.hud-tr', bl: '.hud-bl', br: '.hud-br', alt: '.altimeter', warn: '#hud-warn.on', grade: '.grade.on',
    card: '#screen-sector.is-active .sector-card', stick: '.touch.on.is-live .stick', buttons: '.touch.on.is-live .tbtns' };
  const boxes = Object.entries(parts).map(([k, sel]) => [k, document.querySelector(sel)]).filter(([, el]) => el && el.getBoundingClientRect().width && document.getElementById('hud').classList.contains('is-live'))
    .map(([k, el]) => [k, el.getBoundingClientRect()]);
  out.hudOverlap = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const [a, ra] = boxes[i], [b, rb] = boxes[j];
    const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (w > 1 && h > 1) out.hudOverlap.push(`${a}x${b} ${Math.round(w)}x${Math.round(h)}`);
  }
  Object.assign(out, { offscreen: offscreen.slice(0, 12), tiny: tiny.slice(0, 12), lowContrast: lowContrast.slice(0, 16), clipped: clipped.slice(0, 8) });
  return out;
}

/** Bring the live HUD to a busy but legible instant: chain, warning, grade, low systems. */
async function stageHud(page, warn) {
  await page.evaluate((warn) => {
    const { game, engine, screens } = KZ;
    game.start(); screens.hide(); document.getElementById('screen-sector')?.classList.remove('is-active');
    game.player.invuln = 100; game.player.pos.set(0, 9, 280); game.rig.snap(game.player);
    game.chain = 7; game.chainMult = 3; game.chainTimer = 2.2; game.hud.comboEvent(7, 3);
    game.player.fuel = 0.21; game.player.hull = 1; game.score = 48210;
    // a few presentation steps settle the score count-up; simulation is not stepped
    for (let i = 0; i < 6; i++) game._updatePresentation(0.25, engine.time, game._ctx(0, engine.time));
    if (warn) game.hud.warn(warn, 30);
    engine.postfx.render(1 / 60);
  }, warn);
}

(async () => {
  const browser = await chromium.launch({
    headless: true, executablePath: process.env.KZ_CHROME || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    // WSLg exports a Wayland display that SwiftShader's Vulkan ICD cannot serve.
    env: { ...process.env, DISPLAY: '', WAYLAND_DISPLAY: '' },
  });
  const report = { url: URL, browser: browser.version(), note: 'SwiftShader software frames: layout/legibility evidence only, no physical FPS claim', views: {} };
  try {
    for (const view of VIEWS) {
      if (ONLY && !ONLY.includes(view.id)) continue;
      const ctx = await browser.newContext({ viewport: view.viewport, isMobile: !!view.isMobile, hasTouch: !!view.hasTouch, deviceScaleFactor: view.deviceScaleFactor ?? 1, reducedMotion: process.env.KZ_REDUCED ? 'reduce' : 'no-preference' });
      const page = await ctx.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.addInitScript(() => { try { localStorage.setItem('knotzaxxon.settings.v2', JSON.stringify({ quality: 'low', camera: 'classic', shake: 0 })); localStorage.removeItem('knotzaxxon.scores.v2'); } catch {} });
      await page.goto(URL);
      await page.waitForTimeout(250);
      const shots = {};
      const settle = () => page.evaluate(() => { for (const a of document.getAnimations()) { const t = a.effect?.getTiming?.(); if (t && t.iterations === Infinity) { a.pause(); a.currentTime = 0; } else a.finish(); } });
      const snap = async (name) => { await settle(); const file = path.join(OUT, `${view.id}-${name}.png`); const t0 = Date.now(); await page.screenshot({ path: file, timeout: 180000 }); console.error(view.id, name, 'shot ms', Date.now() - t0); shots[name] = { file: path.basename(file), ...(await page.evaluate(metrics)) }; };
      if (!view.hudOnly) await snap('boot');
      await page.waitForFunction(() => window.KZ?.screens?.current === 'title', null, { timeout: 120000 });
      await page.evaluate(() => { KZ.engine.stop(); KZ.screens.updateGamepad?.(KZ.engine.input, 0); });
      await page.waitForTimeout(600);
      if (view.hudOnly) {
        await stageHud(page, 'MISSILE LOCK - ROLL'); await page.waitForTimeout(400); await snap('hud');
        report.views[view.id] = { errors, shots }; await ctx.close(); continue;
      }
      await snap('title');
      for (const s of ['howto', 'settings', 'scores']) {
        await page.evaluate((s) => KZ.screens.show(s, { push: true }), s); await page.waitForTimeout(550); await snap(s);
        if (s === 'settings') { await page.evaluate(() => KZ.screens.handleControl('right')); await page.waitForTimeout(200); await snap('settings-changed'); }
        await page.evaluate(() => KZ.screens.back()); await page.waitForTimeout(100);
      }
      await stageHud(page, 'MISSILE LOCK - ROLL'); await page.waitForTimeout(500); await snap('hud');
      await page.evaluate(() => KZ.game.hud.warn('CORE EXPOSED', 30)); await snap('hud-gain');
      await page.evaluate(() => KZ.game.hud.grade('A', 'SECTOR 02 CLEAR', '14/16 TARGETS  ·  1 HIT', 30)); await page.waitForTimeout(400); await snap('hud-grade');
      // the Loop 2 entry: the game warns, retires the grade and shows the opening card in the same step
      await page.evaluate(() => { KZ.game.hud.warn('LOOP 2 - THREAT ESCALATED', 30); KZ.game.hud.dismissGrade(); KZ.screens.sectorCard(KZ.game.level.sectors[0], 30); });
      await page.waitForTimeout(700); await snap('hud-cards');
      await page.evaluate(() => { document.getElementById('screen-sector').classList.remove('is-active'); KZ.game.pause(); }); await page.waitForTimeout(550); await snap('pause');
      await page.evaluate(() => { KZ.game.resume(); KZ.game._finish(false); }); await page.waitForTimeout(1300); await snap('over');
      await page.evaluate(() => { KZ.game.start(); KZ.screens.hide(); KZ.game.score = 912340; KZ.game._finish(true); }); await page.waitForTimeout(1300); await snap('victory');
      report.views[view.id] = { errors, shots };
      await ctx.close();
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(OUT, 'audit.json'), JSON.stringify(report, null, 2));   // partial results survive a failure
  }
  console.log(JSON.stringify(report, (k, v) => (k === 'rect' ? undefined : v), 1).slice(0, 200000));
})().catch(e => { console.error(e); process.exitCode = 1; });
