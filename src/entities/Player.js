import { inCombatView } from '../game/CombatVisibility.js';
import { disposeModel } from '../render/Dispose.js';
/**
 * The player ship.
 *
 * Two things matter more than anything else here:
 *
 *  1. The flight model has to feel like it has mass without feeling sluggish,
 *     so lateral and vertical motion are velocity-driven with hard caps and a
 *     bank/pitch that lags the input slightly.
 *
 *  2. In an isometric view you cannot tell how high something is. The shadow
 *     and the drop-line under the ship are not decoration — they are the
 *     primary depth cue, and everything about the altitude game reads off them.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SIDE } from './Projectiles.js';
import { CORRIDOR_HALF, ALT_MIN, ALT_MAX, FLIGHT_SPEED } from '../world/Level.js';
import { clamp, clamp01, damp, lerp, approach, rand } from '../core/Utils.js';
import { settings } from '../core/Settings.js';
import { audio } from '../audio/Audio.js';
import { Trail } from '../fx/Trail.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _euler = new THREE.Euler();

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

/**
 * Builds a panelled interceptor with swept wings and machined engine details. Nose points +Z, the direction of travel.
 */
function buildShip(mats) {
  const g = new THREE.Group();
  /** Static parts are baked per material: the whole airframe is four draws. */
  const buckets = { hull: [], accent: [], glass: [], neon: [] };
  const _obj = new THREE.Object3D();

  const add = (geo, bucket, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, color = null) => {
    _obj.position.set(x, y, z);
    _obj.rotation.set(rx, ry, rz);
    _obj.scale.set(sx, sy, sz);
    _obj.updateMatrix();
    let part = geo.index ? geo.toNonIndexed() : geo.clone();
    part.applyMatrix4(_obj.matrix);
    part.deleteAttribute('uv1');
    part.clearGroups();
    if (bucket === 'neon') {
      const c = new THREE.Color(color);
      const n = part.attributes.position.count;
      const data = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) data.set([c.r, c.g, c.b], i * 3);
      part.setAttribute('color', new THREE.BufferAttribute(data, 3));
    }
    buckets[bucket].push(part);
  };
  const neonColor = (hex, gain) => new THREE.Color(hex).multiplyScalar(gain);

  /* --- fuselage ---------------------------------------------------- */

  const nose = new THREE.ConeGeometry(0.62, 2.6, 8);
  nose.rotateX(Math.PI / 2);
  add(nose, 'hull', 0, 0, 1.9);

  const body = new THREE.CylinderGeometry(0.62, 0.78, 2.6, 8);
  body.rotateX(Math.PI / 2);
  add(body, 'hull', 0, 0, 0.3);

  const tail = new THREE.CylinderGeometry(0.78, 0.5, 1.5, 8);
  tail.rotateX(Math.PI / 2);
  add(tail, 'accent', 0, 0, -1.7);

  /* --- wings -------------------------------------------------------- */

  // Swept delta. Each side is its own outline: extrusion keeps the winding
  // front-facing, which a baked negative scale would not.
  for (const side of [1, -1]) {
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0.9);
    wingShape.lineTo(side * 3.4, -1.5);
    wingShape.lineTo(side * 3.55, -2.15);
    wingShape.lineTo(side * 2.2, -2.0);
    wingShape.lineTo(side * 0.55, -1.1);
    wingShape.closePath();
    const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.15, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.045, bevelThickness: 0.04 });
    wingGeo.translate(0, 0, -0.095);
    wingGeo.rotateX(Math.PI / 2);
    add(wingGeo, 'hull', side * 0.5, -0.06, 0.1, 0, 0, side * -0.09);
  }

  // wing leading-edge accents
  const edgeGeo = new THREE.BoxGeometry(3.1, 0.1, 0.34);
  for (const side of [1, -1]) {
    add(edgeGeo, 'accent', side * 2.0, 0.03, 0.62, 0, side * 0.62, side * -0.09);
  }

  /* --- vertical stabilisers ------------------------------------------ */

  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.lineTo(-1.5, 0);
  finShape.lineTo(-1.15, 1.35);
  finShape.lineTo(-0.15, 1.2);
  finShape.closePath();
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.12, bevelEnabled: false });
  finGeo.translate(0, 0, -0.06);
  for (const side of [1, -1]) {
    add(finGeo, 'accent', side * 0.62, 0.24, -1.35, 0, 0, side * 0.22);
  }

  /* --- canopy -------------------------------------------------------- */

  const canopyGeo = new THREE.SphereGeometry(0.5, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
  add(canopyGeo, 'glass', 0, 0.42, 0.75, 0, 0, 0, 1, 0.85, 1.9);

  /* --- engines ------------------------------------------------------- */

  const nacelle = new THREE.CylinderGeometry(0.42, 0.5, 2.2, 10);
  nacelle.rotateX(Math.PI / 2);
  const nozzle = new THREE.CylinderGeometry(0.44, 0.3, 0.35, 10);
  nozzle.rotateX(Math.PI / 2);

  const engines = [];
  for (const side of [1, -1]) {
    add(nacelle, 'accent', side * 1.05, -0.1, -1.25);
    add(nozzle, 'neon', side * 1.05, -0.1, -2.4, 0, 0, 0, 1, 1, 1, neonColor(0x2a3644, 1));
    // Small and only just over the bloom threshold. The old value put a
    // 3.2x emissive disc a few metres from the camera, which is what turned
    // the bottom of the frame into a white sheet.
    const glowMat = mats.neon(0x8fe4ff, 1.55);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.34, 12), glowMat);
    glow.position.set(side * 1.05, -0.1, -2.56);
    glow.rotation.y = Math.PI;
    g.add(glow);
    engines.push(glow);
  }

  /* --- running lights ------------------------------------------------ */

  const lightGeo = new THREE.BoxGeometry(0.16, 0.1, 0.5);
  add(lightGeo, 'neon', -3.4, 0, -1.55, 0, 0, 0, 1, 1, 1, neonColor(0xff3d55, 1.5));
  add(lightGeo, 'neon', 3.4, 0, -1.55, 0, 0, 0, 1, 1, 1, neonColor(0x52ffa8, 1.5));

  // spine and wing trim: the ship's readable outline in silhouette
  const spine = new THREE.BoxGeometry(0.14, 0.06, 2.4);
  add(spine, 'neon', 0, 0.66, -0.3, 0, 0, 0, 1, 1, 1, neonColor(0x45e0ff, 1.15));

  const trimGeo = new THREE.BoxGeometry(2.6, 0.07, 0.13);
  for (const side of [1, -1]) {
    add(trimGeo, 'neon', side * 2.0, 0.06, 0.5, 0, side * 0.62, side * -0.09, 1, 1, 1, neonColor(0x45e0ff, 1.05));
  }

  // Layered armour, intake vanes and concentric nozzle rings provide a
  // manufactured silhouette without external asset or texture requests.
  for (const side of [-1, 1]) {
    for (let j = 0; j < 4; j++) {
      add(new THREE.BoxGeometry(0.62, 0.06, 0.10), 'accent', side * 1.08, 0.32, -0.65 - j * 0.28);
    }
    for (let j = 0; j < 3; j++) {
      add(new THREE.TorusGeometry(0.43 + j * 0.025, 0.055, 6, 20), 'accent',
        side * 1.05, -0.1, -2.12 - j * 0.19);
    }
    add(new THREE.BoxGeometry(1.1, 0.09, 0.7), 'accent', side * 2.1, 0.11, 0.55, 0, side * 0.62);
    add(new THREE.CylinderGeometry(0.10, 0.15, 1.5, 10), 'accent', side * 1.6, -0.12, 1.1, Math.PI / 2);
    // wingtip gun pods: the visible source of the alternating bolts
    add(new THREE.CylinderGeometry(0.09, 0.12, 1.3, 8), 'accent', side * 1.6, -0.1, 1.95, Math.PI / 2);
  }

  const materials = {
    hull: mats.playerHull,
    accent: mats.playerAccent,
    glass: mats.glass,
    neon: (mats._playerNeon ??= mats.track(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }))),
  };
  // Classic-rig silhouette: the airframe drawn again only where something
  // stands in front of it, so threading a pillar never hides the ship.
  const silhouette = new THREE.Mesh(
    mergeGeometries([...buckets.hull, ...buckets.accent], false),
    (mats._playerSilhouette ??= mats.track(new THREE.MeshBasicMaterial({
      color: 0x7fe8ff, transparent: true, opacity: 0.38, depthWrite: false,
      depthFunc: THREE.GreaterDepth, toneMapped: false,
    }))),
  );
  silhouette.renderOrder = 12;
  silhouette.visible = false;
  g.add(silhouette);
  for (const [key, parts] of Object.entries(buckets)) {
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    const mesh = new THREE.Mesh(merged, materials[key]);
    mesh.castShadow = key !== 'neon';
    mesh.receiveShadow = false;
    g.add(mesh);
  }
  g.userData.engines = engines;
  g.userData.silhouette = silhouette;
  return g;
}

