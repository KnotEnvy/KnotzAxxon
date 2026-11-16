// Read-only audit of paired, explicitly uncredited speed comparison fixtures.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {sha256}=require('./fingerprint.cjs');
const {allocations}=require('./plan.cjs');
const directory=path.resolve(process.argv[2]||'');
const read=name=>JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'));
const lines=name=>fs.readFileSync(path.join(directory,name),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const receipt=read('receipt.json'),hardware=read('hardware.json'),rows=lines('episodes.jsonl'),samples=lines('samples.jsonl');
assert(receipt.exitCode===0&&receipt.stableSource&&receipt.stableHarness&&receipt.stablePackage,'Comparison must close with stable production bytes and harness');
assert(hardware.webgl2&&/NVIDIA/.test(hardware.renderer)&&!/software|swiftshader/i.test(hardware.renderer));
assert.equal(rows.length,12,'Expected one comparison pair for each of the six bands');
const outcomeKeys=['outcome','completed','frames','rawSeconds','gameSeconds','sectors','featuresPassed','bossPhases',
 'rackHits','rackDetonations','maxHeat','minFuel','hull','shields','fuel','z','kills','score','shots',
 'gameShotsCounter','hits','grades','threads','grazes'];
const sampleKeys=['frame','rawSeconds','gameSeconds','pos','sharedRandomState','state','sector','hull','shield','fuel',
 'heat','shots','gameShotsCounter','hits','kills','score','threads','grazes','boss','decision'];
const select=(row,keys)=>Object.fromEntries(keys.map(k=>[k,row[k]]));
const pairs=[];
for(let n=0;n<rows.length;n+=2){
 const [reference,hyper]=rows.slice(n,n+2);
 for(const row of [reference,hyper]){
  assert(row.comparisonFixture&&row.deterministicStreaming&&row.silentSimulation&&!row.creditEligible&&row.kind==='development-pilot','Comparison fixtures must never receive final credit');
  assert.equal(row.sourceHash,receipt.sourceHash);assert.equal(row.harnessTreeHash,receipt.harnessHash);
  assert.deepEqual(row.errors,[]);assert(row.completed&&row.renderedFrames>0);
 }
 assert.equal(reference.hyper,false);assert.equal(hyper.hyper,true);
 assert.deepEqual(select(reference,['seed','loop','profile','camera','quality','sharedRandomSeed']),select(hyper,['seed','loop','profile','camera','quality','sharedRandomSeed']));
 assert.deepEqual(select(reference,outcomeKeys),select(hyper,outcomeKeys),'Gameplay result mismatch in loop '+reference.loop);
 const a=samples.filter(s=>s.id===reference.id).map(s=>select(s,sampleKeys));
 const b=samples.filter(s=>s.id===hyper.id).map(s=>select(s,sampleKeys));
 assert.deepEqual(a,b,'Intermediate simulation mismatch in loop '+reference.loop);
 pairs.push({loop:reference.loop,seed:reference.seed,profile:reference.profile,camera:reference.camera,quality:reference.quality,
  outcome:hyper.outcome,frames:hyper.frames,samplesCompared:a.length,exactGameplayAndSamplesMatch:true,
  reference:{id:reference.id,wallMs:reference.wallMs,renders:reference.renderedFrames},
  hyper:{id:hyper.id,wallMs:hyper.wallMs,renders:hyper.renderedFrames},speedup:reference.wallMs/hyper.wallMs});
}
assert.deepEqual(pairs.map(p=>p.loop),allocations.map(a=>a.loop));
const sum=fn=>pairs.reduce((n,p)=>n+fn(p),0);
const hyperMs=sum(p=>p.hyper.wallMs),referenceMs=sum(p=>p.reference.wallMs),frames=sum(p=>p.frames);
const report={schema:'knotzaxxon.bot-speed-comparison.v1',runId:receipt.runId,sourceHash:receipt.sourceHash,harnessHash:receipt.harnessHash,
 creditedEpisodes:0,comparisonFixture:true,hardware,pairs,
 totals:{pairs:pairs.length,framesPerArm:frames,samplesCompared:sum(p=>p.samplesCompared),referenceWallMs:referenceMs,hyperWallMs:hyperMs,
  referenceRenders:sum(p=>p.reference.renders),hyperRenders:sum(p=>p.hyper.renders),speedup:referenceMs/hyperMs,hyperSimulationFramesPerSecond:frames/(hyperMs/1000),
  weighted1000EpisodeEstimateMs:allocations.reduce((n,band)=>n+band.count*pairs.find(p=>p.loop===band.loop).hyper.wallMs,0)},
 evidence:['config.json','receipt.json','hardware.json','served-build.json','episodes.jsonl','samples.jsonl'].map(file=>({file,sha256:sha256(fs.readFileSync(path.join(directory,file)))})),
 limits:[
  'These are uncredited comparison fixtures, not a frozen final campaign or realtime player evidence.',
  'Both arms use the original compiled game and Engine; the comparison fixes one-chunk streaming and seeds native randomness separately per call site, with the original audio-unavailable branch.',
  'Those controls isolate wall-time streaming, audio detune and renderer UUID randomness. Exact parity is established only under these controlled conditions; natural runs retain timing and native-random variation.',
  'Timing covers episodes, not startup or closing overhead; all presets, seeds and devices are not represented by these six pairs.',
  'The 1000-episode projection weights one sample per band and is an estimate, not a completed campaign or a two-minute promise.',
  'CPU submission/render counts do not establish sustained FPS, audible quality or GPU execution time.'
 ]};
process.stdout.write(JSON.stringify(report,null,2)+'\n');
