// Audit raw per-seed receipts. A report is evidence, never a balance or FPS verdict.
const fs=require('node:fs'),path=require('node:path'),readline=require('node:readline');
const {auditEpisodes}=require('./credit.cjs');
const {allocations}=require('./plan.cjs');
const root=path.resolve(__dirname,'../../..');
const candidateFile=process.argv[2];
if(!candidateFile)throw Error('Expected a frozen candidate JSON');
const candidate=JSON.parse(fs.readFileSync(candidateFile));
const jsonl=file=>fs.existsSync(file)?fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
const add=(table,key,count=1)=>{table[key]=(table[key]??0)+count};
const quantiles=values=>{
  const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
  const at=p=>sorted.length?sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]:null;
  return {n:sorted.length,min:at(0),p50:at(.5),p95:at(.95),max:at(1)};
};
async function stream(file,visit){
  if(!fs.existsSync(file))return;
  const input=fs.createReadStream(file);
  try{for await(const line of readline.createInterface({input,crlfDelay:Infinity}))if(line.trim())visit(JSON.parse(line));}
  finally{input.destroy()}
}
(async()=>{
  const botRoot=path.join(root,'artifacts/launch/bot');
  const runs=[],rows=[],receipts=new Map();
  for(const name of fs.readdirSync(botRoot).sort()){
    const dir=path.join(botRoot,name);if(!fs.statSync(dir).isDirectory())continue;
    const receiptFile=path.join(dir,'receipt.json');
    const receipt=fs.existsSync(receiptFile)?JSON.parse(fs.readFileSync(receiptFile)):null;
    if(receipt)receipts.set(name,receipt);
    const episodes=jsonl(path.join(dir,'episodes.jsonl'));rows.push(...episodes);
    runs.push({name,dir,receipt,episodes,failures:jsonl(path.join(dir,'failures.jsonl'))});
  }
  const unfiltered=auditEpisodes(rows,receipts,candidate.sourceHash);
  const credit=auditEpisodes(rows,receipts,candidate.sourceHash,candidate.browserPilotHash);
  const ids=new Set(credit.creditedIds),valid=rows.filter(r=>ids.has(r.id));
  const wrongHarness=rows.filter(r=>unfiltered.creditedIds.includes(r.id)&&r.harnessHash!==candidate.browserPilotHash).map(r=>r.id);
  const features={},outcomes={},warnings={},collisions={},damage={},grades={},rigs={},qualities={},profiles={},viewports={};
  for(const row of valid){
    add(outcomes,row.outcome);add(rigs,row.camera);add(qualities,row.quality);add(profiles,row.profile);
    add(viewports,`${row.initial.viewport.width}x${row.initial.viewport.height}@${row.initial.viewport.dpr}`);
    for(const [key,count] of Object.entries(row.featuresPassed??{}))add(features,key,count);
    for(const grade of row.grades??[])if(grade)add(grades,grade);
  }
  const resources={samples:0,maxGeometries:0,maxTextures:0,maxPrograms:0};
  const firstShots=[],earnedContinuations=[],runFailures=[];
  for(const run of runs){
    if(!run.receipt?.stableSource||run.receipt.sourceHash!==candidate.sourceHash||run.receipt.afterSourceHash!==candidate.sourceHash)continue;
    runFailures.push(...run.failures.map(f=>({run:run.name,...f})));
    await stream(path.join(run.dir,'events.jsonl'),event=>{
      if(!ids.has(event.id))return;
      if(event.type==='warning')add(warnings,event.label);
      if(event.type==='collision')add(collisions,event.tag??'unlabelled');
      if(event.type==='damage')add(damage,`${event.source}:${event.result}`);
      if(event.type==='first-shot')firstShots.push(event.frame);
    });
    await stream(path.join(run.dir,'samples.jsonl'),sample=>{
      if(!ids.has(sample.id))return;
      resources.samples++;
      resources.maxGeometries=Math.max(resources.maxGeometries,sample.memory?.geometries??0);
      resources.maxTextures=Math.max(resources.maxTextures,sample.memory?.textures??0);
      resources.maxPrograms=Math.max(resources.maxPrograms,sample.programs??0);
    });
    earnedContinuations.push(...jsonl(path.join(run.dir,'progression.jsonl'))
      .filter(r=>r.sourceHash===candidate.sourceHash&&ids.has(r.parentVictory))
      .map(r=>({id:r.id,parentVictory:r.parentVictory,loop:r.loop,outcome:r.outcome,rawSeconds:r.rawSeconds,
        renderedFrames:r.renderedFrames,creditEligible:false,kind:'earned-next-loop-diagnostic'})));
  }
  const bands=allocations.map(a=>{
    const band=valid.filter(r=>r.loop===a.loop);
    return {loop:a.loop,required:a.count,completed:band.length,passed:band.length>=a.count,
      victories:band.filter(r=>r.outcome==='victory').length,
      sectors:[...new Set(band.flatMap(r=>r.sectors))].sort((a,b)=>a-b),
      cameras:[...new Set(band.map(r=>r.camera))].sort(),qualities:[...new Set(band.map(r=>r.quality))].sort(),
      profiles:[...new Set(band.map(r=>r.profile))].sort(),
      gameSeconds:quantiles(band.map(r=>r.gameSeconds)),z:quantiles(band.map(r=>r.z)),
      renderedFrames:band.reduce((n,r)=>n+r.renderedFrames,0)};
  });
  const coverage={allEightSectors:[0,1,2,3,4,5,6,7].every(s=>credit.sectors.includes(s)),
    allBossPhases:[0,1,2].every(p=>credit.bossPhases.includes(p)),
    rackHits:valid.reduce((n,r)=>n+r.rackHits,0),rackDetonations:valid.reduce((n,r)=>n+r.rackDetonations,0),
    gates:features.gate??0,fences:features.fence??0,platforms:features.platform??0,
    debrisRings:features.debrisRing??0,debrisGates:features['wall:slot:debris']??0,
    earnedNextLoop:earnedContinuations.some(r=>r.loop>=1&&r.rawSeconds>=30&&r.renderedFrames>0)};
  const distributionComplete=bands.every(b=>b.passed&&b.cameras.length===3&&b.qualities.length===4&&b.profiles.length===3);
  const coverageComplete=coverage.allEightSectors&&coverage.allBossPhases&&coverage.rackHits>0&&coverage.rackDetonations>0&&
    coverage.gates>0&&coverage.fences>0&&coverage.platforms>0&&coverage.debrisRings>0&&coverage.debrisGates>0&&coverage.earnedNextLoop;
  const report={schema:'knotzaxxon.hardware-campaign-report.v1',generatedAt:new Date().toISOString(),
    candidate:{name:candidate.name,commit:candidate.commit,sourceHash:candidate.sourceHash,browserPilotHash:candidate.browserPilotHash},
    ready:credit.total>=1000&&distributionComplete&&coverageComplete&&wrongHarness.length===0,
    credit,bands,wrongHarness,coverage,distributionComplete,coverageComplete,
    totals:{episodes:valid.length,simulationFrames:valid.reduce((n,r)=>n+r.frames,0),
      renderedFrames:valid.reduce((n,r)=>n+r.renderedFrames,0),outcomes,rigs,qualities,profiles,viewports,
      features,warnings,collisions,damage,grades,firstShotFrames:quantiles(firstShots),
      maximumHeat:quantiles(valid.map(r=>r.maxHeat)),minimumFuel:quantiles(valid.map(r=>r.minFuel)),resources},
    earnedContinuations,runFailures,
    defeatedSeeds:valid.filter(r=>r.outcome==='over').map(r=>({id:r.id,seed:r.seed,loop:r.loop,camera:r.camera,
      quality:r.quality,profile:r.profile,z:r.z,initialEngineTime:r.initial.engineTime,sharedRandomSeed:r.sharedRandomSeed})),
    limitations:['Accelerated, GPU-rendered bot coverage does not establish subjective feel or sustained hardware FPS.',
      'Loop-start fixtures do not prove prior-loop victories. Earned continuations are separate diagnostics.',
      'Synthetic input profiles and browser viewports are not physical controllers or phones.',
      'Readiness here covers bot campaign evidence only; live-agent, production package, audio and all21judge scores are separate.']};
  console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e.stack);process.exitCode=1});
