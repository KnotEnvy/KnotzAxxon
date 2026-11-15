// Build a separately fingerprinted Pages candidate without touching dist/ or publishing.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {build} from 'vite';
const require=createRequire(import.meta.url),{fingerprint,sha256}=require('./fingerprint.cjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),source=fingerprint(root);
const index=process.argv.indexOf('--candidate');
if(index>=0&&process.argv[index+1]!==source.sourceHash)throw Error('Candidate source hash mismatch');
const base=path.join(root,'artifacts/launch/pages',source.sourceHash.slice(0,16));
if(fs.existsSync(base))throw Error('Refusing to overwrite a Pages candidate');
const out=path.join(base,'html5');fs.mkdirSync(base,{recursive:true});
await build({root,base:'/KnotzAxxon/',build:{outDir:out,emptyOutDir:true}});
const after=fingerprint(root);if(after.sourceHash!==source.sourceHash)throw Error('Source changed during build');
function inventory(dir,prefix=''){
 return fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(entry=>{
  const file=path.join(dir,entry.name),rel=prefix+entry.name;
  if(entry.isSymbolicLink())throw Error('Unexpected symlink: '+rel);
  return entry.isDirectory()?inventory(file,rel+'/'):[{path:rel,bytes:fs.statSync(file).size,sha256:sha256(fs.readFileSync(file))}];
 });
}
const files=inventory(out),manifest={createdAt:new Date().toISOString(),source,base:'/KnotzAxxon/',files,
 fileCount:files.length,browserVerification:'pending',publication:'not deployed'};
fs.writeFileSync(path.join(base,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({directory:base,sourceHash:source.sourceHash,fileCount:files.length}));
