// Validate every individual score and candidate identity. No averaging or score editing.
const expected = {luna:'codex/gpt-6-luna', terra:'codex/gpt-6.1-terra', haiku:'claudeAgent/claude-haiku-5-5'};
function judgeGate(round, candidate) {
  const failures = [], scores = [];
  if (round.candidate?.sourceHash !== candidate.sourceHash || round.candidate?.commit !== candidate.commit)
    failures.push('Round is not on the frozen candidate');
  const judges = round.judges ?? [];
  if (judges.length !== 3 || new Set(judges.map(j=>j.judge)).size !== 3)
    failures.push('Exactly three distinct independent judges required');
  for (const [name, model] of Object.entries(expected)) {
    const judge = judges.find(j=>j.judge===name);
    if (!judge) { failures.push(`Missing ${name}`); continue; }
    if (judge.model !== model) failures.push(`${name}: unexpected model`);
    if (!judge.responseFile || !/^[a-f0-9]{64}$/.test(judge.responseSHA256 ?? ''))
      failures.push(`${name}: original response receipt required`);
    if (judge.lenses?.length !== 7 || new Set(judge.lenses.map(l=>l.id)).size !== 7)
      failures.push(`${name}: all seven distinct lenses required`);
    for (let id=1; id<=7; id++) {
      const lens = judge.lenses?.find(l=>l.id===id);
      if (!lens) { failures.push(`${name}: missing lens${id}`); continue; }
      if (!Number.isFinite(lens.score) || lens.score<0 || lens.score>10)
        failures.push(`${name}/lens${id}: invalid score`);
      else if (lens.score<9) failures.push(`${name}/lens${id}: ${lens.score} below9`);
      if (!lens.reason?.trim() || !lens.confidence?.trim() || !Array.isArray(lens.evidence) || !lens.evidence.length ||
          !Array.isArray(lens.limits) || !Array.isArray(lens.findings))
        failures.push(`${name}/lens${id}: reason, evidence, confidence, limits and findings required`);
      scores.push({judge:name,lens:id,score:lens.score});
    }
  }
  return {passed:failures.length===0, candidate, scores, failures,
    note:'This score gate alone does not establish gameplay counts, package validity or account publication'};
}
module.exports = {judgeGate};
if (require.main===module) {
  const fs=require('node:fs'),path=require('node:path'),{sha256}=require('./fingerprint.cjs');
  const root=path.resolve(__dirname,'../../..');
  const [candidateFile,roundFile]=process.argv.slice(2);
  if(!candidateFile||!roundFile)throw Error('Expected candidate JSON and round JSON');
  const candidate=JSON.parse(fs.readFileSync(candidateFile)),round=JSON.parse(fs.readFileSync(roundFile));
  const result=judgeGate(round,{commit:candidate.commit,sourceHash:candidate.sourceHash});
  for(const judge of round.judges??[]){
    const file=path.resolve(root,judge.responseFile??'MISSING');
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||sha256(fs.readFileSync(file))!==judge.responseSHA256)
      result.failures.push(`${judge.judge}: missing or changed original response`);
  }
  result.passed=result.failures.length===0;
  console.log(JSON.stringify(result,null,2));
  if(!result.passed)process.exitCode=1;
}
