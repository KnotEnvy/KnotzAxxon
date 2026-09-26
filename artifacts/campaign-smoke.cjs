/**
 * Campaign smoke: flies the whole eight-sector campaign through the real
 * Game.update / lateUpdate loop at 60 Hz with a scripted, invulnerable pilot,
 * then continues into loop 2. It verifies state flow (every sector entered,
 * boss defeated, victory results with the continue option, loop 2 running)
 * and records per-sector grades, kills, style counters, JS errors and
 * frame CPU time. Rendering runs every 4th frame to keep the run short.
 *
 * It is a progression and stability check, not a balance playtest: the
 * pilot cannot die and aims with perfect altitude knowledge.
 *
 *   KZ_PLAYWRIGHT_PATH=... KZ_TEST_URL=http://localhost:5177 node artifacts/campaign-smoke.cjs
 */
const fs = require('node:fs');
const { chromium } = require(process.env.KZ_PLAYWRIGHT_PATH || 'playwright');

const URL = process.env.KZ_TEST_URL || 'http://localhost:5177';
const OUT = process.env.KZ_OUT || 'artifacts/campaign-smoke.json';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
    await page.addInitScript(() => localStorage.setItem('knotzaxxon.settings.v2', JSON.stringify({ quality: 'medium', camera: 'classic', shake: 0 })));
    await page.goto(URL);
    await page.waitForFunction(() => window.KZ && KZ.game, { timeout: 90000 });
    const result = await page.evaluate(async () => {
      const { engine, game, screens } = KZ;
      engine.stop();
      game.start();
      const p = game.player;
      p.damage = () => 'none';           // progression check: the pilot cannot die
      const input = engine.input;
      const log = { sectors: [], frameMs: [], states: [] };
      let lastSector = -1, frames = 0, bossSeen = false, victoryAt = -1;

      // Autopilot: thread the next barrier's opening, otherwise line up the
      // nearest visible target's lane and height; hold the trigger.
      const autopilot = () => {
        let wantX = p.pos.x, wantY = 9;
        const feats = game.level.features;
        let barrier = null;
        for (let i = game._hudCursor ?? 0; i < feats.length; i++) {
          const f = feats[i];
          if (f.z < p.pos.z - 2) continue;
          if (f.z > p.pos.z + 90) break;
          if (f.kind === 'wall' || f.kind === 'gate' || f.kind === 'arch') { barrier = f; break; }
        }
        if (barrier?.kind === 'wall') {
          if (barrier.type === 'pillars') {
            // aim between the two pillars nearest the ship
            const xs = barrier.gaps.map(g => g.x).sort((a, b) => a - b);
            let best = 0, bestD = 1e9;
            for (let k = 0; k < xs.length - 1; k++) {
              const mid = (xs[k] + xs[k + 1]) / 2;
              if (Math.abs(mid) > 15) continue;
              const d = Math.abs(mid - p.pos.x);
              if (d < bestD) { bestD = d; best = mid; }
            }
            wantX = best; wantY = 9;
          } else {
            const g = barrier.gaps[0];
            wantY = g.y + Math.min(g.h, 22) / 2;
            if (barrier.type === 'notch' || barrier.type === 'window') wantX = Math.max(-15, Math.min(15, g.x));
          }
        } else if (barrier?.kind === 'gate' && barrier.runtime) {
          wantY = barrier.runtime.gapY + barrier.runtime.gapH / 2;
        } else if (barrier?.kind === 'arch') {
          wantY = Math.min(barrier.clearance - 3, 5);
        } else {
          let target = null, bestDz = 1e9;
          for (const e of game.enemies) {
            if (!e.alive || e.kind === 'mine') continue;
            const dz = e.pos.z - p.pos.z;
            if (dz > 8 && dz < 110 && dz < bestDz && Math.abs(e.pos.x) < 17) { bestDz = dz; target = e; }
          }
          if (game.boss?.alive && game.boss.active) {
            const b = game.boss;
            const part = b.launcher?.charging ? b.launcher.pos : b.pods.find(pp => pp.alive)?.pos ?? (b.coreOpen > 0.55 ? b.coreGroup.getWorldPosition(new b.pos.constructor()) : null);
            if (part) target = { pos: part, radius: 0 };
          }
          if (target) {
            wantX = Math.max(-15, Math.min(15, target.pos.x - (p.muzzleSide ?? 1) * 1.6));
            wantY = Math.max(1.6, Math.min(24, target.pos.y + (target.radius ?? 0) * 0.4 + 0.1));
          }
        }
        input.moveX = Math.max(-1, Math.min(1, (p.pos.x - wantX) * 0.3));
        input.moveY = Math.max(-1, Math.min(1, (wantY - p.pos.y) * 0.3));
        input.fire = true;
        p.fuel = Math.max(p.fuel, 0.5);
      };

      const tick = (render) => {
        const t0 = performance.now();
        const dt = 1 / 60;
        engine.time += dt; engine.frame++; engine.realDelta = dt;
        if (game.state === 'playing') autopilot();
        game.update(dt, engine.time, dt);
        game.lateUpdate(dt, engine.time);
        engine.materials.update(engine.time);
        engine.postfx.update(dt, engine.time);
        if (render) engine.postfx.render(dt);
        input.pressed.clear();
        if (render) log.frameMs.push(performance.now() - t0);
        frames++;
      };

      const deadline = 60 * 60 * 9;       // nine minutes of game time
      while (frames < deadline) {
        tick(frames % 4 === 0);
        if (game.sectorIndex !== lastSector && game.state === 'playing') {
          lastSector = game.sectorIndex;
          log.sectors.push({ index: lastSector, atSeconds: +(frames / 60).toFixed(1), score: game.score });
        }
        if (game.boss?.active) bossSeen = true;
        if (game.state === 'victory') { victoryAt = frames; break; }
        if (frames % 600 === 0) await new Promise(r => setTimeout(r, 0));
      }
      const victory = game.state === 'victory';
      const results = {
        title: document.getElementById('over-title')?.textContent,
        continueVisible: !document.getElementById('btn-continue')?.hidden,
        continueLabel: document.getElementById('btn-continue')?.textContent,
        rows: [...document.querySelectorAll('#over-results .result-row')].map(r => r.textContent.replace(/\s+/g, ' ').trim()),
        screen: screens.current,
      };
      const campaign = {
        victory, bossSeen, seconds: +(frames / 60).toFixed(1), kills: game.kills, score: game.score,
        grades: game.gradeLine, threads: game.threads, grazes: game.grazes, loop: game.loop,
      };

      // continue into loop 2 and fly its opening
      let loop2 = null;
      if (victory) {
        game.continueLoop();
        const before = game.score;
        for (let i = 0; i < 60 * 40; i++) tick(i % 4 === 0);
        loop2 = { state: game.state, loop: game.loop, sector: game.sectorIndex, scoreBanked: before, scoreAfter: game.score, enemies: game.enemies.length };
      }
      const f = log.frameMs.sort((a, b) => a - b);
      const q = (k) => +f[Math.min(f.length - 1, Math.floor(f.length * k))].toFixed(2);
      return {
        campaign, results, loop2, sectors: log.sectors,
        renderedFrameCpuMs: { samples: f.length, median: q(0.5), p95: q(0.95), p99: q(0.99), max: q(1) },
        programs: engine.renderer.info.programs.length,
        memory: engine.renderer.info.memory,
      };
    });
    const report = { ...result, errors };
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (errors.length || !result.campaign.victory) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
