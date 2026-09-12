/**
 * Enemies and destructible props.
 *
 * Every enemy is a small class with the same contract:
 *
 *   pos      THREE.Vector3 (the group position, shared by reference)
 *   radius   collision sphere
 *   hp       remaining health; <= 0 means dead
 *   update(dt, ctx)
 *   hit(dmg, ctx) -> true if this hit killed it
 *
 * Geometry is built once per kind and shared, so spawning is cheap even when a
 * whole wing of interceptors appears at once.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SIDE } from './Projectiles.js';
import { CORRIDOR_HALF, ALT_MIN, ALT_MAX } from '../world/Level.js';
import { Rng, clamp, clamp01, damp, lerp, rand, TAU } from '../core/Utils.js';
import { audio } from '../audio/Audio.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _aim = new THREE.Vector3();

/* ------------------------------------------------------------------ */
/* Shared geometry cache                                               */
/* ------------------------------------------------------------------ */

const geoCache = new Map();
const geo = (key, build) => {
  if (!geoCache.has(key)) geoCache.set(key, build());
  return geoCache.get(key);
};

/** Bake secondary forms into one cached draw, then release the build inputs. */
function mergeParts(parts) {
  const flat = parts.map(g => g.index ? g.toNonIndexed() : g);
  const merged = mergeGeometries(flat, false);
  for (const g of new Set([...parts, ...flat])) g.dispose();
  if (!merged) throw new Error('Incompatible enemy detail geometry');
  return merged;
}
function box(w, h, d, x, y, z) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}
function collar(radius, tube, y) {
  return new THREE.TorusGeometry(radius, tube, 4, 16).rotateX(Math.PI / 2).translate(0, y, 0);
}

/** Materials that need a tweak the shared library doesn't provide. */
const matCache = new Map();
const mat = (key, build) => {
  if (!matCache.has(key)) matCache.set(key, build());
  return matCache.get(key);
};

export function disposeEnemyGeometry() {
  for (const g of geoCache.values()) g.dispose();
  geoCache.clear();
  for (const m of matCache.values()) m.dispose();
  matCache.clear();
}

/* ------------------------------------------------------------------ */
/* Base                                                                */
/* ------------------------------------------------------------------ */

class Enemy {
  constructor(mats, feature) {
    this.mats = mats;
    this.feature = feature;
    this.rng = new Rng(feature.seed ?? 1);
    this.group = new THREE.Group();
    this.pos = this.group.position;
    this.pos.set(feature.x ?? 0, feature.y ?? 0, feature.z);
    this.alive = true;
    this.hp = 1;
    this.radius = 2;
    this.score = 100;
    this.flash = 0;
    this.velocity = null;
    /** Static ground emplacements can't be rammed for free. */
    this.contactDamage = 1;
  }

  /**
   * Adds a white overlay shell used for the hit flash. Only worth doing for
   * enemies the player will actually shoot at repeatedly.
   */
  _addFlashShell(sourceGeo, scale = 1.06) {
    this.flashMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false,
      blending: THREE.AdditiveBlending,
    });
    this.flashMesh = new THREE.Mesh(sourceGeo, this.flashMat);
    this.flashMesh.scale.setScalar(scale);
    this.flashMesh.renderOrder = 5;
    this.group.add(this.flashMesh);
  }

  add(g, mat, x = 0, y = 0, z = 0, shadow = true) {
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = shadow;
    this.group.add(m);
    return m;
  }

  hit(dmg, ctx) {
    if (!this.alive) return false;
    this.hp -= dmg;
    this.flash = 1;
    if (this.hp <= 0) {
      this.alive = false;
      return true;
    }
    return false;
  }

  /** Common per-frame housekeeping. Subclasses call super.update(). */
  update(dt, ctx) {
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 6);
      if (this.flashMat) this.flashMat.opacity = this.flash * 0.75;
    }
  }

  /** Aim point, with lead prediction unless the player killed the radar. */
  _aimAt(ctx, bulletSpeed) {
    const p = ctx.player;
    _aim.copy(p.pos);
    if (!ctx.radarJammed) {
      const dist = _aim.distanceTo(this.pos);
      const lead = clamp(dist / bulletSpeed, 0, 1.4);
      _aim.x += p.velocity.x * lead;
      _aim.y += p.velocity.y * lead;
      _aim.z += p.speed * lead;
    }
    // accuracy falls off with difficulty inverted: harder = tighter
    const spread = lerp(3.4, 0.7, clamp01(ctx.difficulty));
    _aim.x += rand.gauss() * spread;
    _aim.y += rand.gauss() * spread * 0.6;
    return _aim;
  }

  dispose() {
    this.flashMat?.dispose();
    this.group.parent?.remove(this.group);
  }
}

