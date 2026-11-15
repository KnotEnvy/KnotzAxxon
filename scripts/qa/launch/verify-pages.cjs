// Verify the existing Pages production smoke through the actual Windows hardware browser.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');
const {acquireGPU}=require('./gpu-lease.cjs'),{sha256}=require('./fingerprint.cjs');
const root=path.resolve(__dirname,'../../..'),base=path.resolve(process.argv[2]||'');
if(!process.argv[2]||!fs.existsSync(path.join(base,'manifest.json')))throw Error('Pass a Pages package directory');
const manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.json'),'utf8'));
assert.equal(manifest.base,'/KnotzAxxon/');
const content=path.join(base,'html5'),out=path.join(base,'browser-qa'),prefix=manifest.base;
const win=p=>execFileSync('wslpath',['-w',p],{encoding:'utf8'}).trim();
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.glb':'model/gltf-binary','.bin':'application/octet-stream'};
let server,lease,child,closing=false;
async function cleanup(){
 if(closing)return;closing=true;
 if(child?.pid&&child.exitCode===null&&child.signalCode===null&&child.kill('SIGTERM'))await new Promise(r=>child.once('exit',r));
 if(server)await new Promise(r=>server.close(r));lease?.release();
}
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>cleanup().finally(()=>process.exit(130)));
(async()=>{
 lease=acquireGPU('/home/knotzuni/code/KnotzAxxon/asset-work/public-launch/gpu-reservation.json','Primary Pages package QA');
 if(fs.existsSync(out))throw Error('Refusing to overwrite browser evidence');
 fs.mkdirSync(out,{recursive:true});
 server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(!url.pathname.startsWith(prefix)){res.writeHead(404);res.end();return}
  let rel;try{rel=decodeURIComponent(url.pathname.slice(prefix.length))||'index.html'}catch{res.writeHead(400);res.end();return}
  const file=path.resolve(content,rel);
  if(!file.startsWith(content+path.sep)){res.writeHead(403);res.end();return}
  if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return}
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
  res.setHeader('Cache-Control','no-store');fs.createReadStream(file).pipe(res);
 });
 await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r)});
 const url=`http://127.0.0.1:${server.address().port}${prefix}`;
 for(const file of manifest.files){
  const response=await fetch(url+file.path);assert.equal(response.status,200,file.path);
  const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.length,file.bytes,file.path);assert.equal(sha256(bytes),file.sha256,file.path);
 }
 const config={env:{KZ_TEST_URL:url,KZ_TARGET_KIND:'local fingerprinted Pages production bundle',KZ_BUILD_DIR:win(content),
  KZ_COMPARE_DIST:'1',KZ_REQUIRE_HARDWARE:'1',KZ_OUT:win(out),
  KZ_PLAYWRIGHT_PATH:win('/home/knotzuni/code/KnotzAxxon/asset-work/studio-opus-code/tools/node_modules/playwright'),
  KZ_CHROME_EXE:'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'},
  source:manifest.source,script:win(path.join(root,'scripts/qa/release-smoke.cjs'))};
 const file=path.join(out,'config.json');fs.writeFileSync(file,JSON.stringify(config,null,2));
 child=spawn('node.exe',[win(path.join(__dirname,'windows-source-qa.cjs')),win(file)],{stdio:'inherit'});
 const code=await new Promise((r,j)=>{child.once('error',j);child.once('exit',r)});
 fs.writeFileSync(path.join(out,'package-receipt.json'),JSON.stringify({source:manifest.source,
  manifestSHA256:sha256(fs.readFileSync(path.join(base,'manifest.json'))),allFilesHashMatched:manifest.files.length,exitCode:code},null,2));
 if(code!==0)process.exitCode=1;
})().catch(e=>{console.error(e.stack);process.exitCode=1}).finally(cleanup);
