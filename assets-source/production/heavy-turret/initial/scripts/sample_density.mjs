import fs from 'node:fs';import path from 'node:path';import{fileURLToPath}from'node:url';
const P=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),repo=process.env.KNOTZ_REPO??path.resolve(P,'../../..');
const{Level}=await import(path.join(repo,'src/world/Level.js'));
let peak={count:0},ys=new Set(),xs=[];
for(let seed=1;seed<=100;seed++)for(let loop of[0,1,3]){
 let f=new Level(seed,loop).features.filter(f=>f.kind==='heavyTurret').sort((a,b)=>a.z-b.z);
 for(let p of f){ys.add(p.y??0);xs.push(p.x);}
 for(let i=0,j=0;i<f.length;i++){while(j<f.length&&f[j].z-f[i].z<=355)j++;if(j-i>peak.count)peak={count:j-i,seed,loop,minZ:f[i].z,maxZ:f[j-1].z};}
}
let r={method:'Actual Level(seed,loop), seeds1..100, loops0,1,3. Maximum heavyTurret features in inclusive355 world-unit Z window. Density proxy, not live simultaneous max.',peak,rootY:[...ys].sort((a,b)=>a-b),rootX:[Math.min(...xs),Math.max(...xs)]};
fs.writeFileSync(path.join(P,'verification/density.json'),JSON.stringify(r,null,2));console.log({peak,rootYRange:[Math.min(...ys),Math.max(...ys)],rootX:r.rootX});
