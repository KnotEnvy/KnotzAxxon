// Windows Node + installed Chrome over Playwright's child-process pipe (no debugging port).
// Actual-game frames, each rendered twice from one frozen simulation state: once with the
// ambient traffic draw and once with only that draw hidden. Hardware renderer required.
// The simulation is stepped at a fixed 60 Hz by this harness, the ship is held on a fixed
// line and takes no damage: this is picture evidence, not gameplay or frame-rate evidence.
const fs = require('node:fs');
const path = require('node:path');
const pw = require(process.env.KZ_PLAYWRIGHT_PATH);
const spec = JSON.parse(fs.readFileSync(process.env.KZ_SPEC, 'utf8'));
const OUT = process.env.KZ_OUT;

(async () => {
  const report = { url: process.env.KZ_URL, seed: spec.seed, quality: spec.quality, startedAt: new Date().toISOString(), views: [], errors: [] };
  const browser = await pw.chromium.launch({ executablePath: process.env.KZ_CHROME_EXE, headless: true,
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
  try {
    report.browser = browser.version();
    for (const view of spec.views) {
      const page = await browser.newPage({ viewport: { width: view.width, height: view.height }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error' && !/404|WebSocket/.test(m.text())) errors.push(m.text()); });
      await page.addInitScript((q) => {
        // the worktree is shared: keep another owner's edit from reloading the page mid-capture
        const Native = window.WebSocket;
        window.WebSocket = class extends Native { constructor(url, protocols) { super(protocols === 'vite-hmr' ? 'ws://127.0.0.1:1' : url, protocols); } };
        localStorage.setItem('knotzaxxon.settings.v2', JSON.stringify({ quality: q, camera: 'classic', shake: 0 }));
      }, spec.quality);
      await page.goto(process.env.KZ_URL);
      await page.waitForFunction(() => window.KZ && KZ.game && KZ.game.fortress, null, { timeout: 240000 });
      const gpu = await page.evaluate(() => {
        const gl = KZ.engine.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
        return { renderer: ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL), vendor: ext && gl.getParameter(ext.UNMASKED_VENDOR_WEBGL),
          userAgent: navigator.userAgent, dpr: devicePixelRatio, inner: [innerWidth, innerHeight] };
      });
      if (!gpu.renderer || /swiftshader|llvmpipe|software|basic render/i.test(gpu.renderer)) throw Error(`hardware renderer unavailable: ${gpu.renderer}`);
      await page.evaluate(() => {
        const { engine, game } = KZ;
        engine.stop();
        window.__advance = (n, pilot) => {
          const input = engine.input, p = game.player;
          for (let i = 0; i < n; i++) {
            const dt = 1 / 60;
            engine.time += dt; engine.frame++; engine.realDelta = dt;
            if (pilot && game.state === 'playing') {
              input.moveX = Math.max(-1, Math.min(1, (p.pos.x - pilot.x) * 0.25));
              input.moveY = Math.max(-1, Math.min(1, (pilot.y - p.pos.y) * 0.25));
              input.fire = false; input.boost = false;
              p.fuel = 1; p.hull = p.hullMax;
            }
            game.update(dt, engine.time, dt);
            game.lateUpdate(dt, engine.time);
            engine.materials.update(engine.time);
            engine.postfx.update(dt, engine.time);
            input.pressed.clear();
          }
        };
        // one frozen state, two renders: the only difference is the traffic mesh's visibility
        window.__pair = (timing) => {
          const gl = engine.renderer.getContext(), canvas = engine.renderer.domElement;
          const mesh = game.fortress.traffic.mesh, shown = mesh.visible, p = game.player;
          const render = (on) => {
            mesh.visible = on && shown;
            engine.renderer.info.reset();
            engine.postfx.render(1 / 60);
            const info = engine.renderer.info.render;
            return { png: canvas.toDataURL('image/png'), calls: info.calls, triangles: info.triangles };
          };
          const after = render(true), before = render(false);
          // indicative GPU-synchronised frame cost, alternating so drift cancels; not an FPS claim
          const ms = { on: [], off: [] };
          for (let i = 0; i < (timing ?? 0) * 2; i++) {
            const on = i % 2 === 0;
            mesh.visible = on && shown;
            const t0 = performance.now(); engine.postfx.render(1 / 60); gl.finish();
            ms[on ? 'on' : 'off'].push(performance.now() - t0);
          }
          mesh.visible = shown;
          engine.postfx.render(1 / 60);   // leave the shipped picture on the canvas for a page screenshot
          const u = mesh.material.uniforms, s = game.level.sectorAt(p.pos.z);
          const median = (a) => a.length ? +[...a].sort((x, y) => x - y)[a.length >> 1].toFixed(3) : null;
          return { after, before, canvas: [canvas.width, canvas.height], state: game.state, z: +p.pos.z.toFixed(1), sector: s?.name, sectorIndex: s?.index,
            camera: KZ.settings.get('camera'), frame: engine.frame,
            traffic: { drawn: shown, opacity: +u.uOpacity.value.toFixed(3), density: u.uDensity.value, tau: +u.uTau.value.toFixed(3) },
            gpuMs: timing ? { samples: timing, medianOn: median(ms.on), medianOff: median(ms.off) } : null };
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
          for (let i = 0; i < 24; i++) { engine.frame++; game.fortress.update(z, 0, engine.time, engine.frame); }
        };
        window.__title = (seed) => { game.reset(seed); game.toTitle(); };
      });
      const shots = [];
      for (const scene of spec.scenes.filter((s) => (s.view ?? spec.views[0].name) === view.name)) {
        await page.evaluate(([seed, s]) => { if (s.camera === 'title') window.__title(seed); else window.__scene(seed, s.camera, s.sector, s.into, s.pilot); }, [spec.seed, scene]);
        let settled = 0;
        for (const [k, frames] of (scene.frames ?? [300]).entries()) {
          const r = await page.evaluate(([n, pilot, timing]) => { window.__advance(n, pilot); return window.__pair(timing); }, [frames, scene.camera === 'title' ? null : scene.pilot, scene.timing ?? 0]);
          settled += frames;
          const base = `${scene.name}-${view.name}-f${settled}`;
          for (const kind of ['after', 'before']) {
            fs.writeFileSync(path.join(OUT, `${base}--${kind}.png`), Buffer.from(r[kind].png.split(',')[1], 'base64'));
            delete r[kind].png;
          }
          if (scene.hud && k === (scene.frames ?? [300]).length - 1) await page.screenshot({ path: path.join(OUT, `${base}--page.png`) });
          shots.push({ scene: scene.name, file: base, simulatedFrames: settled, ...r });
          console.log(`${base.padEnd(44)} ${String(r.sector).padEnd(20)} opacity ${r.traffic.opacity} calls ${r.before.calls}->${r.after.calls} tris ${r.before.triangles}->${r.after.triangles}` + (r.gpuMs ? ` gpu ${r.gpuMs.medianOff}->${r.gpuMs.medianOn} ms` : ''));
        }
      }
      report.views.push({ ...view, gpu, shots, errors });
      if (errors.length) report.errors.push(...errors.map((e) => `${view.name}: ${e}`));
      await page.close();
    }
  } finally {
    await browser.close();
  }
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  console.log('renderer:', report.views[0]?.gpu.renderer, '| browser:', report.browser, '| errors:', report.errors.length, report.errors.slice(0, 4));
})().then(() => process.exit(0)).catch((e) => { console.error(e.stack); process.exit(1); });
