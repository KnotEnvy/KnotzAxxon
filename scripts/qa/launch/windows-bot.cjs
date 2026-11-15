// Windows process. Browser automation uses Playwright's local child-process pipes.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const config=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const {chromium}=require(config.playwright);
const append=(name,value)=>fs.appendFileSync(path.join(config.out,name),JSON.stringify(value)+'\n');
(async()=>{
  const browser=await chromium.launch({executablePath:config.chrome,headless:true,
    args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
  try{
    const context=await browser.newContext({viewport:{width:config.width,height:config.height},hasTouch:config.profile==='analog'});
    await context.addInitScript(({quality,camera})=>{
      localStorage.setItem('knotzaxxon.settings.v2',JSON.stringify({quality,camera,assist:false,shake:0}));
      const Native=window.WebSocket;window.WebSocket=class extends Native{
        constructor(url,protocols){super(protocols==='vite-hmr'?'ws://127.0.0.1:1':url,protocols)}
      };
    },config);
    const page=await context.newPage();const errors=[];
    page.on('pageerror',e=>{errors.push(e.message);append('errors.jsonl',{type:'pageerror',message:e.message,at:new Date().toISOString()})});
    page.on('requestfailed',r=>{if(!r.url().startsWith('ws:'))append('network.jsonl',{url:r.url(),failure:r.failure()})});
    await page.goto(config.url);await page.waitForFunction(()=>!!window.KZ,{},{timeout:120000});
    const probe=await page.evaluate(()=>{
      const gl=KZ.engine.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
      return {webgl2:gl instanceof WebGL2RenderingContext,vendor:ext&&gl.getParameter(ext.UNMASKED_VENDOR_WEBGL),
        renderer:ext&&gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),userAgent:navigator.userAgent,
        viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},
        canvas:{width:KZ.engine.canvas.width,height:KZ.engine.canvas.height},settings:KZ.settings.values};
    });
    const hardware={...probe,browser:browser.version(),host:os.hostname(),platform:process.platform,arch:process.arch,
      chrome:config.chrome,automation:'Playwright local child-process pipes',at:new Date().toISOString()};
    fs.writeFileSync(path.join(config.out,'hardware.json'),JSON.stringify(hardware,null,2)+'\n');
    if(!probe.webgl2||!probe.renderer||/swiftshader|llvmpipe|software|basic render/i.test(probe.renderer))throw Error('Hardware WebGL2 required; no software credit');
    await page.addScriptTag({path:config.pilot});
    // The title overlay deliberately intercepts canvas clicks. Its real launch
    // button supplies the trusted audio gesture; begin() then starts the fixture.
    await page.locator('#screen-title [data-action="start"]').click();
    for(let index=0;index<config.count;index++){
      const episode={id:`${config.runId}-${index}`,seed:config.seed+index,loop:config.loops[index%config.loops.length],
        profile:config.profile,camera:config.camera,quality:config.quality,renderEvery:config.renderEvery,maxSeconds:config.maxSeconds,timeOrigin:config.timeOrigin};
      Object.assign(episode,config.plan?.[index]??{});
      if(episode.width)await page.setViewportSize({width:episode.width,height:episode.height});
      await page.evaluate(spec=>{KZ.settings.set('quality',spec.quality);KZ.settings.set('camera',spec.camera)},episode);
      // Seed the existing shared PRNG once at the episode boundary. This keeps
      // its algorithm/distribution intact and makes boss/effect choices replayable.
      episode.sharedRandomSeed=(episode.seed^0xa1b2c3d4)>>>0;
      await page.evaluate(async spec=>{const {rand}=await import('/src/core/Utils.js');rand.reset(spec.sharedRandomSeed)},episode);
      const errorStart=errors.length;
      const initial=await page.evaluate(({episode,realtime})=>realtime?KZBot.startRealtime(episode):KZBot.begin(episode),{episode,realtime:config.realtime});
      append('initial.jsonl',{...episode,...initial});
      let done=false,chunk=0;
      while(!done){
        if(config.realtime)await page.waitForTimeout(2000);
        const batch=await page.evaluate(realtime=>realtime?KZBot.observeRealtime():KZBot.chunk(240),config.realtime);done=batch.done;
        for(const event of batch.events)append('events.jsonl',{id:episode.id,...event});
        for(const sample of batch.samples)append('samples.jsonl',{id:episode.id,...sample});
        append('chunks.jsonl',{id:episode.id,chunk:chunk++,...batch,events:undefined,samples:undefined});
        if(batch.checkpoint&&index<3){
          const name=`episode-${index}-frame-${batch.frame}-${batch.checkpoint}.png`;
          if(batch.done)await page.waitForTimeout(450); // allow actual CSS result transition, not simulation time
          await page.screenshot({path:path.join(config.out,name),timeout:120000});
          append('media.jsonl',{id:episode.id,frame:batch.frame,file:name,checkpoint:batch.checkpoint});
        }
      }
      const result=await page.evaluate(()=>{KZ.engine.renderer.getContext().finish();return KZBot.end()});
      const row={...result,runId:config.runId,initial:initial.initial,sourceHash:config.source.sourceHash,harnessHash:config.harnessHash,
        hardware:{...hardware,viewport:initial.initial.viewport,canvas:initial.initial.canvas,settings:initial.initial.settings},
        errors:errors.slice(errorStart),kind:config.final?'final-candidate':'development-pilot',
        creditEligible:config.final&&result.completed&&errors.length===errorStart&&result.renderedFrames>0};
      append('episodes.jsonl',row);console.log(JSON.stringify({episode:row.id,loop:row.loop,outcome:row.outcome,
        sectors:row.sectors,z:row.z,fuel:row.fuel,frames:row.frames,renderedFrames:row.renderedFrames,creditEligible:row.creditEligible}));
      if(result.outcome==='victory'&&!config.continuationCaptured){
        config.continuationCaptured=true;
        await page.locator('#btn-continue').click();
        const next=await page.evaluate(()=>({seed:KZ.game.seed,loop:KZ.game.loop,state:KZ.game.state,z:KZ.game.player.pos.z}));
        if(next.loop!==episode.loop+1||next.state!=='playing'||next.z!==0)throw Error('Real continue button did not enter next loop');
        const diagnostic={...episode,id:episode.id+'-continue',...next,attachCurrent:true,maxSeconds:40};
        const initialNext=await page.evaluate(spec=>KZBot.begin(spec),diagnostic);
        let finished=false;
        while(!finished){
          const batch=await page.evaluate(()=>KZBot.chunk(240));finished=batch.done;
          for(const sample of batch.samples)append('progression-samples.jsonl',{id:diagnostic.id,...sample});
          for(const event of batch.events)append('progression-events.jsonl',{id:diagnostic.id,...event});
        }
        const continuation=await page.evaluate(()=>{KZ.engine.renderer.getContext().finish();return KZBot.end()});
        append('progression.jsonl',{...continuation,parentVictory:episode.id,initial:initialNext.initial,sourceHash:config.source.sourceHash,
          kind:'earned-next-loop-diagnostic',creditEligible:false,hardware,errors:errors.slice(errorStart)});
        console.log(JSON.stringify({diagnostic:diagnostic.id,earnedLoop:next.loop,state:continuation.outcome,rawSeconds:continuation.rawSeconds,renderedFrames:continuation.renderedFrames}));
      }
    }
    await context.close();
  }finally{await browser.close()}
})().catch(e=>{append('failures.jsonl',{message:e.stack,at:new Date().toISOString()});console.error(e.stack);process.exitCode=1});
