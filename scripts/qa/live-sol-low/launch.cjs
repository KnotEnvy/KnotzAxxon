// Linux entry point; caller starts a localhost Vite server separately.
const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs');const path=require('node:path');
const {acquireGPU}=require('../launch/gpu-lease.cjs');
const root=path.resolve(__dirname,'../../..');
const out=path.join(root,'artifacts/launch/live-sol-low');
const lease=acquireGPU('/home/knotzuni/code/KnotzAxxon/asset-work/public-launch/gpu-reservation.json','Sol LOW visual pilot');
const win=p=>execFileSync('wslpath',['-w',p],{encoding:'utf8'}).trim();
try {
 fs.mkdirSync(out,{recursive:true});
 fs.appendFileSync(path.join(out,'leases.jsonl'),JSON.stringify({...lease,ownerPID:lease.pid})+'\n');
 const env={...process.env,KZ_PLAYWRIGHT_PATH:win('/home/knotzuni/code/KnotzAxxon/asset-work/studio-opus-code/tools/node_modules/playwright'),KZ_CHROME_EXE:'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',KZ_PILOT_OUT:win(out),KZ_PILOT_URL:process.env.KZ_PILOT_URL||'http://127.0.0.1:5197'};
 // Only these non-secret values need to cross WSL. Chrome debugging uses pipes.
 env.WSLENV='KZ_PLAYWRIGHT_PATH:KZ_CHROME_EXE:KZ_PILOT_OUT:KZ_PILOT_URL';
 const child=spawn('node.exe',[win(path.join(__dirname,'pilot.cjs'))],{env,stdio:'inherit'});
 child.on('error',e=>{console.error(e);lease.release();process.exitCode=1});
 child.on('exit',code=>{lease.release();process.exitCode=code??1});
} catch(e){lease.release();throw e}
