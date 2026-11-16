import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {auditEpisodes}=require('../scripts/qa/launch/credit.cjs');
const {campaignPlan}=require('../scripts/qa/launch/plan.cjs');
const productionPackage={sourceHash:'candidate',manifestSHA256:'a'.repeat(64),fileCount:2,entry:'assets/game.js',entrySHA256:'b'.repeat(64)};
const servedBuild={kind:'hash-verified-production',...productionPackage,browserFilesHashMatched:2,
  bridge:{debugApiAbsentBeforeQA:true,shippedBytesUnmodified:true,debuggerDetachedBeforePlay:true,entrySHA256:productionPackage.entrySHA256}};
const packageReceipt={servedBuild,stablePackage:true,productionPackageBefore:productionPackage,productionPackageAfter:productionPackage};
test('campaign matrix allocates 1000 unique seeds and all rigs, presets and inputs in each loop band',()=>{
  const plan=campaignPlan();assert.equal(plan.length,1000);
  assert.equal(new Set(plan.map(p=>p.seed)).size,1000);
  for(const loop of [0,1,2,3,7,30]){
    const band=plan.filter(p=>p.loop===loop);
    assert.equal(band.length,loop===30?100:180);
    assert.deepEqual([...new Set(band.map(p=>p.camera))].sort(),['chase','classic','modern']);
    assert.equal(new Set(band.map(p=>p.quality)).size,4);
    assert.equal(new Set(band.map(p=>p.profile)).size,3);
  }
});
test('release evidence refuses pilots, software, timeouts, changing builds and duplicate seeds',()=>{
  const good={servedBuild,id:'r-0',runId:'r',seed:42,loop:0,kind:'final-candidate',sourceHash:'candidate',
    hardware:{webgl2:true,renderer:'ANGLE (NVIDIA GeForce GTX 1650 Ti D3D11)'},
    completed:true,outcome:'over',creditEligible:true,errors:[],frames:6000,renderedFrames:500,
    initial:{hull:3,shields:1,fuel:1,z:0,loop:0},sectors:[0,1],bossPhases:[]};
  const receipts=new Map([['r',{...packageReceipt,stableSource:true,sourceHash:'candidate',afterSourceHash:'candidate'}],
    ['changed',{stableSource:false,sourceHash:'candidate',afterSourceHash:'other'}]]);
  const rows=[good,{...good,id:'r-1',kind:'development-pilot'},
    {...good,id:'r-2',hardware:{webgl2:true,renderer:'Google SwiftShader'}},
    {...good,id:'r-3',outcome:'timeout',completed:false},
    {...good,id:'changed-0',runId:'changed'},
    {...good,id:'r-4'}, {...good,id:'r-5',seed:43,initial:{hull:99,shields:1,fuel:1,z:0,loop:0}},
    {...good,id:'r-6',seed:44,initial:{hull:3,shields:9,fuel:1,z:0,loop:0}}];
  const result=auditEpisodes(rows,receipts,'candidate');
  assert.equal(result.total,1);assert.equal(result.excluded.length,7);
  assert.deepEqual(result.excluded.map(e=>e.reason),['development-pilot','no-hardware-proof','not-completed',
    'unverified-or-changing-source','duplicate-seed-and-loop','invalid-initial-state','invalid-initial-state']);
  assert.equal(auditEpisodes([good],receipts,'other').total,0);
  assert.equal(auditEpisodes([good],receipts,'candidate','another-harness').total,0);
});

test('final campaign credit pins the entire QA recipe and immutable freeze record',()=>{
  const frozen={harnessHash:'full-qa',commit:'frozen-runtime-commit',sha256:'freeze-bytes',productionPackages:[productionPackage]};
  const good={servedBuild,id:'r-0',runId:'r',seed:42,loop:0,kind:'final-candidate',sourceHash:'candidate',harnessHash:'pilot',
    frozenCandidate:{commit:frozen.commit,sha256:frozen.sha256},
    hardware:{webgl2:true,renderer:'ANGLE (NVIDIA GTX 1650 Ti D3D11)'},
    completed:true,outcome:'over',creditEligible:true,errors:[],frames:6000,renderedFrames:500,
    initial:{hull:3,shields:1,fuel:1,z:0,loop:0},sectors:[0,1],bossPhases:[]};
  const receipt={...packageReceipt,stableSource:true,sourceHash:'candidate',afterSourceHash:'candidate',
    stableHarness:true,harnessHash:frozen.harnessHash,afterHarnessHash:frozen.harnessHash,
    frozenCandidate:{sha256:frozen.sha256}};
  const audit=(row=good,value=receipt)=>auditEpisodes([row],new Map([['r',value]]),'candidate','pilot',frozen);
  assert.equal(audit().total,1);
  assert.equal(audit(good,{...receipt,afterHarnessHash:'changed-windows-coordinator'}).excluded[0].reason,'unverified-or-changing-harness');
  assert.equal(audit(good,{...receipt,stableHarness:false}).total,0);
  assert.equal(audit({...good,frozenCandidate:{...good.frozenCandidate,sha256:'other-freeze'}}).excluded[0].reason,'different-frozen-identity');
  assert.equal(audit({...good,frozenCandidate:{...good.frozenCandidate,commit:'other-commit'}}).total,0);
});

