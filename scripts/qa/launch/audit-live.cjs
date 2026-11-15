// Independent record audit. Captures alone never establish agent observation.
function auditLiveTrial(trial, candidate) {
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
    const capture = Date.parse(observation.completedAt), view = Date.parse(note.viewedAt), accepted = Date.parse(note.noteAcceptedAt);
    const ageMs = view - capture;
    if (![capture, view, accepted].every(Number.isFinite) || ageMs < 0 || view > accepted) {
      reject('invalid viewed-frame timestamp'); continue;
    }
    if (ageMs > 10000) reject('actually viewed frame age >10 seconds');
    viewed.push({id: observation.id, capture, view, ageMs, initial: observation.reason === 'initial', done: observation.batch?.done === true});
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
  return {trialId: trial.trialId, candidate, recordChecksPassed: reasons.length === 0, credited: false,
    note: 'Record consistency only; primary must inspect original images, truthful viewing facts, source/harness identity and per-band uniqueness before credit.', viewed, reasons};
}
module.exports = {auditLiveTrial};
if (require.main === module) {
  const fs = require('node:fs');
  if (process.argv.length !== 4) throw Error('Expected <trials.jsonl> <candidate sourceHash>');
  const rows = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  console.log(JSON.stringify(rows.map(row => auditLiveTrial(row, process.argv[3])), null, 2));
}
