/** Actual-game native Chromium captures. Software WebGL only; no hardware timing claim.
 * Run with a temporary dev server and a spec JSON; see README.md. */
const fs = require('node:fs');
const path = require('node:path');
const SOFT = true;
const { chromium } = require('playwright');

const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const OUT = spec.out;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const report = { seed: spec.seed, quality: spec.quality, size: [spec.width, spec.height], variants: {}, errors: [] };
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--mute-audio'], env: { ...process.env, DISPLAY: '', WAYLAND_DISPLAY: '' } });
  try {
    report.browser = browser.version();
    for (const [variant, query] of Object.entries(spec.variants)) {
      const page = await browser.newPage({ viewport: { width: spec.width, height: spec.height }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
      await page.addInitScript((q) => localStorage.setItem('knotzaxxon.settings.v2', JSON.stringify({ quality: q, camera: 'classic', shake: 0 })), spec.quality);
      await page.goto(spec.url + (query ? '?' + query : ''));
      await page.waitForFunction(() => window.KZ && KZ.game, null, { timeout: 240000 });
      await page.evaluate((soft) => { window.__soft = soft; }, SOFT);
      const gpu = await page.evaluate(() => {
        const gl = KZ.engine.renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
      });
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
              input.fire = !!pilot.fire; input.boost = !!pilot.boost;
              p.fuel = 1; p.hull = p.hullMax;
            }
            game.update(dt, engine.time, dt);
            game.lateUpdate(dt, engine.time);
            engine.materials.update(engine.time);
            engine.postfx.update(dt, engine.time);
            input.pressed.clear();
          }
          const gl = engine.renderer.getContext();
          // indicative GPU-synchronised render time (not a hardware FPS claim)
          let ms = 0; const N = window.__soft ? 0 : 12;
          for (let i = 0; i < N; i++) { const t0 = performance.now(); engine.postfx.render(1 / 60); gl.finish(); ms += performance.now() - t0; }
          engine.renderer.info.reset();
          engine.postfx.render(1 / 60);
          const info = engine.renderer.info.render;
          const png = engine.renderer.domElement.toDataURL('image/png');
          let chunkTris = 0, chunkDraws = 0;
          game.fortress.root.traverse((o) => { if (o.isMesh) { chunkDraws++; chunkTris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
          return { png, calls: info.calls, triangles: info.triangles, renderMs: N ? +(ms / N).toFixed(2) : null, chunks: game.fortress.chunks.size, chunkTris, chunkDraws,
            z: +p.pos.z.toFixed(1), sector: game.level.sectorAt(p.pos.z)?.name, state: game.state };
        };
        window.__scene = (seed, camera, sectorIndex, into, pilot) => {
          const { settings, screens } = KZ;
          settings.set('camera', camera);
          if (game.state === 'idle' || game.state === 'over' || game.state === 'victory') game.start();
          game.reset(seed);
          game.state = 'playing'; game.hud.setLive(true); screens.hide();
          const s = game.level.sectors[sectorIndex];
          const z = Math.max(0, s.zStart + into);
          const p = game.player;
          p.pos.set(pilot.x, pilot.y, z);
          p.damage = () => 'none';
          p.trails.forEach((t) => t.reset(p.pos));
          game.featureCursor = game.level.features.findIndex((f) => f.z >= z - 30);
          if (game.featureCursor < 0) game.featureCursor = game.level.features.length;
          game._hudCursor = game.featureCursor;
          game.sectorIndex = game.level.sectorAt(z).index;
          game._enterSector(game.sectorIndex);
          game.rig.snap(p);
          // stream the whole draw window in before the pilot runs
          for (let i = 0; i < 24; i++) { engine.frame++; game.fortress.update(z, 0, engine.time, engine.frame); }
        };
        window.__title = (seed) => { game.reset(seed); game.toTitle(); };
      });
      const scenes = [];
      for (const [name, camera, sector, into, frames, pilot] of spec.scenes) {
        const r = await page.evaluate(([seed, camera, sector, into, frames, pilot]) => {
          if (camera === 'title') { window.__title(seed); return window.__step(frames, null); }
          window.__scene(seed, camera, sector, into, pilot);
          return window.__step(frames, pilot);
        }, [spec.seed, camera, sector, into, frames, pilot]);
        const file = `${name}--${variant}.png`;
        fs.writeFileSync(path.join(OUT, file), Buffer.from(r.png.split(',')[1], 'base64'));
        delete r.png;
        scenes.push({ name, camera, file, ...r });
      }
      report.variants[variant] = { query, gpu, scenes, errors };
      if (errors.length) report.errors.push(...errors.map((e) => `${variant}: ${e}`));
      await page.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  const rows = [];
  for (const [v, d] of Object.entries(report.variants)) for (const s of d.scenes) rows.push(`${s.name.padEnd(28)} ${v.padEnd(7)} calls ${String(s.calls).padStart(4)} tris ${String(s.triangles).padStart(8)} chunkTris ${String(s.chunkTris).padStart(7)} render ${s.renderMs} ms  ${s.sector}`);
  console.log(rows.join('\n'));
  console.log('gpu:', Object.values(report.variants)[0]?.gpu, '| errors:', report.errors.length, report.errors.slice(0, 4));
})().catch((e) => { console.error(e); process.exit(1); });
