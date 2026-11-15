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
