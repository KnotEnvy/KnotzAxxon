import { disposeModel } from '../render/Dispose.js';
/**
 * THE IRON SENTINEL — the fortress core guardian.
 *
 * A rail boss: it holds station ahead of the player and matches their forward
 * speed, so the fight plays out as a duel in a moving arena rather than a
 * chase. Three phases, each with a different vulnerability rule:
 *
 *   1. Armoured. Only the two shoulder pods can be hurt. Kill both to crack it.
 *   2. Core cycles open and shut. Punish the windows.
 *   3. Core permanently exposed, but it fights back with everything.
 */

import * as THREE from 'three';
import { SIDE } from './Projectiles.js';
import { CORRIDOR_HALF, ALT_MAX } from '../world/Level.js';
import { Rng, clamp, clamp01, damp, lerp, rand, TAU } from '../core/Utils.js';
import { audio } from '../audio/Audio.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

const STANDOFF = [92, 78, 64];

export class Boss {
  constructor(scene, mats, feature) {
    this.mats = mats;
    this.rng = new Rng(feature.seed ?? 7);
    this.group = new THREE.Group();
    this.pos = this.group.position;
    this.pos.set(0, 14, feature.z);
    scene.add(this.group);

    this.name = 'IRON SENTINEL';
    this.alive = true;
    this.active = false;
    this.phase = 0;
    this.hpMax = 120;
    this.hp = this.hpMax;
    this.radius = 9;
    this.score = 15000;

    this.coreOpen = 0;
    this.coreTimer = 4;
    this.attackTimer = 2.4;
    this.spiralAngle = 0;
    this.entrance = 0;
    this.deathTimer = 0;
    this.velocity = new THREE.Vector3();

    this._build(mats);
  }

  /* ------------------------------------------------------------------ */
  /* Model                                                               */
  /* ------------------------------------------------------------------ */

  _build(mats) {
    const hull = mats.enemyHull;
    const dark = mats.darkMetal;

    const add = (g, m, x, y, z, parent = this.group) => {
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    /* --- central chassis --------------------------------------------- */
    add(new THREE.BoxGeometry(16, 9, 11), hull, 0, 0, 0);
    add(new THREE.BoxGeometry(18, 2.2, 12.5), dark, 0, 5, 0);
    add(new THREE.BoxGeometry(18, 2.2, 12.5), dark, 0, -5, 0);

    // prow
    const prow = new THREE.ConeGeometry(5.2, 7, 4);
    prow.rotateX(-Math.PI / 2);
    prow.rotateZ(Math.PI / 4);
    add(prow, hull, 0, 0, -8.4);

    // buttresses
    for (const side of [1, -1]) {
      add(new THREE.BoxGeometry(2.4, 12, 5), dark, side * 8.6, 0, 2.5);
    }

    /* --- core --------------------------------------------------------- */
    this.coreGroup = new THREE.Group();
    this.coreGroup.position.set(0, 0, -5.6);
    this.group.add(this.coreGroup);

    this.coreMat = mats.energyCore(0xff3d55);
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(3.1, 1), this.coreMat);
    this.coreGroup.add(this.core);

    this.coreShell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(3.5, 0),
      mats.neon(0xff3d55, 2.2, { transparent: true, opacity: 0.5, additive: true, depthWrite: false }),
    );
    this.coreGroup.add(this.coreShell);