/* ------------------------------------------------------------------ */
/* Ground turret                                                       */
/* ------------------------------------------------------------------ */

export class Turret extends Enemy {
  constructor(mats, feature, heavy = false) {
    super(mats, feature);
    this.heavy = heavy;
    this.hp = heavy ? 6 : 2;
    this.radius = heavy ? 3.4 : 2.4;
    this.score = heavy ? 400 : 150;
    this.fireTimer = this.rng.range(0.6, 2.2);
    this.burst = 0;

    const s = heavy ? 1.5 : 1;
    const baseGeo = geo(`turretBase${heavy}`, () => {
      const g = new THREE.CylinderGeometry(1.5 * s, 1.9 * s, 1.0 * s, 8);
      g.translate(0, 0.5 * s, 0);
      return g;
    });
    const domeGeo = geo(`turretDome${heavy}`, () => {
      const g = new THREE.SphereGeometry(1.15 * s, 12, 8, 0, TAU, 0, Math.PI * 0.55);
      return g;
    });
    const barrelGeo = geo(`turretBarrel${heavy}`, () => {
      const g = new THREE.CylinderGeometry(0.19 * s, 0.24 * s, 3.0 * s, 6);
      g.rotateX(Math.PI / 2);
      g.translate(0, 0, 1.3 * s);
      // Sleeves share the barrel draw and follow its pitch without extra shadows.
      const sleeve = new THREE.CylinderGeometry(.31*s, .34*s, .9*s, 8)
        .rotateX(Math.PI/2).translate(0, 0, .75*s);
      const muzzle = new THREE.TorusGeometry(.24*s, .065*s, 4, 8).translate(0, 0, 2.76*s);
      return mergeParts([g, sleeve, muzzle]);
    });

    this.add(baseGeo, mats.darkMetal);
    this.add(geo(`turretArmor${heavy}`, () => {
      const parts = [collar(1.42, .13, .84)];
      for (let i=0; i<8; i++) {
        const a=i*TAU/8;
        parts.push(box(.66,.5,.15,0,.46,1.62).rotateY(a));
      }
      return mergeParts(parts).scale(s,s,s);
    }), mats.enemyHull, 0, 0, 0, false);
    this.turntable = new THREE.Group();
    this.turntable.position.y = 1.0 * s;
    this.group.add(this.turntable);

    const dome = new THREE.Mesh(domeGeo, mats.enemyHull);
    dome.castShadow = true;
    this.turntable.add(dome);

    this.barrels = [];
    const offs = heavy ? [-0.45, 0.45] : [0];
    for (const o of offs) {
      const b = new THREE.Mesh(barrelGeo, mats.darkMetal);
      b.position.set(o * s, 0.15 * s, 0);
      b.castShadow = true;
      this.turntable.add(b);
      this.barrels.push(b);
    }

    // glowing eye — makes turrets legible at a distance
    this.eye = new THREE.Mesh(
      geo(`turretEye${heavy}`, () => new THREE.SphereGeometry(0.3 * s, 8, 6)),
      mats.neon(heavy ? 0xff3d55 : 0xff8a3a, 3),
    );
    this.eye.position.set(0, 0.5 * s, 0.75 * s);
    this.turntable.add(this.eye);

    this._addFlashShell(domeGeo, 1.15);
    this.flashMesh.position.y = 1.0 * s;
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    const p = ctx.player;
    // only engage inside a believable envelope
    const dz = p.pos.z - this.pos.z;
    const engaged = dz > -75 && dz < 8 && p.alive;

    if (engaged) {
      if (!this.hasEngaged) { this.hasEngaged=true; this.firstShotPending=true; this.fireTimer=0.45; }
      _v.copy(p.pos).sub(this.pos);
      const yaw = Math.atan2(_v.x, _v.z);
      const pitch = Math.atan2(_v.y, Math.hypot(_v.x, _v.z));
      this.turntable.rotation.y = damp(this.turntable.rotation.y, yaw, 6, dt);
      for (const b of this.barrels) b.rotation.x = damp(b.rotation.x, -pitch, 6, dt);

      this.fireTimer -= dt * (this.firstShotPending ? 1 : 0.6 + ctx.difficulty * 0.9);
      if (this.fireTimer <= 0) {
        this.firstShotPending=false;
        this._shoot(ctx);
        const salvo = this.heavy ? 3 : 1;
        this.burst++;
        if (this.burst >= salvo) {
          this.burst = 0;
          this.fireTimer = lerp(2.6, 1.0, clamp01(ctx.difficulty)) * this.rng.range(0.8, 1.3);
        } else {
          this.fireTimer = 0.14;
        }
      }
    }

    const charging = engaged && this.fireTimer < 0.5;
    this.eye.scale.setScalar(charging ? 1.25 + Math.sin(ctx.time * 24) * 0.2 : 1);
  }

