/** End-to-end model bindings, cues and resource lifetime against the actual game. */
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const productionPreview = !process.argv.includes('--legacy');
(async () => {
 const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4181','--strictPort'],{stdio:'pipe'});
 let browser; const errors=[];
 try {
  for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:4181')).ok)break;}catch{} await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4181'+(productionPreview?'':'?productionModels=0'));
  await page.waitForFunction(()=>!!window.KZ,undefined,{timeout:90000});
  const report=await page.evaluate(async(productionPreview)=>{
   const {Boss}=await import('/src/entities/Boss.js');
   const {Vector3,Scene,Matrix4,Quaternion}=await import('/node_modules/three/build/three.module.js');
   const {game,engine}=window.KZ;engine.stop();game.start({seed:123});
   const check=(ok,msg)=>{if(!ok)throw Error(msg);};
   check(game.player.model.name==='hero-interceptor-imported','Selected fighter was not loaded');
   check(game.player.model.userData.engines.length===2,'Engine binding');
   check(game.player.model.userData.silhouette.geometry.attributes.position.count>0,'Occlusion silhouette');
   const engineNodes=game.player.model.userData.engines;
   check(Math.abs(engineNodes[0].position.x+1.05)<1e-4&&Math.abs(engineNodes[1].position.x-1.05)<1e-4,'Engine pivots');
   const { createEnemy } = await import('/src/entities/Enemies.js');
   const { Pickup } = await import('/src/entities/Pickup.js');
   const { Rng } = await import('/src/core/Utils.js');
   let parkedFighter;
   {
    const variants={},seedChecks=[];
    for(let seed=1;seed<=16;seed++) {
     const rng=new Rng(seed),scramble=rng.bool(.35),yaw=rng.range(-.2,.2);
     const e=createEnemy('parked',game.materials,{x:0,y:0,z:40,seed});
     check(!!e._importedRoot===productionPreview,'Parked preview opt-in');
     check(e.scramble===scramble&&Math.abs(e.group.rotation.y-yaw)<1e-8&&e.rng.next()===rng.next(),'Parked original constructor RNG sequence');
     seedChecks.push({seed,scramble,yaw});
     if(!variants[scramble])variants[scramble]=e;else e.dispose();
    }
    check(variants.true&&variants.false,'Parked deterministic scramble variants');
    const idle=variants.false,e=variants.true,dt=1/60;
    if(productionPreview) {
     game.scene.add(idle.group,e.group);
     check(e.hp===1&&e.radius===2.4&&e.score===150,'Parked gameplay values');
     check(e.engine.position.distanceTo(new Vector3(0,1,2.3))<1e-6&&e.beacon.position.distanceTo(new Vector3(0,2.4,1.6))<1e-6,'Parked original cue pivots');
     check(e.engine.getObjectByName('engine_lens').material===game.materials.neon(0xff9a3a,2.2),'Parked source engine neon');
     check(e.beacon.getObjectByName('beacon_lens').material===game.materials.neon(0xff3d55,3),'Parked source beacon neon');
     for(const on of [false,true]) {
      const time=((on?Math.PI/2:0)-idle.pos.z)/5;
      const pos=idle.pos.clone();idle.update(dt,game._ctx(dt,time));
      check(idle.beacon.visible===on&&idle.engine.scale.x===.3&&idle.pos.equals(pos),'Parked idle remains static and beacon toggles');
     }
     e.pos.set(0,0,game.player.pos.z+95);e.update(dt,game._ctx(dt,0));
     check(Math.abs(e.engine.scale.x-.3)<1e-8,'Parked far idle engine');
     const pulse=[];
     for(const [time,expected] of [[Math.PI/18,1.045],[Math.PI/6,.995]]) {
      e.pos.z=game.player.pos.z+55;e.update(dt,game._ctx(dt,time));
      check(Math.abs(e.engine.scale.x-expected)<1e-8,'Parked full-spool pulse endpoints');pulse.push(e.engine.scale.x);
     }
     const {audio}=await import('/src/audio/Audio.js');const original=audio.flyby;let roars=0;audio.flyby=()=>roars++;
     try {e.pos.z=game.player.pos.z+30;e.lift=.049;for(let i=0;i<4;i++)e.update(dt,game._ctx(dt,i*dt));}
     finally {audio.flyby=original;}
     check(roars===1,'Parked one-time scramble roar');
     e.pos.set(0,22.99,game.player.pos.z+30);e.lift=1;
     const oldPitch=e.group.rotation.x;e.update(dt,game._ctx(dt,1));
     check(e.pos.y===23&&Math.abs(e.velocity.y-9)<1e-8&&Math.abs(e.velocity.z-game.player.speed*.75)<1e-8,'Parked full launch and source root altitude cap');
     check(Math.abs(e.group.rotation.x-(oldPitch+(-.35-oldPitch)*(1-Math.exp(-4*dt))))<1e-8,'Parked source pitch damping');
     for(const dz of [-20,60]) {
      e.pos.set(0,9,game.player.pos.z+dz);e.lift=.5;
      const pos=e.pos.clone(),pitch=e.group.rotation.x,velocity=e.velocity.clone();
      e.update(dt,game._ctx(dt,2));
      check(e.pos.equals(pos)&&e.lift===.5&&e.group.rotation.x===pitch&&e.velocity.equals(velocity),'Parked strict launch boundaries retain source state');
     }
     e.hit(.25,game._ctx(dt,3));e.update(dt,game._ctx(dt,3));
     check(e.flashMesh.visible&&e.flashMesh.parent===e._importedRoot&&e.flashMesh.scale.x===1.12,'Parked owned flash shell');
     const resources=new Set([...e._importedRoot.userData.modelOwnedMaterials,e.flashMat]);e._importedRoot.traverse(o=>{if(o.geometry)resources.add(o.geometry);});
     const disposed=new Map();for(const r of resources)r.addEventListener('dispose',()=>disposed.set(r,(disposed.get(r)||0)+1));
     e.dispose();check([...resources].every(r=>disposed.get(r)===1),'Parked owned resources disposed exactly once');
     check(idle.engine.scale.x===.3,'Parked survivor remains independent');
     parkedFighter={seedChecks,pulse,roars,resourcesDisposed:resources.size,rootAltitudeCap:23};
    } else e.dispose();
    idle.dispose();
   }
   const {Projectiles}=await import('/src/entities/Projectiles.js');
   const {Projectiles:BaselineProjectiles}=await import('/assets-source/production/missile/initial/source/src/entities/Projectiles.js');
   const missileScene=new Scene(),controlScene=new Scene();
   const missileTest=new Projectiles(missileScene,game.materials,{}),control=new BaselineProjectiles(controlScene,game.materials,{});
   const owned=missileTest._ownedMissileMaterial;
   check(!!owned===productionPreview,'Missile preview opt-in');
   check(missileTest.missile.capacity===40&&missileTest.missileMesh.count===0,'Missile fixed pool capacity and empty draw');
   let missilePool;
   try {
    const mesh=missileTest.missileMesh,geometry=mesh.geometry;
    const triangles=(geometry.index?.count??geometry.attributes.position.count)/3;
    check(triangles===(productionPreview?464:204)&&geometry.groups.length===0&&!Array.isArray(mesh.material),'Missile one-primitive geometry');
    check(!mesh.castShadow&&!mesh.receiveShadow&&!mesh.frustumCulled,'Missile instancing flags');
    if(productionPreview) {
     check(owned!==game.materials.enemyArmor&&owned.color.getHex()===0xffffff&&owned.vertexColors,'Missile owns white vertex palette material');
     check(game.materials.enemyArmor.color.getHex()===0x995c48&&!game.materials.enemyArmor.vertexColors,'Missile source armor unchanged');
     check(owned.metalness===.48&&owned.roughness===.42&&owned.emissiveIntensity===.16&&!owned.map&&!owned.normalMap&&!owned.roughnessMap,'Missile source armor response without textures');
     check(owned.userData.rim!==game.materials.enemyArmor.userData.rim,'Missile owns live rim uniforms');
     const shader={uniforms:{},fragmentShader:'void main() {\n#include <emissivemap_fragment>\n}'};
     owned.onBeforeCompile(shader);
     check(shader.uniforms.uRimStrength.value===.32&&shader.uniforms.uRimPower.value===2.8&&shader.fragmentShader.includes('rimFacing'),'Missile rim shader hook restored');
     geometry.computeBoundingBox();
     check(geometry.boundingBox.min.distanceTo(new Vector3(-.42,-.42,-.76))<1e-6&&geometry.boundingBox.max.distanceTo(new Vector3(.42,.42,.93))<1e-6,'Missile exact source envelope');
    }
    const targets=[{pos:new Vector3(7,12,55),velocity:new Vector3(2,0,1),alive:true},{pos:new Vector3(-8,9,50),alive:false},null];
    const compare=()=>{
     for(const key of Object.keys(control.missile)) {
      const a=missileTest.missile[key],b=control.missile[key];
      if(ArrayBuffer.isView(a))check(a.every((v,i)=>Object.is(v,b[i])),'Missile baseline typed state '+key);
      else if(key==='target')check(a.every((v,i)=>v===b[i]),'Missile target guard parity');
      else check(a===b,'Missile cursor/count parity '+key);
     }
    };
    for(let i=0;i<47;i++)for(const p of [missileTest,control])p.launchMissile(i%5,9,40,Math.sin(i),i%3-1,Math.cos(i),26,targets[i%3],{life:i%4===0?.2:6,turn:2.2,radius:1.1,damage:2});
    compare();
    for(let frame=0;frame<120;frame++) {
     const ctx={playerZ:0,fx:null};
     for(const p of [missileTest,control]){p.update(1/60,ctx);p.render(engine.camera);}
     compare();
     check(mesh.instanceMatrix.array.every((v,i)=>Object.is(v,control.missileMesh.instanceMatrix.array[i])),'Missile source velocity matrix parity');
    }
    for(const p of [missileTest,control])p.kill(p.missile,2,new Vector3());compare();
    for(const p of [missileTest,control]){p.clear();p.render(engine.camera);}compare();
    check(mesh.count===0&&mesh.instanceMatrix.updateRanges.length===0,'Missile clear suppresses packed draw');
    const poolGeometry=mesh.geometry,poolMaterial=mesh.material;
    for(let i=0;i<40;i++)missileTest.launchMissile((i%8-3.5)*2,9+Math.floor(i/8),35,0,0,1,26,null);
    missileTest.render(engine.camera);
    check(mesh.geometry===poolGeometry&&mesh.material===poolMaterial&&missileScene.children.length===5,'Missile reuse allocates no slot meshes/resources');
    const matrix=new Matrix4(),pos=new Vector3(),rot=new Quaternion(),scale=new Vector3();
    mesh.getMatrixAt(0,matrix);matrix.decompose(pos,rot,scale);
    check(scale.distanceTo(new Vector3(1,1,1))<1e-6&&pos.distanceTo(new Vector3(missileTest.missile.x[0],missileTest.missile.y[0],missileTest.missile.z[0]))<1e-6,'Missile source unit-scale root');
    engine.renderer.info.reset();engine.renderer.render(missileScene,engine.camera);
    const drawCalls=engine.renderer.info.render.calls,drawTriangles=engine.renderer.info.render.triangles;
    check(drawCalls===1&&drawTriangles===triangles*40,'Missile actual renderer single 40-slot draw: '+JSON.stringify({drawCalls,drawTriangles,triangles,count:mesh.count}));
    const neighbor=new Projectiles(new Scene(),game.materials,{});
    check(neighbor.missileMesh.geometry!==geometry&&(!productionPreview||neighbor.missileMesh.material!==owned),'Missile pools own independent clones');
    let disposedGeometry=0,disposedMaterial=0,sourceDisposals=0;
    geometry.addEventListener('dispose',()=>disposedGeometry++);
    owned?.addEventListener('dispose',()=>disposedMaterial++);
    const onSource=()=>sourceDisposals++;game.materials.enemyArmor.addEventListener('dispose',onSource);
    missileTest.clear();check(disposedGeometry===0&&disposedMaterial===0,'Missile reset retains resources');
    missileTest.dispose();missileTest.dispose();
    game.materials.enemyArmor.removeEventListener('dispose',onSource);
    check(disposedGeometry===1&&disposedMaterial===(productionPreview?1:0)&&sourceDisposals===0,'Missile exact-once shutdown preserves source');
    neighbor.launchMissile(0,9,40,0,0,1,26,null);neighbor.render(engine.camera);check(neighbor.missileMesh.count===1,'Missile neighboring pool survives');neighbor.dispose();
    missilePool={triangles,capacity:40,drawCalls,drawTriangles,baselineParityFrames:120,launchesIncludingOverflow:47,geometryDisposals:disposedGeometry,ownedMaterialDisposals:disposedMaterial,sourceDisposals};
   } finally {missileTest.dispose();control.dispose();}
   const pickupChecks=[];
   for(const kind of ['shield','spread','repair','fuel']) {
    const pk=new Pickup(game.scene,game.materials,kind,0,9,40);
    check(!!pk._importedRoot===productionPreview,kind+' pickup preview opt-in');
    check(Number.isFinite(pk.phase)&&pk.baseY===9&&pk.velocity.isVector3,'Pickup constructor completes state and halo');
    if(productionPreview) {
     const other=new Pickup(game.scene,game.materials,kind,0,9,40);
     check(pk.radius===2.2&&pk.score===(kind==='fuel'?150:250)&&pk.color===({shield:0x45e0ff,spread:0xffb43a,repair:0x52ffa8,fuel:0xffd76a}[kind]),kind+' pickup gameplay values');
     check(pk.shell.geometry!==other.shell.geometry&&pk.shell.material!==other.shell.material,'Shield instance ownership');
     check(pk.halo.material===other.halo.material&&pk.halo.material.opacity===.35,'Shield preserves shared halo');
     check(pk.shell.material.toneMapped===false&&pk.shape.material.toneMapped===false,'Shield authored unlit cues');
     check(Math.abs(pk.core.position.z+.3)<1e-6&&Math.abs(pk.shape.position.z-.1)<1e-6,'Shield source pivots');
     if(kind==='fuel')check(pk.shape.scale.equals(new Vector3(1,1,1)),'Fuel glyph scale baked once');
     if(kind==='spread'||kind==='fuel')for(const [name,strength] of [['shell',1.15],['shape',1.35]]) {
      const shared=game.materials.neon(pk.color,strength),material=pk[name].material;
      check(material!==shared&&material.color.equals(shared.color)&&material.vertexColors,'Spread owned source-neon clone and neutral vertex multiplier');
      check(!shared.vertexColors,'Spread does not mutate cached source neon');
     }
     const dt=1/60;
     for(const phase of [Math.PI/8,3*Math.PI/8]) {
      pk.phase=phase-dt;pk.update(dt,game._ctx(dt,1));
      check(Math.abs(pk.group.quaternion.dot(engine.camera.quaternion))>1-1e-6,'Shield billboard');
      check(Math.abs(pk.shell.scale.x-(1+Math.sin(phase*4)*.025))<1e-6,'Shield source pulse');
      check(Math.abs(pk.shape.rotation.z-Math.sin(phase*2.2)*.08)<1e-6,'Shield source wobble');
      check(Math.abs(pk.halo.scale.x-7*(1+Math.sin(phase*4)*.2))<1e-6,'Shield shared halo pulse');
      check(Math.abs(pk.pos.y-pk.baseY-Math.sin(phase*1.6)*.7)<1e-6,'Shield drift');
     }
     pk.pos.copy(game.player.pos).add(new Vector3(11,0,0));pk.update(dt,game._ctx(dt,2));
     check(Math.abs(pk.pos.x-game.player.pos.x-10.75)<1e-6,'Shield original magnet strength');
     const priorEnemies=game.enemies,priorPickups=game.pickups,oldShields=game.player.shields,oldSpread=game.player.spreadTimer,oldHull=game.player.hull,oldFuel=game.player.fuel,score=game.score;
     try {
      game.enemies=[];game.pickups=[pk];game.player.shields=0;game.player.spreadTimer=0;game.player.hull=game.player.hullMax-1;game.player.fuel=.4;
      pk.pos.copy(game.player.pos).add(new Vector3(pk.radius+game.player.radius+.01,0,0));
      game._collideContact(game._ctx(dt,2));check(pk.alive,'Shield collection respects radius');
      pk.pos.copy(game.player.pos);game._collideContact(game._ctx(dt,2));
      check(!pk.alive&&game.score===score+pk.score&&(kind==='shield'?game.player.shields===1:kind==='spread'?game.player.spreadTimer===14:kind==='fuel'?Math.abs(game.player.fuel-.7)<1e-9:game.player.hull===game.player.hullMax),kind+' collection grants source reward and score');
      if(kind==='repair'||kind==='fuel') {
       if(kind==='fuel')game.player.fuel=.9;
       const capped=new Pickup(game.scene,game.materials,kind,game.player.pos.x,game.player.pos.y,game.player.pos.z);
       try {game.pickups=[capped];game._collideContact(game._ctx(dt,2));check(!capped.alive&&(kind==='fuel'?game.player.fuel===1:game.player.hull===game.player.hullMax),kind+' respects source cap');}
       finally {capped.dispose();}
      }
     } finally {game.enemies=priorEnemies;game.pickups=priorPickups;game.player.shields=oldShields;game.player.spreadTimer=oldSpread;game.player.hull=oldHull;game.player.fuel=oldFuel;}
     const halo=pk.halo.material;let haloDisposals=0;const onHaloDispose=()=>haloDisposals++;halo.addEventListener('dispose',onHaloDispose);
     const resources=new Set(pk._importedRoot.userData.modelOwnedMaterials);pk._importedRoot.traverse(o=>{if(o.geometry)resources.add(o.geometry);});
     const disposed=new Map();for(const r of resources)r.addEventListener('dispose',()=>disposed.set(r,(disposed.get(r)||0)+1));
     pk.dispose();pk.dispose();halo.removeEventListener('dispose',onHaloDispose);
     check([...resources].every(r=>disposed.get(r)===1)&&haloDisposals===0,'Shield idempotent imported disposal preserves shared halo');
     other.update(dt,game._ctx(dt,3));check(other.shell.geometry.attributes.position.count>0,'Shield survivor remains usable');other.dispose();
     pickupChecks.push({kind,resourcesDisposed:resources.size,sharedHaloPreserved:true,collectionAward:pk.score,magnetSampleStep:.25});
    } else pk.dispose();
   }
   const flyers=[];
   for (const kind of ['drone','interceptor']) {
    const feature={x:0,y:9,z:40,seed:1};
    const first=createEnemy(kind,game.materials,feature);
    const second=createEnemy(kind,game.materials,feature);
    check(!!first._importedRoot===productionPreview,kind+' preview opt-in');
    if (productionPreview) {
     check(first.hp===(kind==='drone'?3:2)&&first.radius===2.2,kind+' mechanics');
     const meshes=root=>{const out=[];root.traverse(o=>{if(o.isMesh)out.push(o);});return out;};
     const firstBody=meshes(first.body),secondBody=meshes(second.body);
     check(firstBody.length===4&&firstBody.every((m,i)=>m.geometry!==secondBody[i].geometry),kind+' instance geometry');
     check(firstBody.every((m,i)=>m.material!==secondBody[i].material),kind+' instance materials');
     check(first.engine.material!==second.engine.material,kind+' independent engine cue');
     check(!first.flashMesh.visible&&first.flashMesh.scale.x>1,kind+' restored hidden flash');
     const bounds=new (await import('/node_modules/three/build/three.module.js')).Box3().setFromObject(first._importedRoot);
     check(bounds.min.x < -2.5 && bounds.max.x > 2.5,kind+' unit world scale');
     check(Math.abs(first.engine.position.z-(kind==='drone'?-1.95:-1.84))<1e-5,kind+' exhaust pivot');
     game.scene.add(first.group);
     const pivot=first.engine.position.clone();
     const contexts=[];
     for(const pattern of ['weave','strafe','orbit','dive','peel','launch']) {
      const e=createEnemy(kind,game.materials,{...feature,z:pattern==='peel'?game.player.pos.z+8:feature.z,
       pattern:pattern==='launch'?'weave':pattern==='peel'?'dive':pattern,launch:pattern==='launch'});
      game.scene.add(e.group);
      for(let i=0;i<180;i++)e.update(1/60,game._ctx(1/60,i/60));
      check(Number.isFinite(e.pos.length())&&Number.isFinite(e.group.rotation.z),kind+' '+pattern+' motion');
      check(e.engine.position.distanceTo(pivot)<1e-8,kind+' local exhaust stays fixed');
      check(e.engine.scale.x>=.97-1e-6&&e.engine.scale.x<=1.065+1e-6,kind+' thrust pulse');
      if(pattern==='peel')check(e.peeling,kind+' committed peel');
      if(pattern==='launch')check(!e.launching,kind+' launch reaches formation');
      contexts.push({pattern,bank:e.group.rotation.z,position:e.pos.toArray()});e.dispose();
     }
     first.hit(1,game._ctx(1/60,4));first.update(1/60,game._ctx(1/60,4));
     check(first.flashMesh.visible&&first.flashMat.opacity>0,kind+' hit flash active');
     for(let i=0;i<20;i++)first.update(1/60,game._ctx(1/60,4+i/60));
     check(!first.flashMesh.visible,kind+' hit flash expires');
     const resources=new Set(first._importedRoot.userData.modelOwnedMaterials);
     resources.add(first.flashMat);first._importedRoot.traverse(o=>{if(o.geometry)resources.add(o.geometry);});
     const disposals=new Map();for(const r of resources)r.addEventListener('dispose',()=>disposals.set(r,(disposals.get(r)||0)+1));
     first.dispose();
     check([...resources].every(r=>disposals.get(r)===1),kind+' every owned resource disposed exactly once');
     check(second.engine.material.color.r>0&&!second.flashMesh.visible,kind+' survivor unaffected');
     flyers.push({kind,contexts,resourcesDisposed:resources.size});
    } else first.dispose();
    second.dispose();
   }
   let heavyTurret;
   {
    const enemy=createEnemy('heavyTurret',game.materials,{x:0,y:0,z:40,seed:1});
    check(!!enemy._importedRoot===productionPreview,'Heavy turret preview opt-in');
    if(productionPreview) {
     game.scene.add(enemy.group);
     check(enemy.hp===6&&enemy.radius===3.4&&enemy.score===400,'Heavy turret gameplay values');
     check(enemy.barrels.length===2&&Math.abs(enemy.turntable.position.y-1.5)<1e-6,'Heavy turntable');
     for(const [i,b] of enemy.barrels.entries()) {
      check(b.parent===enemy.turntable&&Math.abs(b.position.x-(i?.675:-.675))<1e-6&&Math.abs(b.position.y-.225)<1e-6,'Heavy source gun pivot');
      for(const angle of [-90,-85,-45,0,45,85,90]) {
       b.rotation.x=angle*Math.PI/180;enemy.group.updateMatrixWorld(true);
       check(Number.isFinite(b.matrixWorld.elements[0]),'Heavy full elevation');
      }
     }
     check(enemy.eye.getObjectByName('charge-lens').material===game.materials.neon(0xff3d55,3),'Heavy source-neon charge cue');
     enemy.hasEngaged=true;enemy.firstShotPending=true;enemy.fireTimer=-.001;
     const shots=[],original=game.projectiles.fire;
     game.projectiles.fire=(...args)=>{
      const pivot=enemy.barrels[shots.length%2].getWorldPosition(new Vector3());
      const origin=new Vector3(args[1],args[2],args[3]),dir=new Vector3(args[4],args[5],args[6]);
      check(origin.distanceTo(pivot.clone().addScaledVector(dir,1.6))<1e-6,'Heavy shot remains at pivot plus predictive aim times1.6');
      check(args[7]===92&&args[8].width===1.35&&args[8].radius===.9,'Heavy shot properties');
      shots.push({origin:origin.toArray(),direction:dir.toArray()});
     };
     try {for(let i=0;i<36;i++)enemy.update(1/60,game._ctx(1/60,i/60));}
     finally {game.projectiles.fire=original;}
     check(shots.length===6&&enemy.burst===0,'Heavy three paired volleys');
     enemy.fireTimer=.25;enemy.update(1/60,game._ctx(1/60,Math.PI/48));
     check(enemy.eye.scale.x>1.44,'Heavy charge pulse full range');
     enemy.hit(1,game._ctx(1/60,1));enemy.update(1/60,game._ctx(1/60,1));
     check(enemy.flashMesh.parent===enemy.turntable&&enemy.flashMesh.visible,'Heavy yawing damage shell');
     const resources=new Set([...enemy._importedRoot.userData.modelOwnedMaterials,enemy.flashMat]);
     enemy._importedRoot.traverse(o=>{if(o.geometry)resources.add(o.geometry);});
     const disposed=new Map();for(const r of resources)r.addEventListener('dispose',()=>disposed.set(r,(disposed.get(r)||0)+1));
     enemy.dispose();check([...resources].every(r=>disposed.get(r)===1),'Heavy instance resources disposed exactly once');
     heavyTurret={shots,resourcesDisposed:resources.size,chargeCue:'source shared neon',fullElevationDegrees:[-90,90]};
    } else enemy.dispose();
   }
   let mine;
   {
    const enemy=createEnemy('mine',game.materials,{x:0,y:9,z:40,seed:1});
    check(!!enemy._importedRoot===productionPreview,'Mine preview opt-in');
    if(productionPreview) {
     game.scene.add(enemy.group);
     check(enemy.hp===1&&enemy.radius===1.9&&enemy.score===80,'Mine gameplay values');
     check(enemy.lamp.position.length()<1e-8,'Mine lamp at original root pivot');
     check(!enemy.flashMesh.visible&&Math.abs(enemy.flashMesh.scale.x-1.2)<1e-6,'Mine hidden flash authored scale');
     const {audio}=await import('/src/audio/Audio.js');
     const original=audio.mineArm;let warnings=0;audio.mineArm=()=>warnings++;
     const samples=[];
     try {
      for(const [distance,time] of [[40,Math.PI/8],[13.6,.1],[0,Math.PI/60],[0,3*Math.PI/60],[40,.3],[0,.4]]) {
       enemy.pos.copy(game.player.pos).add(new Vector3(0,0,distance));
       enemy.phase=-1/60; // Isolate each source proximity sample from bob displacement.
       enemy.update(1/60,game._ctx(1/60,time));
       const near=Math.max(0,1-distance/34);
       check(Math.abs(enemy.armed-near)<1e-6,'Mine proximity arming');
       check(Math.abs(enemy.lamp.scale.x-(1+Math.sin(time*(4+near*26))*(.015+near*.045)))<1e-6,'Mine source pulse curve');
       samples.push({distance,time,armed:enemy.armed,scale:enemy.lamp.scale.x});
      }
     } finally {audio.mineArm=original;}
     check(warnings===1,'Mine arm warning fires once after threshold crossing');
     check(Math.abs(enemy.group.rotation.x-6*.5/60)<1e-6&&Math.abs(enemy.group.rotation.y-6*.7/60)<1e-6,'Mine original tumble');
     const phase=enemy.phase+1/60,oldY=enemy.pos.y;
     enemy.update(1/60,game._ctx(1/60,.5));
     check(Math.abs(enemy.pos.y-oldY-Math.sin(phase*1.3)/60*1.6)<1e-6,'Mine integrated bob increment');
     enemy.hit(.25,game._ctx(1/60,1));enemy.update(1/60,game._ctx(1/60,1));
     check(enemy.flashMesh.visible&&enemy.flashMat.opacity>0,'Mine hit shell');
     const shared=enemy.lamp.material;let sharedDisposed=0;
     const onSharedDispose=()=>sharedDisposed++;shared.addEventListener('dispose',onSharedDispose);
     const resources=new Set([...enemy._importedRoot.userData.modelOwnedMaterials,enemy.flashMat]);
     enemy._importedRoot.traverse(o=>{if(o.geometry)resources.add(o.geometry);});
     const disposed=new Map();for(const r of resources)r.addEventListener('dispose',()=>disposed.set(r,(disposed.get(r)||0)+1));
     enemy.dispose();shared.removeEventListener('dispose',onSharedDispose);
     check([...resources].every(r=>disposed.get(r)===1)&&sharedDisposed===0,'Mine disposes every owned resource once and preserves shared neon');
     mine={samples,warnings,resourcesDisposed:resources.size};
    } else enemy.dispose();
   }
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
   let batch;
   if(productionPreview) {
    const geometryCounts=[],frameMs=[];
    engine.renderer.render(game.scene,engine.camera);
    const coldGeometryCount=engine.renderer.info.memory.geometries;
    // Sprites share one lazily uploaded geometry. Warm a visible halo before
    // measuring instance disposal, retaining its Materials-owned shared resource.
    const warmPickup=new Pickup(game.scene,game.materials,'shield',0,9,30);
    warmPickup.halo.frustumCulled=false;
    const sharedHaloGeometry=warmPickup.halo.geometry;
    engine.renderer.render(game.scene,engine.camera);
    warmPickup.dispose();engine.renderer.render(game.scene,engine.camera);
    const before=engine.renderer.info.memory.geometries;
    for(let cycle=0;cycle<3;cycle++) {
     const enemies=[];
     for(const kind of ['drone','interceptor'])for(let i=0;i<18;i++) {
      const e=createEnemy(kind,game.materials,{x:(i%6-2.5)*4,y:9+Math.floor(i/6)*3,z:game.player.pos.z+25+(i%3)*10,seed:i});
      enemies.push(e);game.scene.add(e.group);
     }
     for(let i=0;i<11;i++) {
      const e=createEnemy('heavyTurret',game.materials,{x:(i%6-2.5)*4,y:0,z:game.player.pos.z+20+Math.floor(i/6)*12,seed:i});
      enemies.push(e);game.scene.add(e.group);
     }
     for(let i=0;i<24;i++) {
      const e=createEnemy('mine',game.materials,{x:(i%8-3.5)*3,y:12,z:game.player.pos.z+20+Math.floor(i/8)*8,seed:i});
      enemies.push(e);game.scene.add(e.group);
     }
     for(let i=0;i<10;i++) {
      const e=createEnemy('parked',game.materials,{x:(i%5-2)*5,y:0,z:game.player.pos.z+30+Math.floor(i/5)*14,seed:i+1});
      enemies.push(e);game.scene.add(e.group);
     }
     const pickups=['shield','spread','repair','fuel'].flatMap(kind=>Array.from({length:24},(_,i)=>new Pickup(game.scene,game.materials,kind,(i%8-3.5)*3,16,game.player.pos.z+24+Math.floor(i/8)*8)));
     check(pickups.every(p=>p.halo.geometry===sharedHaloGeometry),'Pickup halos share one Sprite geometry');
     engine.renderer.render(game.scene,engine.camera);
     for(let i=0;i<5;i++) {
      for(const e of enemies)e.update(1/60,game._ctx(1/60,10+i/60));
      for(const p of pickups)p.update(1/60,game._ctx(1/60,10+i/60));
      const start=performance.now();engine.renderer.render(game.scene,engine.camera);frameMs.push(performance.now()-start);
     }
     enemies.forEach(e=>e.dispose());pickups.forEach(p=>p.dispose());engine.renderer.render(game.scene,engine.camera);
     geometryCounts.push(engine.renderer.info.memory.geometries);
    }
    check(geometryCounts.every(n=>n===before),'Mixed scene geometry returns to baseline: '+JSON.stringify({before,geometryCounts}));
    frameMs.sort((a,b)=>a-b);
    batch={copies:{drone:18,interceptor:18,heavyTurret:11,mine:24,parkedFighter:10,shieldPickup:24,spreadPickup:24,repairPickup:24,fuelPickup:24},cycles:3,coldGeometryCount,sharedHaloWarmupDelta:before-coldGeometryCount,geometryBaseline:before,geometryAfterCycles:geometryCounts,
     cpuRenderSubmitMedianMs:frameMs[Math.floor(frameMs.length/2)],
     caveat:'Synthetic 81-enemy plus96-pickup stress in actual scene with player/Sentinel. Pickup count is an explicit stress fixture, not a live maximum. CPU render submission timing in headless Chromium, not GPU frame-time or sustained hardware acceptance.'};
   }
   const {Fortress}=await import('/src/world/Fortress.js');
   const {Level}=await import('/src/world/Level.js');
   const landmarkScene=new Scene(),landmark=new Fortress(landmarkScene,game.materials,new Level(1,0),game.quality);
   const chunks=[],rngChecks=[];let landmarkTriangles=0,landmarkDisposed=0,sharedDisposals=0;
   const onShared=()=>sharedDisposals++;
   for(const m of [game.materials.hull,game.materials.darkMetal,game.materials.neonVertex])m.addEventListener('dispose',onShared);
   const originalDread=Fortress.prototype._dreadnought;
   landmark._dreadnought=function(batch,rng,z0,sector){
    const before=new Map([...batch.buckets].map(([key,b])=>[key,b.pos.n]));
    const control=new Rng(1);Object.assign(control,rng);
    originalDread.call(this,batch,rng,z0,sector);
    this._proceduralDreadnought({box(){},lamp(){},add(k,g){g.dispose();}},control,z0,sector);
    check(rng._s===control._s,'Dreadnought retains downstream RNG');rngChecks.push(z0);
    const added=[...batch.buckets].map(([key,b])=>({key,triangles:(b.pos.n-(before.get(key)||0))/9})).filter(x=>x.triangles);
    if(productionPreview)check(added.length<=3&&added.reduce((n,x)=>n+x.triangles,0)<=3500,'Dreadnought chunk budget');
    landmarkTriangles+=added.reduce((n,x)=>n+x.triangles,0);chunks.push({z0,added});
   };
   for(let i=35;i<=44;i++) {
    const group=landmark._buildChunk(i);
    group.traverse(o=>{if(o.isMesh){o.geometry.addEventListener('dispose',()=>landmarkDisposed++);if(o.material===game.materials.neonVertex)check(!!o.geometry.getAttribute('aAnim'),'Dreadnought neon has source animation buffer');}});
    engine.renderer.render(landmarkScene,engine.camera);landmark._disposeChunk(group);
   }
   check(!productionPreview||landmarkTriangles===16698,'Dreadnought sections emitted once including engine overflow: '+landmarkTriangles);
   check(landmark.root.children.length===0&&sharedDisposals===0,'Dreadnought retirement retains shared materials');
   for(const m of [game.materials.hull,game.materials.darkMetal,game.materials.neonVertex])m.removeEventListener('dispose',onShared);
   landmark.root.removeFromParent();
   for(const m of [game.materials.hull,game.materials.darkMetal,game.materials.neonVertex])m.addEventListener('dispose',onShared);
   const carrierChunks=[];let carrierTriangles=0,carrierRetired=0;
   landmark._carrier=function(batch,rng,z0,sector){
    const before=new Map([...batch.buckets].map(([key,b])=>[key,b.pos.n]));
    const control=new Rng(1);Object.assign(control,rng);
    Fortress.prototype._carrier.call(this,batch,rng,z0,sector);
    this._proceduralCarrier({box(){},lamp(){},stamp(){},add(k,g){g.dispose();}},control,z0,sector);
    check(rng._s===control._s,'Carrier downstream RNG parity');
    const added=[...batch.buckets].map(([key,b])=>({key,triangles:(b.pos.n-(before.get(key)||0))/9})).filter(x=>x.triangles);
    const triangles=added.reduce((n,x)=>n+x.triangles,0);
    if(productionPreview)check(added.length<=6&&triangles<=3500,'Carrier chunk budget');
    carrierTriangles+=triangles;carrierChunks.push({z0,triangles,buckets:added.length});
   };
   landmarkScene.add(landmark.root);
   let radarVertices=0;
   for(let i=67;i<=78;i++) {
    const group=landmark._buildChunk(i);
    group.traverse(o=>{if(!o.isMesh)return;
     o.geometry.addEventListener('dispose',()=>carrierRetired++);
     if(productionPreview&&o.material===game.materials.spinMetal){
      const pivot=o.geometry.getAttribute('aPivot'),spin=o.geometry.getAttribute('aSpin');
      check(!!pivot&&!!spin&&!o.frustumCulled&&!o.castShadow,'Carrier source radar shader buffers and flags');
      for(let j=0;j<pivot.count;j++)if(Math.abs(pivot.getX(j)-94)<1e-5&&Math.abs(pivot.getY(j)-39)<1e-5){check(Math.abs(pivot.getZ(j)-6930)<1e-4&&Math.abs(spin.getW(j)-.6)<1e-5,'Carrier radar world pivot/rate');radarVertices++;}
     }
    });
    engine.renderer.render(landmarkScene,engine.camera);landmark._disposeChunk(group);
   }
   check(carrierTriangles===(productionPreview?21330:8492),'Carrier emitted once across12 modules: '+carrierTriangles);
   check(!productionPreview||radarVertices>0,'Carrier radar geometry uploaded');
   check(sharedDisposals===0&&landmark.root.children.length===0,'Carrier retirement retains materials');
   landmark.root.removeFromParent();
   for(const m of [game.materials.hull,game.materials.darkMetal,game.materials.neonVertex])m.removeEventListener('dispose',onShared);
   const carrier={carrierTriangles,chunks:carrierChunks,radarVertices,chunkGeometriesDisposed:carrierRetired};
   const {Fortress:SourceFortress}=await import('/assets-source/production/asteroids/initial/reference/src/world/Fortress.js');
   const asteroidChunks=[];
   const sourceMaterials=[game.materials.hull,game.materials.darkMetal,game.materials.neonVertex,game.materials.rock];
   let asteroidSharedDisposals=0;const onAsteroidShared=()=>asteroidSharedDisposals++;
   sourceMaterials.forEach(m=>m.addEventListener('dispose',onAsteroidShared));
   for(const seed of [1,7,42]) {
    const level=new Level(seed,0),current=new Fortress(new Scene(),game.materials,level,game.quality),baseline=new SourceFortress(new Scene(),game.materials,level,game.quality);
    // Isolate asteroid substitution while keeping original landmark output in both.
    current._carrier=SourceFortress.prototype._carrier;current._dreadnought=SourceFortress.prototype._dreadnought;current._driftingWreckage=Fortress.prototype._proceduralWreckage;
    const states=[];
    for(const f of [current,baseline]) {
     const original=f._voidProps;
     f._voidProps=function(batch,rng,z0,sector){original.call(this,batch,rng,z0,sector);states.push(rng._s);};
    }
    const sector=level.sectors[4];
    for(let index=Math.ceil(sector.zStart/96);index<Math.floor(sector.zEnd/96);index++) {
     states.length=0;
     const actual=current._buildChunk(index),expected=baseline._buildChunk(index);
     check(states[0]===states[1],'Asteroid full void RNG parity');
     const meshes=g=>{const out=[];g.traverse(o=>{if(o.isMesh)out.push(o);});return out;};
     const am=meshes(actual),bm=meshes(expected);check(am.length===bm.length,'Asteroid complete chunk draw count unchanged');
     let rocks=0,triangles=0;
     for(let j=0;j<am.length;j++) {
      check(am[j].material===bm[j].material,'Asteroid retains shared material');
      const ag=am[j].geometry,bg=bm[j].geometry;
      if(am[j].material!==game.materials.rock) {
       for(const key of Object.keys(bg.attributes)){const aa=ag.getAttribute(key).array,ba=bg.getAttribute(key).array;check(aa.length===ba.length&&aa.every((v,k)=>Object.is(v,ba[k])),'Asteroid downstream buffers unchanged '+key);}
      } else {
       rocks++;triangles+=ag.attributes.position.count/3;
       check(!am[j].frustumCulled&&!am[j].castShadow,'Asteroid source spin flags');
       const signatures=g=>{const pivot=g.getAttribute('aPivot'),spin=g.getAttribute('aSpin'),out=new Set();for(let k=0;k<pivot.count;k++)out.add([pivot.getX(k),pivot.getY(k),pivot.getZ(k),spin.getX(k),spin.getY(k),spin.getZ(k),spin.getW(k)].join(','));return [...out].sort().join('|');};
       check(signatures(ag)===signatures(bg),'Asteroid original centers/axes/rates including barriers');
      }
     }
     asteroidChunks.push({seed,index,rockMeshes:rocks,rockTriangles:triangles});
     current._disposeChunk(actual);baseline._disposeChunk(expected);
    }
    current.root.removeFromParent();baseline.root.removeFromParent();
   }
   sourceMaterials.forEach(m=>m.removeEventListener('dispose',onAsteroidShared));
   check(asteroidSharedDisposals===0,'Asteroid chunk retirement preserves shared materials');
   const asteroids={completeChunks:asteroidChunks.length,chunks:asteroidChunks,sharedDisposals:asteroidSharedDisposals,sourceParity:'RNG,all nonrock buffers,rock draw count and centers/axes/rates'};
   const wreckTrials=[];
   for(const seed of [1,7,42,123])for(const index of [68,70,74,77]) {
    const level=new Level(seed,0),trials=[];
    for(const useImported of [true,false]) {
     const f=new Fortress(new Scene(),game.materials,level,game.quality),exclusions=new Map();let taken=false,state;
     const wreck=useImported?Fortress.prototype._driftingWreckage:Fortress.prototype._proceduralWreckage;
     const fields=['pos','nrm','uv','col','anim','pivot','spin'];
     f._driftingWreckage=function(batch,rng,z0,place){
      taken=true;const before=new Map([...batch.buckets].map(([k,b])=>[k,Object.fromEntries(fields.filter(n=>b[n]).map(n=>[n,b[n].n]))]));
      wreck.call(this,batch,rng,z0,place);
      for(const [k,b] of batch.buckets)exclusions.set(k,Object.fromEntries(fields.filter(n=>b[n]).map(n=>[n,[before.get(k)?.[n]||0,b[n].n]])));
     };
     const original=f._voidProps;let buffers;
     f._voidProps=function(batch,rng,z0,sector){
      original.call(this,batch,rng,z0,sector);state=rng._s;
      buffers=Object.fromEntries([...batch.buckets].map(([k,b])=>[k,Object.fromEntries(fields.filter(n=>b[n]).map(n=>{const range=exclusions.get(k)?.[n]||[0,0],v=b[n].a.subarray(0,b[n].n);return[n,[...v.subarray(0,range[0]),...v.subarray(range[1])]];}))]));
     };
     const group=f._buildChunk(index);engine.renderer.render(f.scene,engine.camera);f._disposeChunk(group);f.root.removeFromParent();
     trials.push({taken,state,buffers});
    }
    check(trials[0].state===trials[1].state&&trials[0].taken===trials[1].taken,'Wreckage branch RNG parity');
    check(JSON.stringify(trials[0].buffers)===JSON.stringify(trials[1].buffers),'Wreckage exact outside-branch buffers including asteroid kit');
    wreckTrials.push({seed,index,taken:trials[0].taken});
   }
   const wreckage={trials:wreckTrials,takenBranches:wreckTrials.filter(t=>t.taken).length,sourceParity:'Original branch state and all outside-branch buffers'};
   const antennaTrials=[];
   for(const seed of [1,42])for(const sectorIndex of [5,6])for(const offset of [2,5]) {
    const level=new Level(seed,0),index=Math.floor(level.sectors[sectorIndex].zStart/96)+offset,trials=[];
    for(const Class of [Fortress,SourceFortress]) {
     const f=new Class(new Scene(),game.materials,level,game.quality),excluded=new Map(),props=[];
     if(Class===Fortress)f._crates=Fortress.prototype._proceduralCrates;
     if(Class===Fortress)f._bunker=Fortress.prototype._proceduralBunker;
     const originalAntenna=f._antenna,originalDeck=f._deckProps;let state,buffers;
     f._antenna=function(batch,rng,x,z,theme){
      const fields=['pos','nrm','uv','col','anim','pivot','spin'];
      const before=new Map([...batch.buckets].map(([k,b])=>[k,Object.fromEntries(fields.filter(n=>b[n]).map(n=>[n,b[n].n]))]));
      const begin=batch.surfaces.length,wasCapture=batch.captureSurfaces;batch.captureSurfaces=true;
      originalAntenna.call(this,batch,rng,x,z,theme);batch.captureSurfaces=wasCapture;
      const surfaces=batch.surfaces.splice(begin),ranges={};let triangles=0;
      for(const [key,b] of batch.buckets) {
       if(!excluded.has(key))excluded.set(key,{});
       for(const name of fields.filter(n=>b[n])) {
        const range=[before.get(key)?.[name]||0,b[name].n];
        (excluded.get(key)[name]??=[]).push(range);ranges[key+name]=range;
        if(name==='pos')triangles+=(range[1]-range[0])/9;
       }
      }
      const neon=batch.buckets.get('neon'),nr=ranges.neonanim,colors=ranges.neoncol;
      const cue=[...neon.anim.a.subarray(nr[0],nr[0]+3)],color=[...neon.col.a.subarray(colors[0],colors[0]+3)];
      if(Class===Fortress&&productionPreview)check(triangles>=256&&triangles<=376,'Antenna runtime budget');
      props.push({x,z,state:rng._s,surfaces,cue,color});
     };
     f._deckProps=function(batch,rng,...args){
      originalDeck.call(this,batch,rng,...args);state=rng._s;
      buffers=Object.fromEntries([...batch.buckets].map(([key,b])=>[key,Object.fromEntries(['pos','nrm','uv','col','anim','pivot','spin'].filter(n=>b[n]).map(name=>{
       const input=b[name].a.subarray(0,b[name].n),ranges=excluded.get(key)?.[name]||[];let start=0;const values=[];
       for(const [lower,upper] of ranges){for(let j=start;j<lower;j++)values.push(input[j]);start=upper;}
       for(let j=start;j<input.length;j++)values.push(input[j]);return[name,values];
      }))]));
     };
     const group=f._buildChunk(index);engine.renderer.render(f.scene,engine.camera);f._disposeChunk(group);f.root.removeFromParent();trials.push({props,state,buffers});
    }
    check(JSON.stringify(trials[0])===JSON.stringify(trials[1]),'Antenna exact RNG,surfaces,cues and all outside-prop buffers');
    antennaTrials.push({seed,sectorIndex,index,props:trials[0].props.length});
   }
   check(antennaTrials.some(t=>t.props>0),'Antenna source placements exercised');
   const antenna={trials:antennaTrials,props:antennaTrials.reduce((n,t)=>n+t.props,0),sourceParity:'RNG,surface records,strobe tuples/colors,all outside-prop geometry buffers'};
   const coolingTrials=[];
   for(const seed of [1,7,42,123])for(const sectorIndex of [3])for(const offset of [1,3,5,7]) {
    const level=new Level(seed,0),index=Math.floor(level.sectors[sectorIndex].zStart/96)+offset,trials=[];
    for(const Class of [Fortress,SourceFortress]) {
     const f=new Class(new Scene(),game.materials,level,game.quality),excluded=new Map(),props=[];
     if(Class===Fortress)f._crates=Fortress.prototype._proceduralCrates;
     const originalCooling=f._coolingStack,originalDeck=f._deckProps;let state,buffers;
     f._coolingStack=function(batch,rng,x,z,emit){
      const fields=['pos','nrm','uv','col','anim','pivot','spin'];
      const before=new Map([...batch.buckets].map(([k,b])=>[k,Object.fromEntries(fields.filter(n=>b[n]).map(n=>[n,b[n].n]))]));
      const begin=batch.surfaces.length,wasCapture=batch.captureSurfaces;batch.captureSurfaces=true;
      originalCooling.call(this,batch,rng,x,z,emit);batch.captureSurfaces=wasCapture;
      const surfaces=batch.surfaces.splice(begin),ranges={};let triangles=0;
      for(const [key,b] of batch.buckets) {
       if(!excluded.has(key))excluded.set(key,{});
       for(const name of fields.filter(n=>b[n])) {
        const range=[before.get(key)?.[name]||0,b[name].n];
        (excluded.get(key)[name]??=[]).push(range);ranges[key+name]=range;
        if(name==='pos')triangles+=(range[1]-range[0])/9;
       }
      }
      const neon=batch.buckets.get('neon'),nr=ranges.neonanim,colors=ranges.neoncol;
      const cue=[...neon.anim.a.subarray(nr[0],nr[0]+3)],color=[...neon.col.a.subarray(colors[0],colors[0]+3)].map(v=>Math.round(v*1e5)/1e5);
      if(Class===Fortress&&productionPreview)check(triangles===460,'Cooling stack runtime budget');
      props.push({x,z,state:rng._s,surfaces,cue,color});
     };
     f._deckProps=function(batch,rng,...args){
      originalDeck.call(this,batch,rng,...args);state=rng._s;
      buffers=Object.fromEntries([...batch.buckets].map(([key,b])=>[key,Object.fromEntries(['pos','nrm','uv','col','anim','pivot','spin'].filter(n=>b[n]).map(name=>{
       const input=b[name].a.subarray(0,b[name].n),ranges=excluded.get(key)?.[name]||[];let start=0;const values=[];
       for(const [lower,upper] of ranges){for(let j=start;j<lower;j++)values.push(input[j]);start=upper;}
       for(let j=start;j<input.length;j++)values.push(input[j]);return[name,values];
      }))]));
     };
     const group=f._buildChunk(index);const emissions=f.emitters.map(e=>({...e,owner:e.owner===group}));f._disposeChunk(group);f.root.removeFromParent();trials.push({props,state,buffers,emissions});
    }
    check(JSON.stringify(trials[0])===JSON.stringify(trials[1]),'Cooling stack exact RNG,surfaces,cues and all outside-prop buffers');
    coolingTrials.push({seed,sectorIndex,index,props:trials[0].props.length});
   }
   check(coolingTrials.some(t=>t.props>0),'Cooling stack source placements exercised');
   const coolingStack={trials:coolingTrials,props:coolingTrials.reduce((n,t)=>n+t.props,0),sourceParity:'RNG,surface records,heat tuples/colors,steam emitter ownership and all outside-prop buffers'};
   const flakTrials=[];
   for(const seed of [1,7,42,123])for(const sectorIndex of [1])for(const offset of [2,4,6,8]) {
    const level=new Level(seed,0),index=Math.floor(level.sectors[sectorIndex].zStart/96)+offset,trials=[];
    for(const Class of [Fortress,SourceFortress]) {
     const f=new Class(new Scene(),game.materials,level,game.quality),excluded=new Map(),props=[];
     if(Class===Fortress)f._crates=Fortress.prototype._proceduralCrates;
     const originalFlak=f._flakGun,originalSky=f._skyline;let state,buffers;
     f._flakGun=function(batch,rng,x,z,emit,y=0){
      const fields=['pos','nrm','uv','col','anim','pivot','spin'];
      const before=new Map([...batch.buckets].map(([k,b])=>[k,Object.fromEntries(fields.filter(n=>b[n]).map(n=>[n,b[n].n]))]));
      const begin=batch.surfaces.length,wasCapture=batch.captureSurfaces;batch.captureSurfaces=true;
      originalFlak.call(this,batch,rng,x,z,emit,y);batch.captureSurfaces=wasCapture;
      const surfaces=batch.surfaces.splice(begin),ranges={};let triangles=0;
      for(const [key,b] of batch.buckets) {
       if(!excluded.has(key))excluded.set(key,{});
       for(const name of fields.filter(n=>b[n])) {
        const range=[before.get(key)?.[name]||0,b[name].n];
        (excluded.get(key)[name]??=[]).push(range);ranges[key+name]=range;
        if(name==='pos')triangles+=(range[1]-range[0])/9;
       }
      }
      if(Class===Fortress&&productionPreview)check(triangles===704,'Flak gun runtime budget');
      props.push({x,z,y,state:rng._s,surfaces});
     };
     f._skyline=function(batch,rng,...args){
      originalSky.call(this,batch,rng,...args);state=rng._s;
      buffers=Object.fromEntries([...batch.buckets].map(([key,b])=>[key,Object.fromEntries(['pos','nrm','uv','col','anim','pivot','spin'].filter(n=>b[n]).map(name=>{
       const input=b[name].a.subarray(0,b[name].n),ranges=excluded.get(key)?.[name]||[];let start=0;const values=[];
       for(const [lower,upper] of ranges){for(let j=start;j<lower;j++)values.push(input[j]);start=upper;}
       for(let j=start;j<input.length;j++)values.push(input[j]);return[name,values];
      }))]));
     };
     const group=f._buildChunk(index);const emissions=f.emitters.map(e=>({...e,owner:e.owner===group}));f._disposeChunk(group);f.root.removeFromParent();trials.push({props,state,buffers,emissions});
    }
    check(JSON.stringify(trials[0])===JSON.stringify(trials[1]),'Flak gun exact RNG,surfaces,cues and all outside-prop buffers');
    flakTrials.push({seed,sectorIndex,index,props:trials[0].props.length});
   }
   check(flakTrials.some(t=>t.props>0),'Flak gun source placements exercised');
   const flakGun={trials:flakTrials,props:flakTrials.reduce((n,t)=>n+t.props,0),sourceParity:'RNG,surface records,flak emitter position/direction/rate/owner and all outside-prop buffers'};
   const bunkerTrials=[];
   for(const seed of [1,7,42,123])for(const sectorIndex of [5,6])for(const offset of [1,3,5,7]) {
    const level=new Level(seed,0),index=Math.floor(level.sectors[sectorIndex].zStart/96)+offset,trials=[];
    for(const useImported of [true,false]) {
     const f=new Fortress(new Scene(),game.materials,level,game.quality),excluded=new Map(),props=[];
     const originalBunker=useImported?f._bunker:f._proceduralBunker,originalDeck=f._deckProps;let state,buffers;
     f._bunker=function(batch,rng,x,z,theme){
      const fields=['pos','nrm','uv','col','anim','pivot','spin'];
      const before=new Map([...batch.buckets].map(([k,b])=>[k,Object.fromEntries(fields.filter(n=>b[n]).map(n=>[n,b[n].n]))]));
      const begin=batch.surfaces.length,wasCapture=batch.captureSurfaces;batch.captureSurfaces=true;
      originalBunker.call(this,batch,rng,x,z,theme);batch.captureSurfaces=wasCapture;
      const surfaces=batch.surfaces.splice(begin),ranges={};let triangles=0;
      for(const [key,b] of batch.buckets) {
       if(!excluded.has(key))excluded.set(key,{});
       for(const name of fields.filter(n=>b[n])) {
        const range=[before.get(key)?.[name]||0,b[name].n];
        (excluded.get(key)[name]??=[]).push(range);ranges[key+name]=range;
        if(name==='pos')triangles+=(range[1]-range[0])/9;
       }
      }
      const neon=batch.buckets.get('neon'),nr=ranges.neonanim,colors=ranges.neoncol;
      const cue=[...neon.anim.a.subarray(nr[0],nr[0]+3)],color=[...neon.col.a.subarray(colors[0],colors[0]+3)];
      if(useImported&&productionPreview)check(triangles===468,'Bunker runtime budget');
      props.push({x,z,state:rng._s,surfaces,cue,color});
     };
     f._deckProps=function(batch,rng,...args){
      originalDeck.call(this,batch,rng,...args);state=rng._s;
      buffers=Object.fromEntries([...batch.buckets].map(([key,b])=>[key,Object.fromEntries(['pos','nrm','uv','col','anim','pivot','spin'].filter(n=>b[n]).map(name=>{
       const input=b[name].a.subarray(0,b[name].n),ranges=excluded.get(key)?.[name]||[];let start=0;const values=[];
       for(const [lower,upper] of ranges){for(let j=start;j<lower;j++)values.push(input[j]);start=upper;}
       for(let j=start;j<input.length;j++)values.push(input[j]);return[name,values];
      }))]));
     };
     const group=f._buildChunk(index);f._disposeChunk(group);f.root.removeFromParent();trials.push({props,state,buffers});
    }
    check(JSON.stringify(trials[0])===JSON.stringify(trials[1]),'Bunker exact RNG,surfaces,cues and all outside-prop buffers');
    bunkerTrials.push({seed,sectorIndex,index,props:trials[0].props.length});
   }
   check(bunkerTrials.some(t=>t.props>0),'Bunker source placements exercised');
   const bunker={trials:bunkerTrials,props:bunkerTrials.reduce((n,t)=>n+t.props,0),sourceParity:'RNG,surface records,warm tuples/colors,all outside-prop geometry buffers'};
   const fuelDepotTrials=[];
   for(const seed of [1,7,42,123])for(const sectorIndex of [0])for(const offset of Array.from({length:16},(_,i)=>i+1)) {
    const level=new Level(seed,0),index=Math.floor(level.sectors[sectorIndex].zStart/96)+offset,trials=[];
    for(const useImported of [true,false]) {
     const f=new Fortress(new Scene(),game.materials,level,game.quality),excluded=new Map(),props=[];
     const originalFuelDepot=useImported?f._fuelDepot:f._proceduralFuelDepot,originalDeck=f._deckProps;let state,buffers;
     f._fuelDepot=function(batch,rng,x,z){
      const fields=['pos','nrm','uv','col','anim','pivot','spin'];
      const before=new Map([...batch.buckets].map(([k,b])=>[k,Object.fromEntries(fields.filter(n=>b[n]).map(n=>[n,b[n].n]))]));
      const begin=batch.surfaces.length,wasCapture=batch.captureSurfaces;batch.captureSurfaces=true;
      originalFuelDepot.call(this,batch,rng,x,z);batch.captureSurfaces=wasCapture;
      const surfaces=batch.surfaces.splice(begin),ranges={};let triangles=0;
      for(const [key,b] of batch.buckets) {
       if(!excluded.has(key))excluded.set(key,{});
       for(const name of fields.filter(n=>b[n])) {
        const range=[before.get(key)?.[name]||0,b[name].n];
        (excluded.get(key)[name]??=[]).push(range);ranges[key+name]=range;
        if(name==='pos')triangles+=(range[1]-range[0])/9;
       }
      }
      if(useImported&&productionPreview)check(triangles===992,'Fuel depot runtime budget');
      props.push({x,z,state:rng._s,surfaces});
     };
     f._deckProps=function(batch,rng,...args){
      originalDeck.call(this,batch,rng,...args);state=rng._s;
      buffers=Object.fromEntries([...batch.buckets].map(([key,b])=>[key,Object.fromEntries(['pos','nrm','uv','col','anim','pivot','spin'].filter(n=>b[n]).map(name=>{
       const input=b[name].a.subarray(0,b[name].n),ranges=excluded.get(key)?.[name]||[];let start=0;const values=[];
       for(const [lower,upper] of ranges){for(let j=start;j<lower;j++)values.push(input[j]);start=upper;}
       for(let j=start;j<input.length;j++)values.push(input[j]);return[name,values];
      }))]));
     };
     const group=f._buildChunk(index);f._disposeChunk(group);f.root.removeFromParent();trials.push({props,state,buffers});
    }
    check(JSON.stringify(trials[0])===JSON.stringify(trials[1]),'FuelDepot exact RNG,surfaces and all outside-prop buffers');
    fuelDepotTrials.push({seed,sectorIndex,index,props:trials[0].props.length});
   }
   check(fuelDepotTrials.some(t=>t.props>0),'FuelDepot source placements exercised');
   const fuelDepot={trials:fuelDepotTrials,props:fuelDepotTrials.reduce((n,t)=>n+t.props,0),sourceParity:'RNG,surface records,zero method draws,all outside-prop geometry buffers'};
   const sceneryResults={};
   for(const method of ['_crates','_parkedFighter']) {
    const trials=[];
    for(const seed of [1,7,42,123])for(const sectorIndex of (method==='_crates'?[0,1,3,5,6]:[0]))for(const offset of [0,1,2,3]) {
     const level=new Level(seed,0),index=Math.floor(level.sectors[sectorIndex].zStart/96)+offset,pair=[];
     for(const useImported of [true,false]) {
      const f=new Fortress(new Scene(),game.materials,level,game.quality),excluded=new Map(),props=[];
      const original=useImported?f[method]:f[method==='_crates'?'_proceduralCrates':'_proceduralParkedFighter'];
      f[method]=function(batch,...args) {
       const fields=['pos','nrm','uv','col','anim','pivot','spin'];
       const before=new Map([...batch.buckets].map(([k,b])=>[k,Object.fromEntries(fields.filter(n=>b[n]).map(n=>[n,b[n].n]))]));
       const surfaceStart=batch.surfaces.length,wasCapture=batch.captureSurfaces;batch.captureSurfaces=true;
       const rng=args.find(a=>a&&typeof a.next==='function'),rngBefore=rng._s;
       original.call(this,batch,...args);batch.captureSurfaces=wasCapture;
       const surfaces=batch.surfaces.splice(surfaceStart);let triangles=0;
       for(const [key,b] of batch.buckets) {
        if(key==='paint')continue; // Hardstand paint bytes are compared unchanged.
        if(!excluded.has(key))excluded.set(key,{});
        for(const name of fields.filter(n=>b[n])) {
         const range=[before.get(key)?.[name]||0,b[name].n];
         (excluded.get(key)[name]??=[]).push(range);
         if(name==='pos')triangles+=(range[1]-range[0])/9;
        }
       }
       if(useImported&&productionPreview&&method==='_parkedFighter')check(triangles===1348,'Covered airframe triangle budget');
       props.push({args:args.filter(a=>a!==rng),rngBefore,rngAfter:rng._s,surfaces});
      };
      let state,buffers;const originalDeck=f._deckProps;
      f._deckProps=function(batch,rng,...args) {
       originalDeck.call(this,batch,rng,...args);state=rng._s;
       buffers=Object.fromEntries([...batch.buckets].map(([key,b])=>[key,Object.fromEntries(['pos','nrm','uv','col','anim','pivot','spin'].filter(n=>b[n]).map(name=>{
        const input=b[name].a.subarray(0,b[name].n),ranges=excluded.get(key)?.[name]||[];let start=0;const values=[];
        for(const [lower,upper] of ranges){for(let j=start;j<lower;j++)values.push(input[j]);start=upper;}
        for(let j=start;j<input.length;j++)values.push(input[j]);return[name,values];
       }))]));
      };
      const group=f._buildChunk(index),meshes=[];
      group.traverse(o=>{if(o.isMesh&&o.material===game.materials.hull)meshes.push(o.geometry);});
      const counts=new Map();for(const g of new Set(meshes))g.addEventListener('dispose',()=>counts.set(g,(counts.get(g)||0)+1));
      const emissions=f.emitters.map(e=>({...e,owner:e.owner===group}));
      f._disposeChunk(group);f.root.removeFromParent();
      check([...counts].every(([,n])=>n===1),'Cargo/covered merged hull retires exactly once');
      pair.push({props,state,buffers,emissions});
     }
     check(JSON.stringify(pair[0])===JSON.stringify(pair[1]),method+' original arguments,RNG,surfaces,paint,emitters and outside-prop buffers');
     trials.push({seed,sectorIndex,index,props:pair[0].props.length});
    }
    check(trials.some(t=>t.props>0),method+' source placements exercised');
    sceneryResults[method==='_crates'?'cargoKit':'coveredFighter']={trials,props:trials.reduce((n,t)=>n+t.props,0),sourceParity:'Original arguments,RNG,surfaces,paint,emitters,outside-prop buffers and merged hull retirement'};
   }
   const dreadnought={landmarkTriangles,chunks,rngChecks:rngChecks.length,chunkGeometriesDisposed:landmarkDisposed,sharedDisposals};
   return {selectedFighter:game.player.model.name,groundTargets:['turret','radar','silo','fuel'],productionPreview,...sceneryResults,fuelDepot,bunker,flakGun,coolingStack,antenna,wreckage,asteroids,carrier,dreadnought,missilePool,parkedFighter,pickupChecks,flyers,heavyTurret,mine,batch,iterations:results};
  },productionPreview);
  if(errors.length)throw Error(errors.join('\n'));
  fs.mkdirSync('artifacts/imported-models',{recursive:true});
  fs.writeFileSync('artifacts/imported-models/'+(productionPreview?'production-report.json':'report.json'),JSON.stringify({...report,errors},null,2)+'\n');
  await page.screenshot({path:'artifacts/imported-models/in-game.png'});
  if(productionPreview)for(const rig of ['classic','modern','chase']) {
   await page.evaluate(async rig=>{
    const {settings}=await import('/src/core/Settings.js');
    const {createEnemy}=await import('/src/entities/Enemies.js');
    const {Pickup}=await import('/src/entities/Pickup.js');
    const {game,engine}=window.KZ;
    game.start({seed:123});engine.stop();
    settings.set('camera',rig);game.player.pos.set(0,9,0);game.rig.applyRig();game.rig.snap(game.player);
    for(const [i,kind] of ['drone','interceptor'].entries()) {
     const e=createEnemy(kind,game.materials,{x:i?5:-5,y:9,z:32,seed:1});
     game.scene.add(e.group);game.enemies.push(e);
    }
    for(const [x,kind] of [[-6,'turret'],[6,'heavyTurret']]) {
     const e=createEnemy(kind,game.materials,{x,y:0,z:20,seed:1});
     // Static charged comparison, with the original update driving yaw/pitch.
     e.hasEngaged=true;e.fireTimer=.25;e.update(1/60,game._ctx(1/60,Math.PI/48));
     game.scene.add(e.group);game.enemies.push(e);
    }
    const mine=createEnemy('mine',game.materials,{x:-9,y:9,z:28,seed:1});
    mine.update(1/60,game._ctx(1/60,.5));game.scene.add(mine.group);game.enemies.push(mine);
    const shield=new Pickup(game.scene,game.materials,'shield',9,9,24);
    shield.phase=.4;shield.update(1/60,game._ctx(1/60,.5));game.pickups.push(shield);
    if(Math.abs(shield.group.quaternion.dot(engine.camera.quaternion))<1-1e-6)throw Error('Shield billboard in '+rig);
    const spread=new Pickup(game.scene,game.materials,'spread',0,14,28);
    spread.phase=.4;spread.update(1/60,game._ctx(1/60,.5));game.pickups.push(spread);
    if(Math.abs(spread.group.quaternion.dot(engine.camera.quaternion))<1-1e-6)throw Error('Spread billboard in '+rig);
    const repair=new Pickup(game.scene,game.materials,'repair',-9,14,24);
    repair.phase=.4;repair.update(1/60,game._ctx(1/60,.5));game.pickups.push(repair);
    if(Math.abs(repair.group.quaternion.dot(engine.camera.quaternion))<1-1e-6)throw Error('Repair billboard in '+rig);
    const fuelPickup=new Pickup(game.scene,game.materials,'fuel',9,14,24);
    fuelPickup.phase=.4;fuelPickup.update(1/60,game._ctx(1/60,.5));game.pickups.push(fuelPickup);
    if(Math.abs(fuelPickup.group.quaternion.dot(engine.camera.quaternion))<1-1e-6)throw Error('Fuel billboard in '+rig);
    const parked=createEnemy('parked',game.materials,{x:-10,y:0,z:16,seed:1});
    parked.scramble=false;parked.update(1/60,game._ctx(1/60,.5));game.scene.add(parked.group);game.enemies.push(parked);
    game.projectiles.clear();
    for(const [x,y,z,dx,dy,dz] of [[-4,10,20,0,1,0],[0,10,26,1,0,1],[4,10,32,0,0,-1]])game.projectiles.launchMissile(x,y,z,dx,dy,dz,26,null);
    game.projectiles.render(engine.camera);
    engine.renderer.render(game.scene,engine.camera);
   },rig);
   await page.locator('canvas').first().screenshot({path:`artifacts/imported-models/production-${rig}.png`});
  }
  if(productionPreview)for(const rig of ['classic','modern','chase']) {
   await page.evaluate(async rig=>{
    const {settings}=await import('/src/core/Settings.js');
    const {game,engine}=window.KZ;
    game.start({seed:1});engine.stop();game.player.pos.set(0,9,3510);
    engine.sky.apply(game.level.sectors[2].sky,3);engine.sky.update(0,0,game.player.pos);
    engine.underlay?.setEnvironment(game.level.sectors[2].sky,true);
    settings.set('camera',rig);game.rig.applyRig();game.rig.snap(game.player);
    game.player.group.position.copy(game.player.pos);
    game.fortress.clear();
    for(let i=35;i<=40;i++)game.fortress.chunks.set(i,game.fortress._buildChunk(i));
    engine.renderer.render(game.scene,engine.camera);
   },rig);
   await page.locator('canvas').first().screenshot({path:`artifacts/imported-models/dreadnought-${rig}.png`});
  }
  if(productionPreview)for(const rig of ['classic','modern','chase']) {
   await page.evaluate(async rig=>{
    const {settings}=await import('/src/core/Settings.js');const {game,engine}=window.KZ;
    game.start({seed:1});engine.stop();game.player.pos.set(0,13,6810);
    engine.sky.apply(game.level.sectors[4].sky,5);engine.sky.update(0,0,game.player.pos);
    engine.underlay?.setEnvironment(game.level.sectors[4].sky,true);
    settings.set('camera',rig);game.rig.applyRig();game.rig.snap(game.player);
    game.fortress.clear();for(let i=68;i<=75;i++)game.fortress.chunks.set(i,game.fortress._buildChunk(i));
    game.materials.update(1.25);engine.renderer.render(game.scene,engine.camera);
   },rig);
   await page.locator('canvas').first().screenshot({path:`artifacts/imported-models/carrier-${rig}.png`});
  }
  if(productionPreview)for(const rig of ['classic','modern','chase']) {
   await page.evaluate(async rig=>{
    const {settings}=await import('/src/core/Settings.js');const {game,engine}=window.KZ;
    game.start({seed:42});engine.stop();game.fortress.clear();
    const start=Math.floor(game.level.sectors[5].zStart/96)+2,placements=[],original=game.fortress._antenna;
    game.fortress._antenna=function(batch,rng,x,z,theme){placements.push({x,z});original.call(this,batch,rng,x,z,theme);};
    try{for(let i=start;i<start+4;i++)game.fortress.chunks.set(i,game.fortress._buildChunk(i));}finally{delete game.fortress._antenna;}
    if(!placements.length)throw Error('No source antenna for camera capture');
    game.player.pos.set(12,6,placements[0].z-30);
    engine.sky.apply(game.level.sectors[5].sky,47);engine.sky.update(0,0,game.player.pos);
    engine.underlay?.setEnvironment(game.level.sectors[5].sky,false);
    settings.set('camera',rig);game.rig.applyRig();game.rig.snap(game.player);
    game.materials.update(1.25);engine.renderer.render(game.scene,engine.camera);
   },rig);
   await page.locator('canvas').first().screenshot({path:`artifacts/imported-models/antenna-${rig}.png`});
  }
  if(productionPreview)for(const rig of ['classic','modern','chase']) {
   await page.evaluate(async rig=>{
    const {settings}=await import('/src/core/Settings.js');const {game,engine}=window.KZ;
    game.start({seed:42});engine.stop();game.fortress.clear();
    const start=Math.floor(game.level.sectors[3].zStart/96)+3,placements=[],original=game.fortress._coolingStack;
    game.fortress._coolingStack=function(batch,rng,x,z,emit){placements.push({x,z});original.call(this,batch,rng,x,z,emit);};
    try{for(let i=start;i<start+4;i++)game.fortress.chunks.set(i,game.fortress._buildChunk(i));}finally{delete game.fortress._coolingStack;}
    if(!placements.length)throw Error('No source cooling stack for capture');
    game.player.pos.set(12,6,placements[0].z-30);
    engine.sky.apply(game.level.sectors[3].sky,45);engine.sky.update(0,0,game.player.pos);
    engine.underlay?.setEnvironment(game.level.sectors[3].sky,false);
    settings.set('camera',rig);game.rig.applyRig();game.rig.snap(game.player);
    game.materials.update(1.25);engine.renderer.render(game.scene,engine.camera);
   },rig);
   await page.locator('canvas').first().screenshot({path:`artifacts/imported-models/cooling-stack-${rig}.png`});
  }
  if(productionPreview)for(const rig of ['classic','modern','chase']) {
   await page.evaluate(async rig=>{
    const {settings}=await import('/src/core/Settings.js');const {game,engine}=window.KZ;
    game.start({seed:7});engine.stop();game.fortress.clear();
    game.player.pos.set(16,25,2328.024718);
    for(let i=23;i<=27;i++)game.fortress.chunks.set(i,game.fortress._buildChunk(i));
    engine.sky.apply(game.level.sectors[1].sky,8);engine.sky.update(0,0,game.player.pos);
    engine.underlay?.setEnvironment(game.level.sectors[1].sky,false);
    settings.set('camera',rig);game.rig.applyRig();game.rig.snap(game.player);
    game.materials.update(1.25);engine.renderer.render(game.scene,engine.camera);
   },rig);
   await page.locator('canvas').first().screenshot({path:`artifacts/imported-models/flak-gun-${rig}.png`});
  }
  if(productionPreview)for(const rig of ['classic','modern','chase']) {
   await page.evaluate(async rig=>{
    const {settings}=await import('/src/core/Settings.js');const {game,engine}=window.KZ;
    game.start({seed:1});engine.stop();game.fortress.clear();
    const start=Math.floor(game.level.sectors[5].zStart/96)+2,placements=[],original=game.fortress._bunker;
    game.fortress._bunker=function(batch,rng,x,z,theme){placements.push({x,z});original.call(this,batch,rng,x,z,theme);};
    try{for(let i=start;i<start+4;i++)game.fortress.chunks.set(i,game.fortress._buildChunk(i));}finally{delete game.fortress._bunker;}
    if(!placements.length)throw Error('No source bunker for camera capture');
    game.player.pos.set(12,6,placements[0].z-30);
    engine.sky.apply(game.level.sectors[5].sky,6);engine.sky.update(0,0,game.player.pos);
    engine.underlay?.setEnvironment(game.level.sectors[5].sky,false);
    settings.set('camera',rig);game.rig.applyRig();game.rig.snap(game.player);
    game.materials.update(1.25);engine.renderer.render(game.scene,engine.camera);
   },rig);
   await page.locator('canvas').first().screenshot({path:`artifacts/imported-models/bunker-${rig}.png`});
  }
  if(productionPreview)for(const rig of ['classic','modern','chase']) {
   await page.evaluate(async rig=>{
    const {settings}=await import('/src/core/Settings.js');const {game,engine}=window.KZ;
    game.start({seed:1});engine.stop();game.fortress.clear();
    const start=Math.floor(game.level.sectors[0].zStart/96)+1,placements=[],original=game.fortress._fuelDepot;
    game.fortress._fuelDepot=function(batch,rng,x,z){placements.push({x,z});original.call(this,batch,rng,x,z);};
    try{for(let i=start;i<start+4;i++)game.fortress.chunks.set(i,game.fortress._buildChunk(i));}finally{delete game.fortress._fuelDepot;}
    if(!placements.length)throw Error('No source fuel-depot for camera capture');
    game.player.pos.set(12,6,placements[0].z-30);
    engine.sky.apply(game.level.sectors[0].sky,6);engine.sky.update(0,0,game.player.pos);
    engine.underlay?.setEnvironment(game.level.sectors[0].sky,false);
    settings.set('camera',rig);game.rig.applyRig();game.rig.snap(game.player);
    game.materials.update(1.25);engine.renderer.render(game.scene,engine.camera);
   },rig);
   await page.locator('canvas').first().screenshot({path:`artifacts/imported-models/fuel-depot-${rig}.png`});
  }
  if(productionPreview)for(const asset of ['cargo-kit','covered-fighter'])for(const rig of ['classic','modern','chase']) {
   await page.evaluate(async({asset,rig})=>{
    const {settings}=await import('/src/core/Settings.js');const {game,engine}=window.KZ;
    game.start({seed:42});engine.stop();game.fortress.clear();
    const method=asset==='cargo-kit'?'_crates':'_parkedFighter',placements=[],original=game.fortress[method];
    game.fortress[method]=function(batch,...args){placements.push(asset==='cargo-kit'?{x:args[1],z:args[2]}:{x:args[0],z:args[1]});original.call(this,batch,...args);};
    try{for(let i=0;i<4;i++)game.fortress.chunks.set(i,game.fortress._buildChunk(i));}finally{delete game.fortress[method];}
    if(!placements.length)throw Error('No source '+asset+' for camera capture');
    const chosen=placements[0];game.player.pos.set(asset==='cargo-kit'?-10:4,6,chosen.z-30);
    engine.sky.apply(game.level.sectors[0].sky,6);engine.sky.update(0,0,game.player.pos);
    engine.underlay?.setEnvironment(game.level.sectors[0].sky,false);
    settings.set('camera',rig);game.rig.applyRig();game.rig.snap(game.player);
    game.materials.update(1.25);engine.renderer.render(game.scene,engine.camera);
   },{asset,rig});
   await page.locator('canvas').first().screenshot({path:`artifacts/imported-models/${asset}-${rig}.png`});
  }
  if(productionPreview) {
   report.asteroidTemplateShutdown=await page.evaluate(async()=>{
    const {importedTemplate,disposeImportedModels}=await import('/src/render/ImportedModels.js');
    const {importedAntennaTemplates}=await import('/src/render/ImportedAntenna.js');
    const antennaGeometries=Object.values(importedAntennaTemplates());
    const root=importedTemplate('asteroids'),geometries=new Set(root.userData.templateGeometries);
    root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);});
    const asteroidGeometryCount=geometries.size;antennaGeometries.forEach(g=>geometries.add(g));
    const bunkerGeometries=[];importedTemplate('bunker').traverse(o=>{if(o.geometry){bunkerGeometries.push(o.geometry);geometries.add(o.geometry);}});
    const {importedFuelDepotTemplates}=await import('/src/render/ImportedFuelDepot.js');
    const fuelDepotGeometries=importedFuelDepotTemplates();fuelDepotGeometries.forEach(g=>geometries.add(g));
    const {importedCargoTemplates}=await import('/src/render/ImportedCargo.js');
    const {importedCoveredFighterTemplates}=await import('/src/render/ImportedCoveredFighter.js');
    const cargoGeometries=importedCargoTemplates(),coveredGeometries=importedCoveredFighterTemplates();
    [...cargoGeometries,...coveredGeometries].forEach(g=>geometries.add(g));
    const counts=new Map();for(const g of geometries)g.addEventListener('dispose',()=>counts.set(g,(counts.get(g)||0)+1));
    disposeImportedModels();disposeImportedModels();
    if(![...geometries].every(g=>counts.get(g)===1))throw Error('Asteroid template shutdown exactly once');
    return {geometries:asteroidGeometryCount,antennaGeometries:antennaGeometries.length,bunkerGeometries:bunkerGeometries.length,fuelDepotGeometries:fuelDepotGeometries.length,cargoGeometries:cargoGeometries.length,coveredGeometries:coveredGeometries.length,disposedExactlyOnce:true};
   });
   fs.writeFileSync('artifacts/imported-models/production-report.json',JSON.stringify({...report,errors},null,2)+'\n');
  }
  console.log(JSON.stringify(report,null,2));
 } catch(error) {
  if(errors.length)console.error('Browser errors:',errors);
  throw error;
 } finally {await browser?.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
