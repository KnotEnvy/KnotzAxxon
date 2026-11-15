// Credit rules reject pilots, changing candidates, software renderers and duplicates.
function auditEpisodes(rows,receipts,candidate,expectedHarness=null) {
  const credited=[],excluded=[],seen=new Set();
  for(const row of rows){
    const receipt=receipts.get(row.runId??row.id.replace(/-\d+$/,''));
    let reason=null;
    if(row.kind!=='final-candidate')reason='development-pilot';
    else if(!receipt?.stableSource||receipt.sourceHash!==candidate||receipt.afterSourceHash!==candidate)reason='unverified-or-changing-source';
    else if(row.sourceHash!==candidate)reason='different-candidate';
    else if(expectedHarness&&row.harnessHash!==expectedHarness)reason='different-harness';
    else if(!row.hardware?.webgl2||!row.hardware?.renderer||/swiftshader|llvmpipe|software|basic render/i.test(row.hardware.renderer))reason='no-hardware-proof';
    else if(!row.completed||!['over','victory'].includes(row.outcome))reason='not-completed';
    else if(!row.creditEligible||row.errors?.length)reason='runtime-errors-or-ineligible';
    else if(!(row.renderedFrames>0)||!(row.frames>=row.renderedFrames))reason='no-rendered-frames';
    else if(!row.initial||row.initial.hull!==3||row.initial.shields!==1||row.initial.fuel!==1||row.initial.z!==0||row.initial.loop!==row.loop)reason='invalid-initial-state';
    else if(seen.has(`${row.seed}:${row.loop}`))reason='duplicate-seed-and-loop';
    if(reason)excluded.push({id:row.id,reason});
    else{seen.add(`${row.seed}:${row.loop}`);credited.push(row);}
  }
  const perBand=Object.fromEntries([0,1,2,3,7,30].map(loop=>[loop,credited.filter(r=>r.loop===loop).length]));
  return {candidate,total:credited.length,perBand,excluded,creditedIds:credited.map(r=>r.id),
    sectors:[...new Set(credited.flatMap(r=>r.sectors))].sort(),
    bossPhases:[...new Set(credited.flatMap(r=>r.bossPhases))].sort(),
    victories:credited.filter(r=>r.outcome==='victory').length};
}
module.exports={auditEpisodes};
