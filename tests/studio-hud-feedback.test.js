import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HUD } from '../src/ui/HUD.js';

function element() {
  const classes = new Set(); let value = '', writes = 0;
  return { style:{}, get textContent(){return value;}, set textContent(v){value=v;writes++;}, get writes(){return writes;},
    classList:{toggle:(k,on)=>on?classes.add(k):classes.delete(k),contains:k=>classes.has(k),remove:k=>classes.delete(k)},
    setAttribute(){}, children:[] };
}
function fixture() {
  const labels={}, nodes={};
  for(const name of ['fuel','hull','heat']) {
    const label=labels[name]=element(), track=element(); track.parentElement={querySelector:()=>label};
    nodes['hud-'+name]={style:{},parentElement:track};
  }
  nodes['hud-warn']=element();
  globalThis.document={getElementById:id=>nodes[id]??null};
  const hud=new HUD();
  const state={score:0,best:0,chain:0,chainMult:1,chainTime:0,sectorLabel:'SECTOR 01',sectorSub:'OUTER FORTRESS',sectorIndex:0,progress:0,
    fuel:1,hull:3,hullMax:3,heat:0,overheated:false,boost:1,weapon:'PULSE ARRAY',altitude:8,shields:0};
  return {hud,state,labels,nodes};
}

test('studio: system labels follow the established low/critical thresholds and recover without stale warnings',()=>{
  const {hud,state,labels,nodes}=fixture();hud.update(state,0);
  assert.deepEqual(Object.values(labels).map(e=>e.textContent),['FUEL','HULL','HEAT']);
  Object.assign(state,{fuel:.249,hull:1,heat:1,overheated:true});hud.update(state,0);
  assert.deepEqual(Object.values(labels).map(e=>e.textContent),['FUEL LOW','HULL CRIT','OVERHEAT']);
  for(const name of ['fuel','hull','heat'])assert.equal(nodes['hud-'+name].parentElement.classList.contains('low'),true);
  const writes=Object.values(labels).map(e=>e.writes);hud.update(state,0);assert.deepEqual(Object.values(labels).map(e=>e.writes),writes);
  Object.assign(state,{fuel:.25,hull:2,overheated:false});hud.update(state,0);
  assert.deepEqual(Object.values(labels).map(e=>e.textContent),['FUEL','HULL','HEAT']);
  hud.dispose();
});

test('studio: warning expiry still clears the live class and reset clears transient feedback',()=>{
  const {hud,state,nodes}=fixture();hud.warn('FUEL CRITICAL',2);hud.update(state,1);
  assert.equal(nodes['hud-warn'].textContent,'FUEL CRITICAL');assert.equal(nodes['hud-warn'].classList.contains('on'),true);
  hud.update(state,1.1);assert.equal(nodes['hud-warn'].classList.contains('on'),false);
  hud.warn('WEAPON OVERHEAT',2);hud.reset();assert.equal(nodes['hud-warn'].classList.contains('on'),false);
  hud.dispose();
});
