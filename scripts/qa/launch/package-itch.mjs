// Portable HTML5 delivery: relative URLs, index.html at ZIP root, complete file hashes.
// Does not upload or replace any live Itch release.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {build} from 'vite';
const require=createRequire(import.meta.url);
const {fingerprint,sha256}=require('./fingerprint.cjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const source=fingerprint(root);
const i=process.argv.indexOf('--candidate');
if(i>=0&&process.argv[i+1]!==source.sourceHash)throw Error('Candidate source hash mismatch');
const base=path.join(root,'artifacts/launch/distribution',source.sourceHash.slice(0,16));
if(fs.existsSync(base))throw Error('Refusing to overwrite an existing package; retain its receipt');
const out=path.join(base,'html5');fs.mkdirSync(base,{recursive:true});
await build({root,base:'./',build:{outDir:out,emptyOutDir:true}});
const after=fingerprint(root);
if(after.sourceHash!==source.sourceHash)throw Error('Source changed during packaging; this output is not a frozen candidate');
function inventory(dir,prefix=''){
  return fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(entry=>{
    const rel=prefix+entry.name,absolute=path.join(dir,entry.name);
    if(entry.isSymbolicLink())throw Error('Unexpected symbolic link in delivery: '+rel);
    return entry.isDirectory()?inventory(absolute,rel+'/'):[{path:rel,bytes:fs.statSync(absolute).size,sha256:sha256(fs.readFileSync(absolute))}];
  });
}
const files=inventory(out);
const totalBytes=files.reduce((total,file)=>total+file.bytes,0);
if(files.length>1000||totalBytes>500000000||files.some(file=>file.bytes>200000000||file.path.length>240)) {
  throw Error('Package exceeds published Itch HTML5 file-count/size/path limits');
}
if(!files.some(f=>f.path==='index.html'))throw Error('Missing root index.html');
const html=fs.readFileSync(path.join(out,'index.html'),'utf8');
const runtimeAssets=[...html.matchAll(/(?:src|href)="([^\"]*assets\/[^\"]+)"/g)].map(m=>m[1]);
if(runtimeAssets.length<3||runtimeAssets.some(url=>!url.startsWith('./assets/')))throw Error('Application bundle URLs are not portable relative paths');
if(files.some(f=>/node_modules|^src\/|\.map$/.test(f.path)))throw Error('Unexpected source/tool file in delivery');
const zip=path.join(base,'knotzaxxon-html5.zip');
const py=`import pathlib,sys,zipfile
root=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
 for f in sorted(root.rglob('*')):
  if f.is_file():
   info=zipfile.ZipInfo(f.relative_to(root).as_posix(),(2026,1,1,0,0,0))
   info.compress_type=zipfile.ZIP_DEFLATED
   info.external_attr=0o100644<<16
   archive.writestr(info,f.read_bytes())
with zipfile.ZipFile(sys.argv[2]) as archive:
 assert archive.testzip() is None
 assert 'index.html' in archive.namelist()
`;
const result=spawnSync('python3',['-c',py,out,zip],{encoding:'utf8'});
if(result.status!==0)throw Error('Archive creation/readback failed: '+result.stderr);
const report={createdAt:new Date().toISOString(),source,format:'Itch HTML5 ZIP; index.html at root; relative Vite base',
  archive:{file:path.basename(zip),bytes:fs.statSync(zip).size,sha256:sha256(fs.readFileSync(zip))},
  fileCount:files.length,totalBytes,files,browserVerification:'pending nested-path/iframe/WebGL2/responsive/fullscreen/asset checks',
  publication:'not uploaded; previous live Itch upload preserved'};
fs.writeFileSync(path.join(base,'manifest.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({directory:base,sourceHash:source.sourceHash,archive:report.archive,fileCount:files.length}));
