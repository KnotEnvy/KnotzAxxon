import { inCombatView, markerVisible } from './CombatVisibility.js';
import { Lifetime } from '../core/Lifetime.js';
import { traceWorld } from './WorldCollision.js';
import { segmentSphere, segmentBox } from '../core/Collision.js';
/**
 * Game orchestrator.
 *
 * Owns the state machine, spawns entities from the level plan, resolves every
 * collision, and feeds the HUD. Systems below this file know nothing about
 * each other â€” all the "what happens when X hits Y" rules live here on purpose,
 * because that is the part that gets tuned most.
 */

import * as THREE from 'three';
import { Level, SECTOR_KINDS, CORRIDOR_HALF, DECK_HALF, ALT_MIN, ALT_MAX } from '../world/Level.js';
import { Fortress } from '../world/Fortress.js';
import { Player } from '../entities/Player.js';
import { Projectiles, SIDE } from '../entities/Projectiles.js';
import { createEnemy, ENEMY_KINDS } from '../entities/Enemies.js';
import { Pickup } from '../entities/Pickup.js';
import { Boss } from '../entities/Boss.js';
import { Effects } from '../fx/Effects.js';
import { CameraRig } from './CameraRig.js';
import { HUD } from '../ui/HUD.js';
import { settings, Scores } from '../core/Settings.js';
import { audio } from '../audio/Audio.js';
import { clamp, clamp01, damp, lerp, rand, commafy, timeString, swapRemove } from '../core/Utils.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _n = new THREE.Vector3();
const _bufSize = new THREE.Vector2();

export const STATE = {
  IDLE: 'idle',
  PLAYING: 'playing',
  PAUSED: 'paused',
  DYING: 'dying',
  OVER: 'over',
  VICTORY: 'victory',
};

/** How far ahead of the player features become live entities. */
const SPAWN_AHEAD = 300;
const DESPAWN_BEHIND = 55;

export class Game {
  /**
   * @param {import('../core/Engine.js').Engine} engine
   * @param {import('../ui/Screens.js').Screens} screens
   */
  constructor(engine, screens) {
    this.engine = engine;
    this._lifetime = new Lifetime();
    this.screens = screens;
    this.scene = engine.scene;
    this.materials = engine.materials;

    this.state = STATE.IDLE;
    this.hud = new HUD();
    this.rig = new CameraRig(engine.camera);

    this.fx = new Effects(this.scene, this.materials, settings.quality);
    this.projectiles = new Projectiles(this.scene, this.materials, settings.quality);
    this.player = new Player(this.scene, this.materials, this.projectiles, this.fx);

    this.enemies = [];
    this.pickups = [];
    this.boss = null;

    this.level = null;
    this.fortress = null;

    this._previousPlayer = new THREE.Vector3();
    this._colliderScratch = [];
    this._contacts = [];
    this._visibleEnemies = [];
    this._wallsAhead = [];

    this.reset(1);

    this._lifetime.listen(settings, 'change', (e) => this._onSetting(e.detail));
    engine.onQualityChange = (q) => {
      this.fx.applyQuality(q);
      if (this.fortress) this.fortress.quality = q;
    };
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._lifetime.dispose();

    this.engine.onQualityChange = null;
    for (const entity of [...this.enemies, ...this.pickups]) entity.dispose();
    this.enemies.length = this.pickups.length = 0;
    this.boss?.dispose(); this.boss = null;
    this.fortress?.clear(); this.fortress?.root.removeFromParent();
    this.fortress?._gateMat?.dispose();
    this.player.dispose(); this.projectiles.dispose(); this.fx.dispose(); this.hud.dispose();
  }

  _onSetting({ id }) {
    if (id === 'camera') this.rig.applyRig();
  }

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  reset(seed = (Math.random() * 1e9) | 0, loop = 0) {

    this.seed = seed;
    this.loop = loop;

    this.fortress?.clear();
    this.level = new Level(seed, loop);
    if (!this.fortress) {
      this.fortress = new Fortress(this.scene, this.materials, this.level, settings.quality);
    } else {
      this.fortress.level = this.level;
    }

    for (const e of this.enemies) e.dispose();
    this.enemies.length = 0;
    for (const p of this.pickups) p.dispose();
    this.pickups.length = 0;
    this.boss?.dispose();
    this.boss = null;

    this.projectiles.clear();
    this.fx.clear();
    this.hud.reset();

    this.featureCursor = 0;
    this._hudCursor = 0;
    this._bestScore = Scores.best();
    this.score = 0;
    this.chain = 0;
    this.chainMult = 1;
    this.chainTimer = 0;
    this.kills = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.runTime = 0;
    this.sectorIndex = -1;
    this.radarJamTimer = 0;
    this.bossDefeated = false;
    this._ending = false;
    this._endingCountdown = 0;
    this._deathTimer = 0;
    this._warnCooldown = 0;

    this.engine.setTimeScale?.(1, true);
    this.engine.postfx?.resetTransient?.();
    this.engine.input.reset?.();
    this.player.reset(0);
    this.rig.setFraming(0);
    this.rig.snap(this.player);
    this.engine.sky.apply(this.level.sectors[0].sky, seed);
  }

