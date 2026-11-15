const fs=require('node:fs'),path=require('node:path');
const {auditEpisodes}=require('./credit.cjs');
const root=path.resolve(__dirname,'../../../artifacts/launch/bot');
const candidate=process.argv[2]||'NO-FROZEN-CANDIDATE';
const readLines=file=>fs.existsSync(file)?fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
const rows=[],receipts=new Map(),runs=[];
if(fs.existsSync(root))for(const name of fs.readdirSync(root).sort()){
  const dir=path.join(root,name);if(!fs.statSync(dir).isDirectory())continue;
  const receiptFile=path.join(dir,'receipt.json');
  const receipt=fs.existsSync(receiptFile)?JSON.parse(fs.readFileSync(receiptFile,'utf8')):null;
  if(receipt)receipts.set(name,receipt);
  const episodes=readLines(path.join(dir,'episodes.jsonl'));rows.push(...episodes);
  runs.push({name,receipt,completed:episodes.filter(r=>r.completed).length,
    failures:readLines(path.join(dir,'failures.jsonl')).length,
    progressionDiagnostics:readLines(path.join(dir,'progression.jsonl')).map(r=>({id:r.id,loop:r.loop,
      rawSeconds:r.rawSeconds,completed:r.completed,outcome:r.outcome,renderedFrames:r.renderedFrames,creditEligible:r.creditEligible}))});
}
const pilots=rows.filter(r=>r.kind==='development-pilot'&&r.completed);
const report={generatedAt:new Date().toISOString(),final:auditEpisodes(rows,receipts,candidate),
  developmentPilots:{completed:pilots.length,uniqueSeedLoops:new Set(pilots.map(r=>`${r.seed}:${r.loop}`)).size,
    victories:pilots.filter(r=>r.outcome==='victory').length,renderedFrames:pilots.reduce((n,r)=>n+r.renderedFrames,0),
    note:'Different harness/source checkpoints; never pooled as final candidate evidence or a balance win rate.'},runs};
process.stdout.write(JSON.stringify(report,null,2)+'\n');
