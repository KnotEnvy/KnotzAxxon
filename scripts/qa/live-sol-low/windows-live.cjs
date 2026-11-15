// Windows Node; interactive JSONL stdin. No autonomous campaign/observation loop.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),readline=require('node:readline');
const {createHash}=require('node:crypto');
const config=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const {assertMode,assertRow}=require('./mode-guard.cjs');
assertMode(config.pilotMode,config.kind,config.runId);
for(const spec of config.plan)assertRow(config.pilotMode,spec);
const {chromium}=require(config.playwright);
const at=()=>new Date().toISOString();
const append=(file,row)=>fs.appendFileSync(path.join(config.out,file),JSON.stringify({at:at(),...row})+'\n');
const hash=b=>createHash('sha256').update(b).digest('hex');
let active=null,browser,page,held=[];const used=new Set(),errors=[];
async function releaseKeys(){for(const k of held)await page.keyboard.up(k);held=[]}
async function observe(reason){
 if(!active)throw Error('No active trial');
 const startedAt=at(),batch=await page.evaluate(()=>KZBot.observeRealtime());
 const id=`${active.spec.id}-o${String(active.observations.length+1).padStart(3,'0')}`,file=`${id}.png`;
 await page.screenshot({path:path.join(config.out,file),timeout:30000});
 const presentation=await page.evaluate(()=>({performanceNow:performance.now(),engineFrame:KZ.engine.frame,
  canvas:{width:KZ.engine.canvas.width,height:KZ.engine.canvas.height},settings:{...KZ.settings.values},
  state:KZ.game.state,sector:KZ.game.sectorIndex,visibility:document.visibilityState,focused:document.hasFocus()}));
 const previous=active.observations.at(-1);
 const row={id,trialId:active.spec.id,reason,startedAt,completedAt:at(),gapMs:previous?Date.parse(startedAt)-Date.parse(previous.startedAt):null,
  file,sha256:hash(fs.readFileSync(path.join(config.out,file))),presentation,batch,
  observer:'Sol LOW visual agent',operator:active.operator,viewed:false};
 active.observations.push(row);append('observations.jsonl',row);
 console.log(JSON.stringify({op:'screenshot-ready',id,path:path.join(config.out,file),done:batch.done,checkpoint:batch.checkpoint,
  instruction:'Open screenshot with view_image, then submit note with facts/interpretation/confidence/limits. Capture alone is not observation.'}));
 return row;
}
(async()=>{
 browser=await chromium.launch({executablePath:config.chrome,headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
 const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1});
 await context.addInitScript(()=>{
  localStorage.setItem('knotzaxxon.settings.v2',JSON.stringify({quality:'high',camera:'classic',assist:false}));
  const Native=window.WebSocket;window.WebSocket=class extends Native{constructor(url,protocols){super(protocols==='vite-hmr'?'ws://127.0.0.1:1':url,protocols)}};
 });
 page=await context.newPage();
 page.on('pageerror',e=>{errors.push({at:at(),message:e.message});append('errors.jsonl',errors.at(-1))});
 page.on('requestfailed',r=>append('network.jsonl',{url:r.url(),failure:r.failure()}));
 await page.goto(config.url);await page.waitForFunction(()=>!!window.KZ,{},{timeout:120000});
 const probe=await page.evaluate(()=>{const gl=KZ.engine.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {
  webgl2:gl instanceof WebGL2RenderingContext,vendor:ext&&gl.getParameter(ext.UNMASKED_VENDOR_WEBGL),renderer:ext&&gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),
  userAgent:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}}});
 const hardware={...probe,browser:browser.version(),host:os.hostname(),platform:process.platform,arch:process.arch,
  chrome:config.chrome,automation:'Playwright local child-process pipe',physicalDevicesTested:[],at:at()};
 fs.writeFileSync(path.join(config.out,'hardware.json'),JSON.stringify(hardware,null,2)+'\n');
 if(!probe.webgl2||!probe.renderer||/swiftshader|llvmpipe|software|basic render/i.test(probe.renderer))throw Error('Real hardware WebGL2 required');
 if(hash(fs.readFileSync(config.pilot))!==config.botHash)throw Error('Bot harness changed before load');
 await page.addScriptTag({path:config.pilot});
 await page.locator('#screen-title [data-action="start"]').click(); // trusted ENGAGE/audio gesture
 console.log(JSON.stringify({op:'ready',candidate:config.candidate,hardware,credited:0}));
 const commands=readline.createInterface({input:process.stdin});
 for await(const line of commands){
  try{
   const c=JSON.parse(line);append('commands.jsonl',{command:c});
   if(c.op==='quit'){if(active)throw Error('End or abort active trial before quit');break}
   if(c.op==='start'){
    if(active)throw Error('End previous trial first');
    const spec=config.plan.find(x=>x.id===c.id);if(!spec||used.has(spec.seed))throw Error('Unknown or already attempted seed; never overwrite/retry silently');
    if(c.source?.sourceHash!==config.candidate)throw Error('Missing matching before fingerprint');
    await page.setViewportSize({width:spec.width,height:spec.height});
    await page.evaluate(spec=>{KZ.settings.set('quality',spec.quality);KZ.settings.set('camera',spec.camera)},spec);
    spec.sharedRandomSeed=(spec.seed^0xa1b2c3d4)>>>0;
    await page.evaluate(async spec=>{const {rand}=await import('/src/core/Utils.js');rand.reset(spec.sharedRandomSeed)},spec);
    const initial=await page.evaluate(spec=>KZBot.startRealtime(spec),spec);
    used.add(spec.seed);active={spec,sourceBefore:c.source,startedAt:at(),initial,hardware,errorStart:errors.length,
     observations:[],notes:[],operator:'primary developed realtime bot; Sol LOW visual observer',manualActions:[]};
    append('initial.jsonl',{...active,observations:undefined,notes:undefined});
    await observe('initial');
   }else if(c.op==='observe')await observe(c.reason||'periodic');
   else if(c.op==='observe-burst'){
    const count=c.count??3,intervalMs=c.intervalMs??2000;
    if(!Number.isInteger(count)||count<1||count>3||!Number.isInteger(intervalMs)||intervalMs<1000||intervalMs>3000)throw Error('Burst bounded to 1–3 captures, interval1000–3000ms');
    for(let n=0;n<count;n++){
     if(n)await new Promise(resolve=>setTimeout(resolve,intervalMs)); // wall-clock wait; realtime engine keeps running
     const row=await observe(`bounded-burst:${c.reason||'active'}:${n+1}/${count}`);
     if(row.batch.done)break;
    }
   }
   else if(c.op==='note'){
    const observation=active?.observations.find(o=>o.id===c.observationId);
    if(!observation||c.viewed!==true||!Array.isArray(c.facts)||!c.facts.length||!Array.isArray(c.interpretations)||
      !Array.isArray(c.limits)||!['low','medium','high'].includes(c.confidence))throw Error('Note requires viewed:true, known screenshot, facts[], interpretations[], limits[], confidence');
    const note={trialId:active.spec.id,observationId:c.observationId,viewedAt:at(),observer:'Sol LOW visual agent',
     facts:c.facts,interpretations:c.interpretations,confidence:c.confidence,limits:c.limits};
    observation.viewed=true;active.notes.push(note);append('visual-notes.jsonl',note);
   }else if(c.op==='keys'){
    if(!active||active.spec.profile!=='keyboard')throw Error('Supplemental manual keys require keyboard trial');
    const allowed=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space','KeyL','ShiftLeft'];
    if(!Array.isArray(c.keys)||c.keys.some(k=>!allowed.includes(k)))throw Error('Unsupported keys');
    await releaseKeys();held=c.keys;for(const k of held)await page.keyboard.down(k);
    active.operator='mixed: primary realtime bot plus Sol LOW supplemental keyboard';
    active.manualActions.push({at:at(),keys:held,note:'Bot still decides every six frames and may overwrite intents; no exclusive manual-control claim'});
   }else if(c.op==='end'||c.op==='abort'){
    if(!active)throw Error('No trial');await releaseKeys();
    const terminal=await observe(c.op==='abort'?'abort':'end-before-summary');
    if(!terminal.batch.done&&c.op==='end')throw Error('Still running; end refused. Use abort to preserve incomplete evidence');
    const result=await page.evaluate(()=>KZBot.end());
    const reasons=[];if(config.pilotMode)reasons.push('development pilot; permanently ineligible for final credit');
    if(c.op==='abort'||!result.completed)reasons.push('incomplete/aborted/timeout');
    if(c.source?.sourceHash!==config.candidate||active.sourceBefore.sourceHash!==c.source?.sourceHash)reasons.push('source mismatch');
    if(result.mode!=='realtime'||result.renderedFrames!==result.frames)reasons.push('realtime/render count mismatch');
    const initial=active.initial.initial;if(initial.hull!==3||initial.shields!==1||initial.fuel!==1||initial.z!==0||initial.loop!==active.spec.loop)reasons.push('nonstandard initial resources/fixture');
    if(errors.length!==active.errorStart)reasons.push('page errors');
    const viewed=active.observations.filter(o=>o.viewed);
    if(viewed.length<3||!viewed.some(o=>o.reason==='initial')||!viewed.some(o=>o.reason!=='initial'&&!o.batch.done)||!viewed.some(o=>o.batch.done))reasons.push('missing start/during/terminal visual observations');
    if(active.observations.some((o,i)=>i>0&&!active.observations[i-1].batch.done&&(o.gapMs||0)>10000))reasons.push('observation gap >10 seconds');
    const row={schemaVersion:1,kind:config.kind,pilotMode:config.pilotMode,trialId:active.spec.id,candidate:config.candidate,buildKind:'Vite development graph; production bundle not exercised',
     ...active,sourceAfter:c.source,result,endedAt:at(),pageErrors:errors.slice(active.errorStart),
     credited:false,eligibility:config.pilotMode?'pilot: never final credit':'pending primary evidence audit',blockingReasons:reasons};
    append('trials.jsonl',row);console.log(JSON.stringify({op:'trial-ended',id:active.spec.id,outcome:result.outcome,blockingReasons:reasons,credited:false}));active=null;
   }else throw Error('Unknown command');
  }catch(e){append('command-errors.jsonl',{message:e.stack});console.error(JSON.stringify({commandError:e.message}))}
 }
 if(active){const result=await page.evaluate(()=>KZBot.end());append('abandoned.jsonl',{...active,result,credited:false,reason:'stdin closed with active trial'})}
})().catch(e=>{append('fatal.jsonl',{message:e.stack});process.exitCode=1}).finally(async()=>{await browser?.close();process.exit(process.exitCode||0)});
