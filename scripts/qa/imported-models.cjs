/** End-to-end model bindings, cues and resource lifetime against the actual game. */
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
(async () => {
 const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4181','--strictPort'],{stdio:'pipe'});
 let browser; const errors=[];
 try {
  for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:4181')).ok)break;}catch{} await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4181');
  await page.waitForFunction(()=>!!window.KZ,{timeout:90000});
  const report=await page.evaluate(async()=>{
   const {Boss}=await import('/src/entities/Boss.js');
   const {Vector3}=await import('/node_modules/three/build/three.module.js');
   const {game,engine}=window.KZ;engine.stop();game.start({seed:123});
   const check=(ok,msg)=>{if(!ok)throw Error(msg);};
   check(game.player.model.name==='hero-interceptor-imported','Selected fighter was not loaded');
   check(game.player.model.userData.engines.length===2,'Engine binding');
   check(game.player.model.userData.silhouette.geometry.attributes.position.count>0,'Occlusion silhouette');
   const engineNodes=game.player.model.userData.engines;
   check(Math.abs(engineNodes[0].position.x+1.05)<1e-4&&Math.abs(engineNodes[1].position.x-1.05)<1e-4,'Engine pivots');
   const { createEnemy } = await import('/src/entities/Enemies.js');
   for (const kind of ['turret', 'radar', 'silo', 'fuel']) {
    const enemy = createEnemy(kind, game.materials, {x:0,y:0,z:80,seed:1});
    game.scene.add(enemy.group);
    check(!!enemy._importedRoot, kind+' imported model');
    if (kind === 'turret') {
     const barrel=enemy.barrels[0];
     check(Math.abs(barrel.position.x-2.3)<1e-5,'Side mount pivot');
     const base=enemy._importedRoot.getObjectByName('base');base.geometry.computeBoundingBox();
     const visual=enemy._importedRoot.getObjectByName('barrel_visual');visual.geometry.computeBoundingBox();
     check(barrel.position.x+visual.geometry.boundingBox.min.x>base.geometry.boundingBox.max.x,'Barrel clears base throughout pitch sweep');
     for (const angle of [-85,-45,0,45,85]) {
      barrel.rotation.x=angle*Math.PI/180;
      enemy.group.updateMatrixWorld(true);
      check(Number.isFinite(barrel.matrixWorld.elements[0]),'Valid pitch transform');
     }
    } else if (kind === 'radar') {
     check(Math.abs(enemy.dish.position.y-7.2)<1e-5,'Radar pivot');
     const y=enemy.emitter.position.y;
     check(Math.abs(y-.8596301042)<1e-4,'Radar feed position');
    }
    if (kind === 'silo') {
     check(Math.abs(enemy.hatch.position.y-2.45)<1e-5,'Silo hatch pivot');
     check(Math.abs(enemy.glow.position.y-2.415)<1e-5,'Silo glow pivot');
     enemy.pos.z=game.player.pos.z+30;enemy.hasEngaged=true;
     for(let frame=0;frame<30;frame++) {
      enemy.fireTimer=.2;enemy.update(1/60,game._ctx(1/60,10));
     }
     check(enemy.doors>.95,'Silo opens on approach');
     check(Math.abs(enemy.hatch.scale.x-(1-enemy.doors*.85))<1e-6,'Hatch scale follows gameplay');
     const projectiles=game.projectiles,original=projectiles.launchMissile;
     let launch;
     projectiles.launchMissile=function(...args){launch=args;return original.apply(this,args);};
     try {enemy.fireTimer=-.01;enemy.update(1/60,game._ctx(1/60,10));}
     finally {projectiles.launchMissile=original;}
     check(launch&&Math.abs(launch[1]-(enemy.pos.y+3))<1e-6,'Missile launches at exported socket height');
     check(enemy.hp===5&&enemy.radius===3.2,'Silo gameplay values');
    }
    if (kind === 'fuel') {
     for(const phase of [-Math.PI/2,Math.PI/2]) {
      const time=(phase-enemy.pos.z*.2)/2.4;
      enemy.update(1/60,{...game._ctx(1/60,time),time});
      check(Math.abs(enemy.band.position.y-(phase<0?1.1:3.3))<1e-6,'Fuel band full travel');
     }
     check(enemy.fuelValue===.16&&enemy.hp===1&&enemy.radius===2.2,'Fuel gameplay values');
     const meshes=[];enemy.flashMesh.traverse(o=>{if(o.isMesh)meshes.push(o);});
     check(meshes.length>0&&meshes[0].geometry.attributes.position.count>0,'Fuel hit shell covers composite body');
    }
    enemy.hit(1,game._ctx(1/60,10));enemy.update(1/60,game._ctx(1/60,10));
    check(enemy.flashMesh.parent===(kind==='turret'?enemy.turntable:kind==='radar'?enemy.dish:enemy._importedRoot),'Moving damage flash');
    enemy.dispose();
   }
   const results=[];
   for(let iteration=0;iteration<3;iteration++){
    const boss=new Boss(game.scene,game.materials,{z:game.player.pos.z+80});game.boss=boss;
    check(!!boss.group.getObjectByName('iron-sentinel'),'Selected Sentinel was not loaded');
    check(boss.pods.every(p=>!p.stump.visible),'Stumps initially hidden');
    check(boss.pods.every(p=>p.barrels.length===2),'Independent barrels');
    check(boss.core.material===boss.coreMat&&!!boss.coreMat.uniforms,'Reactor shader binding');
    boss.active=true;boss.entrance=1;boss.phase=1;boss.coreTimer=100;
    const ctx=game._ctx(1/60,10);
    boss.update(1/60,ctx);boss.group.updateMatrixWorld(true);
    for(const pod of boss.pods)pod.group.getWorldPosition(pod.pos);
    check(boss.hitAt(boss.pods[0].pos.clone(),30,ctx)==='pod','Pod hit route');
    check(!boss.pods[0].body.visible&&boss.pods[0].stump.visible&&!boss.pods[0].barrels[0].visible,'Destroyed shoulder state');
    boss.phase=2;boss.coreOpen=1;boss.update(1/60,ctx);
    check(boss.shutters.every(s=>!s.mesh.visible),'Open reactor shutters');
    boss.launcher.charging=true;boss.launcher.timer=2;boss.update(1/60,ctx);
    check(Number.isFinite(boss.chargeMat.color.r)&&boss.coreMat.uniforms.uIntensity.value<1,'Charge cue and reactor dimming');
    boss.coreGroup.getWorldPosition(new Vector3());
    engine.renderer.render(game.scene,engine.camera);
    check(boss.pods.every(p=>p.flashMesh.children.length>0||p.flashMesh.isMesh),'Damage shell');
    const hull=game.player.model.getObjectByName('airframe-hull');
    check(hull.visible,'Boss state altered fighter');
    results.push({iteration,shutters:boss.shutters.length,pods:boss.pods.length,charge:boss.chargeMat.color.toArray()});
    if(iteration===2){game.boss=boss;break;}
    boss.dispose();game.boss=null;
   }
   game.player.model.userData.silhouette.visible=true;
   engine.renderer.render(game.scene,engine.camera);
   return {selectedFighter:game.player.model.name,groundTargets:['turret','radar','silo','fuel'],iterations:results};
  });
  if(errors.length)throw Error(errors.join('\n'));
  fs.mkdirSync('artifacts/imported-models',{recursive:true});
  fs.writeFileSync('artifacts/imported-models/report.json',JSON.stringify({...report,errors},null,2)+'\n');
  await page.screenshot({path:'artifacts/imported-models/in-game.png'});
  console.log(JSON.stringify(report,null,2));
 } finally {await browser?.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
