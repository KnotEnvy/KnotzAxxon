/** Model catalogue: real geometry/materials, fixed lighting and multiple angles.
 * Run against the dev server. KZ_OUT and KZ_TEST_URL override defaults.
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const OUT = process.env.KZ_OUT || 'artifacts/models';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const report = { errors: [], sheets: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    await page.goto(process.env.KZ_TEST_URL || 'http://127.0.0.1:5177');
    await page.waitForFunction(() => window.KZ, null, { timeout: 90000 });
    await page.evaluate(async () => {
      const T = await import('/node_modules/three/build/three.module.js');
      const { createEnemy, ENEMY_KINDS } = await import('/src/entities/Enemies.js');
      const { Pickup, PICKUP_KINDS } = await import('/src/entities/Pickup.js');
      const { Boss } = await import('/src/entities/Boss.js');
      const { Rng } = await import('/src/core/Utils.js');
      const { CHUNK_LEN } = await import('/src/world/Level.js');
      KZ.engine.stop();
      const mats = KZ.engine.materials, fortress = KZ.game.fortress;
      const scene = new T.Scene(); scene.background = new T.Color(0x111c2b); scene.environment = KZ.engine.scene.environment;
      scene.add(new T.HemisphereLight(0xc7eaff, 0x334058, 2.3));
      for (const [p, c, power] of [[[4, 9, 6], 0xffefdb, 3], [[-6, 3, -4], 0x6dcfff, 2]]) {
        const l = new T.DirectionalLight(c, power); l.position.set(...p); scene.add(l);
      }
      const stage = new T.Group(); scene.add(stage);
      document.body.innerHTML = '';
      const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setSize(1440, 1200); renderer.toneMapping = T.ACESFilmicToneMapping;
      document.body.appendChild(renderer.domElement); renderer.setScissorTest(true);
      const enemies = [...ENEMY_KINDS].map(kind => {
        const e = createEnemy(kind, mats, { x: 0, y: 0, z: 0, seed: 42 }); e.group.rotation.set(0, 0, 0);
        return { name: kind, group: e.group, entity: e };
      });
      const items = PICKUP_KINDS.map(kind => {
        const p = new Pickup(new T.Scene(), mats, kind, 0, 0, 0); p.phase = 0; p.halo.visible = false;
        return { name: `pickup-${kind}`, group: p.group };
      });
      for (const name of ['player', 'enemy', 'missile']) {
        const source = KZ.game.projectiles[`${name}Mesh`];
        const g = new T.Group(); g.add(new T.Mesh(source.geometry, source.material)); items.push({ name: `${name}-projectile`, group: g });
      }
      const boss = new Boss(new T.Scene(), mats, { z: 0, seed: 42 }); boss.group.position.set(0, 0, 0);
      // Obtain the actual batching class through its existing builder callback.
      let Batch; const deck = fortress._deck;
      fortress._deck = function(batch, ...args) { Batch = batch.constructor; return deck.call(this, batch, ...args); };
      const sample = fortress._buildChunk(0); fortress._deck = deck; fortress._disposeChunk(sample);
      const theme = { name: 'airfield', warm: 0xffb43a, accent: 0x8bcbd0 };
      const props = [];
      function prop(name, build) {
        const batch = new Batch(), group = new T.Group(); build(batch, new Rng(42), group);
        batch.merge(fortress._matFor, group); props.push({ name, group });
      }
      prop('cargo', (b, r) => fortress._crates(b, r, 0, 0, 3.2));
      prop('stored-fighter', (b, r) => fortress._parkedFighter(b, 0, 0, r));
      prop('landing-pad', (b, r) => fortress._landingPad(b, r, 0, 0, theme));
      prop('fuel-depot', (b, r) => fortress._fuelDepot(b, r, 0, 0));
      prop('hazard-pad', b => fortress._hazardPad(b, 0, 0));
      prop('flak-gun', (b, r) => fortress._flakGun(b, r, 0, 0, () => {}));
      prop('cooling-stack', (b, r) => fortress._coolingStack(b, r, 0, 0, () => {}));
      prop('antenna', (b, r) => fortress._antenna(b, r, 0, 0, theme));
      prop('bunker', (b, r) => fortress._bunker(b, r, 0, 0, theme));
      const structures = [];
      for (const sector of KZ.game.level.sectors) {
        const group = fortress._buildChunk(Math.floor((sector.zStart + 420) / CHUNK_LEN));
        structures.push({ name: `sector-${sector.index + 1}`, group });
      }
      window.catalogue = { T, renderer, scene, stage, enemies, items, boss, props, structures };
      window.captureSheet = (kind, angle = 'front') => {
        const { T, renderer, scene, stage } = catalogue;
        document.querySelectorAll('.model-label').forEach(e => e.remove());
        const list = kind === 'boss' ? [
          { name: 'sentinel-front', group: boss.group, view: [0, .25, -1] },
          { name: 'sentinel-quarter', group: boss.group, view: [-1, .5, -1] },
          { name: 'sentinel-back', group: boss.group, view: [1, .4, 1] },
          { name: 'reactor-open', group: boss.group, view: [0, .25, -1], open: true },
          { name: 'reactor-side', group: boss.group, view: [-1, .25, -.5], open: true },
          { name: 'damaged-pods', group: boss.group, view: [-1, .5, -1], damaged: true },
        ] : catalogue[kind];
        const records = [];
        // Clear all tiles, including the unused bottom row.
        renderer.setViewport(0, 0, 1440, 1200); renderer.setScissor(0, 0, 1440, 1200); renderer.clear();
        for (let i = 0; i < list.length; i++) {
          const item = list[i], group = item.group;
          stage.clear(); stage.position.set(0, 0, 0); stage.add(group);
          if (kind === 'boss') {
            for (const s of boss.shutters) s.mesh.visible = !item.open;
            for (const p of boss.pods) { p.body.visible = !item.damaged; p.stump.visible = !!item.damaged; p.barrels.forEach(b => b.visible = !item.damaged); p.eye.visible = !item.damaged; }
          }
          stage.updateMatrixWorld(true);
          const box = new T.Box3(); group.traverse(o => { if (o.isMesh && o.visible) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
          const center = box.getCenter(new T.Vector3()), size = box.getSize(new T.Vector3());
          stage.position.copy(center).negate();
          const radius = size.length() * .50;
          const camera = new T.OrthographicCamera(-radius * 1.2, radius * 1.2, radius, -radius, .1, radius * 10);
          const eye = item.view || (angle === 'front' ? [-1, .7, 1] : angle === 'rear' ? [1, .4, -1] : [0, 1, .001]);
          camera.position.set(...eye).normalize().multiplyScalar(radius * 4); camera.lookAt(0, 0, 0);
          const x = i % 3 * 480, y = 800 - Math.floor(i / 3) * 400;
          renderer.setViewport(x, y, 480, 400); renderer.setScissor(x, y, 480, 400); renderer.render(scene, camera);
          const label = document.createElement('div'); label.className = 'model-label'; label.textContent = item.name.toUpperCase();
          label.style.cssText = `position:fixed;left:${x + 22}px;top:${1200-y-400+18}px;color:#a3bdd4;font:13px monospace;letter-spacing:2px`; document.body.appendChild(label);
          let meshes = 0, triangles = 0;
          group.traverseVisible(o => { if (o.isMesh) { meshes++; triangles += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3; } });
          records.push({ name: item.name, meshes, triangles, size: size.toArray() });
        }
        return records;
      };
    });
    for (const kind of ['enemies', 'items', 'boss', 'props', 'structures']) {
      for (const angle of kind === 'enemies' || kind === 'props' ? ['front', 'rear', 'top'] : ['front']) {
        const models = await page.evaluate(([kind, angle]) => captureSheet(kind, angle), [kind, angle]);
        await page.screenshot({ path: path.join(OUT, `${kind}-${angle}.png`) });
        report.sheets.push({ kind, angle, models });
      }
    }
    if (report.errors.length) throw new Error(report.errors.join('\n'));
  } finally { await browser.close(); fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n'); }
  console.log(JSON.stringify({ sheets: report.sheets.length, errors: report.errors }));
})().catch(e => { console.error(e); process.exitCode = 1; });
