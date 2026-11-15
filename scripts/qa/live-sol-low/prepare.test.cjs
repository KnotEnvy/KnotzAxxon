const assert=require('node:assert/strict');
const {trialPlan,bands}=require('./trial-plan.cjs');
const plan=trialPlan();
assert.equal(plan.length,60);assert.equal(new Set(plan.map(p=>p.seed)).size,60);
assert.equal(new Set(plan.map(p=>p.id)).size,60);
assert.deepEqual(plan,trialPlan());
for(const loop of bands){const rows=plan.filter(p=>p.loop===loop);assert.equal(rows.length,10);
 assert.equal(new Set(rows.map(p=>p.camera)).size,3);assert.equal(new Set(rows.map(p=>p.quality)).size,4);
 assert(rows.some(p=>p.width<p.height));assert(rows.some(p=>p.width>p.height));
 assert(rows.every(p=>p.fixture==='seeded-loop-start'&&p.renderEvery===1));
}
for(const bad of [-1,1.5,0,0x7fffffff])assert.throws(()=>trialPlan(bad));
console.log('CPU plan checks passed: 60 unique seeds, 10 per band, 3 rigs/4 qualities and mixed viewports per band. No trials executed.');

const {assertMode,assertRow}=require('./mode-guard.cjs');
assert.doesNotThrow(()=>assertMode(true,'development-live-pilot','pilot-live-test'));
assert.doesNotThrow(()=>assertMode(false,'final-candidate-live-observation','final-live-test'));
assert.throws(()=>assertMode(true,'final-candidate-live-observation','final-live-test'));
assert.throws(()=>assertMode(false,'development-live-pilot','pilot-live-test'));
assert.throws(()=>assertRow(true,{id:'live-l0-01',seed:170001}));
assert.throws(()=>assertRow(true,{id:'pilot-live-test',seed:2600001}));
assert.throws(()=>assertRow(false,{id:'pilot-live-test',seed:170001}));
console.log('Pilot/final run identity and row guards pass positive/negative CPU checks.');