  _shoot(ctx) {
    const speed = this.heavy ? 92 : 78;
    const aim = this._aimAt(ctx, speed);
    for (const b of this.barrels) {
      b.getWorldPosition(_v);
      _v2.copy(aim).sub(_v).normalize();
      _v.addScaledVector(_v2, 1.6);
      ctx.projectiles.fire(SIDE.ENEMY, _v.x, _v.y, _v.z, _v2.x, _v2.y, _v2.z, speed, {
        damage: 1, radius: 0.9, life: 4, width: this.heavy ? 1.35 : 1,
      });
      ctx.fx.muzzle(_v, _v2, 0xff7a4a, this.heavy ? 1.1 : 0.7);
    }
    audio.enemyShot(audio.panFor(this.pos.x, ctx.player.pos.x));
  }
}

/* ------------------------------------------------------------------ */
/* Missile silo                                                        */
/* ------------------------------------------------------------------ */

export class Silo extends Enemy {
  constructor(mats, feature) {
    super(mats, feature);
    this.hp = 5;
    this.radius = 3.2;
    this.score = 300;
    this.fireTimer = this.rng.range(1.4, 3.4);
    this.doors = 0;

    const bodyGeo = geo('siloBody', () => {
      const g = new THREE.CylinderGeometry(2.2, 2.6, 2.4, 8);
      g.translate(0, 1.2, 0);
      return g;
    });
    this.add(bodyGeo, mats.enemyHull);
    this.add(geo('siloRim', () => {
      const g = new THREE.TorusGeometry(2.1, 0.22, 6, 16);
      g.rotateX(Math.PI / 2);
      g.translate(0, 2.45, 0);
      return g;
    }), mats.darkMetal);

    this.hatch = this.add(geo('siloHatch', () => {
      const g = new THREE.CylinderGeometry(1.85, 1.85, 0.3, 8);
      return g;
    }), mats.darkMetal, 0, 2.45, 0);

    this.glow = new THREE.Mesh(
      geo('siloGlow', () => new THREE.CircleGeometry(1.75, 16).rotateX(-Math.PI / 2)),
      mats.neon(0xff3d55, 2.4),
    );
    this.glow.position.y = 2.4;
    this.group.add(this.glow);

    this.add(geo('siloBraces', () => {
      const parts=[];
      for (let i=0; i<8; i++) {
        const a=(i+.5)*TAU/8;
        parts.push(box(.3,1.8,.3,0,1.2,2.35).rotateY(a));
        parts.push(box(.65,.22,.45,0,2.22,2.05).rotateY(a));
      }
      return mergeParts(parts);
    }), mats.darkMetal, 0, 0, 0, false);
    this._addFlashShell(bodyGeo, 1.1);
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    const p = ctx.player;
    const dz = p.pos.z - this.pos.z;
    const engaged = dz > -85 && dz < 8 && p.alive;
    if (!engaged) return;
    if (!this.hasEngaged) { this.hasEngaged=true; this.firstShotPending=true; this.fireTimer=0.55; }

    this.fireTimer -= dt * (this.firstShotPending ? 1 : 0.55 + ctx.difficulty * 0.7);
    // the hatch slides open just before launch — a fair telegraph
    const opening = this.fireTimer < 0.9;
    this.doors = damp(this.doors, opening ? 1 : 0, 8, dt);
    this.hatch.position.y = 2.45 + this.doors * 0.1;
    this.hatch.scale.setScalar(1 - this.doors * 0.85);
    this.glow.scale.setScalar(0.4 + this.doors * 0.8);

    if (this.fireTimer <= 0) {
      this.firstShotPending=false;
      this.fireTimer = lerp(5.5, 2.6, clamp01(ctx.difficulty)) * this.rng.range(0.85, 1.25);
      _v.set(this.pos.x, this.pos.y + 3, this.pos.z);
      ctx.projectiles.launchMissile(
        _v.x, _v.y, _v.z,
        rand.range(-0.3, 0.3), 1, 0.35, 44, ctx.player,
        { damage: 1, radius: 1.3, turn: lerp(1.5, 2.9, clamp01(ctx.difficulty)), life: 7 },
      );
      ctx.fx.muzzle(_v, new THREE.Vector3(0, 1, 0), 0xffb060, 1.4);
      audio.missile(audio.panFor(this.pos.x, ctx.player.pos.x));
      ctx.warn('MISSILE LAUNCH');
    }
  }
}

