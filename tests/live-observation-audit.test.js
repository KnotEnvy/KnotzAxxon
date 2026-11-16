import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {auditLiveTrial,auditViewingRecords}=createRequire(import.meta.url)('../scripts/qa/launch/audit-live.cjs');
const pkg={sourceHash:'candidate',manifestSHA256:'a'.repeat(64),fileCount:2,entry:'assets/game.js',entrySHA256:'b'.repeat(64)};
const servedBuild={kind:'hash-verified-production',...pkg,browserFilesHashMatched:2,bridge:{debugApiAbsentBeforeQA:true,shippedBytesUnmodified:true,debuggerDetachedBeforePlay:true,entrySHA256:pkg.entrySHA256}};
const frozen={sha256:'freeze',commit:'commit',harnessHash:'full-harness',productionPackages:[pkg]};
const receipt={servedBuild,stablePackage:true,productionPackageBefore:pkg,productionPackageAfter:pkg,stableHarness:true,harnessHash:frozen.harnessHash,afterHarnessHash:frozen.harnessHash,frozenCandidate:frozen,stableSource:true,candidate:'candidate',sourceAfter:{sourceHash:'candidate'}};
const audit=row=>auditLiveTrial(row,'candidate',receipt,frozen);
// Synthetic integrity fixtures, never gameplay or actual viewing evidence.
const time = seconds => new Date(Date.UTC(2026,10,15)+seconds*1000).toISOString();
function fixture(times=[0,4,8]) {
  const observations=times.map((t,i)=>({id:String(i),sha256:`image-${i}`,reason:i===0?'initial':'observe',completedAt:time(t),batch:{done:i===times.length-1}}));
  return {servedBuild,frozenCandidate:frozen,harnessTreeHash:frozen.harnessHash,trialId:'synthetic',kind:'final-candidate-live-observation',pilotMode:false,candidate:'candidate',sourceBefore:{sourceHash:'candidate'},sourceAfter:{sourceHash:'candidate'},
    hardware:{webgl2:true,renderer:'NVIDIA hardware fixture'},spec:{loop:0},initial:{initial:{hull:3,shields:1,fuel:1,z:0,loop:0}},
    result:{completed:true,outcome:'over',mode:'realtime',frames:480,renderedFrames:480},pageErrors:[],blockingReasons:[],observations,
    notes:observations.map((o,i)=>({trialId:'synthetic',observationId:o.id,sourceScreenshotSha256:o.sha256,viewedAt:time(times[i]+1),noteAcceptedAt:time(times[i]+1),observer:'synthetic test observer',facts:['synthetic fact']}))};
}
test('consistent acknowledged start/during/terminal records still grant no automatic episode credit',()=>{
  const result=audit(fixture());assert.equal(result.recordChecksPassed,true);assert.equal(result.credited,false);
});
test('unviewed frequent captures cannot hide a gap in actually viewed frames',()=>{
  const row=fixture([0,4,8,12,16,20]);row.notes=row.notes.filter(n=>['0','1','5'].includes(n.observationId));
  const result=audit(row);assert.equal(result.recordChecksPassed,false);
  assert.ok(result.reasons.includes('gap between actually viewed captures >10 seconds'));
});
test('fresh frequent capture spacing cannot make stale viewing notes compliant',()=>{
  const row=fixture();row.notes.forEach((n,i)=>{n.viewedAt=n.noteAcceptedAt=time(20+i*4)});
  assert.ok(audit(row).reasons.includes('actually viewed frame age >10 seconds'));
});
test('mismatched image acknowledgments, pilot provenance and candidate drift fail closed',()=>{
  const row=fixture();row.notes[1].sourceScreenshotSha256='another image';row.pilotMode=true;row.sourceAfter.sourceHash='drift';
  const result=audit(row);assert.equal(result.recordChecksPassed,false);
  for(const reason of ['invalid or duplicate viewed-frame acknowledgment','development pilot or unknown evidence kind','source mismatch'])assert.ok(result.reasons.includes(reason));
});

test('conservative note acceptance detects stale acknowledgments even with fresh explicit view times',()=>{
  const row=fixture();row.notes.forEach((n,i)=>n.noteAcceptedAt=time(20+i*4));
  assert(audit(row).reasons.includes('viewing note acceptance age >10 seconds'));
});
test('record audit requires a stable production package and candidate-bound full harness',()=>{
  assert.equal(auditLiveTrial(fixture(),'candidate').recordChecksPassed,false);
  const row=fixture();row.harnessTreeHash='different';
  assert(audit(row).reasons.includes('unverified or changing harness'));
  row.harnessTreeHash=frozen.harnessHash;row.servedBuild={kind:'development-source'};
  assert(audit(row).reasons.includes('missing-or-invalid-production-proof'));
});
test('runtime viewing checks are shared with offline audit and never count unviewed captures',()=>{
  const row=fixture([0,4,8,12,16,20]);row.notes=row.notes.filter(n=>['0','1','5'].includes(n.observationId));
  assert(auditViewingRecords(row).reasons.includes('gap between actually viewed captures >10 seconds'));
});
