import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {auditEpisodes}=require('../scripts/qa/launch/credit.cjs');
const {campaignPlan}=require('../scripts/qa/launch/plan.cjs');
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
  const good={id:'r-0',runId:'r',seed:42,loop:0,kind:'final-candidate',sourceHash:'candidate',
    hardware:{webgl2:true,renderer:'ANGLE (NVIDIA GeForce GTX 1650 Ti D3D11)'},
    completed:true,outcome:'over',creditEligible:true,errors:[],frames:6000,renderedFrames:500,
    initial:{hull:3,shields:1,fuel:1,z:0,loop:0},sectors:[0,1],bossPhases:[]};
  const receipts=new Map([['r',{stableSource:true,sourceHash:'candidate',afterSourceHash:'candidate'}],
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