/* ------------------------------------------------------------------ */
/* Player                                                              */
/* ------------------------------------------------------------------ */

export class Player {
  constructor(scene, materials, projectiles, fx) {
    this.scene = scene;
    this.materials = materials;
    this.projectiles = projectiles;
    this.fx = fx;

    this.group = new THREE.Group();
    this.model = buildShip(materials);
    this.group.add(this.model);
    scene.add(this.group);

    this.pos = this.group.position;
    this.velocity = new THREE.Vector3();

    /* --- shadow rig ---------------------------------------------------
       A projected blob plus a drop-line. Cheap, always readable, and it
       works even in space sectors where there is no deck to receive a
       real shadow map.                                                  */
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9),
      new THREE.MeshBasicMaterial({
        map: materials.blob,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        toneMapped: false,
        color: 0x000000,
      }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = 2;
    scene.add(this.shadow);

    this.dropLine = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 1),
      new THREE.MeshBasicMaterial({
        color: 0x45e0ff,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.dropLine.renderOrder = 3;
    scene.add(this.dropLine);

    // ground reticle: shows exactly where the ship sits on the deck
    this.reticle = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 1.35, 24),
      new THREE.MeshBasicMaterial({
        color: 0x45e0ff,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.reticle.rotation.x = -Math.PI / 2;
    this.reticle.renderOrder = 3;
    scene.add(this.reticle);

    /** One ribbon per nozzle. This is the flame; the sparks are seasoning. */
    this.trails = [1, -1].map(() => new Trail(scene, {
      samples: 18, width: 0.46, hot: 0xe8f8ff, cool: 0x1f6fc8,
    }));
    this._nozzle = [new THREE.Vector3(), new THREE.Vector3()];

    this.reset();
  }

  /* ------------------------------------------------------------------ */

  reset(z = 0) {
    this.alive = true;
    this.pos.set(0, 9, z);
    this.velocity.set(0, 0, 0);

    this.baseSpeed = FLIGHT_SPEED;
    this.speed = this.baseSpeed;
    this.speedScale = 1;

    this.hullMax = 3;
    this.hull = this.hullMax;
    this.shields = 1;
    this.shieldsMax = 3;
    this.fuel = 1;

    this.boost = 1;
    this.boosting = false;
    this._boostExhausted = false;
    this.heat = 0;
    this.overheated = false;

    this.roll = 0;
    this.pitch = 0;
    this.yaw = 0;
    this.rollTimer = 0;
    this.rollDir = 1;
    this.rollCooldown = 0;

    this.invuln = 0;
    this.target = null;
    this.targetTimer = 0;
    this.fireCooldown = 0;
    this.muzzleSide = 1;
    this.weaponLevel = 1;
    this.spreadTimer = 0;

    this._emitTimer = 0;
    this.model.visible = true;
    this.group.visible = true;
    this.model.rotation.set(0, 0, 0);
    this.group.scale.setScalar(1);
    if (this.trails) for (const t of this.trails) t.reset(this.pos);
  }

  get radius() { return 1.5; }

  /* ------------------------------------------------------------------ */
  /* Update                                                              */
  /* ------------------------------------------------------------------ */

  update(dt, ctx) {
    if (!this.alive) {
      this._updateShadow(ctx, dt);
      return;
    }

    const input = ctx.input;
    const assist = settings.get('assist');

    /* --- barrel roll ------------------------------------------------- */
    this.rollCooldown = Math.max(0, this.rollCooldown - dt);
    if (input.justPressed('roll') && this.rollTimer <= 0 && this.rollCooldown <= 0) {
      this.rollTimer = 0.55;
      this.rollDir = input.moveX >= 0 ? -1 : 1;
      this.rollCooldown = 0.9;
      this.invuln = Math.max(this.invuln, 0.42);
      this.heat = Math.max(0, this.heat - 0.35);   // rolling vents the weapon
      audio.roll(this.rollDir);
      this.fx.addTrauma(0.12);
    }
    const rolling = this.rollTimer > 0;
    if (rolling) this.rollTimer = Math.max(0, this.rollTimer - dt);

    /* --- boost -------------------------------------------------------- */
    if (!input.boost) this._boostExhausted = false;
    if (this.boost <= 0.02) this._boostExhausted = true;
    const wantBoost = input.boost && !this._boostExhausted && this.fuel > 0.01;
    this.boosting = wantBoost;
    if (wantBoost) {
      this.boost = Math.max(0, this.boost - dt * 0.42);
    } else {
      this.boost = Math.min(1, this.boost + dt * 0.24);
    }
    const boostT = this.boosting ? 1 : 0;
    this.speedScale = damp(this.speedScale, this.boosting ? 1.72 : 1, 4.5, dt);
    this.speed = this.baseSpeed * ctx.speedMultiplier * this.speedScale;

    /* --- lateral / vertical motion ------------------------------------ */
    const latMax = 27 * (this.boosting ? 0.82 : 1);
    const vertMax = 19;
    const accel = 165;

    // All flight rigs look along +Z: screen-right is world -X.
    // Keep menu/device axes conventional; convert at the flight boundary.
    const wantX = -input.moveX * latMax;
    const wantY = input.moveY * vertMax;

    this.velocity.x = approach(this.velocity.x, wantX, accel * dt);
    this.velocity.y = approach(this.velocity.y, wantY, accel * 0.82 * dt);

    // a rolling ship keeps its momentum but loses steering authority
    if (rolling) {
      this.velocity.x = lerp(this.velocity.x, this.rollDir * latMax * 0.75, 1 - Math.exp(-6 * dt));
    }

    this.pos.x += this.velocity.x * dt;
    this.pos.y += this.velocity.y * dt;
    this.pos.z += this.speed * dt;

    /* --- soft walls ---------------------------------------------------- */
    if (this.pos.x < -CORRIDOR_HALF) { this.pos.x = -CORRIDOR_HALF; this.velocity.x *= -0.2; }
    if (this.pos.x > CORRIDOR_HALF) { this.pos.x = CORRIDOR_HALF; this.velocity.x *= -0.2; }
    const floor = ALT_MIN;
    if (this.pos.y < floor) { this.pos.y = floor; this.velocity.y = Math.max(0, this.velocity.y); }
    if (this.pos.y > ALT_MAX) { this.pos.y = ALT_MAX; this.velocity.y = Math.min(0, this.velocity.y); }

    /* --- attitude ------------------------------------------------------ */
    if (!rolling) this.roll = Math.atan2(Math.sin(this.roll), Math.cos(this.roll));
    const targetRoll = rolling
      ? this.rollDir * Math.PI * 2 * (1 - this.rollTimer / 0.55)
      : -this.velocity.x / latMax * 0.92;
    const targetPitch = this.velocity.y / vertMax * 0.30;
    const targetYaw = this.velocity.x / latMax * 0.20;

    this.roll = rolling ? targetRoll : damp(this.roll, targetRoll, 9, dt);
    this.pitch = damp(this.pitch, targetPitch, 7, dt);
    this.yaw = damp(this.yaw, targetYaw, 7, dt);
    this.model.rotation.set(-this.pitch, this.yaw, this.roll);

    /* --- fuel ---------------------------------------------------------- */
    const burn = (0.0125 + (this.boosting ? 0.03 : 0)) * (assist ? 0.7 : 1) * ctx.fuelBurnScale;
    this.fuel = clamp01(this.fuel - burn * dt);
    if (this.fuel <= 0) {
      // out of fuel: the hull starts to fail
      this.damage(dt * 0.9, ctx, { silent: true, source: 'fuel', pierce: true, ignoreInvuln: true });
      if (!this.alive) return;
    }

    /* --- targeting ------------------------------------------------------- */
    // Re-acquire a few times a second rather than every frame: it costs less
    // and, more importantly, the reticle stops flickering between candidates.
    this.targetTimer -= dt;
    if (this.targetTimer <= 0) {
      this.targetTimer = 0.08;
      this.target = ctx.findTarget ? ctx.findTarget(this.pos) : null;
    } else if (this.target && this.target.obj?.alive === false) {
      this.target = null;
    }

    /* --- weapons -------------------------------------------------------- */
    this.spreadTimer = Math.max(0, this.spreadTimer - dt);
    this.fireCooldown -= dt;
    const coolRate = this.overheated ? 0.55 : 0.42;
    this.heat = clamp01(this.heat - coolRate * dt);
    if (this.overheated && this.heat <= 0.05) { this.overheated = false; audio.cooled(); }

    if ((input.fire || input.justPressed('fire')) && this.fireCooldown <= 0 && !this.overheated && !rolling) {
      this._fire(ctx);
    }

    /* --- invulnerability blink ------------------------------------------ */
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.invuln > 0) {
      const blink = Math.sin(ctx.time * 42) > -0.2;
      this.model.visible = blink;
    } else {
      this.model.visible = true;
    }

    /* --- engine FX -------------------------------------------------------- */
    const silhouette = this.model.userData?.silhouette;
    if (silhouette) silhouette.visible = !!ctx.camera?.classic;
    this._engineFx(dt, ctx, boostT);
    this._updateShadow(ctx, dt);

    audio.setEngine(0.5 + this.speedScale * 0.3, this.boosting ? 1 : 0);
  }

  /* ------------------------------------------------------------------ */

  _fire(ctx) {
    const rate = this.spreadTimer > 0 ? 0.105 : 0.115;
    this.fireCooldown = rate;
    this.heat = clamp01(this.heat + 0.075);
    if (this.heat >= 1) {
      this.overheated = true;
      audio.overheat();
    }

    const speed = 190;
    const spread = this.spreadTimer > 0;
    const shots = spread ? [-0.12, 0, 0.12] : [0];

    for (const angle of shots) {
      const side = shots.length === 1 ? this.muzzleSide : 0;
      _v.set(this.pos.x + side * 1.6, this.pos.y - 0.1, this.pos.z + 2.4);

      // base direction: straight ahead, fanned out for the spread array
      _v2.set(Math.sin(angle), 0, Math.cos(angle));

      // Standard shots preserve altitude; steering is an explicit assist.
      if (settings.get('assist') && this.target && inCombatView(ctx.camera, this.target.x, this.target.y, this.target.z)) {
        _aim.set(this.target.x - _v.x, this.target.y - _v.y, this.target.z - _v.z).normalize();
        _v2.lerp(_aim, 0.86).normalize();
      }

      this.projectiles.fire(
        SIDE.PLAYER, _v.x, _v.y, _v.z,
        _v2.x, _v2.y, _v2.z, speed,
        { damage: 1, radius: 0.9, life: 1.6, length: 1.15 },
      );
      // A compact flash just ahead of the gun pod: at 8.7 shots a second a
      // big sprite and a pooled light turned the ship into a white orb.
      _aim.copy(_v).addScaledVector(_v2, 0.8);
      this.fx.muzzle(_aim, _v2, 0x8ff0ff, 0.42, false);
    }

    // Screen-right is world -X, so the right-hand pod pans right.
    audio.laser(shots.length === 1 ? -this.muzzleSide * 0.22 : 0, 1);
    this.muzzleSide *= -1;
    this.fx.addTrauma(0.03);
    ctx.cameraKick?.(0.16);
  }

  _engineFx(dt, ctx, boostT) {
    const intensity = 0.32 + boostT * 0.55;
    // A gentle 9 Hz shimmer. The old 40 Hz flicker strobed at 60 fps.
    const glowScale = 1 + boostT * 0.45 + Math.sin(ctx.time * 9) * 0.05;
    for (const e of this.model.userData.engines) e.scale.setScalar(glowScale);

    const camPos = ctx.camera.position;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      const n = this._nozzle[i];
      n.set(side * 1.05, -0.1, -2.62).applyEuler(this.model.rotation).add(this.pos);
      this.trails[i].setColors(
        this.boosting ? 0xffffff : 0xdff2ff,
        this.boosting ? 0x6fd4ff : 0x1f6fc8,
      );
      this.trails[i].width = 0.42 + boostT * 0.3;
      this.trails[i].update(dt, n, camPos, 0.55 + boostT * 0.75);
    }

    // Sparks are an accent on top of the ribbon, emitted sparsely.
    this._emitTimer = (this._emitTimer ?? 0) + dt;
    const step = this.boosting ? 0.022 : 0.05;
    while (this._emitTimer > step) {
      this._emitTimer -= step;
      const n = this._nozzle[this._emitTimer > step ? 0 : 1];
      _v2.set(0, 0, -1).applyEuler(this.model.rotation);
      this.fx.thruster(
        n, _v2,
        this.boosting ? 0x9fd8ff : 0x2f8fd0,
        intensity,
        this.velocity,
      );
    }
  }