test('final CLI rejects a missing freeze before acquiring GPU or creating a run',async()=>{
  const {spawnSync}=await import('node:child_process');
  const fs=await import('node:fs');
  const {fileURLToPath}=await import('node:url');
  const {fingerprint}=require('../scripts/qa/launch/fingerprint.cjs');
  const root=fileURLToPath(new URL('..',import.meta.url)),id='guard-missing-freeze-'+process.pid;
  const run=spawnSync(process.execPath,['scripts/qa/launch/run-bot.cjs','--final','--candidate',fingerprint(root).sourceHash,
    '--count','1','--run-id',id],{cwd:root,encoding:'utf8'});
  assert.equal(run.status,1);
  assert.match(run.stderr,/--final requires --freeze/);
  assert.equal(fs.existsSync(root+'/artifacts/launch/bot/'+id),false);
});

test('production credit rejects DEV, incomplete browser hashes, changed and unpinned packages',()=>{
  const row={servedBuild,id:'r-0',runId:'r',seed:1,loop:0,kind:'final-candidate',sourceHash:'candidate',
    hardware:{webgl2:true,renderer:'NVIDIA GTX 1650 Ti'},completed:true,outcome:'over',creditEligible:true,
    errors:[],frames:10,renderedFrames:10,initial:{hull:3,shields:1,fuel:1,z:0,loop:0},sectors:[0],bossPhases:[]};
  const receipt={...packageReceipt,stableSource:true,sourceHash:'candidate',afterSourceHash:'candidate'};
  const audit=(r=row,v=receipt)=>auditEpisodes([r],new Map([['r',v]]),'candidate');
  assert.equal(audit().total,1);
  for(const proof of ['Vite DEV graph',{kind:'development-source'},{...servedBuild,browserFilesHashMatched:1},
    {...servedBuild,sourceHash:'other'},{...servedBuild,bridge:{...servedBuild.bridge,debuggerDetachedBeforePlay:false}}]){
    assert.equal(audit({...row,servedBuild:proof}).excluded[0].reason,'missing-or-invalid-production-proof');
  }
  for(const changed of [{...receipt,stablePackage:false},{...receipt,servedBuild:null},
    {...receipt,productionPackageAfter:{...productionPackage,manifestSHA256:'c'.repeat(64)}}]){
    assert.equal(audit(row,changed).excluded[0].reason,'unverified-or-changing-production-package');
  }
  const {productionCreditError}=require('../scripts/qa/launch/production-proof.cjs');
  assert.equal(productionCreditError(row,receipt,'candidate',{productionPackages:[]}), 'package-not-in-frozen-candidate');
  assert.equal(productionCreditError(row,receipt,'candidate',{productionPackages:[productionPackage]}),null);
});

test('final bot and player CLIs reject missing production packages before GPU reservation',async()=>{
  const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path');
  const {spawnSync}=await import('node:child_process'),{fileURLToPath}=await import('node:url');
  const {fingerprint,harnessFingerprint,sha256}=require('../scripts/qa/launch/fingerprint.cjs');
  const root=fileURLToPath(new URL('..',import.meta.url)),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'kz-freeze-guard-'));
  try{
    const source=fingerprint(root),freeze=path.join(tmp,'candidate.json');
    fs.writeFileSync(freeze,JSON.stringify({schema:'knotzaxxon.frozen-candidate.v1',sourceHash:source.sourceHash,
      harnessHash:harnessFingerprint(root).harnessHash,browserPilotHash:sha256(fs.readFileSync(path.join(root,'scripts/qa/launch/pilot-browser.js')))}));
    for(const [script,mode,id,directory] of [
      ['scripts/qa/launch/run-bot.cjs',['--final'],'guard-production-'+process.pid,'bot'],
      ['scripts/qa/live-sol-low/final-live.cjs',['--launch'],'final-live-guard-production-'+process.pid,'live-sol-low']]){
      const run=spawnSync(process.execPath,[script,...mode,'--candidate',source.sourceHash,'--freeze',freeze,'--run-id',id],{cwd:root,encoding:'utf8'});
      assert.equal(run.status,1);assert.match(run.stderr,/requires --production/);
      assert.equal(fs.existsSync(path.join(root,'artifacts/launch',directory,id)),false);
    }
  }finally{fs.rmSync(tmp,{recursive:true,force:true})}
});


test('comparison streaming or RNG fixtures cannot be relabelled as final campaign credit',()=>{
  const row={servedBuild,id:'r-0',runId:'r',seed:1,loop:0,kind:'final-candidate',sourceHash:'candidate',
    hardware:{webgl2:true,renderer:'NVIDIA GTX 1650 Ti'},completed:true,outcome:'over',creditEligible:true,
    errors:[],frames:10,renderedFrames:2,initial:{hull:3,shields:1,fuel:1,z:0,loop:0},sectors:[0],bossPhases:[]};
  const receipts=new Map([['r',{...packageReceipt,stableSource:true,sourceHash:'candidate',afterSourceHash:'candidate'}]]);
  for(const fixture of [{comparisonFixture:true},{deterministicStreaming:true}]){
    const result=auditEpisodes([{...row,...fixture}],receipts,'candidate');
    assert.equal(result.total,0);assert.equal(result.excluded[0].reason,'comparison-fixture');
  }
});