  start() {
    // Fire and forget: a blocked audio context must never stall the run.
    audio.init();
    this.reset((Math.random() * 1e9) | 0, 0);
    this.state = STATE.PLAYING;
    this.hud.setLive(true);
    this.screens.hide();
    audio.startEngine();
    audio.setPaused(false);
    audio.startMusic('combat');
    audio.setIntensity(0.35);
    this.engine.setTimeScale(1);
    this.engine.postfx.setDesaturation(0);
    this._enterSector(0);
  }

  toTitle() {
    this.state = STATE.IDLE;
    this.hud.setLive(false);
    audio.stopEngine();
    audio.startMusic('menu');
    audio.setIntensity(0.2);
    audio.setPaused(false);
    this.engine.setTimeScale(1);
    this.engine.postfx.setDesaturation(0);
    this.engine.postfx.setBoost(0);
    this.screens.show('title');
  }

  pause() {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.PAUSED;
    this.hud.setControlsLive(false);
    this.engine.setTimeScale(0, true);
    this.engine.input.reset();
    audio.setPaused(true);
    this.screens.show('pause');
  }

  resume() {
    if (this.state !== STATE.PAUSED) return;
    this.state = STATE.PLAYING;
    this.engine.setTimeScale(1, true);
    this.engine.input.reset();
    audio.setPaused(false);
    this.screens.hide();
    this.hud.setControlsLive(true);
  }

  /* ------------------------------------------------------------------ */
  /* Frame                                                               */
  /* ------------------------------------------------------------------ */

