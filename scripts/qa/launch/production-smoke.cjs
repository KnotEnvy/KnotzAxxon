const fs=require('node:fs'),path=require('node:path');
const {spawn,execFileSync}=require('node:child_process');
const {readPackage,serveProduction}=require('./production-bundle.cjs');
const {acquireGPU}=require('./gpu-lease.cjs');
const root=path.resolve(__dirname,'../../..'),directory=path.resolve(process.argv[2]||'');
if(!process.argv[2])throw Error('Pass an existing immutable production package');
const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json')));
const win=p=>execFileSync('wslpath',['-w',p],{encoding:'utf8'}).trim();
let lease,served,child;
async function cleanup(){if(child?.exitCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r))}if(served)await new Promise(r=>served.server.close(r));lease?.release()}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>cleanup().finally(()=>process.exit(130)));
(async()=>{
 lease=acquireGPU('/home/knotzuni/code/KnotzAxxon/asset-work/public-launch/gpu-reservation.json','Primary production attachment smoke');
 const bundle=readPackage(directory,manifest.source.sourceHash);served=await serveProduction(bundle);
 const out=path.join(root,'artifacts/launch/production-attachment',new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(out,{recursive:true});
 const config={url:served.url,package:win(directory),sourceHash:manifest.source.sourceHash,out:win(out),chrome:'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',playwright:win(path.join(root,'node_modules/playwright'))};
 const file=path.join(out,'config.json');fs.writeFileSync(file,JSON.stringify(config,null,2));
 console.log('Noncredited production probe '+out);
 child=spawn('node.exe',[win(path.join(__dirname,'windows-production-smoke.cjs')),win(file)],{stdio:'inherit'});
 const code=await new Promise((r,j)=>{child.once('error',j);child.once('exit',r)});
 const after=readPackage(directory,manifest.source.sourceHash);
 fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify({kind:'noncredited-production-attachment-probe',sourceHash:manifest.source.sourceHash,manifestSHA256:bundle.manifestSHA256,unchangedPackage:after.manifestSHA256===bundle.manifestSHA256,requests:served.requests,exitCode:code,creditEligible:false},null,2)+'\n');
 if(code!==0)process.exitCode=1;
})().catch(error=>{console.error(error.stack);process.exitCode=1}).finally(cleanup);
