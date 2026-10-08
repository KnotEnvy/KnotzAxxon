/**
 * Motion evidence: short frame sequences of live simulation tiled into
 * contact sheets (6 frames, left to right, top to bottom). Stills cannot show
 * animation timing; these show how effects and set pieces evolve.
 *
 *   KZ_PLAYWRIGHT_PATH=... KZ_TEST_URL=http://localhost:5177 KZ_OUT=artifacts/motion node scripts/qa/motion-capture.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.KZ_PLAYWRIGHT_PATH || 'playwright');

const OUT = process.env.KZ_OUT || 'artifacts/motion';
const URL = process.env.KZ_TEST_URL || 'http://localhost:5177';

/** name, camera, sector, metres in, warm-up frames, frames between shots, setup */
const SEQUENCES = [
  ['turret-kill', 'modern', 1, 200, 20, 9, 'turret'],
  ['fuel-kill', 'chase', 0, 150, 30, 8, 'fuel'],
  ['boss-entrance', 'chase', 7, 190, 1, 26, 'boss'],
  ['launcher-duel', 'chase', 7, 250, 260, 14, 'duel'],
  ['scramble', 'chase', 1, 10, 4, 12, 'scramble'],
  ['runway-lights', 'classic', 0, 1100, 30, 7, null],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const report = { sequences: [], errors: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', e => report.errors.push(e.message));
    await page.addInitScript(() => localStorage.setItem('knotzaxxon.settings.v2', JSON.stringify({ quality: 'high', camera: 'classic', shake: 0.4 })));
    await page.goto(URL);
    await page.waitForFunction(() => window.KZ && KZ.game, { timeout: 90000 });
    for (const [name, camera, sector, into, warm, gap, setup] of SEQUENCES) {
      const png = await page.evaluate(([camera, sector, into, warm, gap, setup]) => {
        const { engine, game, settings, screens } = KZ;
        engine.stop();
        settings.set('camera', camera);
        if (game.state !== 'playing') game.start();
        game.reset(42); game.state = 'playing'; game.hud.setLive(true); screens.hide();
        const s = game.level.sectors[sector], p = game.player;
        const pilot = { x: setup === 'duel' ? 2 : setup === 'scramble' ? 4.5 : 0, y: setup === 'fuel' || setup === 'scramble' || setup === 'turret' ? 3 : 12 };
        p.pos.set(pilot.x, pilot.y, s.zStart + into); p.damage = () => 'none'; p.trails.forEach(t => t.reset(p.pos));
        game.featureCursor = Math.max(0, game.level.features.findIndex(f => f.z >= p.pos.z - 30));
        game._hudCursor = game.featureCursor;
        game.sectorIndex = s.index; game._enterSector(s.index);
        document.getElementById('screen-sector')?.classList.remove('is-active');
        if (game.hud.gradeEl) { game.hud.gradeEl.style.transition = 'none'; game.hud.gradeEl.classList.remove('on'); }
        game.rig.snap(p);
        for (let i = 0; i < 12; i++) { engine.frame++; game.fortress.update(p.pos.z, 0, engine.time, engine.frame); }
        const step = (n, fire) => {
          for (let i = 0; i < n; i++) {
            const dt = 1 / 60; engine.time += dt; engine.frame++;
            engine.input.moveX = Math.max(-1, Math.min(1, (p.pos.x - pilot.x) * 0.25));
            engine.input.moveY = Math.max(-1, Math.min(1, (pilot.y - p.pos.y) * 0.25));
            engine.input.fire = !!fire; p.fuel = 1;
            game.update(dt, engine.time, dt); game.lateUpdate(dt, engine.time);
            engine.materials.update(engine.time); engine.postfx.update(dt, engine.time);
          }
          engine.postfx.render(1 / 60);
        };
        let target = null;
        if (setup === 'turret') target = game._spawnEnemy('heavyTurret', { x: 0, y: 0, z: p.pos.z + 38, seed: 3 });
        if (setup === 'fuel') target = game._spawnEnemy('fuel', { x: 0, y: 0, z: p.pos.z + 34, seed: 3 });
        if (setup === 'scramble') {
          for (let k = 0; k < 3; k++) {
            const e = game._spawnEnemy('parked', { x: -9 + k * 9, y: 0, z: p.pos.z + 70 + k * 8, seed: 11 + k });
            e.scramble = true;
          }
        }
        step(warm, setup === 'duel');
        if (setup === 'duel') {
          const ctx = game._ctx(1 / 60, engine.time);
          for (const pod of game.boss.pods) game.boss.hitAt(pod.pos.clone(), 99, ctx);
          step(60, false);
          game.boss.launcher.cooldown = 0;
        }
        if (target) { const ctx = game._ctx(1 / 60, engine.time); target.hit(999, ctx); game._killEnemy(target, ctx); }
        // grab six frames into a 3x2 sheet at half resolution
        const gl = engine.renderer.getContext();
        const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
        const sheet = document.createElement('canvas');
        sheet.width = w * 1.5; sheet.height = h;
        const sctx = sheet.getContext('2d');
        const tile = document.createElement('canvas'); tile.width = w; tile.height = h;
        const tctx = tile.getContext('2d');
        const px = new Uint8Array(w * h * 4);
        for (let f = 0; f < 6; f++) {
          step(f === 0 ? 1 : gap, setup === 'duel');
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
          const img = tctx.createImageData(w, h);
          for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
          tctx.putImageData(img, 0, 0);
          const x = (f % 3) * w / 2, y = Math.floor(f / 3) * h / 2;
          sctx.drawImage(tile, x, y, w / 2, h / 2);
          sctx.fillStyle = '#000a'; sctx.fillRect(x + 6, y + 6, 150, 22);
          sctx.fillStyle = '#ffe2a8'; sctx.font = '15px monospace';
          sctx.fillText(`t+${((f === 0 ? 1 : 1 + f * gap) / 60).toFixed(2)}s`, x + 12, y + 22);
        }
        return sheet.toDataURL('image/png').split(',')[1];
      }, [camera, sector, into, warm, gap, setup]);
      fs.writeFileSync(path.join(OUT, `motion-${name}.png`), Buffer.from(png, 'base64'));
      report.sequences.push({ name, camera, sector: sector + 1, frameGapSeconds: +(gap / 60).toFixed(3) });
    }
    fs.writeFileSync(path.join(OUT, 'motion.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (report.errors.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