  update(dt, time, realDt = dt) {
    if (this.state === STATE.PAUSED || this.state === STATE.IDLE) {
      // keep the world alive behind the menus so it isn't a static postcard
      this._idleUpdate(dt, time);
      return;
    }

    if (this.state === STATE.OVER || this.state === STATE.VICTORY) {
      return;
    }
    // Cinematic deadlines use unscaled time and stop while paused.
    if (this._ending) {
      this._endingCountdown -= realDt;
      if (this._endingCountdown <= 0) { this._finish(true); return; }
    }
    this.runTime += dt;
    const p = this.player;
    const ctx = this._ctx(dt, time);

    /* --- sector tracking ---------------------------------------------- */
    const sector = this.level.sectorAt(p.pos.z);
    if (sector && sector.index !== this.sectorIndex) this._enterSector(sector.index);

    /* --- world -------------------------------------------------------- */
    this.fortress.update(p.pos.z, dt, time, this.engine.frame);
    this._spawnFeatures(p.pos.z);

    this._previousPlayer.copy(p.pos);

    /* --- actors ------------------------------------------------------- */
    if (this.state === STATE.PLAYING && !this._ending) p.update(dt, ctx);
    else p.update(dt, { ...ctx, input: NULL_INPUT });

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.update(dt, ctx);
      if (e.pos.z < p.pos.z - DESPAWN_BEHIND || !e.alive) {
        e.dispose();
        swapRemove(this.enemies, i);
      }
    }

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      pk.update(dt, ctx);
      if (pk.pos.z < p.pos.z - DESPAWN_BEHIND || !pk.alive) {
        pk.dispose();
        swapRemove(this.pickups, i);
      }
    }

    if (this.boss) this.boss.update(dt, ctx);

    this.projectiles.update(dt, ctx);

    /* --- collisions ---------------------------------------------------- */
    this._collidePlayerProjectiles(ctx);
    if (this.state === STATE.PLAYING && p.alive && !this._ending) {
      this._collideEnemyProjectiles(ctx);
      this._collideStatic(ctx);
      this._collideContact(ctx);
    }

    /* --- scoring chain --------------------------------------------------- */
    if (this.chainTimer > 0) {
      this.chainTimer -= dt;
      if (this.chainTimer <= 0) this._breakChain();
    }
    this.radarJamTimer = Math.max(0, this.radarJamTimer - dt);
    this._warnCooldown = Math.max(0, this._warnCooldown - dt);

    /* --- death sequence --------------------------------------------------- */
    if (this.state === STATE.DYING) {
      this._deathTimer -= realDt;
      if (this._deathTimer <= 0) this._finish(false);
    } else if (this.state === STATE.PLAYING && !p.alive) {
      this._beginDeath();
    }

    /* --- run out of level without a boss to fight -------------------------- */
    // Defensive: the campaign ends at the boss, so this only fires if the run
    // somehow overshoots. Explicitly excluded once the ending has been queued,
    // otherwise beating the boss would wrap the level and show results at once.
    if (this.state === STATE.PLAYING && !this._ending && !this.bossDefeated
        && p.pos.z > this.level.totalLength - 40 && !this.boss) {
      this._nextLoop();
    }

  }

  /** Camera and post-processing only â€” used behind menus. */
  _idleUpdate(dt, time) {
    const p = this.player;
    if (this.state === STATE.IDLE) {
      if (p.pos.z > 1100) this.reset(1);
      p.model.visible = true;
      // Bounded fly-through of the opening fortress.
      p.pos.z += 22 * dt;
      p.pos.x = Math.sin(time * 0.35) * 8;
      p.pos.y = 11 + Math.sin(time * 0.23) * 3;
      p.model.rotation.z = Math.sin(time * 0.35 + 1.6) * 0.25;
      this.fortress.update(p.pos.z, dt, time, this.engine.frame);
      const ctx = this._ctx(dt, time);
      p._engineFx(dt, ctx, 0);
      p._updateShadow(ctx, dt);
      this.rig.update(dt, time, p, { trauma: 0, boost: 0 });
    }
  }

  /** Presentation and GPU uploads run once per rendered frame, after all simulation steps. */
  lateUpdate(dt, time) {
    this.engine.renderer.getDrawingBufferSize(_bufSize);
    this.fx.setViewport(_bufSize.y, this.engine.camera);
    if (this.state === STATE.PLAYING || this.state === STATE.DYING) {
      this._updatePresentation(dt, time, this._ctx(dt, time));
      return;
    }
    if (this.state === STATE.OVER || this.state === STATE.VICTORY) {
      this.rig.setFraming(18);
      this.rig.update(dt, time, this.player, { trauma: 0 });
    }
    this.fx.update(dt, time, this.engine.camera);
    this.projectiles.render(this.engine.camera);
    this.engine.sky.update(dt, time, this.player.pos);
  }

  _ctx(dt, time) {
    const p = this.player;
    return {
      dt, time,
      game: this,
      player: p,
      playerZ: p.pos.z,
      camera: this.engine.camera,
      input: this.engine.input,
      projectiles: this.projectiles,
      fx: this.fx,
      postfx: this.engine.postfx,
      level: this.level,
      difficulty: clamp01(this.level.difficultyAt(p.pos.z)),
      hasDeck: this.level.hasDeck(p.pos.z),
      guideSurfaceAt: (x, z, y) => this.fortress.surfaceAt(x, z, y),
      radarJammed: this.radarJamTimer > 0,
      speedMultiplier: 1 + this.sectorIndex * 0.035 + this.loop * 0.16,
      fuelBurnScale: 1,
      warn: (t) => this.warn(t),
      findTarget: (from) => this.findTarget(from),
      cameraKick: (a) => this.rig.kick(a),
      awardScore: (v, pos, label) => this.award(v, pos, label),
      spawnEnemy: (kind, feature) => this._spawnEnemy(kind, feature),
      onBossEngage: (b) => this._bossEngage(b),
      onBossPhase: () => audio.setIntensity(1),
      onBossDefeated: (b) => this._bossDefeated(b),
      onBossGone: () => this._bossGone(),
    };
  }

  /* ------------------------------------------------------------------ */
  /* Targeting                                                           */
  /* ------------------------------------------------------------------ */

  /** In standard flight the reticle is an alignment cue, not aim steering.
   * Flight Assist permits a wider acquisition cone. Cover blocks both modes.
   */
  findTarget(from, maxDist = 165, minCos = 0.93) {
    let best = null;
    let bestScore = -Infinity;
    const assist=settings.get('assist');
    const sx=from.x+(this.player.muzzleSide ?? 1)*1.6, sy=from.y-0.1, sz=from.z+2.4;

    const consider = (obj, x, y, z, bonus = 0, radius = obj.radius ?? 2, projectilePadding = 0.9) => {
      const dz = z - from.z;
      if (dz < 5 || dz > maxDist || !inCombatView(this.engine?.camera, x, y, z)) return;
      const dx = x - from.x;
      const dy = y - from.y;
      const d = Math.hypot(dx, dy, dz);
      const cos = dz / d;
      if (assist && cos<minCos) return;
      const contact=segmentSphere(sx,sy,sz,sx,sy,sz+maxDist,x,y,z,radius+projectilePadding);
      if(!assist && !Number.isFinite(contact)) return;
      const ex=assist?x:sx, ey=assist?y:sy, ez=assist?z:sz+contact*maxDist;
      if(traceWorld(this.level,this.fortress?.animated,sx,sy,sz,ex,ey,ez,0.9,this._colliderScratch,false).t<1) return;
      // Prefer things nearly dead ahead, then things that are close.
      const score = assist ? (cos-minCos)*12-d/maxDist+bonus : -contact;
      if (score > bestScore) { bestScore = score; best = { obj, x, y, z }; }
    };

    for (const e of this.enemies) {
      if (!e.alive) continue;
      // mines are hazards, not priorities; only lock them when nothing else fits
      const bonus = e.kind === 'mine' ? -0.5 : e.kind === 'fuel' ? 0.15 : 0.35;
      consider(e, e.pos.x, e.pos.y + e.radius * 0.4, e.pos.z, bonus);
    }

    if (this.boss?.alive && this.boss.active) {
      for (const pod of this.boss.pods) {
        if (pod.alive) consider(this.boss, pod.pos.x, pod.pos.y, pod.pos.z, 0.5, pod.radius, 0);
      }
      if (this.boss.coreOpen > 0.55) {
        _v.setFromMatrixPosition(this.boss.coreGroup.matrixWorld);
        consider(this.boss, _v.x, _v.y, _v.z, 0.9, 6.5, 0);
      }
    }

    return best;
  }

  /* ------------------------------------------------------------------ */
  /* Spawning                                                            */
  /* ------------------------------------------------------------------ */

  _spawnFeatures(z) {
    const limit = z + SPAWN_AHEAD;
    const feats = this.level.features;
    while (this.featureCursor < feats.length && feats[this.featureCursor].z <= limit) {
      const f = feats[this.featureCursor++];
      if (f.spawned) continue;
      f.spawned = true;
      if (ENEMY_KINDS.has(f.kind)) {
        this._spawnEnemy(f.kind, f);
      } else if (f.kind === 'boss') {
        this.boss = new Boss(this.scene, this.materials, f);
      }
    }
  }

  _spawnEnemy(kind, feature) {
    const e = createEnemy(kind, this.materials, feature);
    if (!e) return null;
    this.scene.add(e.group);
    this.enemies.push(e);
    return e;
  }

  _dropPickup(pos, kind) {
    const pk = new Pickup(this.scene, this.materials, kind, pos.x, Math.max(pos.y, 3), pos.z);
    this.pickups.push(pk);
    return pk;
  }

  /* ------------------------------------------------------------------ */
  /* Collisions                                                          */
  /* ------------------------------------------------------------------ */

  /** Player shots vs enemies, boss and level geometry. */
  _collidePlayerProjectiles(ctx) {
    const pool = this.projectiles.player;
    for (let i = 0; i < pool.capacity; i++) {
      if (pool.life[i] <= 0) continue;
      const x = pool.x[i], y = pool.y[i], z = pool.z[i];
      const r = pool.radius[i];

      const ax=pool.px[i], ay=pool.py[i], az=pool.pz[i];
      const world=traceWorld(this.level,this.fortress?.animated,ax,ay,az,x,y,z,r,this._colliderScratch);
      let nearest=world.t, hit=world.collider, kind=world.collider?'wall':null;
      for(const e of this.enemies) {
        if(!e.alive) continue;
        const t=segmentSphere(ax,ay,az,x,y,z,e.pos.x,e.pos.y+e.radius*0.4,e.pos.z,e.radius+r);
        if(t<nearest) { nearest=t; hit=e; kind='enemy'; }
      }
      if(this.boss?.alive && this.boss.active) {
        if (this.boss.coreOpen > 0.55) {
          this.boss.coreGroup.getWorldPosition(_v2);
          const t=segmentSphere(ax,ay,az,x,y,z,_v2.x,_v2.y,_v2.z,6.5);
          if(t<nearest) { nearest=t; hit=this.boss; kind='boss'; }
        }
        for(let j=0; j<=this.boss.pods.length; j++) {
          const part=this.boss.pods[j] ?? this.boss;
          if(!part.alive) continue;
          const radius=part===this.boss ? part.radius+2 : part.radius;
          const t=segmentSphere(ax,ay,az,x,y,z,part.pos.x,part.pos.y,part.pos.z,radius);
          if(t<nearest) { nearest=t; hit=part; kind='boss'; }
        }
      }
      if(!Number.isFinite(nearest)) continue;
      // Advance a tiny distance inside the hit volume for strict boss tests.
      const t=Math.min(1,nearest+0.0001);
      _v.set(lerp(ax,x,t),lerp(ay,y,t),lerp(az,z,t));
      _n.set(0,0,-1);
      // A bolt that reaches an unseen target is spent without an invisible kill,
      // reward, hit-stop or explosion sound. It cannot pass through to another target.
      const targetPos = kind === 'enemy' ? hit.pos : _v;
      const targetY = kind === 'enemy' ? hit.pos.y + hit.radius * 0.4 : _v.y;
      if (!inCombatView(this.engine?.camera, targetPos.x, targetY, targetPos.z)) {
        pool.life[i] = 0;
        continue;
      }
      if(kind==='enemy') {
        this.shotsHit++;
        if(hit.hit(pool.dmg[i],ctx)) this._killEnemy(hit,ctx);
        else { this.fx.impact(_v,_n,0x9fe8ff,0.9); audio.impact(audio.panFor(x,this.player.pos.x)); }
      } else if(kind==='boss') {
        if(this.boss.hitAt(_v,pool.dmg[i],ctx)) this.shotsHit++;
      } else {
        this.fx.impact(_v,_n,0x9fb8cc,0.7);
        audio.impact(audio.panFor(x,this.player.pos.x));
      }
      pool.life[i]=0;
    }
  }

  /** Enemy shots and missiles vs the player. */
  _collideEnemyProjectiles(ctx) {
    const p = this.player;
    const pr = p.radius;

    for (const pool of [this.projectiles.enemy, this.projectiles.missile]) {
      for (let i = 0; i < pool.capacity; i++) {
        if (pool.life[i] <= 0) continue;
        const dx = pool.x[i] - p.pos.x;
        const dy = pool.y[i] - p.pos.y;
        const dz = pool.z[i] - p.pos.z;
        const rr = pr + pool.radius[i];
        const contact=segmentSphere(pool.px[i]-this._previousPlayer.x+p.pos.x,pool.py[i]-this._previousPlayer.y+p.pos.y,pool.pz[i]-this._previousPlayer.z+p.pos.z,pool.x[i],pool.y[i],pool.z[i],p.pos.x,p.pos.y,p.pos.z,rr);
        const world=traceWorld(this.level,this.fortress?.animated,pool.px[i],pool.py[i],pool.pz[i],pool.x[i],pool.y[i],pool.z[i],pool.radius[i],this._colliderScratch);
        if(Number.isFinite(world.t) && world.t<=contact) {
          pool.life[i]=0; pool.target[i]=null;
          _v.set(lerp(pool.px[i],pool.x[i],world.t),lerp(pool.py[i],pool.y[i],world.t),lerp(pool.pz[i],pool.z[i],world.t));
          this.fx.impact(_v,_n.set(0,0,-1),0xff965a,0.6);
          continue;
        }
        if(!Number.isFinite(contact)) continue;

        _v.set(pool.x[i], pool.y[i], pool.z[i]);
        pool.life[i] = 0;
        pool.target[i] = null;

        const result = p.damage(pool.dmg[i], ctx);
        if (result === 'none') {
          this.fx.impact(_v, _n.set(dx, dy, dz).normalize(), 0x9fe8ff, 0.7);
        } else {
          this.fx.explosion(_v, 0.6, { shake: 0.6, debris: false });
          if (result !== 'shield') this.hud.pulseDamage(0.85);
          this._breakChain();
        }
      }
    }
  }

  /** Player vs static level geometry, and vs the dynamic coolant gates. */
  _collideStatic(ctx) {
    const p = this.player;
    const r = p.radius * 0.72;
    const previous=this._previousPlayer;
    const hit=traceWorld(this.level,this.fortress.animated,previous.x,previous.y,previous.z,p.pos.x,p.pos.y,p.pos.z,r,this._colliderScratch);
    if(Number.isFinite(hit.t)) this._crash(ctx,hit.collider,hit.collider.tag);
  }

  /** Player ramming enemies and collecting pickups. */
  _collideContact(ctx) {
    const p = this.player;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.alive) continue;
      const dx = e.pos.x - p.pos.x;
      const dy = (e.pos.y + e.radius * 0.4) - p.pos.y;
      const dz = e.pos.z - p.pos.z;
      const rr = e.radius + p.radius;
      if (dx * dx + dy * dy + dz * dz > rr * rr) continue;

      // Ramming costs hull/shield and never grants a fuel or score reward.
      e.hit(999, ctx);
      this._killEnemy(e, ctx, false);
      const res = p.damage(e.contactDamage, ctx);
      if (res !== 'none' && res !== 'shield') this.hud.pulseDamage(1);
      if (res !== 'none') this._breakChain();
    }

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      if (pk.pos.distanceTo(p.pos) > pk.radius + p.radius) continue;
      pk.alive = false;
      this._applyPickup(pk, ctx);
    }
  }

  /** Point-vs-solid test used by projectiles. */
  _pointInSolid(x, y, z, r) {
    const list = this.level.collidersNear(z - 2, z + 2, this._colliderScratch);
    for (const c of list) {
      if (x + r < c.minX || x - r > c.maxX) continue;
      if (y + r < c.minY || y - r > c.maxY) continue;
      if (z + r < c.minZ || z - r > c.maxZ) continue;
      return true;
    }
    return false;
  }

  /**
   * Terrain strike.
   *
   * Instant death on any wall contact is the arcade-authentic answer, but at a
   * 42-degree camera angle a player cannot always judge depth well enough for
   * that to read as fair. A strike costs a hull point, kills the chain, and
   * dumps most of your speed - three mistakes still end the run, but one
   * misjudged gap does not.
   *
   * Shields deliberately do not absorb terrain: they are anti-projectile.
   */
  _crash(ctx, collider, tag) {
    const p = this.player;
    const assist = settings.get('assist');

    const res = p.damage(assist ? 0.5 : 1, ctx, { pierce: true });
    this._pushOut(p, collider);
    p.speedScale = 0.5;
    p.velocity.multiplyScalar(0.25);
    if (res === 'none') return; // damage grace never disables physical terrain response

    this.fx.explosion(p.pos, 1.2, { shake: 1.6, debris: false });
    this.hud.pulseDamage(1);
    this._breakChain();
    this.warn(tag === 'gate' ? 'COOLANT DISCHARGE' : 'HULL SCRAPE');
  }

  /**
   * Move the ship to the nearest free side of a box it is inside of. Because
   * barrier colliders are the *solid* parts of a wall, the nearest exit is
   * almost always the gap the player was aiming for.
   */
  _pushOut(p, c) {
    const r = p.radius * 0.72 + 0.01;
    let bestAxis = null;
    let bestValue = 0;
    let bestDist = Infinity;

    const tryExit = (axis, value, current, lo, hi) => {
      if (value < lo || value > hi) return;
      const d = Math.abs(value - current);
      if (d < bestDist) { bestDist = d; bestAxis = axis; bestValue = value; }
    };

    tryExit('y', c.maxY + r, p.pos.y, ALT_MIN, ALT_MAX);
    tryExit('y', c.minY - r, p.pos.y, ALT_MIN, ALT_MAX);
    tryExit('x', c.maxX + r, p.pos.x, -CORRIDOR_HALF, CORRIDOR_HALF);
    tryExit('x', c.minX - r, p.pos.x, -CORRIDOR_HALF, CORRIDOR_HALF);

    if (!bestAxis) return;
    if (bestAxis === 'y') { p.pos.y = bestValue; p.velocity.y = 0; }
    else { p.pos.x = bestValue; p.velocity.x = 0; }
  }

  /* ------------------------------------------------------------------ */
  /* Rewards                                                             */
  /* ------------------------------------------------------------------ */

  _killEnemy(e, ctx, reward = true) {
    e.alive = false;
    const big = e.radius > 3;
    const groundY = this.level.groundAt(e.pos.z);

    if (e.kind === 'fuel') {
      if (reward) this.player.refuel(e.fuelValue ?? 0.16);
      this.fx.explosion(e.pos, 1.5, { colorHot: 0xfff0a0, colorMid: 0xffb43a, groundY });
      if (reward) this.hud.floater(e.pos, `+FUEL`, '#ffb43a', 1.05);
      audio.pickup(this.kills);
    } else {
      this.fx.explosion(e.pos, big ? 1.7 : 1.0, { groundY });
      audio.explosion(big ? 1.5 : 0.85, audio.panFor(e.pos.x, this.player.pos.x));
    }

    this.engine.hitStop(0.2, big ? 0.055 : 0.03);
    this.engine.input.rumble(0.35, 0.2, 90);

    if (!reward) return;

    this.kills++;
    this._bumpChain();
    this.award(Math.round((e.score ?? 100) * this.chainMult), e.pos);

    if (e.kind === 'radar') {
      this.radarJamTimer = 22;
      this.warn('ENEMY TRACKING BLINDED');
      this.fx.rings.spawn(e.pos, { from: 3, to: 120, life: 1.1, color: 0x52ffa8, opacity: 0.7 });
      audio.sting(true);
    }

    // drops
    const roll = rand.next();
    if (e.kind === 'heavyTurret' && roll < 0.55) {
      this._dropPickup(e.pos, rand.bool(0.5) ? 'shield' : 'spread');
    } else if (e.kind === 'silo' && roll < 0.4) {
      this._dropPickup(e.pos, 'repair');
    } else if (roll < 0.045) {
      this._dropPickup(e.pos, 'shield');
    }
  }

  _applyPickup(pk, ctx) {
    const p = this.player;
    switch (pk.kind) {
      case 'shield': p.addShield(); break;
      case 'spread': p.grantSpread(14); break;
      case 'repair': p.repair(1); break;
      case 'fuel': p.refuel(0.3); break;
    }
    this.fx.pickup(pk.pos, pk.color);
    this.hud.floater(pk.pos, pk.def.label, `#${pk.color.toString(16).padStart(6, '0')}`, 1.15);
    this.award(pk.score, pk.pos, null, false);
    audio.pickup(this.kills);
    this.engine.postfx.flash(0.18, pk.color);
  }

  _bumpChain() {
    this.chain++;
    this.chainTimer = 3.0;
    const next = clamp(1 + Math.floor(this.chain / 3), 1, 8);
    if (next !== this.chainMult) {
      this.chainMult = next;
      if (next > 1) {
        audio.chain(next);
        // The fixed HUD announces milestones without covering the ship.
      }
    }
    this.hud.comboEvent?.(this.chain, this.chainMult);
    audio.setIntensity(clamp01(0.3 + this.chain * 0.06));
  }

  _breakChain() {
    if (this.chain > 0) this.hud.comboEvent?.(this.chain, this.chainMult, true);
    this.chain = 0;
    this.chainMult = 1;
    this.chainTimer = 0;
  }

  award(points, pos, label = null, showFloater = true) {
    this.score += points;
    if (showFloater && pos) {
      this.hud.floater(pos, label ?? `+${commafy(points)}`, '#ffffff', points >= 1000 ? 1.3 : 1);
    } else if (label && pos) {
      this.hud.floater(pos, label, '#ffb43a', 1.25);
    }
  }

  warn(label) {
    if (this._warnCooldown > 0) return;
    this._warnCooldown = 1.2;
    this.hud.warn(label);
    audio.alarm();
  }

  /* ------------------------------------------------------------------ */
  /* Sectors, boss, endings                                              */
  /* ------------------------------------------------------------------ */

  _enterSector(index) {
    const s = this.level.sectors[index];
    if (!s) return;
    this.sectorIndex = index;
    this.engine.sky.apply(s.sky, this.seed + index);
    this.screens.sectorCard(s);
    audio.sting(true);
    audio.setIntensity(clamp01(0.25 + s.threat * 0.5));
    if (s.kind === SECTOR_KINDS.BOSS) audio.startMusic('boss');
    this.rig.setFraming(s.kind === SECTOR_KINDS.BOSS ? 6 : 0);
  }

  _bossEngage(b) {
    this.warn('SENTINEL ENGAGED');
    audio.startMusic('boss');
    audio.setIntensity(1);
    this.engine.postfx.flash(0.4, 0xff3d55);
    this.rig.setFraming(10);
  }

  _bossDefeated(b) {
    this.bossDefeated = true;
    this.award(b.score, b.pos, 'SENTINEL DESTROYED');
    this.engine.setTimeScale(0.32);
    this.engine.postfx.setDesaturation(0.35);
  }

  _bossGone() {
    this.engine.setTimeScale(1);
    this.engine.postfx.setDesaturation(0);
    this.boss?.dispose();
    this.boss = null;
    this.rig.setFraming(0);
    this._ending = true;
    // Pause-aware presentation deadline; no wall-clock callback can be lost.
    this._endingCountdown = 1.4;
    this.projectiles.clear();
  }

  /** Campaign complete â€” wrap into the next, harder loop. */
  _nextLoop() {
    this.loop++;
    const keep = { score: this.score, kills: this.kills, time: this.runTime };
    this.reset((Math.random() * 1e9) | 0, this.loop);
    this.score = keep.score;
    this.kills = keep.kills;
    this.runTime = keep.time;
    this.state = STATE.PLAYING;
    this._ending = false;
    this._endingCountdown = 0;
    this.warn(`LOOP ${this.loop + 1} - THREAT ESCALATED`);
    this._enterSector(0);
  }

  _beginDeath() {
    this.state = STATE.DYING;
    this.hud.setControlsLive(false);
    this._deathTimer = 2.3;
    this.engine.setTimeScale(0.28);
    this.engine.postfx.setDesaturation(0.75);
    this.engine.postfx.flash(0.7, 0xffffff);
    audio.stopMusic();
    this.hud.warn('HULL BREACH', 2.4);
  }

  _finish(victory) {
    this.state = victory ? STATE.VICTORY : STATE.OVER;
    this.engine.setTimeScale(1);
    this.engine.postfx.setDesaturation(0);
    this.hud.setLive(false);
    audio.stopEngine();
    audio.stopMusic();

    const timeBonus = victory ? Math.max(0, 60000 - Math.floor(this.runTime) * 120) : 0;
    const total = this.score + timeBonus;

    const entry = {
      name: 'ACE',
      score: total,
      sector: this.sectorIndex + 1 + this.loop * 8,
      time: this.runTime,
      date: Date.now(),
    };
    const rank = Scores.submit(entry);

    this.screens.results({
      title: victory ? 'FORTRESS NEUTRALISED' : 'MISSION FAILED',
      rows: [
        { label: 'SECTOR REACHED', value: String(this.sectorIndex + 1 + this.loop * 8).padStart(2, '0') },
        { label: 'TARGETS DESTROYED', value: commafy(this.kills) },
        { label: 'FLIGHT TIME', value: timeString(this.runTime) },
        { label: 'COMBAT SCORE', value: commafy(this.score) },
        ...(timeBonus ? [{ label: 'TIME BONUS', value: commafy(timeBonus) }] : []),
        { label: 'TOTAL', value: commafy(total), total: true },
      ],
      rank, entry,
    });
  }

  /* ------------------------------------------------------------------ */
  /* Presentation                                                        */
  /* ------------------------------------------------------------------ */

  _updatePresentation(dt, time, ctx) {
    const p = this.player;

    this.rig.update(dt, time, p, {
      trauma: this.fx.trauma,
      boost: p.boosting ? 1 : 0,
    });

    this.engine.sky.update(dt, time, p.pos);
    this.engine.postfx.setBoost(p.boosting ? 1 : 0);

    // Critical-hull heartbeat: a slow red breathe at the screen edge. Reads
    // instantly in peripheral vision without stealing the centre of the frame.
    if (p.alive && p.hull <= 1 && this.state === STATE.PLAYING) {
      this.engine.postfx.setEdgePulse(0.32 + Math.sin(time * 4.2) * 0.22);
    } else {
      this.engine.postfx.setEdgePulse(0);
    }
    this.fx.update(dt, time, this.engine.camera);
    this.projectiles.render(this.engine.camera);

    if (this.fx.pendingHitStop > 0) {
      this.engine.hitStop(0.22, this.fx.pendingHitStop);
      this.fx.pendingHitStop = 0;
    }

    this._updateHud(dt, ctx);
  }

  _updateHud(dt, ctx) {
    const p = this.player;
    const sector = this.level.sectorAt(p.pos.z) ?? this.level.sectors[0];

    /* --- hazard band: the gap in the next wall ahead ------------------- */
    let hazard = null;
    const clearance = p.radius * 0.72 + 0.05;
    this._wallsAhead.length = 0;
    const feats = this.level.features;
    // Its own forward-only cursor: the HUD looks at a different window than
    // the spawner, so sharing one would make both of them scan.
    while (this._hudCursor < feats.length && feats[this._hudCursor].z < p.pos.z - 20) this._hudCursor++;
    for (let i = this._hudCursor; i < feats.length; i++) {
      const f = feats[i];
      if (f.z + (f.thickness ?? 7) / 2 < p.pos.z - clearance) continue;
      if (f.z > p.pos.z + 230) break;
      if (f.kind === 'wall') {
        const g = f.gaps[0];
        if (f.type === 'pillars') {
          this._wallsAhead.push({ z: f.z, gapX: null });
        } else {
          this._wallsAhead.push({
            z: f.z,
            gapX: f.type === 'slot' || f.type === 'stagger' ? 0 : g.x,
            gapW: f.type === 'slot' || f.type === 'stagger' ? CORRIDOR_HALF * 2 : Math.max(0,g.w - clearance*2),
          });
          if (!hazard && f.z - p.pos.z < 130 && f.type !== 'notch') {
            hazard = { y0: g.y + clearance, y1: g.y + g.h - clearance, z: f.z };
          }
        }
      } else if (f.kind === 'gate' && f.runtime) {
        this._wallsAhead.push({ z: f.z, gapX: null });
        if (!hazard && f.z - p.pos.z < 130) {
          hazard = { y0: f.runtime.gapY + clearance, y1: f.runtime.gapY + f.runtime.gapH - clearance, z: f.z };
        }
      } else if (f.kind === 'arch') {
        if (!hazard && f.z - p.pos.z < 130) hazard = { y0: ALT_MIN, y1: f.clearance - clearance, z: f.z };
      }
    }

    /* --- radar contacts -------------------------------------------------- */
    this._contacts.length = 0;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dz = e.pos.z - p.pos.z;
      if (dz < -20 || dz > 230) continue;
      this._contacts.push({
        x: e.pos.x, z: e.pos.z,
        color: e.kind === 'fuel' ? '#ffb43a'
          : e.kind === 'radar' ? '#52ffa8'
            : e.kind === 'mine' ? '#a06bff' : '#ff3d55',
        big: e.radius > 3,
      });
    }
    for (const pk of this.pickups) {
      this._contacts.push({ x: pk.pos.x, z: pk.pos.z, color: '#a8f4ff', big: false });
    }
    if (this.boss?.alive && this.boss.active) {
      this._contacts.push({ x: this.boss.pos.x, z: this.boss.pos.z, color: '#ff3d55', big: true });
    }

    // Reuse the candidate list; only twelve nearby, uncovered contacts get markers.
    const visible = this._visibleEnemies ??= [];
    visible.length = 0;
    this.engine.camera.updateMatrixWorld?.(true);
    for (const e of this.enemies) {
      const dz = e.pos.z - p.pos.z;
      if (!e.alive || dz < -8 || dz > 120) continue;
      if (markerVisible(this.engine.camera, this.level, this.fortress?.animated,
          p.pos.z, e.pos.x, e.pos.y + e.radius * 0.4, e.pos.z)) visible.push(e);
    }
    visible.sort((a,b) => Math.abs(a.pos.z-p.pos.z)-Math.abs(b.pos.z-p.pos.z));
    if (visible.length > 12) visible.length = 12;

    const sectorSpan = sector.zEnd - sector.zStart;
    this.hud.update({
      score: this.score,
      best: Math.max(this._bestScore, this.score),
      chain: this.chain,
      chainMult: this.chainMult,
      chainTime: this.chainTimer / 3,
      sectorLabel: `SECTOR ${String(sector.index + 1 + this.loop * 8).padStart(2, '0')}`,
      sectorSub: sector.sub,
      progress: clamp01((p.pos.z - sector.zStart) / sectorSpan),
      fuel: p.fuel,
      hull: p.hull, hullMax: p.hullMax,
      shields: p.shields,
      heat: p.heat, overheated: p.overheated,
      boost: p.boost,
      weapon: p.spreadTimer > 0 ? 'SPREAD ARRAY' : 'PULSE ARRAY',
      altitude: p.pos.y,
      hazard,
      boss: this.boss?.alive && this.boss.active ? this.boss : null,
      camera: this.engine.camera,
      player: p,
      contacts: this._contacts,
      visibleEnemies: visible,
      wallsAhead: this._wallsAhead,
      stats: this.engine.stats,
      entities: this.enemies.length + this.pickups.length,
      lock: p.alive ? p.target : null,
    }, dt);
  }
}

/** Neutral input used while the player is dying â€” no control, no crash. */
const NULL_INPUT = {
  moveX: 0, moveY: 0, fire: false, boost: false,
  justPressed: () => false,
  isDown: () => false,
  rumble: () => {},
};
