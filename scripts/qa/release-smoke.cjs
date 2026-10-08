/** Production release QA. Uses only public UI; never enables the development debug API.
 * npm run build:pages && npm run test:release
 * KZ_TEST_URL=https://knotenvy.github.io/KnotzAxxon/ npm run test:release
 * KZ_BROWSER_CHANNEL=msedge uses installed Edge; otherwise install Chromium first.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const OUT = process.env.KZ_OUT || 'artifacts/release-smoke';
const remote = !!process.env.KZ_TEST_URL;
let URL = process.env.KZ_TEST_URL || null;
const report = { verified_at: new Date().toISOString(), url: URL, target: remote ? 'deployed_site' : 'local_pages_build', checks: [], errors: [], failed_requests: [] };
let server, browser, activePage;
const assert = (ok, message) => { if (!ok) throw Error(message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function title(page) { await page.waitForSelector('#screen-title.is-active', { timeout: 90000 }); }
async function frames(page, count = 30) {
  await page.evaluate(count => new Promise(resolve => { let n = 0; function tick() { if (++n >= count) resolve(); else requestAnimationFrame(tick); } requestAnimationFrame(tick); }), count);
}
async function layout(page) {
  return page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
    canvas: {width: document.getElementById('viewport').width, height: document.getElementById('viewport').height},
    altimeter: (() => { const r = document.getElementById('hud-altimeter')?.getBoundingClientRect(); return r ? {left:r.left,right:r.right,top:r.top,bottom:r.bottom} : null; })(),
    debug_api: !!window.KZ }));
}
(async () => {
  fs.mkdirSync(OUT, {recursive:true});
  try {
    if (!remote) {
      assert(fs.existsSync('dist/index.html'), 'Build first with npm run build:pages');
      const listener = require('node:net').createServer();
      await new Promise((resolve,reject)=>{listener.once('error',reject);listener.listen(0,'127.0.0.1',resolve);});
      const port = listener.address().port;
      await new Promise(resolve=>listener.close(resolve));
      URL = 'http://127.0.0.1:'+port+'/KnotzAxxon/';report.url=URL;
      server = spawn(process.execPath, ['node_modules/vite/bin/vite.js','preview','--base=/KnotzAxxon/','--host','127.0.0.1','--port',String(port),'--strictPort'], {stdio:['ignore','pipe','pipe']});
      let log='';server.stdout.on('data',data=>log+=data);server.stderr.on('data',data=>log+=data);
      server.on('error',error=>log+=error.message);
      let ready=false;
      for(let n=0;n<100;n++) { if(server.exitCode!==null)throw Error('Preview exited: '+log);try { ready=(await fetch(URL)).ok; }catch {}if(ready)break;await delay(100); }
      assert(ready,'Preview did not become ready: '+log);
    }
    const response = await fetch(URL); assert(response.ok,'Site HTTP '+response.status);
    const html = await response.text();
    const assets = [...html.matchAll(/(?:src|href)="([^\"]+\/assets\/[^\"]+|\/assets\/[^\"]+)"/g)].map(m=>new global.URL(m[1],URL));
    assert(assets.length===3,'Expected application, Three.js and CSS assets, got '+assets.length);
    for(const asset of assets) {
      assert(asset.pathname.startsWith('/KnotzAxxon/assets/'),'Asset escaped project path: '+asset);
      const res=await fetch(asset);assert(res.ok,'Asset HTTP '+res.status+': '+asset);
      const actual=Buffer.from(await res.arrayBuffer()), disk=path.join('dist','assets',path.basename(asset.pathname));
      if(!remote || process.env.KZ_COMPARE_DIST==='1')assert(actual.equals(fs.readFileSync(disk)),'Served asset differs from dist: '+asset);
    }
    report.assets=assets.map(a=>a.pathname);report.assets_matched_dist=!remote||process.env.KZ_COMPARE_DIST==='1';
    browser=await chromium.launch({headless:true,...(process.env.KZ_BROWSER_CHANNEL ? {channel:process.env.KZ_BROWSER_CHANNEL} : {})});
    report.browser=browser.version();
    const contexts=[];
    for(const fixture of [
      {name:'desktop',width:1280,height:720,touch:false,quality:'low'},
      {name:'touch-portrait',width:390,height:844,touch:true,quality:'low'},
      {name:'touch-landscape',width:844,height:390,touch:true,quality:'low'},
    ]) {
      const context=await browser.newContext({viewport:{width:fixture.width,height:fixture.height},hasTouch:fixture.touch,isMobile:fixture.touch});contexts.push(context);
      const page=await context.newPage();activePage=page;page.setDefaultTimeout(90000);console.log('Release fixture: '+fixture.name);
      page.on('pageerror',e=>report.errors.push(fixture.name+': '+e.message));
      page.on('console',m=>{if(m.type()==='error')report.errors.push(fixture.name+': '+m.text());});
      page.on('requestfailed',r=>report.failed_requests.push({fixture:fixture.name,url:r.url(),error:r.failure()?.errorText}));
      page.on('response',r=>{if(r.status()>=400)report.errors.push(fixture.name+': HTTP '+r.status()+' '+r.url());});
      await page.addInitScript(quality=>localStorage.setItem('knotzaxxon.settings.v2',JSON.stringify({quality,camera:'classic',shake:0})),fixture.quality);
      await page.goto(URL);await title(page);
      assert(!(await page.evaluate(()=>!!window.KZ)),'Production exposed development debug API');
      if(fixture.name==='desktop') {
        await page.click('#screen-title [data-action="howto"]');await page.waitForSelector('#screen-howto.is-active');await page.click('#screen-howto [data-action="back"]');await title(page);
        await page.click('#screen-title [data-action="settings"]');await page.waitForSelector('#screen-settings.is-active');await page.click('#screen-settings [data-action="back"]');await title(page);
        await page.locator('#screen-title [data-action="start"]').focus();
        await page.keyboard.press('Enter');
      } else await page.click('#screen-title [data-action="start"]');
      await page.waitForSelector('#hud.is-live');await frames(page);
      if(!fixture.touch) {
        await page.keyboard.down('Space');await page.keyboard.down('ArrowLeft');await frames(page,12);await page.keyboard.up('ArrowLeft');await page.keyboard.down('ArrowRight');await frames(page,12);await page.keyboard.up('ArrowRight');await page.keyboard.up('Space');
        await page.keyboard.press('Escape');await page.waitForSelector('#screen-pause.is-active');
        await page.click('#screen-pause [data-action="resume"]');await page.waitForFunction(()=>!document.getElementById('screen-pause').classList.contains('is-active'));await frames(page);
      }
      const state=await layout(page);
      assert(state.scrollWidth<=state.width,'Horizontal overflow: '+fixture.name);
      assert(state.canvas.width>0&&state.canvas.height>0,'No rendered canvas: '+fixture.name);
      assert(!state.debug_api,'Debug API present');
      if(state.altimeter)assert(state.altimeter.left>=0&&state.altimeter.right<=fixture.width&&state.altimeter.top>=0&&state.altimeter.bottom<=fixture.height,'Altimeter outside viewport: '+fixture.name);
      if(fixture.touch)assert(await page.locator('#touch').evaluate(el=>el.classList.contains('on')),'Touch controls missing');
      await page.screenshot({path:path.join(OUT,fixture.name+'.png')});
      report.checks.push({fixture:fixture.name,...state,title_to_flight:true,keyboard_pause_resume:!fixture.touch,touch_controls:fixture.touch});
      if(fixture.name==='desktop') {
        const shared=new global.URL(URL);shared.searchParams.set('seed','4F9K2A');
        await page.goto(shared.href);await title(page);assert((await page.locator('#title-hint').textContent()).includes('SHARED FORTRESS 4F9K2A'),'Shared seed missing from title');
        assert(await page.evaluate(()=>JSON.parse(localStorage.getItem('knotzaxxon.settings.v2')).camera==='classic'),'Settings did not persist');
        await page.click('#screen-title [data-action="start"]');await page.waitForSelector('#hud.is-live');await frames(page,10);
        await page.goto(URL);await title(page);await page.click('#screen-title [data-action="daily"]');await page.waitForSelector('#hud.is-live');await frames(page,10);
        report.checks.push({shared_fortress_start:true,daily_sortie_start:true,settings_persist:true});
      }
      await context.close();
    }
    assert(report.errors.length===0,'Browser errors: '+report.errors.join('\n'));
    assert(report.failed_requests.length===0,'Failed network requests: '+JSON.stringify(report.failed_requests));
    report.status='passed';
  } catch(error) { report.status='failed';report.failure=error.stack;process.exitCode=1;
    if(activePage&&!activePage.isClosed()){report.ui=await activePage.evaluate(()=>({activeScreens:[...document.querySelectorAll('.screen.is-active')].map(el=>el.id),focused:document.activeElement?.outerHTML,hud:document.getElementById('hud')?.className})).catch(()=>null);await activePage.screenshot({path:path.join(OUT,'failure.png'),timeout:5000}).catch(()=>{});}
  }
  finally { await browser?.close();server?.kill();fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2)); }
})();