    // iris shutters — four petals that retract to expose the core
    this.shutters = [];
    const petal = new THREE.BoxGeometry(6.4, 3.6, 1.4);
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(petal, hull);
      s.castShadow = true;
      const holder = new THREE.Group();
      holder.rotation.z = (i / 4) * TAU;
      holder.add(s);
      s.position.set(0, 3.4, -6.4);
      this.group.add(holder);
      this.shutters.push({ holder, mesh: s, base: 3.4 });
    }

    /* --- shoulder pods ------------------------------------------------- */
    this.pods = [];
    const podGeo = new THREE.CylinderGeometry(3.4, 4.0, 6.5, 8);
    const barrelGeo = new THREE.CylinderGeometry(0.5, 0.62, 6, 8);
    barrelGeo.rotateX(-Math.PI / 2);
    barrelGeo.translate(0, 0, -3);

    for (const side of [1, -1]) {
      const g = new THREE.Group();
      g.position.set(side * 13.5, 0, -1);
      this.group.add(g);

      const body = new THREE.Mesh(podGeo, hull);
      body.rotation.x = Math.PI / 2;
      body.castShadow = true;
      g.add(body);

      const barrels = [];
      for (const o of [-1.3, 1.3]) {
        const b = new THREE.Mesh(barrelGeo, dark);
        b.position.set(o, 0, -3);
        b.castShadow = true;
        g.add(b);
        barrels.push(b);
      }

      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), mats.neon(0xffb43a, 3));
      eye.position.set(0, 2.2, -2.4);
      g.add(eye);

      const flashMat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
        toneMapped: false, blending: THREE.AdditiveBlending,
      });
      const flashMesh = new THREE.Mesh(podGeo, flashMat);
      flashMesh.rotation.x = Math.PI / 2;
      flashMesh.scale.setScalar(1.1);
      g.add(flashMesh);

      this.pods.push({
        group: g, side, hp: 22, hpMax: 22, alive: true,
        barrels, eye, flashMat, flash: 0, fireTimer: this.rng.range(0.5, 2),
        pos: new THREE.Vector3(), radius: 5,
      });
    }

    /* --- decorative rings ---------------------------------------------- */
    this.rings = [];
    for (let i = 0; i < 2; i++) {
      const r = new THREE.Mesh(
        new THREE.TorusGeometry(11 + i * 3.4, 0.34, 6, 40),
        mats.neon(i ? 0xff6a3a : 0x45e0ff, 2.2),
      );
      r.position.z = -3 - i * 2;
      this.group.add(r);
      this.rings.push(r);
    }

    /* --- engine glow ---------------------------------------------------- */
    this.thrusters = [];
    for (const side of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.CircleGeometry(2.2, 16), mats.neon(0xff7a3a, 2.6));
      t.position.set(side * 5, 0, 6.1);
      this.group.add(t);
      this.thrusters.push(t);
    }
  }

  get podsAlive() {
    return this.pods.filter((p) => p.alive).length;
  }

  /* ------------------------------------------------------------------ */
  /* Update                                                              */
  /* ------------------------------------------------------------------ */

  update(dt, ctx) {
    const p = ctx.player;

    if (!this.alive) {
      this._updateDeath(dt, ctx);
      return;
    }

    /* --- entrance ---------------------------------------------------- */
    if (!this.active) {
      if (p.pos.z > this.pos.z - 220) {
        this.active = true;
        ctx.onBossEngage?.(this);
      } else {
        this.pos.z = Math.max(this.pos.z, p.pos.z + 200);
        return;
      }
    }
    this.entrance = Math.min(1, this.entrance + dt * 0.5);

    /* --- station keeping --------------------------------------------- */
    const standoff = STANDOFF[Math.min(this.phase, 2)];
    const wantZ = p.pos.z + standoff;
    const prevZ = this.pos.z;
    this.pos.z = damp(this.pos.z, wantZ, 2.6, dt);

    // lateral weave; more aggressive as phases advance
    this._t = (this._t ?? 0) + dt * (0.55 + this.phase * 0.35);
    const sweep = (CORRIDOR_HALF - 2) * (0.55 + this.phase * 0.2);
    const wantX = Math.sin(this._t) * sweep + Math.sin(this._t * 2.3) * 3;
    const wantY = 13 + Math.sin(this._t * 0.8) * (3 + this.phase * 2);

    const prevX = this.pos.x;
    const prevY = this.pos.y;
    this.pos.x = damp(this.pos.x, wantX, 2.2, dt);
    this.pos.y = damp(this.pos.y, clamp(wantY, 7, ALT_MAX - 4), 2.2, dt);
    this.velocity.set(
      (this.pos.x - prevX) / dt, (this.pos.y - prevY) / dt, (this.pos.z - prevZ) / dt,
    );

    // face the player
    _v.copy(p.pos).sub(this.pos);
    this.group.rotation.y = damp(this.group.rotation.y, Math.atan2(_v.x, -_v.z) * 0.35, 3, dt);
    this.group.rotation.z = damp(this.group.rotation.z, -this.velocity.x * 0.008, 3, dt);

    /* --- visuals ------------------------------------------------------ */
    this.rings[0].rotation.z += dt * 0.6;
    this.rings[1].rotation.z -= dt * 0.9;
    this.core.rotation.x += dt * 0.5;
    this.core.rotation.y += dt * 0.8;
    const pulse = 1 + Math.sin(ctx.time * 6) * 0.06;
    this.coreShell.scale.setScalar(pulse * (0.9 + this.coreOpen * 0.35));
    this.coreMat.uniforms.uIntensity.value = 0.35 + this.coreOpen * 1.5;
    for (const t of this.thrusters) t.scale.setScalar(1 + Math.sin(ctx.time * 22) * 0.1);

    /* --- phase logic --------------------------------------------------- */
    this._updatePhase(dt, ctx);

    /* --- shutters ------------------------------------------------------- */
    for (const s of this.shutters) {
      s.mesh.position.y = s.base + this.coreOpen * 4.6;
      s.mesh.visible = this.coreOpen < 0.98;
    }

    /* --- pods ------------------------------------------------------------ */
    for (const pod of this.pods) {
      pod.group.getWorldPosition(pod.pos);
      if (pod.flash > 0) {
        pod.flash = Math.max(0, pod.flash - dt * 6);
        pod.flashMat.opacity = pod.flash * 0.8;
      }
      if (!pod.alive) continue;
      // aim
      _v.copy(p.pos).sub(pod.pos);
      const yaw = Math.atan2(_v.x, -_v.z);
      const pitch = Math.atan2(_v.y, Math.hypot(_v.x, _v.z));
      pod.group.rotation.y = damp(pod.group.rotation.y, yaw * 0.6, 4, dt);
      for (const b of pod.barrels) b.rotation.x = damp(b.rotation.x, pitch * 0.6, 4, dt);
      pod.eye.scale.setScalar(1 + Math.sin(ctx.time * 7 + pod.side) * 0.18);
    }

    /* --- attacks ---------------------------------------------------------- */
    this.attackTimer -= dt;
    if (this.attackTimer <= 0 && p.alive) this._chooseAttack(ctx);
  }

  _updatePhase(dt, ctx) {
    if (this.phase === 0) {
      // armoured: core sealed until both pods are gone
      this.coreOpen = damp(this.coreOpen, 0, 4, dt);
      if (this.podsAlive === 0) this._advancePhase(ctx);
    } else if (this.phase === 1) {
      this.coreTimer -= dt;
      if (this.coreTimer <= 0) {
        const opening = this.coreOpen < 0.5;
        this.coreTimer = opening ? 4.2 : 3.0;
        this._wantOpen = opening;
        if (opening) {
          audio.sting(false);
          ctx.warn('CORE EXPOSED');
        }
      }
      this.coreOpen = damp(this.coreOpen, this._wantOpen ? 1 : 0, 3.4, dt);
      if (this.hp <= this.hpMax * 0.35) this._advancePhase(ctx);
    } else {
      this.coreOpen = damp(this.coreOpen, 1, 3, dt);
      this._rageTimer = (this._rageTimer ?? 0) - dt;
      if (this._rageTimer <= 0) {
        this._rageTimer = 6.5;
        // call in escorts
        for (let i = 0; i < 2; i++) {
          ctx.spawnEnemy?.('interceptor', {
            z: this.pos.z - 20 - i * 12,
            x: rand.range(-10, 10),
            y: rand.range(6, 18),
            pattern: 'dive',
            seed: rand.int(0, 1e6),
          });
        }
      }
    }
  }

  _advancePhase(ctx) {
    this.phase++;
    this.attackTimer = 1.4;
    this._wantOpen = true;
    this.coreTimer = 4.5;
    ctx.fx.explosion(this.pos, 2.4, { shake: 1.6, debris: false });
    ctx.postfx?.flash(0.5, 0xff8a4a);
    audio.explosion(2.2, 0);
    audio.sting(false);
    ctx.onBossPhase?.(this);
    ctx.warn(this.phase === 1 ? 'ARMOUR BREACHED' : 'SENTINEL ENRAGED');
  }

  /* ------------------------------------------------------------------ */
  /* Attacks                                                             */
  /* ------------------------------------------------------------------ */

  _chooseAttack(ctx) {
    const opts = [];
    if (this.podsAlive > 0) opts.push('spray', 'aimed');
    opts.push('spiral');
    if (this.phase >= 1) opts.push('missiles', 'sweep');
    if (this.phase >= 2) opts.push('sweep', 'spiral', 'missiles');

    const pick = opts[Math.floor(rand.next() * opts.length)];
    const cooldown = lerp(2.6, 1.1, this.phase / 2) * rand.range(0.85, 1.2);
    this.attackTimer = cooldown;

    switch (pick) {
      case 'spray': this._spray(ctx); break;
      case 'aimed': this._aimed(ctx); break;
      case 'spiral': this._spiral(ctx); break;
      case 'missiles': this._missiles(ctx); break;
      case 'sweep': this._sweep(ctx); break;
    }
  }

  _muzzle(ctx, from, dir, color = 0xff8a4a, scale = 1) {
    ctx.fx.muzzle(from, dir, color, scale);
  }

  _spray(ctx) {
    const speed = 68;
    for (const pod of this.pods) {
      if (!pod.alive) continue;
      const n = 5 + this.phase * 2;
      for (let i = 0; i < n; i++) {
        const a = (i / (n - 1) - 0.5) * 0.85;
        _v.copy(pod.pos);
        _v2.set(Math.sin(a), rand.range(-0.08, 0.02), -Math.cos(a));
        ctx.projectiles.fire(SIDE.ENEMY, _v.x, _v.y, _v.z, _v2.x, _v2.y, _v2.z, speed, {
          damage: 1, radius: 1, life: 4.5, width: 1.2,
        });
      }
      this._muzzle(ctx, pod.pos, _v2, 0xffb060, 1.4);
    }
    audio.enemyShot(0);
  }

  _aimed(ctx) {
    const speed = 100;
    for (const pod of this.pods) {
      if (!pod.alive) continue;
      _v2.copy(ctx.player.pos);
      _v2.z += ctx.player.speed * 0.35;
      _v2.sub(pod.pos).normalize();
      for (let i = 0; i < 3; i++) {
        ctx.projectiles.fire(
          SIDE.ENEMY, pod.pos.x, pod.pos.y, pod.pos.z - i * 3,
          _v2.x + rand.gauss() * 0.02, _v2.y + rand.gauss() * 0.02, _v2.z,
          speed, { damage: 1, radius: 1, life: 4 },
        );
      }
      this._muzzle(ctx, pod.pos, _v2, 0xff5a3a, 1.2);
    }
    audio.enemyShot(0);
  }

  _spiral(ctx) {
    const count = 14 + this.phase * 6;
    const speed = 56;
    _v.copy(this.pos);
    _v.z -= 6;
    for (let i = 0; i < count; i++) {
      const a = this.spiralAngle + (i / count) * TAU;
      _v2.set(Math.cos(a) * 0.62, Math.sin(a) * 0.62, -0.78).normalize();
      ctx.projectiles.fire(SIDE.ENEMY, _v.x, _v.y, _v.z, _v2.x, _v2.y, _v2.z, speed, {
        damage: 1, radius: 0.9, life: 5, width: 1.1,
      });
    }
    this.spiralAngle += 0.42;
    ctx.fx.rings.spawn(_v, { from: 2, to: 26, life: 0.45, color: 0xff3d55, opacity: 0.8 });
    audio.enemyShot(0);
  }

  _missiles(ctx) {
    const n = 2 + this.phase;
    for (let i = 0; i < n; i++) {
      _v.copy(this.pos);
      _v.x += (i - (n - 1) / 2) * 4;
      _v.y += 3;
      ctx.projectiles.launchMissile(
        _v.x, _v.y, _v.z, (i - (n - 1) / 2) * 0.4, 0.5, -1, 46, ctx.player,
        { damage: 1, radius: 1.4, turn: 2.0 + this.phase * 0.3, life: 7.5 },
      );
    }
    audio.missile(0);
    ctx.warn('MISSILES INBOUND');
  }

  /**
   * A curtain of fire across the corridor with exactly one gap. Read it, fly
   * through it — the boss's version of the wall gaps from the rest of the game.
   */
  _sweep(ctx) {
    const speed = 62;
    const gapX = rand.range(-CORRIDOR_HALF + 4, CORRIDOR_HALF - 4);
    const gapW = lerp(9, 6.5, this.phase / 2);
    _v.copy(this.pos);
    for (let x = -CORRIDOR_HALF - 3; x <= CORRIDOR_HALF + 3; x += 2.6) {
      if (Math.abs(x - gapX) < gapW / 2) continue;
      for (const y of [this.pos.y - 4, this.pos.y + 4]) {
        ctx.projectiles.fire(SIDE.ENEMY, x, y, this.pos.z - 6, 0, 0, -1, speed, {
          damage: 1, radius: 0.9, life: 5, width: 1.3,
        });
      }
    }
    ctx.warn('BARRAGE');
    audio.enemyShot(0);
  }

  /* ------------------------------------------------------------------ */
  /* Damage                                                              */
  /* ------------------------------------------------------------------ */

  /**
   * Resolve a hit at a world position.
   * @returns {'pod'|'core'|'armour'|null}
   */
  hitAt(worldPos, dmg, ctx) {
    if (!this.alive) return null;

    // pods first — they stick out and are the phase-1 objective
    for (const pod of this.pods) {
      if (!pod.alive) continue;
      if (worldPos.distanceTo(pod.pos) < pod.radius) {
        pod.hp -= dmg;
        pod.flash = 1;
        if (pod.hp <= 0) {
          pod.alive = false;
          pod.group.visible = false;
          this.hp -= 18;
          ctx.fx.explosion(pod.pos, 1.8, { shake: 1.2 });
          audio.explosion(1.8, audio.panFor(pod.pos.x, ctx.player.pos.x));
          ctx.awardScore?.(2500, pod.pos, 'POD DESTROYED');
        }
        return 'pod';
      }
    }

    // core, only when the shutters are open
    this.coreGroup.getWorldPosition(_v);
    if (this.coreOpen > 0.55 && worldPos.distanceTo(_v) < 6.5) {
      this.hp -= dmg * 1.6;
      ctx.fx.impact(worldPos, _v2.copy(worldPos).sub(_v).normalize(), 0xff3d55, 1.3);
      if (this.hp <= 0) this._die(ctx);
      return 'core';
    }

    // otherwise it bounces
    if (worldPos.distanceTo(this.pos) < this.radius + 2) {
      ctx.fx.impact(worldPos, _v2.copy(worldPos).sub(this.pos).normalize(), 0x9fb8cc, 0.8);
      return 'armour';
    }
    return null;
  }

  _die(ctx) {
    this.alive = false;
    this.hp = 0;
    this.deathTimer = 3.4;
    ctx.onBossDefeated?.(this);
    audio.stopMusic();
  }

  _updateDeath(dt, ctx) {
    this.deathTimer -= dt;
    // ride along with the player so the spectacle stays on screen
    this.pos.z = damp(this.pos.z, ctx.player.pos.z + 70, 1.6, dt);
    this.group.rotation.z += dt * 0.5;
    this.group.rotation.x += dt * 0.2;
    this.coreOpen = 1;

    this._boomTimer = (this._boomTimer ?? 0) - dt;
    if (this._boomTimer <= 0 && this.deathTimer > 0.6) {
      this._boomTimer = 0.14;
      _v.copy(this.pos).add(
        _v2.set(rand.range(-11, 11), rand.range(-6, 6), rand.range(-8, 8)),
      );
      ctx.fx.explosion(_v, rand.range(0.7, 1.7), { shake: 0.5 });
      audio.explosion(rand.range(0.8, 1.6), audio.panFor(_v.x, ctx.player.pos.x));
    }

    if (this.deathTimer <= 0 && !this._finalBoom) {
      this._finalBoom = true;
      ctx.fx.explosion(this.pos, 4.5, { shake: 3 });
      for (let i = 0; i < 5; i++) {
        ctx.fx.rings.spawn(this.pos, { from: 4, to: 90 + i * 30, life: 1.1 + i * 0.2, color: 0xffd9a0, opacity: 0.8 });
      }
      ctx.postfx?.flash(1, 0xffffff);
      audio.explosion(3, 0);
      this.group.visible = false;
      ctx.onBossGone?.(this);
    }
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    disposeModel(this.group);
    this.coreMat.dispose();
    for (const pod of this.pods) pod.flashMat.dispose();
  }
}
