const fs=require('node:fs'),path=require('node:path');
const config=JSON.parse(fs.readFileSync(process.argv[2]));
const {chromium}=require(config.playwright);
const {readPackage,attachProduction}=require('./production-bundle.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:config.chrome,headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
 try{
  const page=await browser.newPage({viewport:{width:960,height:540}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('knotzaxxon.settings.v2',JSON.stringify({quality:'low',camera:'classic',assist:false,shake:0})));
  const bundle=readPackage(config.package,config.sourceHash);
  const servedBuild=await attachProduction(page,config.url,bundle);
  const before=await page.evaluate(()=>{const gl=KZ.engine.renderer.getContext(),x=gl.getExtension('WEBGL_debug_renderer_info');return {webgl2:gl instanceof WebGL2RenderingContext,renderer:gl.getParameter(x.UNMASKED_RENDERER_WEBGL),state:KZ.game.state,initialHull:KZ.game.player.hull}});
  if(!before.webgl2||/swiftshader|llvmpipe|software|basic render/i.test(before.renderer))throw Error('Hardware WebGL2 required');
  await page.locator('#screen-title [data-action="start"]').click();
  await page.waitForTimeout(1000);
  const after=await page.evaluate(()=>({state:KZ.game.state,z:KZ.game.player.pos.z,randWorks:typeof KZ.rand.reset==='function'}));
  if(after.state!=='playing'||!(after.z>0)||!after.randWorks||errors.length)throw Error('Production play smoke failed '+JSON.stringify({after,errors}));
  const report={kind:'noncredited-production-attachment-probe',servedBuild,browser:browser.version(),before,after,errors,creditEligible:false};
  fs.writeFileSync(path.join(config.out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }finally{await browser.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1});
