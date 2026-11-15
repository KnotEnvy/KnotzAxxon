const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const config=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const {chromium}=require(config.playwright);
const report={sourceHash:config.manifest.source.sourceHash,archive:config.manifest.archive,
  kind:'local packaged HTML5 distribution QA',checks:[],errors:[],networkFailures:[],loadedModels:[],
  limits:['Headless hardware browser; emulated viewports/touch are not physical mobile-device proof.','Local iframe fixture; does not establish current live Itch upload.']};
let browser;
const frames=frame=>frame.evaluate(()=>new Promise(resolve=>{let n=0;function tick(){if(++n===12)resolve();else requestAnimationFrame(tick)}requestAnimationFrame(tick)}));
(async()=>{
  // Every shipped file is fetched at the nested upload path and compared byte-for-byte.
  for(const file of config.manifest.files){
    const res=await fetch(config.url+config.prefix+file.path);assert.equal(res.status,200,file.path);
    const bytes=Buffer.from(await res.arrayBuffer());assert.equal(bytes.length,file.bytes,file.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,file.path);
  }
  report.checks.push({allPackagedFilesFetchedAndHashMatched:config.manifest.files.length});
  browser=await chromium.launch({executablePath:config.chrome,headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
  report.browser=browser.version();
  const loaded=new Set();
  for(const fixture of [
    {id:'desktop-iframe',width:1280,height:800,touch:false,iframe:true},
    {id:'portrait-iframe',width:390,height:844,touch:true,iframe:true},
    {id:'landscape-nested',width:844,height:390,touch:true,iframe:false},
    {id:'short-reduced-motion',width:667,height:375,touch:false,iframe:false,reducedMotion:'reduce'},
  ]){
    const context=await browser.newContext({viewport:{width:fixture.width,height:fixture.height},hasTouch:fixture.touch,isMobile:fixture.touch,reducedMotion:fixture.reducedMotion||'no-preference'});
    await context.addInitScript(()=>{
      localStorage.setItem('knotzaxxon.settings.v2',JSON.stringify({quality:'low',camera:'classic',shake:0}));
      window.__distributionFrames={engineCallbacks:0,drawCalls:0};
      const raf=window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame=callback=>raf(time=>{
        if(callback.name==='bound _loop')window.__distributionFrames.engineCallbacks++;
        callback(time);
      });
      for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){
        const original=WebGL2RenderingContext.prototype[name];
        WebGL2RenderingContext.prototype[name]=function(...args){window.__distributionFrames.drawCalls++;return original.apply(this,args)};
      }
    });
    const page=await context.newPage();page.setDefaultTimeout(120000);
    page.on('pageerror',e=>report.errors.push({fixture:fixture.id,message:e.message}));
    page.on('requestfailed',r=>report.networkFailures.push({fixture:fixture.id,url:r.url(),error:r.failure()}));
    page.on('response',r=>{if(r.url().startsWith(config.url)&&r.status()>=400)report.errors.push({fixture:fixture.id,status:r.status(),url:r.url()});if(r.ok()&&r.url().includes('/models/'))loaded.add(new URL(r.url()).pathname.slice(config.prefix.length))});
    await page.goto(config.url+(fixture.iframe?'/qa/frame.html':config.prefix));
    let game=page.mainFrame();
    if(fixture.iframe){await page.locator('#game').waitFor();game=await(await page.locator('#game').elementHandle()).contentFrame();}
    await game.locator('#screen-title.is-active').waitFor();
    const hardware=await game.evaluate(()=>{
      const c=document.getElementById('viewport'),gl=c.getContext('webgl2'),ext=gl?.getExtension('WEBGL_debug_renderer_info');
      return {webgl2:!!gl,renderer:ext&&gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),vendor:ext&&gl.getParameter(ext.UNMASKED_VENDOR_WEBGL),userAgent:navigator.userAgent};
    });
    assert.ok(hardware.webgl2&&hardware.renderer&&!/swiftshader|llvmpipe|software|basic render/i.test(hardware.renderer));
    assert.equal(await game.evaluate(()=>!!window.KZ),false,'Production exposed development API');
    if(fixture.id==='desktop-iframe'){
      await page.locator('#fullscreen').click();
      await page.waitForFunction(()=>document.fullscreenElement?.id==='game');
      report.checks.push({iframeFullscreen:true});
      await page.evaluate(()=>document.exitFullscreen());
      await game.locator('[data-action="howto"]').first().click();await game.locator('#screen-howto.is-active').waitFor();
      await game.locator('#screen-howto [data-action="back"]').click();
      await game.locator('#screen-title [data-action="settings"]').click();await game.locator('#screen-settings.is-active').waitFor();
      await game.locator('#screen-settings [data-action="back"]').click();
    }
    const start=game.locator('#screen-title [data-action="start"]');
    if(fixture.touch)await start.tap();else{await start.focus();await page.keyboard.press('Enter')}
    await game.locator('#hud.is-live').waitFor();await frames(game);
    const layout=await game.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,
      canvas:{width:document.getElementById('viewport').width,height:document.getElementById('viewport').height},
      touch:document.getElementById('touch').classList.contains('on'),observedRendering:{...window.__distributionFrames}}));
    assert.ok(layout.scrollWidth<=layout.width,'Horizontal overflow '+fixture.id);assert.ok(layout.canvas.width>0&&layout.canvas.height>0);
    if(fixture.touch)assert.ok(layout.touch);
    await page.screenshot({path:path.join(config.out,fixture.id+'.png'),timeout:120000});
    assert.ok(layout.observedRendering.drawCalls>0,'No actual WebGL draws observed');
    report.checks.push({fixture:fixture.id,hardware,layout,startedThroughUI:true,rafObservationCallbacks:12});
    await context.close();
  }
  report.loadedModels=[...loaded].sort();
  for(const file of ['models/environment/environment-kit.glb','models/player.glb','models/sentinel.glb','models/production/carrier-template.bin','models/production/covered-fighter.recipe.json'])assert.ok(loaded.has(file),'Default required resource missing: '+file);
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.networkFailures,[]);
  report.status='passed';
})().catch(e=>{report.status='failed';report.failure=e.stack;process.exitCode=1}).finally(async()=>{
  await browser?.close();fs.writeFileSync(path.join(config.out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
});
