import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Batch,Fortress } from '../../../../src/world/Fortress.js';
import { prepareCoolingStack } from './streaming-adapter.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const world=JSON.parse(fs.readFileSync(path.join(root,'evidence/source-world.json')));
const template=prepareCoolingStack(JSON.parse(fs.readFileSync(path.join(root,'cooling-stack.template.json'))));
const selected=world.placements[0],endpoints={};
const serialize=batch=>[...batch.buckets].map(([bucket,data])=>({bucket,p:Array.from(data.pos.view()),n:Array.from(data.nrm.view()),c:Array.from(data.col.view())}));
for(const height of [7,11]) {
  const source=new Batch(),prototype=new Batch();
  const controlledRng={ range:()=>height,next:()=>selected.phase };
  Fortress.prototype._coolingStack(source,controlledRng,selected.x,selected.z,()=>{});
  template.stamp(prototype,height,selected.phase,selected.x,selected.z);
  endpoints[height]={source:serialize(source),prototype:serialize(prototype)};
}
fs.writeFileSync(path.join(root,'evidence/render-fixture.json'),JSON.stringify({
  note:'Offline endpoint fixtures. Source endpoints call original _coolingStack with explicit height/phase stubs, not seeded draws. Prototype uses actual Batch adapter. Separate streaming proof establishes seeded equality.',selected,endpoints
})+'\n');
