// Windows Node + installed Chrome. Playwright uses its local child-process pipe.
// JSONL stdin: {op:'observe'|'start'|'keys'|'quit', ...}. No game-state assistance.
const fs = require('node:fs');
const readline = require('node:readline');
const path = require('node:path');
const pw = require(process.env.KZ_PLAYWRIGHT_PATH);
(async () => {
 const out = process.env.KZ_PILOT_OUT;
 fs.mkdirSync(out,{recursive:true});
 const log = x => {const line=JSON.stringify({at:new Date().toISOString(),operator:'Sol LOW visual agent',...x});fs.appendFileSync(path.join(out,'events.jsonl'),line+'\n');console.log(line)};
 const browser=await pw.chromium.launch({executablePath:process.env.KZ_CHROME_EXE,headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
 try {
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 await page.addInitScript(() => { // disable only Vite's localhost HMR websocket
  const Native = window.WebSocket; window.WebSocket = class extends Native {
   constructor(url, protocols) { super(protocols === 'vite-hmr' ? 'ws://127.0.0.1:1' : url, protocols); }
  };
 });
 await page.goto(process.env.KZ_PILOT_URL || 'about:blank');
 if(process.env.KZ_PILOT_URL)await page.waitForFunction(()=>!!window.KZ,{},{timeout:30000});
 const probe=await page.evaluate(async()=>{const c=document.createElement('canvas'),g=c.getContext('webgl2');if(!g)return {webgl2:false};const e=g.getExtension('WEBGL_debug_renderer_info');let frames=0;const start=performance.now();await new Promise(resolve=>{function tick(){if(++frames===120)resolve();else requestAnimationFrame(tick)}requestAnimationFrame(tick)});return {webgl2:true,vendor:e&&g.getParameter(e.UNMASKED_VENDOR_WEBGL),renderer:e&&g.getParameter(e.UNMASKED_RENDERER_WEBGL),frames,elapsedMs:performance.now()-start,userAgent:navigator.userAgent,screen:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}}});
 log({op:'probe',browser:browser.version(),probe});
 if(!probe.renderer || /swiftshader|llvmpipe|software|basic render/i.test(probe.renderer))throw Error('Hardware renderer unavailable; no credited pilot');
 let held=[];
 for await(const line of readline.createInterface({input:process.stdin})){
  const c=JSON.parse(line);log({op:'command',command:c});
  if(c.op==='quit')break;
  if(c.op==='start'){await page.evaluate(seed=>window.KZ.game.start({seed}),c.seed);await page.locator('canvas').first().click();}
  if(c.op==='keys'){for(const k of held)await page.keyboard.up(k);held=c.keys||[];for(const k of held)await page.keyboard.down(k);}
  if(c.op==='observe'){
   const name=`shot-${Date.now()}.png`;await page.screenshot({path:path.join(out,name)});
   log({op:'observation',screenshot:name,state:await page.evaluate(()=>{const k=window.KZ;if(!k)return null;const p=k.game.player;return {state:k.game.state,loop:k.game.loop,hull:p.hull,shields:p.shields,fuel:p.fuel,alive:p.alive,pos:p.pos.toArray(),settings:k.settings.values,frame:k.engine.frame,canvas:{width:k.engine.renderer.domElement.width,height:k.engine.renderer.domElement.height},sector:k.game.sectorIndex,observedAt:performance.now()}})});
  }
 }
 } finally {await browser.close()}
})().then(()=>process.exit(0)).catch(e=>{console.error(e.stack);process.exit(1)});
