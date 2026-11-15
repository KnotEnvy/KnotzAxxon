// Source QA using a Linux localhost Vite server and Windows hardware browser.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {spawn,execFileSync}=require('node:child_process');
const {acquireGPU}=require('./gpu-lease.cjs');
const {fingerprint}=require('./fingerprint.cjs');
const root=path.resolve(__dirname,'../../..'),name=process.argv[2];
const scriptByName={'audio-render':'audio-render','audio-lifecycle':'audio-lifecycle','context-recovery':'context-recovery',
  'models-default':'imported-models','models-legacy':'imported-models','ui-nav':'opus-ui-nav'};
if(!Object.hasOwn(scriptByName,name))throw Error('Expected '+Object.keys(scriptByName).join(', '));
const out=path.join(root,'artifacts/launch',name.startsWith('audio-')?'audio':'functional',name+'-'+new Date().toISOString().replace(/[:.]/g,'-'));
const win=p=>execFileSync('wslpath',['-w',p],{encoding:'utf8'}).trim();
let lease,server,child,closing=false;
async function stop(p){if(p?.pid&&p.exitCode===null&&p.signalCode===null&&p.kill('SIGTERM'))await new Promise(r=>p.once('exit',r))}
async function cleanup(){if(closing)return;closing=true;await stop(child);await stop(server);lease?.release()}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>cleanup().finally(()=>process.exit(130)));
(async()=>{
  lease=acquireGPU('/home/knotzuni/code/KnotzAxxon/asset-work/public-launch/gpu-reservation.json','Primary '+name);
  fs.mkdirSync(out,{recursive:true});const before=fingerprint(root);
  const listener=net.createServer();await new Promise((r,j)=>{listener.once('error',j);listener.listen(0,'127.0.0.1',r)});
  const port=listener.address().port;await new Promise(r=>listener.close(r));
  server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});
  const url=`http://127.0.0.1:${port}`;let ready=false;
  for(let i=0;i<100;i++){try{ready=(await fetch(url)).ok}catch{}if(ready)break;await new Promise(r=>setTimeout(r,100));}
  if(!ready)throw Error('Owned QA server failed to start');
  const config={source:before,env:{KZ_TEST_URL:url,KZ_OUT:win(out),
    KZ_PLAYWRIGHT_PATH:win('/home/knotzuni/code/KnotzAxxon/asset-work/studio-opus-code/tools/node_modules/playwright'),
    KZ_CHROME_EXE:'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    KZ_MODEL_LEGACY:name==='models-legacy'?'1':'0'},
    script:win(path.join(root,'scripts/qa',scriptByName[name]+'.cjs'))};
  const file=path.join(out,'config.json');fs.writeFileSync(file,JSON.stringify(config,null,2));
  child=spawn('node.exe',[win(path.join(__dirname,'windows-source-qa.cjs')),win(file)],{stdio:'inherit'});
  const code=await new Promise((r,j)=>{child.once('error',j);child.once('exit',r)});
  const after=fingerprint(root);fs.writeFileSync(path.join(out,'source-receipt.json'),JSON.stringify({before,after,stableSource:before.sourceHash===after.sourceHash,exitCode:code},null,2));
  if(code!==0||before.sourceHash!==after.sourceHash)process.exitCode=1;
})().catch(e=>{console.error(e.stack);process.exitCode=1}).finally(cleanup);
