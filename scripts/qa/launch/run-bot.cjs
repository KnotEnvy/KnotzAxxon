// Linux coordinator: owned localhost server + Windows Node/Chrome over local pipes.
// Example: node scripts/qa/launch/run-bot.cjs --count 3 --loops 0 --seed 170001
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const { acquireGPU } = require('./gpu-lease.cjs');
const {readPackage,serveProduction}=require('./production-bundle.cjs');
const {packageIdentity,samePackage}=require('./production-proof.cjs');
const { fingerprint, harnessFingerprint, sha256 } = require('./fingerprint.cjs');
const { campaignPlan } = require('./plan.cjs');
const root = path.resolve(__dirname, '../../..');
const args = process.argv.slice(2);
function arg(name, fallback) { const i=args.indexOf(name); return i<0?fallback:args[i+1]; }
const count=Number(arg('--count','3')), loops=arg('--loops','0,1,2,3,7,30').split(',').map(Number);
const seed=Number(arg('--seed','170001')), final=args.includes('--final');
const offset=Number(arg('--offset','0'));
const lifecycleProbe=args.includes('--lifecycle-probe');
if(lifecycleProbe&&(final||!args.includes('--realtime')))throw Error('--lifecycle-probe requires an uncredited --realtime run');
if(!Number.isInteger(count)||count<1||!loops.length||loops.some(l=>!Number.isInteger(l)||l<0))throw Error('Invalid count/loops');
if(!Number.isInteger(offset)||offset<0||offset+count>1000&&args.includes('--matrix'))throw Error('Invalid campaign offset/range');
const runId=arg('--run-id',`pilot-${new Date().toISOString().replace(/[:.]/g,'-')}`);
if(!/^[a-zA-Z0-9_-]+$/.test(runId))throw Error('Invalid run id');
const out=path.join(root,'artifacts/launch/bot',runId);
const win=p=>execFileSync('wslpath',['-w',p],{encoding:'utf8'}).trim();
let lease,server,served,child,closing=false;
async function stop(p) {
  if(p?.pid&&p.exitCode===null&&p.signalCode===null&&p.kill('SIGTERM'))await new Promise(r=>p.once('exit',r));
}
async function cleanup() {
  if(closing)return;closing=true;
  await stop(child);await stop(server);if(served)await new Promise(r=>served.server.close(r));lease?.release();
}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>cleanup().finally(()=>process.exit(130)));
(async()=>{
  const before=fingerprint(root), beforeHarness=harnessFingerprint(root);
  let frozenCandidate=null;
  if(final){
    if(arg('--candidate',null)!==before.sourceHash)throw Error('--final requires matching --candidate sourceHash');
    const freezeFile=arg('--freeze',null);
    if(!freezeFile)throw Error('--final requires --freeze <immutable candidate JSON>');
    const bytes=fs.readFileSync(path.resolve(root,freezeFile)),candidate=JSON.parse(bytes);
    if(candidate.schema!=='knotzaxxon.frozen-candidate.v1'||candidate.sourceHash!==before.sourceHash||
      candidate.harnessHash!==beforeHarness.harnessHash||candidate.browserPilotHash!==sha256(fs.readFileSync(path.join(__dirname,'pilot-browser.js'))))
      throw Error('Frozen runtime or full QA/test harness does not match current files');
    frozenCandidate={name:candidate.name,commit:candidate.commit,sourceHash:candidate.sourceHash,sha256:sha256(bytes),productionPackages:candidate.productionPackages};
  }
  const packageArg=arg('--production',null);
  if(final&&!packageArg)throw Error('--final requires --production <frozen production package>');
  const packageDir=packageArg?path.resolve(root,packageArg):null;
  const bundle=packageDir?readPackage(packageDir,before.sourceHash):null;
  const productionPackageBefore=bundle?packageIdentity(bundle):null;
  if(final&&!frozenCandidate.productionPackages?.some(p=>samePackage(p,productionPackageBefore)))throw Error('Production package is not pinned by the candidate freeze');
  if(fs.existsSync(out))throw Error('Refusing to overwrite a previous run');
  lease=acquireGPU('/home/knotzuni/code/KnotzAxxon/asset-work/public-launch/gpu-reservation.json',`Primary bot ${runId}`);
  fs.mkdirSync(out,{recursive:true});
  let url;
  if(bundle){served=await serveProduction(bundle);url=served.url;}
  else{
    const listener=net.createServer();await new Promise((r,j)=>{listener.once('error',j);listener.listen(0,'127.0.0.1',r)});
    const port=listener.address().port;await new Promise(r=>listener.close(r));
    server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:['ignore','pipe','pipe']});
    const serverLog=fs.createWriteStream(path.join(out,'server.log'));server.stdout.pipe(serverLog);server.stderr.pipe(serverLog);
    url=`http://127.0.0.1:${port}/`;
    let ready=false;
    for(let i=0;i<100;i++){
      if(server.exitCode!==null)throw Error('Owned dev server exited');
      try{ready=(await fetch(url)).ok}catch{}
      if(ready)break;await new Promise(r=>setTimeout(r,100));
    }
    if(!ready)throw Error('Owned server not ready');
  }
  const config={runId,source:before,harnessTreeHash:beforeHarness.harnessHash,frozenCandidate,final,url,lifecycleProbe,production:bundle?{directory:win(packageDir),identity:productionPackageBefore}:null,count,loops,seed,realtime:args.includes('--realtime'),
    renderEvery:Number(arg('--render-every','12')),maxSeconds:Number(arg('--max-seconds','720')),
    quality:arg('--quality','low'),bootQuality:arg('--boot-quality',arg('--quality','low')),camera:arg('--camera','classic'),profile:arg('--profile','analog'),
    width:Number(arg('--width','960')),height:Number(arg('--height','540')),
    timeOrigin:args.includes('--time-origin')?Number(arg('--time-origin','0')):null,
    out:win(out),pilot:win(path.join(__dirname,'pilot-browser.js')),
    playwright:win(fs.realpathSync(path.join(root,'node_modules/playwright'))),
    chrome:'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    lease:{...lease},harnessHash:sha256(fs.readFileSync(path.join(__dirname,'pilot-browser.js')))};
  if(args.includes('--matrix'))config.plan=campaignPlan(seed).slice(offset,offset+count);
  fs.writeFileSync(path.join(out,'config.json'),JSON.stringify(config,null,2)+'\n');
  child=spawn('node.exe',[win(path.join(__dirname,'windows-bot.cjs')),win(path.join(out,'config.json'))],{stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',b=>process.stdout.write(b));child.stderr.on('data',b=>process.stderr.write(b));
  const code=await new Promise((r,j)=>{child.once('error',j);child.once('exit',r)});
  const after=fingerprint(root), afterHarness=harnessFingerprint(root);fs.writeFileSync(path.join(out,'source-after.json'),JSON.stringify(after,null,2)+'\n');
  const productionPackageAfter=bundle?packageIdentity(readPackage(packageDir,before.sourceHash)):null;
  const proofFile=path.join(out,'served-build.json');
  const servedBuild=fs.existsSync(proofFile)?JSON.parse(fs.readFileSync(proofFile)):null;
  const receipt={runId,productionPackageBefore,productionPackageAfter,servedBuild,
    stablePackage:!!bundle&&samePackage(productionPackageBefore,productionPackageAfter)&&samePackage(productionPackageBefore,servedBuild),
    productionRequests:served?.requests??[],sourceHash:before.sourceHash,afterSourceHash:after.sourceHash,
    stableSource:before.sourceHash===after.sourceHash,harnessHash:beforeHarness.harnessHash,afterHarnessHash:afterHarness.harnessHash,
    stableHarness:beforeHarness.harnessHash===afterHarness.harnessHash,frozenCandidate,kind:final?'final-candidate':'development-pilot',exitCode:code};
  fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify(receipt));
  if(code!==0||(final&&(!receipt.stableSource||!receipt.stableHarness||!receipt.stablePackage)))process.exitCode=1;
})().catch(e=>{console.error(e.stack);process.exitCode=1}).finally(cleanup);
