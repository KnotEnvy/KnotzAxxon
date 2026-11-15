// Verify a packaged build beneath an arbitrary nested upload path and iframe.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {spawn,execFileSync}=require('node:child_process');
const {acquireGPU}=require('./gpu-lease.cjs');
const base=path.resolve(process.argv[2]||'');
if(!process.argv[2]||!fs.existsSync(path.join(base,'manifest.json')))throw Error('Pass a package directory containing manifest.json and html5/');
const manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.json'),'utf8'));
const root=path.join(base,'html5'),out=path.join(base,'browser-qa');
const win=p=>execFileSync('wslpath',['-w',p],{encoding:'utf8'}).trim();
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.glb':'model/gltf-binary','.bin':'application/octet-stream'};
let server,lease;
(async()=>{
  lease=acquireGPU('/home/knotzuni/code/KnotzAxxon/asset-work/public-launch/gpu-reservation.json','Primary portable Itch QA');
  if(fs.existsSync(out))throw Error('Refusing to overwrite package browser evidence');
  fs.mkdirSync(out,{recursive:true});
  const prefix='/uploads/knotzaxxon/html5/';
  server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/qa/frame.html'){
      res.setHeader('Content-Type','text/html');
      res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}iframe{border:0;width:100%;height:calc(100% - 32px);display:block}button{height:32px}</style></head><body><button id="fullscreen">Fullscreen</button><iframe id="game" title="KnotzAxxon HTML5 upload" src="${prefix}" allow="autoplay; fullscreen; gamepad" allowfullscreen sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-orientation-lock"></iframe><script>document.getElementById('fullscreen').onclick=()=>document.getElementById('game').requestFullscreen()</script></body></html>`);return;
    }
    if(!url.pathname.startsWith(prefix)){res.writeHead(404);res.end('outside upload root');return;}
    let rel;
    try{rel=decodeURIComponent(url.pathname.slice(prefix.length))||'index.html'}catch{res.writeHead(400);res.end();return;}
    const filename=path.resolve(root,rel);
    if(!filename.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    if(!fs.existsSync(filename)||!fs.statSync(filename).isFile()){res.writeHead(404);res.end('missing');return;}
    res.setHeader('Content-Type',mime[path.extname(filename)]||'application/octet-stream');
    res.setHeader('Cache-Control','no-store');fs.createReadStream(filename).pipe(res);
  });
  await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r)});
  const url=`http://127.0.0.1:${server.address().port}`;
  const config={url,prefix,manifest,out:win(out),
    playwright:win('/home/knotzuni/code/KnotzAxxon/asset-work/studio-opus-code/tools/node_modules/playwright'),
    chrome:'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'};
  const configFile=path.join(out,'config.json');fs.writeFileSync(configFile,JSON.stringify(config,null,2));
  const child=spawn('node.exe',[win(path.join(__dirname,'windows-itch.cjs')),win(configFile)],{stdio:'inherit'});
  const code=await new Promise((r,j)=>{child.once('error',j);child.once('exit',r)});if(code!==0)process.exitCode=1;
})().catch(e=>{console.error(e.stack);process.exitCode=1}).finally(async()=>{
  if(server)await new Promise(r=>server.close(r));lease?.release();
});
