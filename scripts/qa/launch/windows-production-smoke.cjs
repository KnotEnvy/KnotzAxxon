const fs=require('node:fs'),path=require('node:path');
const config=JSON.parse(fs.readFileSync(process.argv[2]));
const {chromium}=require(config.playwright);
const {readPackage,attachProduction}=require('./production-bundle.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:config.chrome,headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
 try{
  const page=await browser.newPage({viewport:{width:960,height:540}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const bundle=readPackage(config.package,config.sourceHash);
  const servedBuild=await attachProduction(page,config.url,bundle);
  const before=await page.evaluate(()=>{
    const gl=KZ.engine.renderer.getContext(),x=gl.getExtension('WEBGL_debug_renderer_info'),coarse=matchMedia('(pointer: coarse)').matches;
    const cores=navigator.hardwareConcurrency||4,mem=navigator.deviceMemory||4;
    const expectedQuality=coarse?(cores>=8?'medium':'low'):(cores>=12&&mem>=8?'ultra':cores>=6?'high':'medium');
    return {webgl2:gl instanceof WebGL2RenderingContext,renderer:gl.getParameter(x.UNMASKED_RENDERER_WEBGL),
      state:KZ.game.state,initialHull:KZ.game.player.hull,search:location.search,
      savedSettings:localStorage.getItem('knotzaxxon.settings.v2'),settings:{...KZ.settings.values},expectedQuality};
  });
  if(!before.webgl2||/swiftshader|llvmpipe|software|basic render/i.test(before.renderer))throw Error('Hardware WebGL2 required');
  if(before.search!==''||before.savedSettings!==null||before.state!=='idle'||before.settings.camera!=='modern'||
    before.settings.quality!==before.expectedQuality||before.settings.assist!==false||before.settings.perf!==false)
    throw Error('Clean normal-URL launch defaults failed '+JSON.stringify(before));
  await page.locator('#screen-title [data-action="start"]').click();
  await page.waitForFunction(()=>KZ.game.state==='playing');
  await page.waitForTimeout(1000);
  const after=await page.evaluate(()=>({state:KZ.game.state,z:KZ.game.player.pos.z,loop:KZ.game.loop,
    sectorIndex:KZ.game.sectorIndex,mode:KZ.game.mode,timeScale:KZ.engine.timeScale,targetTimeScale:KZ.engine._targetTimeScale,
    camera:KZ.settings.get('camera'),randWorks:typeof KZ.rand.reset==='function',
    sectorLabel:document.getElementById('hud-sector')?.textContent}));
  if(after.state!=='playing'||!(after.z>0)||after.loop!==0||after.sectorIndex!==0||after.mode?.daily!==false||
    after.mode?.seed!==null||after.timeScale!==1||after.targetTimeScale!==1||after.camera!=='modern'||
    after.sectorLabel!=='SECTOR 01'||!after.randWorks||errors.length)
    throw Error('Normal default gameplay start failed '+JSON.stringify({after,errors}));
  const report={kind:'noncredited-production-attachment-probe',servedBuild,browser:browser.version(),before,after,errors,
    limits:['Normal URL, empty storage and shipped settings only; QA bridge detached before play.','One opening-sector smoke is not a gameplay campaign or physical-device acceptance.'],
    creditEligible:false};
  fs.writeFileSync(path.join(config.out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }finally{await browser.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1});
