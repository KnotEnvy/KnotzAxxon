// CPU-only until explicitly invoked with --launch and a frozen candidate fingerprint.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),readline=require('node:readline');
const {spawn,execFileSync}=require('node:child_process');
const {fingerprint,harnessFingerprint,sha256}=require('../launch/fingerprint.cjs');
const {readPackage,serveProduction}=require('../launch/production-bundle.cjs');
const {packageIdentity,samePackage}=require('../launch/production-proof.cjs');
const {acquireGPU}=require('../launch/gpu-lease.cjs');
const {trialPlan}=require('./trial-plan.cjs');
const root=path.resolve(__dirname,'../../..'),args=process.argv.slice(2);
const arg=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1]};
if(!args.includes('--launch')){console.log('CPU preparation only. See FINAL-TRIALS.md; --launch requires frozen --candidate and --run-id.');process.exit(0)}
const pilotMode=args.includes('--pilot');
const pilotSeedBase=arg('--pilot-seed-base',null);
if(pilotSeedBase!==null&&(!pilotMode||!Number.isSafeInteger(Number(pilotSeedBase))||Number(pilotSeedBase)<1||Number(pilotSeedBase)>2599999))throw Error('Pilot seed base requires --pilot and safe seeds below final2600001');
const pilotMaxSeconds=Number(arg('--pilot-max-seconds','900'));
if(args.includes('--pilot-max-seconds')&&(!pilotMode||!Number.isFinite(pilotMaxSeconds)||pilotMaxSeconds<5||pilotMaxSeconds>60))throw Error('Bounded smoke duration requires --pilot, 5–60 seconds');
const candidate=arg('--candidate',pilotMode?fingerprint(root).sourceHash:''),runId=arg('--run-id','');
if(!/^[a-f0-9]{64}$/.test(candidate)||!(pilotMode?/^pilot-live-[a-zA-Z0-9_-]+$/:/^final-live-[a-zA-Z0-9_-]+$/).test(runId))throw Error('Matching candidate and mode-specific pilot-live-/final-live- run id required');
const out=path.join(root,'artifacts/launch/live-sol-low',runId),win=p=>execFileSync('wslpath',['-w',p],{encoding:'utf8'}).trim();
let lease,server,served,child,closing=false,config,bundle,packageDir,productionPackageBefore,beforeHarness,exitCode=0;
async function stop(p){if(p?.pid&&p.exitCode===null&&p.signalCode===null&&p.kill('SIGTERM'))await new Promise(r=>p.once('exit',r))}
async function cleanup(){if(closing)return;closing=true;await stop(child);await stop(server);if(served)await new Promise(r=>served.server.close(r));lease?.release()}
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>cleanup().finally(()=>process.exit(130)));
(async()=>{
 const before=fingerprint(root);beforeHarness=harnessFingerprint(root);
 if(before.sourceHash!==candidate)throw Error('Candidate mismatch before lease; no browser launched');
 let frozenCandidate=null;
 if(!pilotMode){
  const freeze=arg('--freeze',null);if(!freeze)throw Error('Final live requires --freeze');
  const bytes=fs.readFileSync(path.resolve(root,freeze)),record=JSON.parse(bytes);
  if(record.schema!=='knotzaxxon.frozen-candidate.v1'||record.sourceHash!==candidate||record.harnessHash!==beforeHarness.harnessHash||record.browserPilotHash!==sha256(fs.readFileSync(path.join(root,'scripts/qa/launch/pilot-browser.js'))))throw Error('Frozen live runtime or full harness mismatch');
  frozenCandidate={name:record.name,commit:record.commit,sha256:sha256(bytes),productionPackages:record.productionPackages};
 }
 const packageArg=arg('--production',null);
 if(!pilotMode&&!packageArg)throw Error('Final live requires --production');
 packageDir=packageArg?path.resolve(root,packageArg):null;
 bundle=packageDir?readPackage(packageDir,candidate):null;
 productionPackageBefore=bundle?packageIdentity(bundle):null;
 if(!pilotMode&&!frozenCandidate.productionPackages?.some(p=>samePackage(p,productionPackageBefore)))throw Error('Live production package not pinned by freeze');
 if(fs.existsSync(out))throw Error('Refusing to overwrite evidence');
 lease=acquireGPU('/home/knotzuni/code/KnotzAxxon/asset-work/public-launch/gpu-reservation.json',`Terra medium ${pilotMode?'pilot':'final'} live ${runId}`);
 fs.mkdirSync(out,{recursive:true});
 let url;
 if(bundle){served=await serveProduction(bundle);url=served.url;}else{
 const listener=net.createServer();await new Promise((r,j)=>{listener.once('error',j);listener.listen(0,'127.0.0.1',r)});
 const port=listener.address().port;await new Promise(r=>listener.close(r));
 server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:['ignore','pipe','pipe']});
 const log=fs.createWriteStream(path.join(out,'server.log'));server.stdout.pipe(log);server.stderr.pipe(log);
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Owned server startup timeout')),20000);
  server.stdout.on('data',b=>{if(b.toString().includes('Local:')){clearTimeout(timer);resolve()}});
  server.once('exit',()=>{clearTimeout(timer);reject(Error('Owned server exited'))});server.once('error',reject)});
 url=`http://127.0.0.1:${port}/`;
 }
 config={schemaVersion:2,runId,candidate,sourceBefore:before,harnessTreeHash:beforeHarness.harnessHash,frozenCandidate,production:bundle?{directory:win(packageDir),identity:productionPackageBefore}:null,kind:pilotMode?'development-live-pilot':'final-candidate-live-observation',pilotMode,
  url,out:win(out),outLocal:out,python:'C:\\Python311\\python.exe',lease:{...lease,ownerPID:lease.pid},
  pilot:win(path.join(root,'scripts/qa/launch/pilot-browser.js')),
  botHash:sha256(fs.readFileSync(path.join(root,'scripts/qa/launch/pilot-browser.js'))),
  toolingHashes:Object.fromEntries(fs.readdirSync(__dirname).filter(f=>/\.(cjs|py)$/.test(f)).map(f=>[f,sha256(fs.readFileSync(path.join(__dirname,f)))])),
  liveHarnessHash:sha256(fs.readFileSync(path.join(__dirname,'windows-live.cjs'))),
  playwright:win(fs.realpathSync(path.join(root,'node_modules/playwright'))),
  chrome:'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',plan:pilotMode?[{id:'pilot-live-l30',seed:pilotSeedBase===null?170101:Number(pilotSeedBase),loop:30,fixture:'seeded-loop-start',profile:'keyboard',camera:'chase',quality:'high',width:960,height:540,dpr:1,maxSeconds:pilotMaxSeconds,renderEvery:1},{id:'pilot-live-l0',seed:pilotSeedBase===null?170001:Number(pilotSeedBase)+1,loop:0,fixture:'seeded-loop-start',profile:'gamepad',camera:'modern',quality:'medium',width:960,height:540,dpr:1,maxSeconds:pilotMaxSeconds,renderEvery:1}]:trialPlan(Number(arg('--seed-base','2600001')))};
 fs.writeFileSync(path.join(out,'config.json'),JSON.stringify(config,null,2)+'\n');
 child=spawn('node.exe',[win(path.join(__dirname,'windows-live.cjs')),win(path.join(out,'config.json'))],{stdio:['pipe','pipe','pipe']});
 child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);
 const lines=readline.createInterface({input:process.stdin});
 child.once('exit',()=>lines.close());
 // Human/agent-paced commands only: no timer drives observations or trial starts.
 for await(const line of lines){
  try{const c=JSON.parse(line);if(['start','end','quit'].includes(c.op)){
   c.source=fingerprint(root);c.harnessTreeHash=harnessFingerprint(root).harnessHash;if(c.op==='start'){
    if(c.source.sourceHash!==candidate||c.harnessTreeHash!==config.harnessTreeHash)throw Error('Candidate or harness changed; start refused');
    const spec=config.plan.find(p=>p.id===c.id);if(!spec)throw Error('Unknown trial id');
    const parent=path.dirname(out);
    for(const entry of fs.readdirSync(parent,{withFileTypes:true})){
     if(!entry.isDirectory())continue;const file=path.join(parent,entry.name,'initial.jsonl');
     if(!fs.existsSync(file))continue;
     for(const row of fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean)){
      if(JSON.parse(row).spec?.seed===spec.seed)throw Error('Seed previously attempted; preserve it and assign an explicit new replacement plan');
     }
    }
   }
  }child.stdin.write(JSON.stringify(c)+'\n');if(c.op==='quit'){lines.close();break}}
  catch(e){console.error(JSON.stringify({commandError:e.message}))}
 }
 if(child.exitCode===null){child.stdin.end();await new Promise(r=>child.once('exit',r))}
 exitCode=child.exitCode??1;
})().catch(e=>{console.error(e.stack);exitCode=1}).finally(async()=>{
 if(config){
  try{
   const after=fingerprint(root),afterHarness=harnessFingerprint(root);
   const productionPackageAfter=bundle?packageIdentity(readPackage(packageDir,candidate)):null;
   const proof=path.join(out,'served-build.json'),servedBuild=fs.existsSync(proof)?JSON.parse(fs.readFileSync(proof)):null;
   fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify({candidate,kind:config.kind,pilotMode,
    sourceAfter:after,stableSource:after.sourceHash===candidate,harnessHash:config.harnessTreeHash,
    afterHarnessHash:afterHarness.harnessHash,stableHarness:afterHarness.harnessHash===config.harnessTreeHash,
    frozenCandidate:config.frozenCandidate,productionPackageBefore,productionPackageAfter,servedBuild,
    stablePackage:!!bundle&&samePackage(productionPackageBefore,productionPackageAfter)&&samePackage(productionPackageBefore,servedBuild),
    productionRequests:served?.requests??[],exitCode,credited:0,note:'Raw evidence only; per-trial provenance and actual viewed cadence audit required'},null,2)+'\n');
  }catch(error){console.error(error.stack);exitCode=1;}
 }
 await cleanup();process.exitCode=exitCode;
});