/* ------------------------------------------------------------------ */
/* Fuel cell — shoot it, don't dodge it                                */
/* ------------------------------------------------------------------ */

export class FuelCell extends Enemy {
  constructor(mats, feature) {
    super(mats, feature);
    this.hp = 1;
    this.radius = 2.2;
    this.score = 100;
    this.fuelValue = 0.16;
    this.contactDamage = 1;

    const tankGeo = geo('fuelTank', () => {
      const g = new THREE.CapsuleGeometry(1.3, 1.6, 4, 12);
      g.translate(0, 2.0, 0);
      return g;
    });
    this.add(tankGeo, mats.enemyHull);
    this.add(geo('fuelFoot', () => {
      const g = new THREE.CylinderGeometry(1.5, 1.7, 0.5, 8);
      g.translate(0, 0.25, 0);
      return g;
    }), mats.darkMetal);

    this.band = new THREE.Mesh(
      geo('fuelBand', () => {
        const g = new THREE.TorusGeometry(1.34, 0.16, 6, 16);
        g.rotateX(Math.PI / 2);
        return g;
      }),
      mats.neon(0xffb43a, 2.6),
    );
    this.band.position.y = 2.0;
    this.group.add(this.band);

    this.add(geo('fuelPlumbing', () => mergeParts([
      collar(1.29,.09,1.2), collar(1.29,.09,2.8),
      box(.2,1.7,.24,1.35,2,0), box(.2,1.7,.24,-1.35,2,0),
      new THREE.CylinderGeometry(.32,.4,.24,8).translate(0,4.02,0),
    ])), mats.darkMetal, 0, 0, 0, false);
    this._addFlashShell(tankGeo, 1.1);
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    this.band.position.y = 2.0 + Math.sin(ctx.time * 2.4 + this.pos.z * 0.2) * 0.35;
    this.band.rotation.y += dt * 1.2;
  }
}

/* ------------------------------------------------------------------ */
/* Radar tower — big score, and killing it blinds enemy aim            */
/* ------------------------------------------------------------------ */

