/**
 * Camera rig.
 *
 * The offset is defined in "travel space" — behind and above the ship — then
 * yawed around it. That yaw is the whole look of the game: 42 degrees gives
 * the classic isometric diagonal, small values give a modern chase cam. Both
 * are legitimate ways to play, so it's a setting rather than a constant.
 *
 * Shake uses the trauma model: effects add trauma, trauma decays, and the
 * actual displacement is trauma squared. That keeps small hits subtle while
 * big ones really kick.
 */

import * as THREE from 'three';
import { settings } from '../core/Settings.js';
import { clamp, damp, lerp, noise1, DEG } from '../core/Utils.js';

const _target = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _look = new THREE.Vector3();
const _off = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.position = new THREE.Vector3(0, 18, -30);
    this.lookAt = new THREE.Vector3();
    this.shakeSeed = Math.random() * 1000;
    this.fovBase = 58;
    this.fov = 58;
    this.extraDist = 0;
    this._kick = 0;
    this._intro = 0;
    this.applyRig();
  }

  applyRig() {
    const rig = settings.cameraRig;
    this.yaw = rig.yaw * DEG;
    this.dist = rig.dist;
    this.height = rig.height;
    this.fovBase = rig.fov;
    this.classic = settings.get('camera') === 'classic';
  }

  /** Snap to the ideal position — used when a run starts. */
  snap(player) {
    this._kick = 0;
    this.fov = this.fovBase;
    this.camera.fov = this.fov;
    this.camera.up.set(0, 1, 0);
    this._compute(player, 0, 0);
    this.position.copy(_desired);
    this.lookAt.copy(_look);
    this.camera.position.copy(this.position);
    this.camera.lookAt(this.lookAt);
    this.camera.setFlightProjection(this.classic, this._halfHeight());
    this.camera.updateMatrixWorld(true);
    this._intro = 1;
  }

  _compute(player, boost, dt) {
    const p = player.pos;

    // Base offset: behind (-Z) and above, then rotated by the rig yaw.
    _off.set(0, this.height, -(this.dist + this.extraDist + boost * 4.5));
    _off.applyAxisAngle(_up, this.yaw);

    _desired.copy(p).add(_off);
    if (this.classic) {
      // Anchor to the corridor, not lateral input: targets stay on screen.
      // Lead both eye and focus equally to retain the classic isometric angle.
      const lead = 28;
      _desired.set(_off.x, 9 + _off.y, p.z + lead + _off.z);
      _look.set(0, 9, p.z + lead);
      return;
    }
    // lead the camera slightly with lateral movement so turns feel wide
    _desired.x += player.velocity.x * 0.12;
    _desired.y += clamp(player.velocity.y * 0.06, -1.6, 1.6);

    // Look ahead of the ship, further at speed — this is what sells velocity.
    _look.copy(p);
    _look.z += 16 + boost * 14;
    _look.x += player.velocity.x * 0.22;
    _look.y += 1.2 + player.velocity.y * 0.05;
  }

  /**
   * @param {number} dt
   * @param {number} time
   * @param {import('../entities/Player.js').Player} player
   * @param {object} o { trauma, boost, focus }
   */
  update(dt, time, player, o = {}) {
    const boost = o.boost ?? 0;
    this._compute(player, boost, dt);

    // Position lag: tight vertically, looser laterally, so the ship leads.
    const k = o.instant ? 60 : 9;
    this.position.x = damp(this.position.x, _desired.x, k * 0.8, dt);
    this.position.y = damp(this.position.y, _desired.y, k, dt);
    this.position.z = damp(this.position.z, _desired.z, k * 1.6, dt);

    this.lookAt.x = damp(this.lookAt.x, _look.x, 11, dt);
    this.lookAt.y = damp(this.lookAt.y, _look.y, 11, dt);
    this.lookAt.z = damp(this.lookAt.z, _look.z, 14, dt);

    /* --- weapon recoil --------------------------------------------------
       A small push straight back along the view axis. Tiny, but it is what
       makes the gun feel connected to the camera rather than to the HUD.   */
    this._kick = damp(this._kick, 0, 16, dt);

    /* --- shake --------------------------------------------------------- */
    const trauma = clamp((o.trauma ?? 0) * settings.get('shake'), 0, 1.4);
    const amp = trauma * trauma;
    let sx = 0, sy = 0, sr = 0;
    if (amp > 0.0005) {
      const t = time * 26;
      sx = noise1(t + this.shakeSeed) * amp * 1.5;
      sy = noise1(t + this.shakeSeed + 91.3) * amp * 1.5;
      sr = noise1(t + this.shakeSeed + 217.7) * amp * 0.06;
    }

    this.camera.position.set(
      this.position.x + sx,
      this.position.y + sy,
      this.position.z - this._kick * settings.get('shake'),
    );
    this.camera.up.set(Math.sin(sr), Math.cos(sr), 0);
    this.camera.lookAt(this.lookAt);

    this.camera.setFlightProjection(this.classic, this._halfHeight());
    if (this.classic) return;

    /* --- FOV ------------------------------------------------------------ */
    const wantFov = this.fovBase + boost * 9 + amp * 3;
    this.fov = damp(this.fov, wantFov, 6, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  _halfHeight() {
    // Preserve lateral coverage on portrait displays instead of cropping lanes.
    return Math.max(40, 60 / this.camera.aspect) + this.extraDist * 0.3;
  }

  /** Recoil impulse, consumed and decayed by update(). */
  kick(amount) {
    this._kick = Math.min(0.9, this._kick + amount);
  }

  /** Pull back for the boss fight. */
  setFraming(extraDist, extraHeight = 0) {
    this.extraDist = extraDist;
  }
}
