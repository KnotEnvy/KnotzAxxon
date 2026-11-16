// Faults cross only disposal boundaries; actual Game/entities/pools run unchanged.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeRig} from './fixtures/studio-feel.mjs';
import {Pickup} from '../src/entities/Pickup.js';
import {Boss} from '../src/entities/Boss.js';

for (const fault of ['fortress','enemy-0','projectiles']) {
  test(`reset retires all previous sortie owners after ${fault} cleanup fails`, () => {
    const rig=makeRig({seed:94131}),g=rig.g,calls=[],restore=[];
    const failure=new Error(`reset ${fault} sentinel`);
    function watch(owner,key,label){
      const original=owner[key];
      owner[key]=function(...args){
        calls.push(label);
        const value=original.apply(this,args);
        if(label===fault)throw failure;
        return value;
      };
      restore.push(()=>{owner[key]=original});
    }
    let thrown;
    try {
      g._spawnEnemy('turret',{x:0,y:6,z:40,seed:1});
      g._spawnEnemy('drone',{x:3,y:9,z:65,seed:2});
      assert.equal(g.enemies.length,2,'fixture has two real enemies');
      g.pickups.push(new Pickup(g.scene,g.materials,'repair',0,6,50));
      g.boss=new Boss(g.scene,g.materials,{z:80});
      const retired=[...g.enemies,...g.pickups,g.boss];
      watch(g.fortress,'clear','fortress');
      g.enemies.forEach((owner,i)=>watch(owner,'dispose',`enemy-${i}`));
      watch(g.pickups[0],'dispose','pickup');
      watch(g.boss,'dispose','boss');
      watch(g.projectiles,'clear','projectiles');
      watch(g.fx,'clear','effects');
      watch(g.hud,'reset','hud');
      try { g.reset(94132,1); } catch(error) { thrown=error; }
      assert.ok(thrown,'cleanup fault must remain observable');
      assert.deepEqual(calls,['fortress','enemy-0','enemy-1','pickup','boss','projectiles','effects','hud'],
        'every independent previous owner is attempted in the existing order');
      assert.deepEqual(g.enemies,[],'retired enemies cannot remain live owners');
      assert.deepEqual(g.pickups,[],'retired pickups cannot remain live owners');
      assert.equal(g.boss,null,'the previous boss owner is given up');
      for(const owner of retired)assert.equal(owner.group.parent,null,'actual entity group is detached');
      assert.ok(thrown instanceof AggregateError);
      assert.ok(thrown.errors.includes(failure),'keep the actual cleanup error');
    } finally {
      for(const undo of restore.reverse())undo();
      rig.dispose();
    }
  });
}
