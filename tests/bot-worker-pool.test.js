import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {runWorkerPool}=createRequire(import.meta.url)('../scripts/qa/launch/worker-pool.cjs');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}};

test('browser owners run concurrently and claim each episode once with sequential local state',async()=>{
 const opened=deferred(),seen=[],busy=new Set();let owners=0,peak=0;
 const output=await runWorkerPool({count:19,workers:4,worker:async(id,claim)=>{
  busy.add(id);peak=Math.max(peak,busy.size);if(++owners===4)opened.resolve();
  await opened.promise;let previous=-1;
  for(let index;(index=claim())!==null;){
   assert(index>previous);previous=index;seen.push(index);
   await new Promise(resolve=>setImmediate(resolve));
  }
  busy.delete(id);return id;
 }});
 assert.equal(peak,4);assert.equal(busy.size,0);assert.deepEqual(output,[0,1,2,3]);
 assert.deepEqual(seen.sort((a,b)=>a-b),Array.from({length:19},(_,i)=>i));
});

test('a failed owner closes admission immediately and rejection waits for every owner cleanup',async()=>{
 const active=deferred(),faultSeen=deferred(),allowClose=deferred(),closed=[],fault=Error('browser fault');
 let settled=false;
 const running=runWorkerPool({count:100,workers:2,worker:async(id,claim,stopAdmission)=>{
  assert.equal(claim(),id);if(id===1)active.resolve();
  try{
   if(id===0){await active.promise;stopAdmission();faultSeen.resolve();throw fault}
   await faultSeen.promise;assert.equal(claim(),null,'active owner must not admit another episode');
  }finally{await allowClose.promise;closed.push(id)}
 }});
 const checked=assert.rejects(running,error=>error instanceof AggregateError&&error.errors[0]===fault);
 running.then(()=>{settled=true},()=>{settled=true});
 await faultSeen.promise;await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,false);
 allowClose.resolve();await checked;assert.deepEqual(closed.sort(),[0,1]);
});

test('pool bounds reject invalid requests before opening any browser and avoid idle owners',async()=>{
 for(const workers of [0,-1,1.1,5,NaN])await assert.rejects(runWorkerPool({count:1,workers,worker(){assert.fail()}}),/Invalid bot worker/);
 let opened=0;await runWorkerPool({count:1,workers:4,worker:async()=>{opened++}});assert.equal(opened,1);
});
