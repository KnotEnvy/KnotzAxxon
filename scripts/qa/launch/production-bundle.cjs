// Exact static production bytes. QA attaches over the existing Playwright pipe;
// neither shipped files nor their no-debug-API behavior are changed.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {sha256}=require('./fingerprint.cjs');
const {packageIdentity}=require('./production-proof.cjs');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.glb':'model/gltf-binary','.bin':'application/octet-stream'};
function readPackage(directory,sourceHash){
  const manifestBytes=fs.readFileSync(path.join(directory,'manifest.json'));
  const manifest=JSON.parse(manifestBytes),root=path.join(directory,'html5');
  if(manifest.source?.sourceHash!==sourceHash)throw Error('Production package source mismatch');
  const files=new Map();
  for(const entry of manifest.files){
    const rel=entry.path;
    if(typeof rel!=='string'||rel.startsWith('/')||rel.includes('\\')||rel.split('/').some(s=>s==='..'||s==='.'||!s)||files.has(rel))throw Error('Unsafe or duplicate production path');
    const bytes=fs.readFileSync(path.join(root,rel));
    if(bytes.length!==entry.bytes||sha256(bytes)!==entry.sha256)throw Error('Production asset mismatch: '+rel);
    files.set(rel,{...entry,bytes});
  }
  if(files.size!==manifest.fileCount||!files.has('index.html'))throw Error('Incomplete production inventory');
  const html=files.get('index.html').bytes.toString();
  const script=[...html.matchAll(/<script[^>]*\bsrc="([^"]+)"[^>]*>/g)].map(m=>m[1]).find(s=>s.includes('/assets/')||s.startsWith('assets/'));
  if(!script||/^(?:https?:)?\/\//.test(script))throw Error('Production entry must be packaged');
  const base=script.startsWith('/')?script.slice(0,script.indexOf('/assets/')+1):'/';
  const entry=script.startsWith('/')?script.slice(base.length):script.replace(/^\.\//,'');
  if(!files.has(entry))throw Error('Production entry absent from inventory');
  return {directory,manifest,manifestSHA256:sha256(manifestBytes),root,files,base,entry,code:files.get(entry).bytes.toString()};
}
async function serveProduction(bundle){
  const requests=[];
  const server=http.createServer((req,res)=>{
    let name;
    try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{res.writeHead(400);res.end();return;}
    if(!name.startsWith(bundle.base)){res.writeHead(404);res.end();return;}
    const rel=name.slice(bundle.base.length)||'index.html',entry=bundle.files.get(rel);
    if(!entry){res.writeHead(404);res.end('Not in frozen production inventory');return;}
    requests.push({file:rel,sha256:entry.sha256});
    res.writeHead(200,{'Content-Type':mime[path.extname(rel)]||'application/octet-stream','Cache-Control':'no-store'});res.end(entry.bytes);
  });
  await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r)});
  return {server,requests,url:`http://127.0.0.1:${server.address().port}${bundle.base}`};
}
function bootstrapLocation(code){
  // The final main bootstrap call is after every owner and menu listener exists.
  // Fail closed if bundling changes this shape; no script rewriting is allowed.
  const end=code.lastIndexOf('.toTitle()');
  if(end<0)throw Error('Production bootstrap marker absent');
  const match=code.slice(0,end).match(/([A-Za-z_$][\w$]*)$/);
  if(!match||!code.slice(Math.max(0,end-30),end).includes('.start(),'))throw Error('Unexpected production bootstrap shape');
  const offset=end-match[1].length,prefix=code.slice(0,offset),lines=prefix.split('\n');
  return {lineNumber:lines.length-1,columnNumber:lines.at(-1).length,gameIdentifier:match[1]};
}
async function attachProduction(page,url,bundle){
  const session=await page.context().newCDPSession(page),location=bootstrapLocation(bundle.code);
  await session.send('Debugger.enable');
  const scriptURL=new URL(bundle.entry,url).href;
  const {breakpointId}=await session.send('Debugger.setBreakpointByUrl',{url:scriptURL,lineNumber:location.lineNumber,columnNumber:location.columnNumber});
  let timer;
  const ready=new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(Error('Production bootstrap breakpoint timeout')),120000);
    session.once('Debugger.paused',async event=>{
      try{
        const frame=event.callFrames[0],callFrameId=frame.callFrameId;
        if(!event.hitBreakpoints?.includes(breakpointId))throw Error('Unexpected debugger pause');
        const absent=await session.send('Debugger.evaluateOnCallFrame',{callFrameId,expression:'typeof globalThis.KZ === "undefined"',returnByValue:true});
        if(absent.result?.value!==true)throw Error('Production unexpectedly exposes a debug API before QA');
        const found={};
        for(const scope of frame.scopeChain.filter(s=>['local','module','closure'].includes(s.type))){
          const props=await session.send('Runtime.getProperties',{objectId:scope.object.objectId,ownProperties:true});
          for(const prop of props.result??[]){
            if(prop.value?.type!=='object'||!prop.value.objectId||!/^[$A-Z_a-z][$\w]*$/.test(prop.name))continue;
            const expression=`((v)=>!v?null:({settings:!!v.values&&typeof v.get==='function'&&typeof v.save==='function',audio:typeof v.missileLock==='function'&&typeof v.init==='function',rand:typeof v.next==='function'&&typeof v.reset==='function'&&typeof v.weighted==='function'}))(${prop.name})`;
            const probe=await session.send('Debugger.evaluateOnCallFrame',{callFrameId,expression,returnByValue:true,silent:true});
            for(const [kind,yes] of Object.entries(probe.result?.value??{}))if(yes){
              if(found[kind]&&found[kind]!==prop.name)throw Error('Ambiguous production owner: '+kind);
              found[kind]=prop.name;
            }
          }
        }
        if(!found.settings||!found.audio||!found.rand)throw Error('Missing production owner in bootstrap scope: '+JSON.stringify(found));
        const g=location.gameIdentifier;
        const expression=`globalThis.KZ={game:${g},engine:${g}.engine,screens:${g}.screens,settings:${found.settings},audio:${found.audio},rand:${found.rand}};!!(KZ.game.player&&KZ.engine.renderer&&KZ.screens.show)`;
        const attached=await session.send('Debugger.evaluateOnCallFrame',{callFrameId,expression,returnByValue:true});
        if(attached.exceptionDetails||attached.result?.value!==true)throw Error('Production QA owner attachment failed');
        await session.send('Debugger.removeBreakpoint',{breakpointId});await session.send('Debugger.resume');
        await session.send('Debugger.disable');await session.detach();
        resolve({method:'Playwright local-pipe CDP bootstrap scope inspection; debugger detached before play',debugApiAbsentBeforeQA:true,shippedBytesUnmodified:true,debuggerDetachedBeforePlay:true,scriptURL,entrySHA256:bundle.files.get(bundle.entry).sha256});
      }catch(error){await session.send('Debugger.resume').catch(()=>{});reject(error);}
    });
  });
  try{
    const [bridge]=await Promise.all([ready,page.goto(url,{timeout:120000})]);
    await page.waitForFunction(()=>!!window.KZ?.game?.fortress,{timeout:120000});
    const expected=[...bundle.files.values()].map(({path,sha256,bytes})=>({path,sha256,size:bytes.length}));
    const checked=await page.evaluate(async ({base,expected})=>{
      const hex=a=>[...new Uint8Array(a)].map(x=>x.toString(16).padStart(2,'0')).join('');
      const result=await Promise.all(expected.map(async entry=>{
        const response=await fetch(new URL(entry.path,base));if(!response.ok)throw Error('Production fetch failed: '+entry.path);
        const bytes=await response.arrayBuffer();
        if(bytes.byteLength!==entry.size||hex(await crypto.subtle.digest('SHA-256',bytes))!==entry.sha256)throw Error('Browser production hash mismatch: '+entry.path);
        return entry.path;
      }));return result.length;
    },{base:url,expected});
    return {kind:'hash-verified-production',...packageIdentity(bundle),browserFilesHashMatched:checked,bridge};
  }finally{clearTimeout(timer);await session.detach().catch(()=>{});}
}
module.exports={readPackage,serveProduction,bootstrapLocation,attachProduction};
