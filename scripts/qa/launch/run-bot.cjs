// Linux coordinator: owned localhost server + Windows Node/Chrome over local pipes.
// Example: node scripts/qa/launch/run-bot.cjs --count 3 --loops 0 --seed 170001
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const { acquireGPU } = require('./gpu-lease.cjs');
const { fingerprint, sha256 } = require('./fingerprint.cjs');
const { campaignPlan } = require('./plan.cjs');
const root = path.resolve(__dirname, '../../..');
const args = process.argv.slice(2);
function arg(name, fallback) { const i=args.indexOf(name); return i<0?fallback:args[i+1]; }
const count=Number(arg('--count','3')), loops=arg('--loops','0,1,2,3,7,30').split(',').map(Number);
const seed=Number(arg('--seed','170001')), final=args.includes('--final');
if(!Number.isInteger(count)||count<1||!loops.length||loops.some(l=>!Number.isInteger(l)||l<0))throw Error('Invalid count/loops');
const runId=arg('--run-id',`pilot-${new Date().toISOString().replace(/[:.]/g,'-')}`);
if(!/^[a-zA-Z0-9_-]+$/.test(runId))throw Error('Invalid run id');
const out=path.join(root,'artifacts/launch/bot',runId);
const win=p=>execFileSync('wslpath',['-w',p],{encoding:'utf8'}).trim();
let lease,server,child,closing=false;
async function cleanup() {
  if(closing)return;closing=true;
  if(child&&child.exitCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}
  if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}
  lease?.release();
}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>cleanup().finally(()=>process.exit(130)));
(async()=>{
  lease=acquireGPU('/home/knotzuni/code/KnotzAxxon/asset-work/public-launch/gpu-reservation.json',`Primary bot ${runId}`);
  if(fs.existsSync(out))throw Error('Refusing to overwrite a previous run');
  fs.mkdirSync(out,{recursive:true});
  const before=fingerprint(root);
  if(final && arg('--candidate',null)!==before.sourceHash)throw Error('--final requires matching --candidate sourceHash');
  const listener=net.createServer();await new Promise((r,j)=>{listener.once('error',j);listener.listen(0,'127.0.0.1',r)});
  const port=listener.address().port;await new Promise(r=>listener.close(r));
  server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:['ignore','pipe','pipe']});
  const serverLog=fs.createWriteStream(path.join(out,'server.log'));server.stdout.pipe(serverLog);server.stderr.pipe(serverLog);
  const url=`http://127.0.0.1:${port}/`;
  let ready=false;
  for(let i=0;i<100;i++){
    if(server.exitCode!==null)throw Error('Owned dev server exited');
    try{ready=(await fetch(url)).ok}catch{}
    if(ready)break;await new Promise(r=>setTimeout(r,100));
  }
  if(!ready)throw Error('Owned server not ready');
  const config={runId,source:before,final,url,count,loops,seed,realtime:args.includes('--realtime'),
    renderEvery:Number(arg('--render-every','12')),maxSeconds:Number(arg('--max-seconds','720')),
    quality:arg('--quality','low'),camera:arg('--camera','classic'),profile:arg('--profile','analog'),
    width:Number(arg('--width','960')),height:Number(arg('--height','540')),
    timeOrigin:args.includes('--time-origin')?Number(arg('--time-origin','0')):null,
    out:win(out),pilot:win(path.join(__dirname,'pilot-browser.js')),
    playwright:win('/home/knotzuni/code/KnotzAxxon/asset-work/studio-opus-code/tools/node_modules/playwright'),
    chrome:'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    lease:{...lease},harnessHash:sha256(fs.readFileSync(path.join(__dirname,'pilot-browser.js')))};
  if(args.includes('--matrix'))config.plan=campaignPlan(seed).slice(0,count);
  fs.writeFileSync(path.join(out,'config.json'),JSON.stringify(config,null,2)+'\n');
  child=spawn('node.exe',[win(path.join(__dirname,'windows-bot.cjs')),win(path.join(out,'config.json'))],{stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',b=>process.stdout.write(b));child.stderr.on('data',b=>process.stderr.write(b));
  const code=await new Promise((r,j)=>{child.once('error',j);child.once('exit',r)});
  const after=fingerprint(root);fs.writeFileSync(path.join(out,'source-after.json'),JSON.stringify(after,null,2)+'\n');
  const receipt={runId,sourceHash:before.sourceHash,afterSourceHash:after.sourceHash,
    stableSource:before.sourceHash===after.sourceHash,kind:final?'final-candidate':'development-pilot',exitCode:code};
  fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify(receipt));
  if(code!==0||(final&&!receipt.stableSource))process.exitCode=1;
})().catch(e=>{console.error(e.stack);process.exitCode=1}).finally(cleanup);
