const bands=[0,1,2,3,7,30];
function trialPlan(seedBase=2600001){
 if(!Number.isSafeInteger(seedBase)||seedBase<1||seedBase+29>0x7fffffff)throw Error('Invalid seed base');
 const cameras=['classic','modern','chase'],qualities=['low','medium','high','ultra'];
 const viewports=[[1280,800],[960,540],[844,390],[390,844],[1440,900]];
 return bands.flatMap((loop,b)=>Array.from({length:5},(_,n)=>{
  const [width,height]=viewports[n%viewports.length];
  return {id:`live-l${loop}-${String(n+1).padStart(2,'0')}`,seed:seedBase+b*5+n,loop,
   fixture:'seeded-loop-start',camera:cameras[n%3],quality:qualities[(n+b)%4],
   profile:n===3?'gamepad':n===4?'analog':'keyboard',width,height,dpr:1,
   inputClaim:n===3?'synthetic standard gamepad':n===4?'synthetic touch intent':'synthetic keyboard events',
   operator:'primary developed bot; Terra Medium visual observer',maxSeconds:900,renderEvery:1};
 }));
}
module.exports={bands,trialPlan};
if(require.main===module)process.stdout.write(JSON.stringify({schemaVersion:2,credited:0,kind:'unexecuted-plan',bands,plan:trialPlan(Number(process.argv[2]||2600001))},null,2)+'\n');