export class RadarTower extends Enemy {
  constructor(mats, feature) {
    super(mats, feature);
    this.hp = 4;
    this.radius = 3.0;
    this.score = 1000;

    this.add(geo('radarMast', () => {
      const g = new THREE.CylinderGeometry(0.45, 0.8, 7, 6);
      g.translate(0, 3.5, 0);
      return g;
    }), mats.darkMetal);
    this.add(geo('radarBase', () => {
      const g = new THREE.CylinderGeometry(1.8, 2.2, 1.0, 8);
      g.translate(0, 0.5, 0);
      return g;
    }), mats.enemyHull);

    this.dish = new THREE.Group();
    this.dish.position.y = 7.2;
    this.group.add(this.dish);

    const dishGeo = geo('radarDish', () => {
      const g = new THREE.SphereGeometry(2.4, 16, 10, 0, TAU, 0, Math.PI * 0.34);
      g.rotateX(-Math.PI / 2.2);
      return g;
    });
    // The dish is an open shell, so it needs its own double-sided material
    // rather than mutating the shared enemy hull.
    const dishMat = mat('dish', () => {
      const m = mats.enemyHull.clone();
      m.side = THREE.DoubleSide;
      return m;
    });
    const d = new THREE.Mesh(dishGeo, dishMat);
    d.castShadow = true;
    this.dish.add(d);

    const emitter = new THREE.Mesh(
      geo('radarEmit', () => new THREE.SphereGeometry(0.34, 8, 6)),
      mats.neon(0x52ffa8, 3),
    );
    emitter.position.set(0, 1.1, 1.1);
    this.dish.add(emitter);
    this.emitter = emitter;

    this._addFlashShell(dishGeo, 1.12);
    this.flashMesh.position.y = 7.2;
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    this.dish.rotation.y += dt * 1.1;
    this.emitter.scale.setScalar(1 + Math.sin(ctx.time * 8) * 0.3);
  }
}

/* ------------------------------------------------------------------ */
/* Floating mine                                                       */
/* ------------------------------------------------------------------ */

