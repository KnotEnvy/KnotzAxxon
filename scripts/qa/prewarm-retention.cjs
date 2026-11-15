/** Actual-source GPU diagnostics for staged material ownership, never campaign credit. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.KZ_PLAYWRIGHT_PATH || 'playwright');
const { startEvidence, finishEvidence } = require('./launch/browser-evidence.cjs');
const out = process.env.KZ_OUT;
if (!out || !process.env.KZ_TEST_URL) throw Error('Run through launch/run-source-qa.cjs prewarm-retention');

(async () => {
  let browser;
  const errors = [];
  try {
    browser = await chromium.launch({headless:true, executablePath:process.env.KZ_CHROME_EXE,
      args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
    const context = await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
    await context.addInitScript(() => {
      localStorage.setItem('knotzaxxon.settings.v2', JSON.stringify({quality:'high',camera:'classic',assist:false,shake:0}));
      const Native = window.WebSocket;
      window.WebSocket = class extends Native {
        constructor(url, protocols) { super(protocols === 'vite-hmr' ? 'ws://127.0.0.1:1' : url, protocols); }
      };
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push({type:'pageerror',message:e.message}));
    page.on('requestfailed', r => { if (!r.url().startsWith('ws:')) errors.push({type:'requestfailed',url:r.url(),failure:r.failure()}); });
    page.on('response', r => { if (r.status() >= 400) errors.push({type:'http',url:r.url(),status:r.status()}); });
    await page.goto(process.env.KZ_TEST_URL);
    await page.waitForFunction(() => !!window.KZ, undefined, {timeout:120000});
    await page.evaluate(() => KZ.engine.stop());
    const start = await startEvidence(page);
    assert.equal(start.webgl2, true);
    assert.match(start.renderer, /NVIDIA.*1650 Ti/);
    assert.doesNotMatch(start.renderer, /swiftshader|llvmpipe|software/i);
    const result = await page.evaluate(() => {
      const {engine:e,game:g} = KZ, renderer = e.renderer;
      const materials = new Map(), disposed = new Map(), epochs = [];
      const snapshot = () => ({programs:renderer.info.programs.map(p => ({id:p.id,name:p.name,usedTimes:p.usedTimes})),
        memory:{...renderer.info.memory},sceneChildren:e.scene.children.length,fortressChildren:g.fortress.root.children.length,
        enemies:g.enemies.length,pickups:g.pickups.length});
      const baseline = snapshot();
      const sceneMaterials = () => {
        const found = new Set();
        e.scene.traverse(o => { for (const m of [].concat(o.material ?? [])) found.add(m); });
        return found;
      };
      function stage(name, fail = false) {
        const priorMaterials = sceneMaterials(), before = snapshot();
        let during, staged = [], thrown = null;
        const startedAt = performance.now();
        try {
          g.prewarm(() => {
            const previous = renderer.getRenderTarget();
            renderer.setRenderTarget(e.postfx.composer.readBuffer);
            try {
              renderer.compile(e.scene, e.camera);
              e.scene.traverse(o => {
                for (const m of [].concat(o.material ?? [])) {
                  const slots = [...Object.values(m), ...Object.values(m.uniforms ?? {}).map(u => u?.value)];
                  for (const t of slots) if (t?.isTexture && !t.isRenderTargetTexture) renderer.initTexture(t);
                }
              });
            } finally { renderer.setRenderTarget(previous); }
            for (const m of sceneMaterials()) {
              if (priorMaterials.has(m)) continue;
              if (!materials.has(m.uuid)) {
                materials.set(m.uuid, m);
                disposed.set(m.uuid, 0);
                m.addEventListener('dispose', () => disposed.set(m.uuid, disposed.get(m.uuid) + 1));
              }
              const properties = renderer.properties.get(m);
              staged.push({uuid:m.uuid,name:m.name,type:m.type,
                programs:[...(properties.programs?.values() ?? [])].map(p => ({id:p.id,name:p.name,usedTimes:p.usedTimes}))});
            }
            e.postfx.render(1/60);
            renderer.getContext().finish();
            during = snapshot();
            if (fail) throw Error('QA intentional compile-callback fault after actual compile and render');
          });
        } catch (error) { thrown = error.message; }
        const after = snapshot(), ids = new Set(after.programs.map(p => p.id));
        const epoch = {name, intentionalFault:fail, thrown, durationMs:performance.now()-startedAt,
          before,during,after,staged:staged.map(m => ({...m,disposeEvents:disposed.get(m.uuid),
            retainedPrograms:m.programs.filter(p => ids.has(p.id)).map(p => p.id)}))};
        epochs.push(epoch);
        return epoch;
      }
      const first = stage('successful-initial-stage');
      const firstUUIDs = first.staged.map(m => m.uuid);
      const second = stage('successful-replacement');
      const firstAfterReplacement = firstUUIDs.map(uuid => ({uuid,name:materials.get(uuid).name,disposeEvents:disposed.get(uuid)}));
      const secondUUIDs = second.staged.map(m => m.uuid);
      const fault = stage('failed-replacement', true);
      const secondAfterFault = secondUUIDs.map(uuid => ({uuid,name:materials.get(uuid).name,disposeEvents:disposed.get(uuid)}));
      const beforeDispose = snapshot();
      g.dispose();
      const afterDispose = snapshot();
      const materialDisposal = [...materials].map(([uuid,m]) => ({uuid,name:m.name,disposeEvents:disposed.get(uuid)}));
      return {kind:'staged actual-source GPU ownership diagnostic; zero gameplay credit',
        method:'Game.prewarm with actual renderer.compile, texture uploads and postprocessing draw; repeated success, intentional callback fault, final Game.dispose',
        baseline,epochs,firstAfterReplacement,secondAfterFault,beforeDispose,afterDispose,materialDisposal,
        limits:['Renderer CPU durations include compilation, uploads, draws and gl.finish; not isolated GPU timings or FPS.',
          'Material names do not uniquely identify shader variants; actual program IDs and usage counts are retained.',
          'This does not establish subjective feel, campaign coverage or physical-device behavior.']};
    });
    result.hardware = await finishEvidence(page,browser);
    result.errors = errors;
    const healthy = result.epochs.every(epoch =>
      epoch.after.sceneChildren === result.baseline.sceneChildren && epoch.after.fortressChildren === result.baseline.fortressChildren &&
      epoch.after.enemies === result.baseline.enemies && epoch.after.pickups === result.baseline.pickups);
    result.assertions = {sceneOwnershipRestored:healthy,
      successfulCallbacksReturn:result.epochs.slice(0,2).every(epoch => !epoch.thrown),
      intentionalFaultPreserved:result.epochs[2].thrown === 'QA intentional compile-callback fault after actual compile and render',
      noPageOrNetworkErrors:errors.length === 0};
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(result,null,2)+'\n');
    for (const [name,passed] of Object.entries(result.assertions)) assert.equal(passed,true,name);
    console.log(JSON.stringify({assertions:result.assertions,hardware:result.hardware,
      epochs:result.epochs.map(epoch => ({name:epoch.name,programsDuring:epoch.during.programs.length,
        programsAfter:epoch.after.programs.length,stagedMaterials:epoch.staged.length,
        undisposedMaterials:epoch.staged.filter(m => !m.disposeEvents).length})),
      finalProgramCount:result.afterDispose.programs.length,report:path.join(out,'report.json')},null,2));
  } finally { await browser?.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
