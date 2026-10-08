const fs = require('node:fs');
const {chromium}=require(process.env.KZ_PLAYWRIGHT_PATH || 'playwright');
fs.mkdirSync('artifacts', {recursive:true});
(async()=>{let browser;try{
 browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text());});
 await page.addInitScript(()=>localStorage.setItem('knotzaxxon.settings.v2',JSON.stringify({quality:'medium',camera:'classic',shake:0})));
 await page.goto(process.env.KZ_TEST_URL || 'http://127.0.0.1:4175');await page.waitForFunction(()=>window.KZ,{timeout:60000});
 await page.evaluate(()=>{KZ.engine.stop();KZ.game.start();KZ.screens.hide();document.getElementById('screen-sector')?.classList.remove('is-active');});
 const results=[];
 for(const mode of ['classic','modern','chase']) {
  const result=await page.evaluate(async(mode)=>{
   const {engine,game,settings}=KZ;
   settings.set('camera',mode); game.reset(42);game.state='playing';game.hud.setLive(true);
   game.player.pos.set(0,9,280);game.player.invuln=100;game.player.fuel=1;game.rig.snap(game.player);
   for(let i=0;i<8;i++){engine.frame++;game.fortress.update(game.player.pos.z,0,engine.time,engine.frame);}
   game._spawnFeatures(game.player.pos.z);
   for(const e of game.enemies)e.dispose();game.enemies.length=0;
   for(const [kind,x,y,z] of [['turret',-9,0,315],['fuel',8,0,326],['drone',0,10,333]])game._spawnEnemy(kind,{x,y,z,seed:7});
   game.rig.snap(game.player);engine.camera.updateMatrixWorld(true);
   game.chain=12;game.chainMult=5;game.chainTimer=2.4;game.hud.comboEvent(12,5);
   game._updatePresentation(1/60,engine.time,game._ctx(1/60,engine.time));
   engine.renderer.info.reset();engine.postfx.render(1/60);
   const gl=engine.renderer.getContext(), ext=gl.getExtension('WEBGL_debug_renderer_info');
   return {mode,state:game.state,altitudeEcho:game._altitudeEcho,enemyHelpers:document.querySelectorAll('.threat-marker').length,calls:engine.renderer.info.render.calls,triangles:engine.renderer.info.render.triangles,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
  },mode);
  await page.screenshot({path:'artifacts/sector-'+mode+'.png'});results.push(result);
 }
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{KZ.settings.set('camera','classic');KZ.game.rig.snap(KZ.game.player);KZ.game._updatePresentation(0,0,KZ.game._ctx(0,0));KZ.engine.postfx.render(0);});
 await page.screenshot({path:'artifacts/sector-portrait.png'});
 results.push(await page.evaluate(()=>({portrait:{scrollWidth:document.documentElement.scrollWidth,width:innerWidth,chain:document.getElementById('hud-chain').getBoundingClientRect().toJSON(),sector:document.querySelector('.hud-tr').getBoundingClientRect().toJSON()}})));
 await page.setViewportSize({width:1280,height:720});
 await page.evaluate(()=>{KZ.game.rig.snap(KZ.game.player);KZ.game._updatePresentation(0,0,KZ.game._ctx(0,0));KZ.engine.postfx.render(0);KZ.screens.sectorCard(KZ.game.level.sectors[0]);});
 await page.waitForTimeout(650);
 await page.screenshot({path:'artifacts/sector-title.png'});
 results.push(await page.evaluate(()=>({sectorText:{name:document.getElementById('sc-name').textContent,rhythm:document.getElementById('sc-rhythm').textContent,animations:KZ.screens._cardAnimations.length}})));
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(()=>KZ.screens.sectorCard(KZ.game.level.sectors[3]));
 results.push(await page.evaluate(()=>({reducedMotionAnimations:KZ.screens._cardAnimations.length})));
 await page.evaluate(()=>KZ.screens.hide());
 // Real DOM keyboard events run through the game's input mapping, then bounded player updates.
 for(const mode of ['classic','modern','chase']) for(const key of ['ArrowLeft','ArrowRight']) {
  await page.evaluate(mode=>{KZ.settings.set('camera',mode);KZ.game.player.reset(0);KZ.game.rig.snap(KZ.game.player);KZ.engine.input.reset();},mode);
  await page.keyboard.down(key);
  const result=await page.evaluate(()=>{const {game,engine}=KZ;engine.input.update();const axis=engine.input.moveX;for(let i=0;i<12;i++)game.player.update(1/60,game._ctx(1/60,i/60));engine.input.endFrame();return {axis,worldX:game.player.pos.x};});
  await page.keyboard.up(key);results.push({keyboard:{mode,key,...result}});
  if((key==='ArrowRight'&&result.worldX>=0)||(key==='ArrowLeft'&&result.worldX<=0))throw Error('Keyboard direction regression');
 }
 console.log(JSON.stringify({browser:browser.version(),errors,results},null,2));fs.writeFileSync('artifacts/sector-smoke.json',JSON.stringify({browser:browser.version(),errors,results},null,2));
 if(errors.length)process.exitCode=1;
}finally{await browser?.close();}})().catch(e=>{console.error(e);process.exitCode=1});