export class Mine extends Enemy {
  constructor(mats, feature) {
    super(mats, feature);
    this.hp = 1;
    this.radius = 1.9;
    this.score = 80;
    this.phase = this.rng.next() * TAU;
    this.armed = 0;

    const coreGeo = geo('mineCore', () => new THREE.IcosahedronGeometry(1.2, 0));
    this.core = this.add(coreGeo, mats.enemyHull);

    // spikes
    const spikeGeo = geo('mineSpike', () => {
      const g = new THREE.ConeGeometry(0.22, 1.1, 5);
      g.rotateX(Math.PI / 2);
      g.translate(0, 0, 1.3);
      return g;
    });
    for (const d of [
      [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
    ]) {
      const s = new THREE.Mesh(spikeGeo, mats.darkMetal);
      s.lookAt(d[0], d[1], d[2]);
      s.castShadow = true;
      this.group.add(s);
    }

    this.lamp = new THREE.Mesh(
      geo('mineLamp', () => new THREE.SphereGeometry(0.4, 8, 6)),
      mats.neon(0xff3d55, 3.2),
    );
    this.group.add(this.lamp);
    this._addFlashShell(coreGeo, 1.2);
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    this.phase += dt;
    this.group.rotation.x += dt * 0.5;
    this.group.rotation.y += dt * 0.7;
    this.pos.y += Math.sin(this.phase * 1.3) * dt * 1.6;

    // proximity arming: it pulses faster the closer you get
    const d = this.pos.distanceTo(ctx.player.pos);
    const near = clamp01(1 - d / 34);
    this.armed = near;
    const blink = 1 + Math.sin(ctx.time * (4 + near * 26)) * (0.25 + near * 0.5);
    this.lamp.scale.setScalar(blink);
    if (near > 0.55 && !this._warned) {
      this._warned = true;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Flying enemies                                                      */
/* ------------------------------------------------------------------ */

class Flyer extends Enemy {
  constructor(mats, feature, fast) {
    super(mats, feature);
    this.fast = fast;
    this.hp = fast ? 2 : 3;
    this.radius = 2.2;
    this.score = fast ? 320 : 250;
    this.pattern = feature.pattern ?? 'weave';
    this.phase = this.rng.next() * TAU;
    this.fireTimer = this.rng.range(0.8, 2.6);
    this.velocity = new THREE.Vector3();
    this.homeX = feature.x;
    this.homeY = feature.y;
    this.peeling = false;
    this.peelDir = this.rng.bool() ? 1 : -1;

    const bodyGeo = geo(`flyBody${fast}`, () => {
      // Armoured keel: a narrow interceptor nose, broad drone shoulders.
      const shape = new THREE.Shape();
      const width=fast ? .75 : 1.05, nose=fast ? 1.86 : 1.45;
      shape.moveTo(0,nose); shape.lineTo(width,.35);
      shape.lineTo(width*.72,-1.05); shape.lineTo(.38,-1.5);
      shape.lineTo(-.38,-1.5); shape.lineTo(-width*.72,-1.05);
      shape.lineTo(-width,.35); shape.closePath();
      return new THREE.ExtrudeGeometry(shape, {depth:.45,steps:1,
        bevelEnabled:true,bevelThickness:.12,bevelSize:.1,bevelSegments:1})
        .rotateX(Math.PI/2).translate(0,.225,0);
    });
    this.body = this.add(bodyGeo, mats.enemyHull);

    const wingGeo = geo(`flyWing${fast}`, () => {
      const s = new THREE.Shape();
      s.moveTo(0, 0.5);
      s.lineTo(2.4, -0.7);
      s.lineTo(2.5, -1.1);
      s.lineTo(0.4, -0.6);
      s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.12, steps: 1, bevelEnabled: true, bevelThickness: .035, bevelSize: .035, bevelSegments: 1 });
      g.rotateX(Math.PI / 2);
      return g;
    });
    for (const side of [1, -1]) {
      const w = new THREE.Mesh(wingGeo, mats.darkMetal);
      w.scale.x = side;
      w.position.set(side * 0.5, 0, 0);
      w.castShadow = true;
      this.group.add(w);
    }

    this.add(geo(`flyMachinery${fast}`, () => {
      const parts=[];
      for (const side of [-1,1]) {
        const x=side*(fast ? .7 : .92);
        parts.push(box(.35,.35,1.45,x,-.06,-.42));
        // Recessed inlet, cooling vanes, and exhaust fairings.
        parts.push(box(.43,.42,.16,x,0,.32));
        for(let i=0;i<3;i++) parts.push(box(.5,.06,.09,x,.23,-.15-i*.24));
      }
      parts.push(new THREE.TorusGeometry(.42,.12,6,12).translate(0,0,fast ? -1.86 : -1.48));
      return mergeParts(parts);
    }), mats.darkMetal, 0, 0, 0, false);
    const canopyMat=mat('enemyCanopy', () => new THREE.MeshStandardMaterial({
      color:0x151c29,metalness:.68,roughness:.22,envMapIntensity:1.1,
    }));
    this.add(geo(`flyCanopy${fast}`, () => new THREE.SphereGeometry(1,12,6)
      .scale(fast ? .32 : .5,.24,fast ? .72 : .48).translate(0,.32,.28)),
      canopyMat, 0, 0, 0, false);

    this.engine = new THREE.Mesh(
      geo('flyEngine', () => new THREE.CircleGeometry(0.38, 10)),
      mats.neon(fast ? 0xff5a3a : 0xff9a3a, 3),
    );
    this.engine.position.z = fast ? -2.0 : -1.5;
    this.engine.rotation.y = Math.PI;
    this.group.add(this.engine);

    this.eye = new THREE.Mesh(
      geo('flyEye', () => new THREE.SphereGeometry(0.24, 8, 6)),
      mats.neon(0xff3d55, 3),
    );
    this.eye.position.z = fast ? 1.8 : 1.4;
    this.group.add(this.eye);

    this._addFlashShell(bodyGeo, 1.15);
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    const p = ctx.player;
    this.phase += dt;

    const trail = this.fast ? 0.82 : 0.62;
    let vx = 0, vy = 0, vz = p.speed * trail;

    switch (this.pattern) {
      case 'weave':
        vx = Math.cos(this.phase * 1.6) * 15;
        vy = Math.sin(this.phase * 1.1) * 6;
        break;
      case 'dive': {
        _v.copy(p.pos).sub(this.pos);
        if (this.pos.z-p.pos.z < 12) this.peeling = true;
        if (!this.peeling) {
          // Slower forward motion closes the distance in scrolling world space.
          vx=clamp(_v.x*0.35,-1,1)*12;
          vy=clamp(_v.y*0.25,-1,1)*8;
          vz=p.speed*0.35;
        } else {
          // Commit to one exit, so the fighter never oscillates across the threshold.
          vx=this.peelDir*24; vy=8; vz=p.speed*0.1;
        }
        break;
      }
      case 'strafe':
        vx = clamp((p.pos.x - this.pos.x) * 0.5, -1, 1) * 19;
        vy = Math.sin(this.phase * 2.2) * 4;
        break;
      case 'orbit': {
        const r = 11;
        vx = Math.cos(this.phase * 1.5) * r * 1.5 - (this.pos.x - this.homeX) * 2;
        vy = Math.sin(this.phase * 1.5) * r * 0.8 - (this.pos.y - this.homeY) * 2;
        break;
      }
    }

    this.velocity.set(vx, vy, vz);
    this.pos.addScaledVector(this.velocity, dt);
    this.pos.x = clamp(this.pos.x, -CORRIDOR_HALF - 3, CORRIDOR_HALF + 3);
    this.pos.y = clamp(this.pos.y, ALT_MIN + 1, ALT_MAX);

    // bank into the turn
    this.group.rotation.z = damp(this.group.rotation.z, -vx * 0.035, 6, dt);
    this.group.rotation.x = damp(this.group.rotation.x, -vy * 0.02, 6, dt);
    this.group.rotation.y = damp(this.group.rotation.y, vx * 0.012, 5, dt);
    this.engine.scale.setScalar(1 + Math.sin(ctx.time * 30 + this.phase) * 0.12);

    // fire when roughly ahead of the player
    const dz = this.pos.z - p.pos.z;
    if (dz > 4 && dz < 85 && p.alive) {
      this.fireTimer -= dt * (0.7 + ctx.difficulty * 0.8);
      if (this.fireTimer <= 0) {
        this.fireTimer = lerp(2.8, 1.1, clamp01(ctx.difficulty)) * this.rng.range(0.8, 1.3);
        const speed = 76;
        const aim = this._aimAt(ctx, speed);
        _v.copy(this.pos);
        _v2.copy(aim).sub(_v).normalize();
        ctx.projectiles.fire(SIDE.ENEMY, _v.x, _v.y, _v.z + 1.5, _v2.x, _v2.y, _v2.z, speed, {
          damage: 1, radius: 0.9, life: 4,
        });
        ctx.fx.muzzle(_v, _v2, 0xff7a4a, 0.6);
        audio.enemyShot(audio.panFor(this.pos.x, p.pos.x));
      }
    }
  }
}

export class Drone extends Flyer {
  constructor(mats, feature) { super(mats, feature, false); }
}
export class Interceptor extends Flyer {
  constructor(mats, feature) { super(mats, feature, true); }
}

/* ------------------------------------------------------------------ */
/* Factory                                                             */
/* ------------------------------------------------------------------ */

export const ENEMY_KINDS = new Set([
  'turret', 'heavyTurret', 'silo', 'fuel', 'radar', 'mine', 'drone', 'interceptor',
]);

export function createEnemy(kind, mats, feature) {
  const e = _create(kind, mats, feature);
  // Explicit tag rather than constructor.name: class names do not survive
  // minification, and gameplay rules key off this.
  if (e) e.kind = kind;
  return e;
}

function _create(kind, mats, feature) {
  switch (kind) {
    case 'turret': return new Turret(mats, feature, false);
    case 'heavyTurret': return new Turret(mats, feature, true);
    case 'silo': return new Silo(mats, feature);
    case 'fuel': return new FuelCell(mats, feature);
    case 'radar': return new RadarTower(mats, feature);
    case 'mine': return new Mine(mats, feature);
    case 'drone': return new Drone(mats, feature);
    case 'interceptor': return new Interceptor(mats, feature);
    default: return null;
  }
}
