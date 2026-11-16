// A bounded pool of independent browser owners. Claiming is synchronous in the
// parent Node process; one worker never has two episodes in flight. A failure
// closes admission, and all owners finish their finally blocks before rejection.
async function runWorkerPool({count,workers,worker}) {
  if(!Number.isInteger(count)||count<1||!Number.isInteger(workers)||workers<1||workers>4)
    throw Error('Invalid bot worker count (1–4 required)');
  let cursor=0,failed=false;
  const claim=()=>failed||cursor>=count?null:cursor++;
  const results=await Promise.allSettled(Array.from({length:Math.min(count,workers)},async(_,id)=>{
    try{return await worker(id,claim,()=>{failed=true})}catch(error){failed=true;throw error}
  }));
  const errors=results.filter(result=>result.status==='rejected').map(result=>result.reason);
  if(errors.length)throw new AggregateError(errors,'Bot worker failed; admission stopped and all owners closed');
  return results.map(result=>result.value);
}
module.exports={runWorkerPool};
