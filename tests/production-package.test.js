import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {readPackage,serveProduction,bootstrapLocation}=require('../scripts/qa/launch/production-bundle.cjs');
const {sha256}=require('../scripts/qa/launch/fingerprint.cjs');
function fixture(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'kz-production-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const files=[['index.html','<script type="module" src="/KnotzAxxon/assets/game.js"></script>'],
    ['assets/game.js','const unchanged="exact production bytes";e.start(),g.toTitle();']];
  for(const [name,bytes] of files){const p=path.join(directory,'html5',name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,bytes);}
  const manifest={source:{sourceHash:'candidate'},fileCount:files.length,
    files:files.map(([name,bytes])=>({path:name,bytes:Buffer.byteLength(bytes),sha256:sha256(bytes)}))};
  const manifestFile=path.join(directory,'manifest.json');
  fs.writeFileSync(manifestFile,JSON.stringify(manifest));
  return {directory,manifest,manifestFile,files};
}
test('production server serves only hash-verified inventory bytes at the package base',async t=>{
  const f=fixture(t),bundle=readPackage(f.directory,'candidate');
  const served=await serveProduction(bundle);
  t.after(()=>new Promise(resolve=>served.server.close(resolve)));
  for(const [name,bytes] of f.files){
    const response=await fetch(new URL(name,served.url));assert.equal(response.status,200);assert.equal(await response.text(),bytes);
  }
  for(const suffix of ['/src/main.js','/KnotzAxxon/src/main.js','/KnotzAxxon/manifest.json','/KnotzAxxon/%2e%2e/package.json']){
    assert.equal((await fetch(new URL(suffix,served.url))).status,404);
  }
  // A later disk mutation cannot change the verified bytes already being served.
  fs.writeFileSync(path.join(f.directory,'html5/assets/game.js'),'tampered');
  assert.equal(await (await fetch(new URL('assets/game.js',served.url))).text(),f.files[1][1]);
  assert.throws(()=>readPackage(f.directory,'candidate'),/asset mismatch/);
});
test('package verification rejects changed bytes, wrong source and unsafe inventory paths',t=>{
  const f=fixture(t);
  assert.throws(()=>readPackage(f.directory,'other'),/source mismatch/);
  f.manifest.files.push({...f.manifest.files[0]});fs.writeFileSync(f.manifestFile,JSON.stringify(f.manifest));
  assert.throws(()=>readPackage(f.directory,'candidate'),/duplicate/);
  f.manifest.files=[{path:'../secret',bytes:1,sha256:'x'}];fs.writeFileSync(f.manifestFile,JSON.stringify(f.manifest));
  assert.throws(()=>readPackage(f.directory,'candidate'),/Unsafe/);
});
test('production bootstrap inspection fails closed when the compiled entry shape changes',()=>{
  assert.deepEqual(bootstrapLocation('e.start(),g.toTitle();'),{lineNumber:0,columnNumber:10,gameIdentifier:'g'});
  assert.throws(()=>bootstrapLocation('g.toTitle();'),/bootstrap shape/);
  assert.throws(()=>bootstrapLocation('no owners exposed'),/marker absent/);
});
