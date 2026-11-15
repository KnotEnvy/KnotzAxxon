/**
 * Interaction checks for the polished menus (software frames, no FPS claims):
 *  - real keyboard events walk the results menu; every focused control is visible and
 *    not covered by the sticky action bar (elementFromPoint at its centre is itself);
 *  - SYSTEMS RETURN is reachable on a short viewport without scrolling;
 *  - reduced motion: result rows and steady warnings are fully visible, no infinite pulse.
 *
 *   KZ_TEST_URL=http://127.0.0.1:5291 KZ_OUT=<dir> kz-pw node scripts/qa/opus-ui-nav.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.KZ_PLAYWRIGHT_PATH || 'playwright');
const URL = process.env.KZ_TEST_URL || 'http://127.0.0.1:5291';
const OUT = process.env.KZ_OUT || 'artifacts/opus-ui-nav';
fs.mkdirSync(OUT, { recursive: true });

const visible = () => {
  const a = document.activeElement; if (!a || a === document.body) return { none: true };
  const r = a.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const hit = document.elementFromPoint(x, y);
  return { text: (a.value || a.textContent || '').trim().slice(0, 30), inView: r.top >= 0 && r.bottom <= innerHeight, unobstructed: !!hit && (hit === a || a.contains(hit)) };
};

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.KZ_CHROME || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], env: { ...process.env, DISPLAY: '', WAYLAND_DISPLAY: '' } });
  const out = { url: URL, browser: browser.version(), note: 'SwiftShader software frames; interaction and layout only', checks: [] };
  const fail = (msg) => { out.checks.push({ fail: msg }); process.exitCode = 1; };
  try {
    {
      // phone portrait title: subtitle readable, no horizontal scroll, touch prompt
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      await page.goto(URL); await page.waitForFunction(() => window.KZ?.screens?.current === 'title', null, { timeout: 120000 });
      await page.evaluate(() => { KZ.engine.stop(); KZ.screens.updateGamepad(KZ.engine.input, 0); });
      const t = await page.evaluate(() => { const s = document.querySelector('.title-sub'); return { fs: parseFloat(getComputedStyle(s).fontSize), right: s.getBoundingClientRect().right, scrollW: document.documentElement.scrollWidth, vw: innerWidth, hint: document.getElementById('title-hint').textContent }; });
      out.checks.push({ id: 'portrait-title', ...t });
      if (t.fs < 12 || t.right > t.vw || t.scrollW > t.vw) fail(`portrait-title: subtitle ${t.fs}px right ${t.right}`);
      if (t.hint !== 'TAP ENGAGE TO LAUNCH') fail(`portrait-title: hint ${t.hint}`);
      await page.screenshot({ path: path.join(OUT, 'portrait-title.png'), timeout: 120000 });
      await ctx.close();
    }
    for (const [id, viewport, reduced] of [['short', { width: 1280, height: 440 }, false], ['desk-rm', { width: 1280, height: 720 }, true]]) {
      const ctx = await browser.newContext({ viewport, reducedMotion: reduced ? 'reduce' : 'no-preference' });
      const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(() => { try { localStorage.setItem('knotzaxxon.settings.v2', JSON.stringify({ quality: 'low', camera: 'classic', shake: 0 })); localStorage.removeItem('knotzaxxon.scores.v2'); } catch {} });
      await page.goto(URL); await page.waitForFunction(() => window.KZ?.screens?.current === 'title', null, { timeout: 120000 });
      await page.evaluate(() => KZ.engine.stop());
      // victory with a new record: CONTINUE focused, walk up into the callsign and down through every action
      await page.evaluate(() => { KZ.game.start(); KZ.screens.hide(); KZ.game.score = 912340; KZ.game._finish(true); });
      await page.waitForTimeout(reduced ? 200 : 1300);
      const walk = [await page.evaluate(visible)];
      await page.keyboard.press('ArrowUp'); walk.push(await page.evaluate(visible));
      await page.keyboard.press('Enter'); walk.push(await page.evaluate(visible));   // Enter finishes the callsign
      for (let i = 0; i < 2; i++) { await page.keyboard.press('ArrowDown'); walk.push(await page.evaluate(visible)); }
      out.checks.push({ id, walk });
      if (walk.map(w => w.text).join('|') !== 'CONTINUE: LOOP 2|ACE|CONTINUE: LOOP 2|RE-ENGAGE|MAIN MENU') fail(`${id}: results walk order ${walk.map(w => w.text)}`);
      for (const w of walk) if (!w.inView || !w.unobstructed) fail(`${id}: ${w.text} hidden or covered`);
      await page.screenshot({ path: path.join(OUT, `${id}-results-callsign.png`), timeout: 120000 });
      if (reduced) {
        const rows = await page.evaluate(() => [...document.querySelectorAll('.result-row')].map(r => getComputedStyle(r).opacity));
        if (rows.some(o => o !== '1')) fail(`${id}: result rows not fully visible under reduced motion ${rows}`);
        await page.evaluate(() => { KZ.game.start(); KZ.screens.hide(); KZ.game.hud.setLive(true); KZ.game.hud.warn('MISSILE LOCK - ROLL', 30); });
        await page.waitForTimeout(300);
        const pulse = await page.evaluate(() => ({ opacity: getComputedStyle(document.getElementById('hud-warn')).opacity, infinite: document.getAnimations().filter(a => a.effect?.target?.id === 'hud-warn' && a.effect.getTiming().iterations === Infinity && a.playState === 'running').length }));
        out.checks.push({ id, reducedWarn: pulse });
        if (pulse.opacity !== '1' || pulse.infinite) fail(`${id}: alert still pulses under reduced motion`);
      } else {
        // SYSTEMS on a 440px-tall window: RETURN visible without scrolling, then Escape returns to title
        // reach SYSTEMS the way a pilot does: real keys from the title menu
        await page.evaluate(() => { KZ.game.reset(); KZ.game.toTitle(); });
        await page.waitForTimeout(300);
        for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(600);
        if (await page.evaluate(() => KZ.screens.current) !== 'settings') fail(`${id}: keyboard did not open SYSTEMS`);
        const ret = await page.evaluate(() => { const b = document.querySelector('#screen-settings .mi'); const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { inView: r.bottom <= innerHeight, hit: hit === b || b.contains(hit) }; });
        out.checks.push({ id, settingsReturn: ret });
        if (!ret.inView || !ret.hit) fail(`${id}: SYSTEMS RETURN not reachable without scrolling`);
        await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150);
        const status = await page.evaluate(() => document.getElementById('settings-status')?.textContent);
        out.checks.push({ id, status });
        if (!/· SAVED ON THIS DEVICE$/.test(status ?? '')) fail(`${id}: no save confirmation (${status})`);
        await page.screenshot({ path: path.join(OUT, `${id}-settings.png`), timeout: 120000 });
        await page.keyboard.press('Escape'); await page.waitForTimeout(150);
        const back = await page.evaluate(() => ({ current: KZ.screens.current, focus: document.activeElement?.dataset?.action }));
        out.checks.push({ id, escape: back });
        if (back.current !== 'title' || back.focus !== 'settings') fail(`${id}: Escape did not restore focus to SYSTEMS (${JSON.stringify(back)})`);
      }
      if (errors.length) fail(`${id}: page errors ${errors}`);
      await ctx.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(OUT, 'nav.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 1));
})().catch(e => { console.error(e); process.exitCode = 1; });