  _updateShadow(ctx, dt) {
    const show = (ctx.hasDeck || ctx.flightGrid) && this.alive;
    this.shadow.visible = show;
    this.reticle.visible = show;
    this.dropLine.visible = show && settings.get('shadowLine');
    if (!show) return;

    const gy = (ctx.guideSurfaceAt?.(this.pos.x, this.pos.z, this.pos.y) ?? 0) + 0.06;
    const alt = Math.max(0, this.pos.y - gy);

    this.shadow.position.set(this.pos.x, gy, this.pos.z);
    // higher up = larger and softer, exactly like a real penumbra
    const s = 0.62 + alt * 0.055;
    this.shadow.scale.set(s, s, s);
    this.shadow.material.opacity = clamp(0.72 - alt * 0.014, 0.2, 0.72);

    this.reticle.position.set(this.pos.x, gy + 0.02, this.pos.z);
    this.reticle.scale.setScalar(0.8 + alt * 0.012);
    this.reticle.material.opacity = clamp(0.5 - alt * 0.008, 0.14, 0.5);

    if (this.dropLine.visible) {
      this.dropLine.position.set(this.pos.x, gy + alt / 2, this.pos.z);
      this.dropLine.scale.set(1, alt, 1);
      // keep the ribbon facing the camera
      _euler.setFromQuaternion(ctx.camera.quaternion, 'YXZ');
      this.dropLine.rotation.set(0, _euler.y, 0);
      this.dropLine.material.opacity = clamp(0.05 + alt * 0.012, 0.05, 0.3);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Damage                                                              */
  /* ------------------------------------------------------------------ */

  /**
   * @returns {'shield'|'hull'|'dead'|'none'}
   */
  damage(amount, ctx, opts = {}) {
    if (!this.alive) return 'none';
    if (this.invuln > 0 && !opts.ignoreInvuln) return 'none';

    if (this.shields > 0 && !opts.pierce) {
      this.shields--;
      this.invuln = Math.max(this.invuln, 0.9);
      this.fx.shieldHit(this.pos, 0x45e0ff);
      ctx.postfx?.flash(0.28, 0x45e0ff);
      audio.shield();
      ctx.input?.rumble(0.4, 0.25, 140);
      return 'shield';
    }

    this.hull -= amount;
    if (!opts.silent) {
      this.invuln = Math.max(this.invuln, 1.15);
      this.fx.addTrauma(0.6);
      ctx.postfx?.hurt(0.85);
      audio.hurt();
      ctx.input?.rumble(0.85, 0.6, 260);
      this.fx.sparks.burst({
        position: this.pos,
        count: 18,
        speed: 15, speedVar: 0.7,
        life: 0.55, lifeVar: 0.5,
        size: 2.4, sizeVar: 0.5,
        colorA: 0xffe0a0, colorB: 0xff2a10,
        drag: 2.4, gravity: -8, fade: 1.5,
      });
    }

    if (this.hull <= 0) {
      this.hull = 0;
      this.kill(ctx);
      return 'dead';
    }
    return 'hull';
  }

  kill(ctx) {
    if (!this.alive) return;
    this.alive = false;
    this.group.visible = false;
    this.shadow.visible = false;
    this.reticle.visible = false;
    this.dropLine.visible = false;
    for (const t of this.trails) t.mesh.visible = false;
    this.fx.playerDeath(this.pos);
    audio.explosion(2.4, 0);
    audio.stopEngine();
    ctx.input?.rumble(1, 1, 600);
  }

  /* ------------------------------------------------------------------ */

  refuel(amount) {
    this.fuel = clamp01(this.fuel + amount);
  }

  addShield() {
    this.shields = Math.min(this.shieldsMax, this.shields + 1);
  }

  repair(amount = 1) {
    this.hull = Math.min(this.hullMax, this.hull + amount);
  }

  grantSpread(seconds = 12) {
    this.spreadTimer = Math.max(this.spreadTimer, seconds);
  }
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    disposeModel(this.group);
    for (const guide of [this.shadow, this.dropLine, this.reticle]) disposeModel(guide, true);
    for (const trail of this.trails) trail.dispose();
  }

}
