/* Browser-side bot. Test tooling only; never imported by the production game.
 * Uses the unmodified Engine._loop, including hit stop, time scaling, substeps,
 * input folding, collision checks, actor updates and presentation. Only rAF
 * scheduling and render cadence are controlled by the accelerated test clock.
 */
window.KZBot = (() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  let active=null;
  function begin(spec) {
    if(active)throw Error('Previous bot episode not closed');
    const k=window.KZ,{engine:e,game:g}=k;
    e.stop();
    if(Number.isFinite(spec.timeOrigin)&&!spec.attachCurrent)e.time=spec.timeOrigin;
    if(spec.attachCurrent){
      if(g.state!=='playing'||g.loop!==spec.loop||g.seed!==spec.seed)throw Error('Earned continuation state mismatch');
    }else{
      g.start({seed:spec.seed});
      // A labelled loop-start fixture, not a claim of earning prior victories.
      if(spec.loop){g.reset(spec.seed,spec.loop);g._enterSector(0);}
    }
    const i=e.input,p=g.player;
    const original={raf:window.requestAnimationFrame,render:e.postfx.render,
      damage:p.damage,crash:g._crash,warn:g.warn,fire:g.projectiles.fire,getGamepads:navigator.getGamepads};
    const run={spec,frames:0,renderedFrames:0,rawSeconds:0,events:[],samples:[],
      sectors:[],features:{},bossPhases:[],rackHits:0,rackDetonations:0,
      maxHeat:0,minFuel:1,observedShots:0,previousZ:p.pos.z,decision:null,lastSector:-1,lastBossPhase:-1,
      lastRackHits:0,lastRackCharging:false,held:new Set(),renderCpuMs:[],renderStalls:[],renderStallCount:0,
      startedAt:performance.now(),original,k,done:false};
    active=run;
    window.requestAnimationFrame=()=>0;
    e.postfx.render=function(dt){
      if(run.frames%spec.renderEvery!==0)return;
      const start=performance.now(),programsBefore=e.renderer.info.programs.length;
      original.render.call(this,dt);
      const durationMs=performance.now()-start;
      run.renderCpuMs.push(durationMs);run.renderedFrames++;
      // Observe slow submissions at their actual sector/state; no timing law or
      // renderer behavior changes. These are CPU submissions, not GPU timings.
      if(durationMs>=50){
        const stall={type:'render-submission-stall',frame:run.frames,durationMs,
          performanceNow:start,wallTimeMs:performance.timeOrigin+start,
          z:p.pos.z,sector:g.sectorIndex,loop:g.loop,state:g.state,bossPhase:g.boss?.phase??null,
          programsBefore,programsAfter:e.renderer.info.programs.length,
          memory:{...e.renderer.info.memory},canvas:[e.canvas.width,e.canvas.height],
          settings:{...k.settings.values},decision:run.decision};
        run.renderStallCount++;run.events.push(stall);run.renderStalls.push(stall);
        run.renderStalls.sort((a,b)=>b.durationMs-a.durationMs);run.renderStalls.length=Math.min(16,run.renderStalls.length);
      }
      run.lastRenderStats={frame:run.frames,calls:e.renderer.info.render.calls,
        triangles:e.renderer.info.render.triangles,points:e.renderer.info.render.points,
        lines:e.renderer.info.render.lines,canvas:{width:e.canvas.width,height:e.canvas.height}};
    };
    // Observational wrappers invoke the originals unchanged and return exactly
    // their result. No health/fuel/aim/cadence/invulnerability override is used.
    p.damage=function(amount,ctx,opts){const before=this.hull;
      const result=original.damage.call(this,amount,ctx,opts);
      if(result!=='none')run.events.push({type:'damage',frame:run.frames,z:this.pos.z,amount,result,before,hull:this.hull,source:opts?.source??'combat'});
      return result;
    };
    g._crash=function(ctx,c,tag){const before={hull:p.hull,shields:p.shields,invuln:p.invuln};const result=original.crash.call(this,ctx,c,tag);
      run.events.push({type:'collision',frame:run.frames,z:p.pos.z,tag,before,hull:p.hull,shields:p.shields,
        damaging:p.hull!==before.hull||p.shields!==before.shields,decision:run.decision});return result;
    };
    g.warn=function(label){run.events.push({type:'warning',frame:run.frames,z:p.pos.z,label});return original.warn.call(this,label)};
    g.projectiles.fire=function(side,...args){
      const result=original.fire.call(this,side,...args);
      if(side===0){run.observedShots++;if(run.observedShots===1)run.events.push({type:'first-shot',frame:run.frames,z:p.pos.z});}
      return result;
    };
    const axes=[0,0],buttons=Array.from({length:17},()=>({pressed:false,touched:false,value:0}));
    run.pad={id:'KZ synthetic standard test pad',mapping:'standard',connected:true,index:0,axes,buttons,timestamp:0};
    if(spec.profile==='gamepad')Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[run.pad]});
    document.activeElement?.blur?.();
    return {initial:{hull:p.hull,shields:p.shields,fuel:p.fuel,loop:g.loop,z:p.pos.z,
      engineTime:e.time,settings:{...k.settings.values},viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},
      canvas:{width:e.canvas.width,height:e.canvas.height}},
      fixture:spec.attachCurrent?'earned-continuation':'seeded-loop-start',operator:'primary developed bot',input:spec.profile};
  }

  function intent(run,x,y,fire,roll) {
    const i=run.k.engine.input;
    if(run.spec.profile==='keyboard'){
      const keys=new Set();
      if(x<-.15)keys.add('ArrowLeft');if(x>.15)keys.add('ArrowRight');
      if(y<-.15)keys.add('ArrowDown');if(y>.15)keys.add('ArrowUp');
      if(fire)keys.add('Space');if(roll)keys.add('KeyL');
      for(const key of run.held)if(!keys.has(key))window.dispatchEvent(new KeyboardEvent('keyup',{code:key,bubbles:true}));
      for(const key of keys)if(!run.held.has(key))window.dispatchEvent(new KeyboardEvent('keydown',{code:key,bubbles:true}));
      run.held=keys;
    }else if(run.spec.profile==='gamepad'){
      const axis=v=>v===0?0:Math.sign(v)*.18+v*.82;
      run.pad.axes[0]=axis(x);run.pad.axes[1]=-axis(y);run.pad.timestamp=performance.now();
      for(const b of run.pad.buttons)b.pressed=b.touched=false,b.value=0;
      // RT fires without the menu-confirm shortcut associated with A.
      run.pad.buttons[7]={pressed:fire,touched:fire,value:fire?1:0};
      run.pad.buttons[3]={pressed:roll,touched:roll,value:roll?1:0};
    }else{
      // Synthetic touch intent exercises the normal Input.update fold, not
      // touch hit-testing/physical-device latency. Those need separate UI QA.
      i.lastDevice='touch';i._touchVec.x=x;i._touchVec.y=y;i._touchFire=fire;
      i._touchRollQueued=roll;
    }
  }

  function decide(run) {
    const {game:g,engine:e}=run.k,p=g.player;
    let x=p.pos.x,y=10,reason='cruise',target=null;
    const look=Math.max(90,p.speed*1.65);
    const feats=g.level.features;
    // Read the next geometric constraint; all movement remains normal input.
    const f=feats.find(f=>f.z>=p.pos.z-7&&f.z<p.pos.z+look&&['wall','gate','arch','fence','platform'].includes(f.kind));
    if(f){
      reason=`avoid-${f.kind}${f.type?'-'+f.type:''}`;
      if(f.kind==='wall'){
        if(f.columns){
          const candidates=[];
          for(let cx=-14;cx<=14;cx+=.5)if(!f.gaps.some(c=>Math.abs(cx-c.x)<c.w/2+1.8))candidates.push(cx);
          if(candidates.length)x=candidates.reduce((a,b)=>Math.abs(a-p.pos.x)<Math.abs(b-p.pos.x)?a:b);
          y=10;
        }else{
          const gap=f.gaps[0];
          x=clamp(p.pos.x,gap.x-gap.w/2+2,gap.x+gap.w/2-2);
          y=gap.y+gap.h/2;
        }
      }else if(f.kind==='gate'){
        const arrival=e.time+Math.max(0,f.z-p.pos.z)/Math.max(1,p.speed);
        const gy=f.gapY+(f.cycle>0?Math.sin(arrival*6.283/f.cycle+f.phase)*4.5:0);
        y=gy+f.gapH/2;
      }else if(f.kind==='arch')y=Math.min(7,f.clearance-2.5);
      else if(f.kind==='fence'){
        const lower=f.y-2.5,upper=f.y+f.band+2.5;
        y=lower>=1.8&&Math.abs(p.pos.y-lower)<Math.abs(p.pos.y-upper)?lower:upper;
      }else if(f.kind==='platform'){
        if(Math.abs(p.pos.x-f.x)<10)y=f.y+6;
      }
    }
    // Only target enemies that can soon be shot; fuel is a real shoot-to-refuel
    // objective. Do not invent/refill resources when the pilot misses it.
    if(!f || f.z-p.pos.z>Math.max(65,p.speed*.95)){
      let best=Infinity;
      for(const enemy of g.enemies){
        if(!enemy.alive||enemy.kind==='mine')continue;
        const dz=enemy.pos.z-p.pos.z;
        if(dz<16||dz>180||Math.abs(enemy.pos.x)>15)continue;
        const score=dz*.25+Math.abs(enemy.pos.x-p.pos.x)*1.5+Math.abs(enemy.pos.y+enemy.radius*.4-p.pos.y)*2-(enemy.kind==='fuel'?(p.fuel<.65?110:30):0);
        if(score<best){best=score;target=enemy;}
      }
      if(target){x=target.pos.x;y=target.pos.y+target.radius*.4+.1;reason=`shoot-${target.kind}`;}
      // Collect actual dropped resources if safely on the flight path.
      const pk=g.pickups.find(pk=>pk.alive&&pk.pos.z-p.pos.z>0&&pk.pos.z-p.pos.z<70);
      if(pk){x=pk.pos.x;y=pk.pos.y;reason=`pickup-${pk.kind}`;}
      const b=g.boss;
      if(b?.active&&b.alive){
        let part=b.launcher.charging?b.launcher.pos:b.pods.find(p=>p.alive)?.pos;
        if(!part&&b.coreOpen>.55)part=b.coreGroup.getWorldPosition(p.pos.clone());
        if(part){x=part.x;y=part.y;reason=b.launcher.charging?'shoot-rack':'shoot-boss';}
      }
    }
    // A target close to the nose becomes a contact hazard if it survives.
    for(const enemy of g.enemies){
      if(!enemy.alive)continue;const dz=enemy.pos.z-p.pos.z;
      if(dz>-4&&dz<Math.max(12,p.speed*.28)&&Math.abs(enemy.pos.x-p.pos.x)<enemy.radius+2&&Math.abs(enemy.pos.y+enemy.radius*.4-p.pos.y)<enemy.radius+2){
        if(!f){y=Math.min(24,enemy.pos.y+enemy.radius*1.5+3);reason='avoid-contact';}
      }
    }
    // Roll is the existing defensive/vent action; never grant extra invuln.
    let danger=false;
    const pool=g.projectiles.enemy;
    if(pool)for(let j=0;j<pool.capacity;j++){
      if(pool.life[j]<=0)continue;
      if(Math.abs(pool.x[j]-p.pos.x)<4&&Math.abs(pool.y[j]-p.pos.y)<4&&pool.z[j]-p.pos.z>-6&&pool.z[j]-p.pos.z<28){danger=true;break;}
    }
    const roll=!f&&p.rollCooldown<=0&&(danger||p.heat>.86);
    const mx=clamp((p.pos.x-clamp(x,-14,14))*0.45,-1,1);
    const my=clamp((clamp(y,1.8,24)-p.pos.y)*0.5,-1,1);
    const fire=!!target||!!g.boss?.active||run.frames%90<42;
    run.decision={reason,x,y,mx,my,fire,roll,barrier:f?{kind:f.kind,type:f.type,z:f.z}:null};
    intent(run,mx,my,fire,roll);
  }

  function observeFrame(run) {
    const {engine:e,game:g}=run.k;
    const out={checkpoint:null};
    const p=g.player;
    run.maxHeat=Math.max(run.maxHeat,p.heat);run.minFuel=Math.min(run.minFuel,p.fuel);
    if(g.sectorIndex!==run.lastSector){run.lastSector=g.sectorIndex;
      run.sectors.push(g.sectorIndex);run.events.push({type:'sector',frame:run.frames,index:g.sectorIndex,z:p.pos.z});out.checkpoint='sector';}
    for(const f of g.level.features){
      if(f.z>=run.previousZ&&f.z<p.pos.z){
        const key=`${f.kind}${f.type?':'+f.type:''}${f.debris?':debris':''}`;
        if(!run.passed)run.passed=new Set();
        if(!run.passed.has(f.id)){run.passed.add(f.id);run.features[key]=(run.features[key]??0)+1;}
      }
    }
    const b=g.boss;
    if(b?.active&&b.phase!==run.lastBossPhase){run.lastBossPhase=b.phase;run.bossPhases.push(b.phase);run.events.push({type:'boss-phase',frame:run.frames,phase:b.phase});out.checkpoint='boss';}
    if(b?.launcher){
      const hits=b.launcher.hits;
      if(hits>run.lastRackHits)run.rackHits+=hits-run.lastRackHits;
      if(run.lastRackCharging&&!b.launcher.charging&&run.lastRackHits>=5)run.rackDetonations++;
      run.lastRackHits=hits;run.lastRackCharging=b.launcher.charging;
    }
    if(run.frames%120===0)run.samples.push({frame:run.frames,rawSeconds:run.rawSeconds,gameSeconds:g.runTime,
      pos:p.pos.toArray(),state:g.state,sector:g.sectorIndex,hull:p.hull,shield:p.shields,fuel:p.fuel,heat:p.heat,
      shots:run.observedShots,gameShotsCounter:g.shotsFired,hits:g.shotsHit,kills:g.kills,score:g.score,threads:g.threads,grazes:g.grazes,
      boss:b?{hp:b.hp,phase:b.phase,coreOpen:b.coreOpen,rackHits:b.launcher.hits,charging:b.launcher.charging}:null,
      memory:{...e.renderer.info.memory},programs:e.renderer.info.programs.length,lastRender:run.lastRenderStats,
      canvas:{width:e.canvas.width,height:e.canvas.height},decision:run.decision});
    if(g.state==='over'||g.state==='victory'){run.done=true;run.outcome=g.state;out.checkpoint='terminal';}
    if(run.rawSeconds>=run.spec.maxSeconds&&!run.done){run.done=true;run.outcome='timeout';out.checkpoint='timeout';}
    run.previousZ=p.pos.z;
    return out.checkpoint;
  }

  function drain(run) {
    const g=run.k.game,out={};
    out.events=run.events.splice(0);out.samples=run.samples.splice(0);
    out.frame=run.frames;out.renderedFrames=run.renderedFrames;out.done=run.done;
    out.state=g.state;out.z=g.player.pos.z;
    out.checkpoint=run.checkpoint??null;run.checkpoint=null;
    return out;
  }

  function chunk(limit=240) {
    const run=active;if(!run)throw Error('No active episode');
    if(run.realtime)throw Error('Do not accelerate a realtime trial');
    const {engine:e,game:g}=run.k,start=performance.now();
    e.running=true;
    for(let n=0;n<limit&&!run.done;n++){
      if(g.state==='playing'&&run.frames%6===0)decide(run);
      const now=performance.now();e._last=now-1000/60;
      e._loop(now); // original frame law, including normal hit-stop/recovery
      run.frames++;run.rawSeconds+=1/60;
      run.checkpoint=observeFrame(run)??run.checkpoint;
    }
    e.running=false;
    return {...drain(run),cpuMs:performance.now()-start};
  }

  function startRealtime(spec) {
    const initial=begin({...spec,renderEvery:1});
    const run=active,{engine:e,game:g}=run.k;
    run.realtime=true;run.rafIntervals=[];run.original.loop=e._loop;
    window.requestAnimationFrame=run.original.raf;
    e._loop=(now)=>{
      if(!e.running)return;
      const interval=now-e._last;
      if(g.state==='playing'&&run.frames%6===0)decide(run);
      run.original.loop(now); // actual rAF timestamp; no synthetic clock/step
      run.frames++;run.rawSeconds+=e.realDelta;run.rafIntervals.push(interval);
      run.checkpoint=observeFrame(run)??run.checkpoint;
      if(run.done)e.stop();
    };
    e.start();return {...initial,mode:'realtime-render-every-frame'};
  }

  function observeRealtime() {
    if(!active?.realtime)throw Error('No realtime trial');
    return {...drain(active),elapsedWallMs:performance.now()-active.startedAt};
  }

  function end() {
    const run=active;if(!run)throw Error('No active episode');
    const {engine:e,game:g}=run.k,p=g.player;
    const frameCpu=run.renderCpuMs.sort((a,b)=>a-b);
    const q=k=>frameCpu[Math.min(frameCpu.length-1,Math.floor(frameCpu.length*k))]??null;
    const result={...run.spec,outcome:run.outcome,completed:run.outcome==='over'||run.outcome==='victory',
      fixture:run.spec.attachCurrent?'earned-continuation':'seeded-loop-start',frames:run.frames,renderedFrames:run.renderedFrames,renderEvery:run.spec.renderEvery,
      rawSeconds:run.rawSeconds,gameSeconds:g.runTime,wallMs:performance.now()-run.startedAt,
      sectors:run.sectors,featuresPassed:run.features,bossPhases:run.bossPhases,rackHits:run.rackHits,rackDetonations:run.rackDetonations,
      maxHeat:run.maxHeat,minFuel:run.minFuel,hull:p.hull,shields:p.shields,fuel:p.fuel,z:p.pos.z,
      kills:g.kills,score:g.score,shots:run.observedShots,gameShotsCounter:g.shotsFired,hits:g.shotsHit,grades:g.grades,threads:g.threads,grazes:g.grazes,
      memory:{...e.renderer.info.memory},programs:e.renderer.info.programs.length,
      renderSubmissionCpuMs:{samples:frameCpu.length,p50:q(.5),p95:q(.95),max:q(1)},
      renderStallCount:run.renderStallCount,slowestRenderSubmissions:run.renderStalls,
      healthLaw:'original Player.damage called unchanged',
      stepLaw:run.realtime?'original Engine._loop with actual requestAnimationFrame timestamps':'original Engine._loop at synthetic 60Hz; actual rendered cadence separately counted'};
    if(run.realtime){
      const intervals=run.rafIntervals.sort((a,b)=>a-b),q=k=>intervals[Math.min(intervals.length-1,Math.floor(intervals.length*k))]??null;
      result.actualRafIntervalsMs={samples:intervals.length,p50:q(.5),p95:q(.95),p99:q(.99),max:q(1)};
      result.mode='realtime';
    }
    intent(run,0,0,false,false);e.input.reset();e.stop();
    window.requestAnimationFrame=run.original.raf;e.postfx.render=run.original.render;
    if(run.original.loop)e._loop=run.original.loop;
    p.damage=run.original.damage;g._crash=run.original.crash;g.warn=run.original.warn;g.projectiles.fire=run.original.fire;
    if(run.spec.profile==='gamepad')delete navigator.getGamepads;
    active=null;return result;
  }
  return {begin,chunk,end,startRealtime,observeRealtime};
})();
