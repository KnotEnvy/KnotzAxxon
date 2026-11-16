// Report actual whole-coordinator throughput, including browser startup/closing.
// These pilots compare scheduling cost, not deterministic replay or campaign credit.
const fs=require('node:fs'),path=require('node:path');
const {sha256}=require('./fingerprint.cjs');
const {productionCreditError,validProof,samePackage}=require('./production-proof.cjs');
const weights={0:180,1:180,2:180,3:180,7:180,30:100};
function summarizePool(root,runId){
  if(!/^[a-zA-Z0-9_-]+$/.test(runId))throw Error('Invalid run id');
  const directory=path.join(root,'artifacts/launch/bot',runId),inputs={};
  const read=name=>{const file=path.join(directory,name),bytes=fs.readFileSync(file);inputs[name]=sha256(bytes);return bytes.toString()};
  const receipt=JSON.parse(read('receipt.json')),config=JSON.parse(read('config.json'));
  const rows=read('episodes.jsonl').trim().split('\n').map(JSON.parse),closed=read('workers.jsonl').trim().split('\n').map(JSON.parse);
  if(receipt.exitCode!==0||!receipt.stableSource||!receipt.stableHarness||!receipt.stablePackage||
     receipt.sourceHash!==receipt.afterSourceHash||receipt.harnessHash!==receipt.afterHarnessHash||!(receipt.wallMs>0))
    throw Error('Unstable or failed pilot');
  if(config.final||config.speedComparison||config.realtime||!config.hyper||rows.length!==config.count)
    throw Error('Expected complete, uncredited natural hyper pilot');
  const count=Math.min(config.count,config.workers??1),seen=new Set();
  if(closed.length!==count||new Set(closed.map(row=>row.worker)).size!==count)throw Error('Missing worker closure');
  const workers=[];
  for(let worker=0;worker<count;worker++){
    if(!closed.some(row=>row.worker===worker))throw Error('Wrong worker closure');
    const proof=JSON.parse(read(`served-build-worker-${worker}.json`)),hardware=JSON.parse(read(`hardware-worker-${worker}.json`));
    if(!validProof(proof,receipt.sourceHash)||!samePackage(proof,receipt.servedBuild)||!hardware.webgl2||
       !hardware.renderer||/swiftshader|llvmpipe|software|basic render/i.test(hardware.renderer))throw Error('Worker lacks production/hardware proof');
    workers.push({worker,episodes:rows.filter(row=>row.worker===worker).length,hardware,closed:closed.find(row=>row.worker===worker)});
  }
  for(const row of rows){
    const i=row.planIndex;
    if(!Number.isInteger(i)||i<0||i>=config.count||seen.has(i)||row.id!==`${runId}-${i}`||
       row.seed!==config.seed+i||row.loop!==config.loops[i%config.loops.length]||
       !Number.isInteger(row.worker)||row.worker<0||row.worker>=count||row.kind!=='development-pilot'||row.creditEligible||
       !row.completed||!['over','victory'].includes(row.outcome)||row.errors?.length||row.comparisonFixture||row.deterministicStreaming||
       row.sourceHash!==receipt.sourceHash||row.harnessTreeHash!==receipt.harnessHash||
       row.initial?.hull!==3||row.initial.shields!==1||row.initial.fuel!==1||row.initial.z!==0||row.initial.loop!==row.loop||
       !(row.frames>=row.renderedFrames)||!(row.renderedFrames>0)||productionCreditError(row,receipt,receipt.sourceHash,null))
      throw Error('Invalid pilot row: '+row.id);
    seen.add(i);
  }
  const total=field=>rows.reduce((sum,row)=>sum+row[field],0),frames=total('frames');
  const bands=Object.entries(weights).map(([loop,weight])=>{
    const sample=rows.filter(row=>row.loop===Number(loop));if(!sample.length)throw Error('Missing loop band');
    return {loop:Number(loop),sampleEpisodes:sample.length,meanFrames:sample.reduce((sum,row)=>sum+row.frames,0)/sample.length,weight};
  });
  const projectedFrames=bands.reduce((sum,band)=>sum+band.meanFrames*band.weight,0);
  return {runId,workers:count,sourceHash:receipt.sourceHash,harnessHash:receipt.harnessHash,package:receipt.productionPackageBefore,
    episodes:rows.length,victories:rows.filter(row=>row.outcome==='victory').length,deaths:rows.filter(row=>row.outcome==='over').length,
    frames,renders:total('renderedFrames'),episodeElapsedMs:total('wallMs'),coordinatorWallMs:receipt.wallMs,
    framesPerWallSecond:frames/receipt.wallMs*1000,simulatedSecondsPerWallSecond:total('rawSeconds')/receipt.wallMs*1000,
    bands,projected1000Frames:projectedFrames,projected1000WallMs:projectedFrames/frames*receipt.wallMs,
    framesPerSecondRequiredFor120s:projectedFrames/120,creditedEpisodes:0,workerEvidence:workers,inputSHA256:inputs};
}
function report(root,runIds){
  const pilots=runIds.map(id=>summarizePool(root,id)),first=pilots[0];
  if(!first||pilots.some(pilot=>pilot.sourceHash!==first.sourceHash||pilot.harnessHash!==first.harnessHash||!samePackage(pilot.package,first.package)))
    throw Error('Pilot recipes or production packages differ');
  return {schema:'knotzaxxon.bot-worker-throughput.v1',pilots,
    throughputRatiosToFirst:pilots.map(pilot=>({runId:pilot.runId,ratio:pilot.framesPerWallSecond/first.framesPerWallSecond})),
    limits:['Two natural seeds per band; outcomes differ because native randomness and timed streaming remain original.',
      'This measures scheduling cost, not exact replay parity. Both pilots use Low/Classic/synthetic analog at 960x540.',
      'Whole-coordinator timing includes startup, verification, screenshots, continuation and closing; sample projection is not a measured 1000-run campaign.',
      'No final bot/player, listening, sustained performance or physical-device credit. No two-minute throughput demonstrated.']};
}
if(require.main===module){
  const root=path.resolve(__dirname,'../../..'),[output,...runs]=process.argv.slice(2);
  if(!output||runs.length<2)throw Error('Usage: pool-report.cjs OUTPUT RUN_ID RUN_ID');
  fs.writeFileSync(path.resolve(root,output),JSON.stringify(report(root,runs),null,2)+'\n');
}
module.exports={summarizePool,report};
