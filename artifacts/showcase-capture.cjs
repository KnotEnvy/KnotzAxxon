/**
 * Showcase capture: drives the development build through a fixed set of
 * seeded scenes and saves one rendered frame per scene, plus render counts.
 *
 *   KZ_PLAYWRIGHT_PATH=<dir>/node_modules/playwright-core \
 *   KZ_TEST_URL=http://localhost:5177 KZ_OUT=artifacts/showcase node artifacts/showcase-capture.cjs
 *
 * Scenes run the real Game.update/lateUpdate with a scripted pilot (steady
 * lane, trigger held) so bullets, kills, explosions and animation are live.
 * The pilot cannot die; this is a presentation capture, not a playtest.
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.KZ_PLAYWRIGHT_PATH || 'playwright');

const OUT = process.env.KZ_OUT || 'artifacts/showcase';
const URL = process.env.KZ_TEST_URL || 'http://localhost:5177';
const QUALITY = process.env.KZ_QUALITY || 'high';
const ONLY = process.env.KZ_ONLY ? process.env.KZ_ONLY.split(',') : null;

/** name, camera, sector index, metres into sector, frames, pilot */
const SCENES = [
  ['s1-opening-classic', 'classic', 0, 150, 150, { x: 7, y: 2.2 }],
  ['s1-opening-modern', 'modern', 0, 260, 110, { x: -7, y: 2.2 }],
  ['s1-turret-chase', 'chase', 0, 250, 150, { x: 7, y: 2.4 }],
  ['s1-wall-modern', 'modern', 0, 400, 60, { x: 0, y: 11 }],
  ['s2-guns-classic', 'classic', 1, 300, 150, { x: 0, y: 3 }],
  ['s2-guns-chase', 'chase', 1, 600, 150, { x: -4, y: 4 }],
  ['s3-space-classic', 'classic', 2, 260, 160, { x: 0, y: 11 }],
  ['s3-space-chase', 'chase', 2, 500, 160, { x: 2, y: 13 }],
  ['s4-reactor-modern', 'modern', 3, 300, 150, { x: 0, y: 9 }],
  ['s4-reactor-classic', 'classic', 3, 700, 150, { x: 0, y: 9 }],
  ['s5-formation-modern', 'modern', 4, 300, 160, { x: 0, y: 13 }],
  ['s6-citadel-chase', 'chase', 5, 400, 150, { x: 3, y: 6 }],
  ['s7-gauntlet-classic', 'classic', 6, 400, 150, { x: 0, y: 7 }],
  ['s8-boss-classic', 'classic', 7, 250, 260, { x: 0, y: 13 }],
  ['s8-boss-chase', 'chase', 7, 250, 360, { x: 4, y: 12 }],
  ['s8-boss-modern', 'modern', 7, 250, 480, { x: -3, y: 12 }],
  ['sector-transition-modern', 'modern', 1, -30, 90, { x: 0, y: 11 }],
  ['s3-dreadnought-classic', 'classic', 2, 470, 120, { x: 0, y: 8 }],
  ['s3-dreadnought-chase', 'chase', 2, 620, 120, { x: 3, y: 6 }],
  ['s5-carrier-modern', 'modern', 4, 420, 120, { x: 4, y: 14 }],
  ['s4-perimeter-modern', 'modern', 3, -10, 40, { x: 0, y: 11 }],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let browser;
  const report = { quality: QUALITY, scenes: [], errors: [] };
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) report.errors.push(m.text()); });
    await page.addInitScript(q => localStorage.setItem('knotzaxxon.settings.v2', JSON.stringify({ quality: q, camera: 'classic', shake: 0.4 })), QUALITY);
    await page.goto(URL);
    await page.waitForFunction(() => window.KZ && KZ.game, { timeout: 90000 });

    // Deterministic manual stepping of the real loop.
    await page.evaluate(() => {
      const { engine, game } = KZ;
      engine.stop();
      window.__step = (n, pilot) => {
        const input = engine.input, p = game.player;
        for (let i = 0; i < n; i++) {
          const dt = 1 / 60;
          engine.time += dt; engine.frame++; engine.realDelta = dt;
          if (pilot && game.state === 'playing') {
            input.moveX = Math.max(-1, Math.min(1, (p.pos.x - pilot.x) * 0.25));
            input.moveY = Math.max(-1, Math.min(1, (pilot.y - p.pos.y) * 0.25));
            input.fire = pilot.fire !== false; input.boost = !!pilot.boost;
            p.fuel = 1; p.hull = p.hullMax;
          }
          game.update(dt, engine.time, dt);
          game.lateUpdate(dt, engine.time);
          engine.materials.update(engine.time);
          engine.postfx.update(dt, engine.time);
          input.pressed.clear();
        }
        engine.renderer.info.reset();
        engine.postfx.render(1 / 60);
        const info = engine.renderer.info.render;
        // Rec.709 luma of the presented frame (3D only, no DOM HUD), every 4th pixel.
        const gl = engine.renderer.getContext();
        const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let sum = 0, dark = 0, samples = 0;
        for (let i = 0; i < px.length; i += 16) {
          const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
          sum += l; samples++; if (l < 12) dark++;
        }
        return { calls: info.calls, triangles: info.triangles, enemies: game.enemies.length,
          luma: +(sum / samples).toFixed(1), nearBlack: +(dark / samples * 100).toFixed(0) };
      };
      window.__scene = (camera, sectorIndex, into, pilot) => {
        const { settings, screens } = KZ;
        settings.set('camera', camera);
        if (game.state === 'idle' || game.state === 'over' || game.state === 'victory') game.start();
        game.reset(42);
        game.state = 'playing'; game.hud.setLive(true); screens.hide();
        document.getElementById('screen-sector')?.classList.remove('is-active');
        const s = game.level.sectors[sectorIndex];
        const z = Math.max(0, s.zStart + into);
        const p = game.player;
        p.pos.set(pilot.x, pilot.y, z);
        p.damage = () => 'none';
        p.trails.forEach(t => t.reset(p.pos));
        game.featureCursor = game.level.features.findIndex(f => f.z >= z - 30);
        if (game.featureCursor < 0) game.featureCursor = game.level.features.length;
        game._hudCursor = game.featureCursor;
        game.sectorIndex = game.level.sectorAt(z).index;
        game._enterSector(game.sectorIndex);
        document.getElementById('screen-sector')?.classList.remove('is-active');
        // Teleporting grades the skipped sector; keep that card out of the frame.
        game.hud._gradeTimer = 0; if (game.hud.gradeEl) { game.hud.gradeEl.style.transition = 'none'; game.hud.gradeEl.classList.remove('on'); }
        game.rig.snap(p);
        for (let i = 0; i < 12; i++) { engine.frame++; game.fortress.update(z, 0, engine.time, engine.frame); }
      };
    });

    // Title screen over the idle fly-through.
    if (!ONLY || ONLY.includes('title')) {
      await page.evaluate(() => { KZ.game.reset(1); KZ.game.toTitle(); return window.__step(150, null); });
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(OUT, 'title.png') });
      report.scenes.push({ name: 'title' });
    }

    for (const [name, camera, sector, into, frames, pilot] of SCENES) {
      if (ONLY && !ONLY.includes(name)) continue;
      const stats = await page.evaluate(([camera, sector, into, frames, pilot]) => {
        window.__scene(camera, sector, into, pilot);
        return window.__step(frames, pilot);
      }, [camera, sector, into, frames, pilot]);
      await page.screenshot({ path: path.join(OUT, name + '.png') });
      report.scenes.push({ name, camera, sector: sector + 1, ...stats });
    }

    // Explosion close-up: kill a heavy turret right in front of the ship.
    if (!ONLY || ONLY.includes('explosion-modern')) {
      const stats = await page.evaluate(() => {
        const pilot = { x: 0, y: 3, fire: false };
        window.__scene('modern', 1, 200, pilot);
        const { game } = KZ;
        const e = game._spawnEnemy('heavyTurret', { x: 0, y: 0, z: game.player.pos.z + 40, seed: 3 });
        window.__step(20, pilot);
        e.hit(999, game._ctx(1 / 60, KZ.engine.time));
        game._killEnemy(e, game._ctx(1 / 60, KZ.engine.time));
        return window.__step(9, pilot);
      });
      await page.screenshot({ path: path.join(OUT, 'explosion-modern.png') });
      report.scenes.push({ name: 'explosion-modern', ...stats });
    }

    // Boss duel: both cannons shot off, the launcher arm charging its missile.
    if (!ONLY || ONLY.includes('boss-duel-chase')) {
      const stats = await page.evaluate(() => {
        const pilot = { x: 2, y: 12, fire: false };
        window.__scene('chase', 7, 250, pilot);
        const { game } = KZ;
        window.__step(200, pilot);
        const b = game.boss, ctx = game._ctx(1 / 60, KZ.engine.time);
        for (const pod of b.pods) b.hitAt(pod.pos.clone(), 99, ctx);
        window.__step(90, pilot);
        b.launcher.cooldown = 0;
        return window.__step(80, { ...pilot, fire: true });
      });
      await page.screenshot({ path: path.join(OUT, 'boss-duel-chase.png') });
      report.scenes.push({ name: 'boss-duel-chase', ...stats });
    }

    // Results screen after a run.
    if (!ONLY || ONLY.includes('results')) {
      await page.evaluate(() => { const { game } = KZ; game.score = 48250; game.kills = 61; game.runTime = 312; game.sectorIndex = 5; game._finish(false); window.__step(30, null); });
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(OUT, 'results.png') });
      report.scenes.push({ name: 'results' });
    }

    report.browser = browser.version();
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (report.errors.length) process.exitCode = 1;
  } finally {
    await browser?.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
