function auditViewingRecords(trial){
  const reasons=[];
  const reject=reason=>{if(!reasons.includes(reason))reasons.push(reason)};
  const observations = new Map(), viewed = [], acknowledged = new Set();
  for (const observation of trial.observations ?? []) {
    if (observations.has(observation.id)) reject('duplicate capture identity');
    observations.set(observation.id, observation);
  }
  for (const note of trial.notes ?? []) {
    const observation = observations.get(note.observationId);
    if (!observation || observation.sha256 !== note.sourceScreenshotSha256 || note.trialId !== trial.trialId ||
      !note.facts?.length || !note.observer || acknowledged.has(note.observationId)) {
      reject('invalid or duplicate viewed-frame acknowledgment'); continue;
    }
    acknowledged.add(note.observationId);
    const capture = Date.parse(observation.captureCompletedAt ?? observation.completedAt), view = Date.parse(note.viewedAt), accepted = Date.parse(note.noteAcceptedAt);
    const ageMs = view - capture;
    if (![capture, view, accepted].every(Number.isFinite) || ageMs < 0 || view > accepted) {
      reject('invalid viewed-frame timestamp'); continue;
    }
    if (ageMs > 10000) reject('actually viewed frame age >10 seconds');
    if (accepted - capture > 10000) reject('viewing note acceptance age >10 seconds');
    viewed.push({id: observation.id, capture, view, accepted, ageMs, initial: observation.reason === 'initial', done: observation.batch?.done === true});
  }
  viewed.sort((a, b) => a.capture - b.capture);
  if (viewed.length < 3 || !viewed.some(o => o.initial) || !viewed.some(o => !o.initial && !o.done) || !viewed.some(o => o.done)) reject('missing actually viewed start/during/terminal frames');
  for (let i = 1; i < viewed.length; i++) {
    if (!viewed[i - 1].done && viewed[i].capture - viewed[i - 1].capture > 10000) reject('gap between actually viewed captures >10 seconds');
  }
  const byView = [...viewed].sort((a, b) => a.view - b.view);
  for (let i = 1; i < byView.length; i++) {
    if (!byView[i - 1].done && byView[i].view - byView[i - 1].view > 10000) reject('gap between actual viewing acknowledgments >10 seconds');
  }
  const byAcceptance=[...viewed].sort((a,b)=>a.accepted-b.accepted);
  for(let i=1;i<byAcceptance.length;i++)if(!byAcceptance[i-1].done&&byAcceptance[i].accepted-byAcceptance[i-1].accepted>10000)reject('gap between conservative viewing acknowledgments >10 seconds');
  if(trial.startedAt){
    const start=Date.parse(trial.startedAt);
    if(!Number.isFinite(start)||!byAcceptance.length||byAcceptance[0].accepted-start>10000)reject('initial viewing acknowledgment gap >10 seconds');
  }
  return {viewed,reasons};
}
const {productionCreditError}=require('./production-proof.cjs');
// Independent record audit. Captures alone never establish agent observation.
function auditLiveTrial(trial, candidate, receipt=null, expectedFreeze=null) {
  const reasons = [...(trial.blockingReasons ?? [])];
  const reject = reason => { if (!reasons.includes(reason)) reasons.push(reason); };
  if (trial.pilotMode !== false || trial.kind !== 'final-candidate-live-observation') reject('development pilot or unknown evidence kind');
  for (const hash of [trial.candidate, trial.sourceBefore?.sourceHash, trial.sourceAfter?.sourceHash]) {
    if (hash !== candidate) reject('source mismatch');
  }
  const result = trial.result ?? {}, initial = trial.initial?.initial ?? {};
  if (!result.completed || !['over', 'victory'].includes(result.outcome)) reject('incomplete outcome');
  if (result.mode !== 'realtime' || !(result.frames > 0) || result.renderedFrames !== result.frames) reject('realtime/render count mismatch');
  if (initial.hull !== 3 || initial.shields !== 1 || initial.fuel !== 1 || initial.z !== 0 || initial.loop !== trial.spec?.loop) reject('nonstandard initial resources/fixture');
  if (!trial.hardware?.webgl2 || !trial.hardware?.renderer || /swiftshader|llvmpipe|software|basic render/i.test(trial.hardware.renderer)) reject('no hardware proof');
  if (trial.pageErrors?.length) reject('page errors');
  if(!receipt?.stableSource||receipt.candidate!==candidate||receipt.sourceAfter?.sourceHash!==candidate)reject('unverified closed-run source');
  const productionError=productionCreditError(trial,receipt,candidate,expectedFreeze);
  if(productionError)reject(productionError);
  if(!expectedFreeze)reject('missing frozen candidate audit identity');
  else if(trial.frozenCandidate?.sha256!==expectedFreeze.sha256||trial.frozenCandidate?.commit!==expectedFreeze.commit||receipt?.frozenCandidate?.sha256!==expectedFreeze.sha256)reject('different frozen identity');
  if(!receipt?.stableHarness||receipt.harnessHash!==expectedFreeze?.harnessHash||receipt.afterHarnessHash!==expectedFreeze?.harnessHash||trial.harnessTreeHash!==expectedFreeze?.harnessHash)reject('unverified or changing harness');
  const viewing=auditViewingRecords(trial);
  for(const reason of viewing.reasons)reject(reason);
  const viewed=viewing.viewed;
  return {trialId: trial.trialId, candidate, recordChecksPassed: reasons.length === 0, credited: false,
    note: 'Record consistency only; primary must inspect original images, truthful viewing facts, source/harness identity and per-band uniqueness before credit.', viewed, reasons};
}
module.exports = {auditLiveTrial,auditViewingRecords};
if (require.main === module) {
  const fs=require('node:fs'),path=require('node:path');
  const {sha256}=require('./fingerprint.cjs');
  if(process.argv.length!==4)throw Error('Expected <trials.jsonl> <frozen candidate.json>');
  const bytes=fs.readFileSync(process.argv[3]),candidate=JSON.parse(bytes);
  const receipt=JSON.parse(fs.readFileSync(path.join(path.dirname(process.argv[2]),'receipt.json')));
  const frozen={...candidate,sha256:sha256(bytes)};
  const rows=fs.readFileSync(process.argv[2],'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  console.log(JSON.stringify(rows.map(row=>auditLiveTrial(row,candidate.sourceHash,receipt,frozen)),null,2));
}
