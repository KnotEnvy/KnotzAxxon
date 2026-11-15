const allocations=[{loop:0,count:180},{loop:1,count:180},{loop:2,count:180},
  {loop:3,count:180},{loop:7,count:180},{loop:30,count:100}];
function campaignPlan(seed=170001) {
  const plan=[];
  for(let ordinal=0;ordinal<180;ordinal++)for(const band of allocations){
    if(ordinal>=band.count)continue;
    const profile=['analog','keyboard','gamepad'][ordinal%3];
    const viewport=profile==='analog'?(ordinal%2?{width:844,height:390}:{width:390,height:844}):{width:1280,height:720};
    plan.push({seed:seed+plan.length,loop:band.loop,profile,
      camera:['classic','modern','chase'][Math.floor(ordinal/3)%3],
      quality:['low','medium','high','ultra'][Math.floor(ordinal/9)%4],...viewport});
  }
  return plan;
}
module.exports={allocations,campaignPlan};
