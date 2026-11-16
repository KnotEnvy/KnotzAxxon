/** Real menu actions and quality changes against the source game; staged QA only. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require(process.env.KZ_PLAYWRIGHT_PATH || 'playwright');
const {startEvidence,finishEvidence} = require('./launch/browser-evidence.cjs');
const out = process.env.KZ_OUT;
if (!out || !process.env.KZ_TEST_URL) throw Error('Run through launch/run-source-qa.cjs prewarm-quality');
(async () => {
  let browser;
  const errors = [], checks = [];
  try {
    browser = await chromium.launch({headless:true,executablePath:process.env.KZ_CHROME_EXE,
      args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
    const page = await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
    page.on('pageerror',e=>errors.push(e.message));
    page.on('requestfailed',r=>{if(!r.url().startsWith('ws:'))errors.push('Network '+r.url()+': '+JSON.stringify(r.failure()));});
    page.on('response',r=>{if(r.status()>=400)errors.push('HTTP '+r.status()+': '+r.url());});
    await page.addInitScript(() => {
      localStorage.setItem('knotzaxxon.settings.v2',JSON.stringify({quality:'low',camera:'classic',shake:0,master:0}));
      const Native=window.WebSocket;
      window.WebSocket=class extends Native {constructor(url,protocols){super(protocols==='vite-hmr'?'ws://127.0.0.1:1':url,protocols)}};
    });
    await page.goto(process.env.KZ_TEST_URL);
    await page.waitForFunction(()=>window.KZ?.screens.current==='title',undefined,{timeout:120000});
    await page.evaluate(()=>KZ.engine.stop());
    const hardware = await startEvidence(page);
    assert.equal(hardware.webgl2,true);
    assert.match(hardware.renderer,/NVIDIA.*1650 Ti/);
    assert.doesNotMatch(hardware.renderer,/swiftshader|llvmpipe|software/i);
    await page.evaluate(() => {
      const g=KZ.game,original=g.prewarm;
      window.__qualityPrewarmCalls=[];
      g.prewarm=function(...args){
        const before=performance.now(),quality=KZ.settings.get('quality');
        const value=original.apply(this,args);
        __qualityPrewarmCalls.push({quality,durationMs:performance.now()-before,owners:this._prewarmEntities?.length,
          attached:this._prewarmEntities?.filter(owner=>owner.group.parent).length,
          programs:KZ.engine.renderer.info.programs.map(p=>({id:p.id,name:p.name,usedTimes:p.usedTimes}))});
        return value;
      };
    });
    async function record(name,expectedCalls,expectedQuality) {
      const row=await page.evaluate(name=>{
        const {engine:e,game:g}=KZ;
        e.postfx.render(1/60);e.renderer.getContext().finish();
        return {name,prewarmCalls:__qualityPrewarmCalls.length,quality:KZ.settings.get('quality'),
          state:g.state,screen:KZ.screens.current,mode:{...g.mode},owners:g._prewarmEntities?.length,
          attached:g._prewarmEntities?.filter(owner=>owner.group.parent).length,
          hull:g.player.hull,shields:g.player.shields,programs:e.renderer.info.programs.length,memory:{...e.renderer.info.memory}};
      },name);
      checks.push(row);
      assert.equal(row.prewarmCalls,expectedCalls,name+' prewarm calls');
      assert.equal(row.quality,expectedQuality,name+' quality');
      assert.equal(row.state,'playing',name+' state');
      assert.equal(row.owners,14,name+' retained owner bound');
      assert.equal(row.attached,0,name+' staged owners detached');
    }
    async function title(quality) {
      await page.evaluate(quality=>{KZ.game.toTitle();KZ.settings.set('quality',quality)},quality);
      await page.waitForTimeout(400);
    }
    async function finish(quality) {
      await page.evaluate(quality=>{KZ.game._finish(false);KZ.settings.set('quality',quality)},quality);
      await page.waitForTimeout(400);
    }
    await page.locator('#screen-title [data-action="start"]').click();
    await record('same-quality ENGAGE uses boot warm set',0,'low');
    await title('medium');
    await page.locator('#screen-title [data-action="daily"]').click();
    await record('changed-quality DAILY recompiles before start',1,'medium');
    assert.equal(checks.at(-1).mode.daily,true);
    await finish('high');
    await page.locator('#screen-over [data-action="retry"]').click();
    await record('changed-quality RE-ENGAGE recompiles before start',2,'high');
    await page.evaluate(()=>{KZ.game.pause();KZ.settings.set('quality','ultra')});
    await page.waitForTimeout(400);
    await page.locator('#screen-pause [data-action="resume"]').click();
    await record('RESUME retains current warm set while changing active quality',2,'ultra');
    await finish('ultra');
    await page.locator('#screen-over [data-action="retry"]').click();
    await record('next new sortie warms previously active quality',3,'ultra');
    await title('low');
    await page.keyboard.press('Enter');
    await record('keyboard ENGAGE warms changed quality',4,'low');
    await title('low');
    await page.locator('#screen-title [data-action="daily"]').click();
    await record('same-quality DAILY reuses latest warm set',4,'low');
    const calls=await page.evaluate(()=>__qualityPrewarmCalls);
    assert.deepEqual(calls.map(c=>c.quality),['medium','high','ultra','low']);
    assert.deepEqual(errors,[],'page/network errors');
    const report={kind:'staged menu/quality lifecycle diagnostic; zero gameplay credit',checks,calls,errors,
      hardware:await finishEvidence(page,browser),
      limits:['Game._finish opens staged results; these are not normal-play deaths or wins.',
        'Real DOM click/key menu actions, headless Windows Chrome; no physical-controller/phone or FPS claim.',
        'A quality change during pause resumes without prewarming; its next new sortie is prewarmed.']};
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({checks,hardware:report.hardware},null,2));
  } finally { await browser?.close(); }
})().catch(error=>{console.error(error.stack);process.exitCode=1});
