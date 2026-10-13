/** Deterministic airframe inspection using the real player and material library.
 * KZ_OUT=artifacts/ship-before node scripts/qa/ship-capture.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.KZ_PLAYWRIGHT_PATH || 'playwright');
const OUT = process.env.KZ_OUT || 'artifacts/ship-review';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const report = { errors: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    await page.goto(process.env.KZ_TEST_URL || 'http://127.0.0.1:5177');
    await page.waitForFunction(() => window.KZ, null, { timeout: 90000 });
    report.model = await page.evaluate(async () => {
      const T = await import('/node_modules/three/build/three.module.js');
      KZ.engine.stop();
      const model = KZ.game.player.model;
      model.removeFromParent(); model.position.set(0, 0, 0); model.rotation.set(0, 0, 0);
      model.visible = true; model.userData.silhouette.visible = false;
      const scene = new T.Scene(); scene.background = new T.Color(0x111c2b);
      scene.environment = KZ.engine.scene.environment;
      scene.add(model, new T.HemisphereLight(0xc7eaff, 0x334058, 2.4));
      for (const [position, color, intensity] of [[[4, 9, 6], 0xffefdb, 3.5], [[-6, 3, -4], 0x6dcfff, 2]]) {
        const l = new T.DirectionalLight(color, intensity); l.position.set(...position); scene.add(l);
      }
      document.body.innerHTML = '';
      const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setSize(1440, 960); renderer.setPixelRatio(1);
      renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
      document.body.appendChild(renderer.domElement);
      renderer.setScissorTest(true);
      const views = [
        ['FRONT QUARTER', [8, 6, 10]], ['REAR QUARTER', [-8, 5, -10]], ['TOP', [0, 14, 0.01]],
        ['SIDE', [14, 2, 0]], ['CHASE', [0, 3, -14]], ['BANK / UNDERSIDE', [-7, -5, 10]],
      ];
      for (let i = 0; i < views.length; i++) {
        const [label, eye] = views[i], x = (i % 3) * 480, y = i < 3 ? 480 : 0;
        const c = new T.OrthographicCamera(-5.3, 5.3, 5.3, -5.3, .1, 100);
        c.position.set(...eye); c.lookAt(0, .15, 0);
        renderer.setViewport(x, y, 480, 480); renderer.setScissor(x, y, 480, 480);
        renderer.render(scene, c);
        const tag = document.createElement('div'); tag.textContent = label;
        tag.style.cssText = `position:fixed;left:${x+24}px;top:${960-y-480+22}px;color:#91abc6;font:12px monospace;letter-spacing:2px`;
        document.body.appendChild(tag);
      }
      window.shipReview = { scene, model, renderer, T };
      let triangles = 0, meshes = 0;
      model.traverse(o => { if (o.isMesh && o.visible) { meshes++; triangles += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3; } });
      return { meshes, triangles };
    });
    await page.screenshot({ path: path.join(OUT, 'airframe.png') });
    report.occlusion = await page.evaluate(() => {
      const { scene, model, renderer, T } = shipReview;
      const size = 384, target = new T.WebGLRenderTarget(size, size);
      renderer.setScissorTest(false); renderer.setRenderTarget(target);
      renderer.setViewport(0, 0, size, size);
      const occluder = new T.Mesh(new T.BoxGeometry(12, 8, .5), new T.MeshBasicMaterial({ color: 0x29333e }));
      occluder.position.z = -4; scene.add(occluder);
      const read = () => {
        const data = new Uint8Array(size * size * 4);
        renderer.readRenderTargetPixels(target, 0, 0, size, size, data); return data;
      };
      const results = [];
      for (const orthographic of [true, false]) {
        const camera = orthographic ? new T.OrthographicCamera(-5, 5, 5, -5, .1, 50) : new T.PerspectiveCamera(45, 1, .1, 50);
        camera.position.set(0, 2, -14); camera.lookAt(0, .2, 0);
        for (const bank of [0, -.92, .92, Math.PI]) {
          model.rotation.set(.3, .2, bank);
          for (const covered of [false, true]) {
            occluder.visible = covered;
            model.userData.silhouette.visible = false; renderer.render(scene, camera); const before = read();
            model.userData.silhouette.visible = true; renderer.render(scene, camera); const after = read();
            let pixelsChanged = 0;
            for (let i = 0; i < before.length; i += 4) {
              if (Math.abs(before[i] - after[i]) + Math.abs(before[i+1] - after[i+1]) + Math.abs(before[i+2] - after[i+2]) > 3) pixelsChanged++;
            }
            results.push({ orthographic, bank, covered, pixelsChanged });
          }
        }
      }
      occluder.geometry.dispose(); occluder.material.dispose(); target.dispose();
      return results;
    });
    for (const result of report.occlusion) {
      assert(result.covered ? result.pixelsChanged > 100 : result.pixelsChanged === 0,
        `Occlusion effect must reveal covered hull only: ${JSON.stringify(result)}`);
    }
    if (report.errors.length) throw new Error(report.errors.join('\n'));
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
