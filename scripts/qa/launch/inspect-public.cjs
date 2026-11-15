// Actual browser inspection of the public listing, live game entry and platform specs.
const fs=require('node:fs'),path=require('node:path');
const {spawn,execFileSync}=require('node:child_process');
const {acquireGPU}=require('./gpu-lease.cjs');
const root=path.resolve(__dirname,'../../..');
const out=path.join(root,'artifacts/launch/public-inspection',new Date().toISOString().replace(/[:.]/g,'-'));
const win=p=>execFileSync('wslpath',['-w',p],{encoding:'utf8'}).trim();
const lease=acquireGPU('/home/knotzuni/code/KnotzAxxon/asset-work/public-launch/gpu-reservation.json','Primary public listing browser inspection');
fs.mkdirSync(out,{recursive:true});
const config={out:win(out),chrome:'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  playwright:win('/home/knotzuni/code/KnotzAxxon/asset-work/studio-opus-code/tools/node_modules/playwright')};
const file=path.join(out,'config.json');fs.writeFileSync(file,JSON.stringify(config,null,2));
const child=spawn('node.exe',[win(path.join(__dirname,'windows-public.cjs')),win(file)],{stdio:'inherit'});
child.once('error',e=>{console.error(e);lease.release();process.exitCode=1});
child.once('exit',code=>{lease.release();process.exitCode=code??1});
