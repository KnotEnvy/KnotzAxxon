import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {judgeGate}=createRequire(import.meta.url)('../scripts/qa/launch/judge-gate.cjs');
const candidate={commit:'frozen-commit',sourceHash:'frozen-source'};
function fixture(){return {candidate,judges:[['luna','codex/gpt-6-luna'],['terra','codex/gpt-6.1-terra'],['haiku','claudeAgent/claude-haiku-5-5']].map(([judge,model])=>({judge,model,responseFile:judge+'.md',responseSHA256:'a'.repeat(64),
  lenses:Array.from({length:7},(_,i)=>({id:i+1,score:9,reason:'Concrete observed evidence',evidence:['evidence/path'],confidence:'medium',limits:['No physical phone'],findings:[]}))}))};}
test('one subthreshold score fails even when the other twenty scores are10',()=>{
  const round=fixture();round.judges.forEach(j=>j.lenses.forEach(l=>l.score=10));
  round.judges[2].lenses[6].score=8.9;
  const result=judgeGate(round,candidate);assert.equal(result.passed,false);
  assert.deepEqual(result.failures,['haiku/lens7: 8.9 below9']);
  round.judges[2].lenses[6].score=9;assert.equal(judgeGate(round,candidate).passed,true);
});
test('scores cannot be pooled across candidates, duplicate judges or omitted lenses',()=>{
  const wrong=fixture();wrong.candidate={...candidate,sourceHash:'another-source'};
  assert.equal(judgeGate(wrong,candidate).passed,false);
  const duplicate=fixture();duplicate.judges[2]=duplicate.judges[1];
  assert.equal(judgeGate(duplicate,candidate).passed,false);
  const incomplete=fixture();incomplete.judges[0].lenses.pop();
  assert.equal(judgeGate(incomplete,candidate).passed,false);
  const ungrounded=fixture();ungrounded.judges[1].lenses[0].evidence=[];
  assert.equal(judgeGate(ungrounded,candidate).passed,false);
});
