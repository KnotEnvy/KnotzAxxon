/**
 * HUD.
 *
 * The overlay is plain DOM rather than in-scene geometry: crisp text at any
 * resolution, free layout, and zero draw calls. Bars are driven with
 * `transform: scaleX` so nothing triggers layout, and every write is guarded
 * by a dirty check because the update runs sixty times a second.
 *
 * The radar is the one canvas element â€” it's genuinely a drawing.
 */

import * as THREE from 'three';
import { inCombatView } from '../game/CombatVisibility.js';
import { CORRIDOR_HALF, ALT_MIN, ALT_MAX } from '../world/Level.js';
import { clamp, clamp01, pad, commafy, lerp } from '../core/Utils.js';

const _p = new THREE.Vector3();

/** Only touch the DOM when the value actually changed. */
class Cell {
  constructor(el, fn) { this.el = el; this.fn = fn; this.last = undefined; }
  set(v) {
    if (v === this.last || !this.el) return;
    this.last = v;
    this.fn(this.el, v);
  }
}

const text = (el) => new Cell(el, (e, v) => { e.textContent = v; });
const bar = (el) => new Cell(el, (e, v) => { e.style.transform = `scaleX(${v})`; });
const cls = (el, name) => new Cell(el, (e, v) => { e.classList.toggle(name, !!v); });

export class HUD {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.root = $('hud');

    this.score = text($('hud-score'));
    this.scoreEl = $('hud-score');
    this.best = text($('hud-best'));
    this.chainWrap = $('hud-chain');
    this.chainMult = text($('hud-chain-mult'));
    this.chainFill = bar($('hud-chain-fill'));
    this.chainOn = cls($('hud-chain'), 'on');
    this.chainDetail = text($('hud-chain-detail'));
    this.chainEventEl = $('hud-chain-event');
    this._comboTimer = 0;
    this._comboPulse = 0;
    this.altEcho = $('alt-contact');
    this.altEchoOn = cls(this.altEcho, 'on');
    this.altEchoLevel = cls(this.altEcho, 'level');
    this.altEchoStatus = text($('alt-contact-status'));
    this.altFill = $('alt-fill');
    this.routePips = Array.from($('hud-route')?.children ?? []);
    this._routeIndex = -1;

    this.sector = text($('hud-sector'));
    this.sectorType = text($('hud-sector-type'));
    this.progress = bar($('hud-progress'));

    this.fuel = bar($('hud-fuel'));
    this.fuelPct = text($('hud-fuel-pct'));
    this.fuelLow = cls($('hud-fuel')?.parentElement, 'low');
    this.hull = bar($('hud-hull'));
    this.hullPct = text($('hud-hull-pct'));
    this.hullLow = cls($('hud-hull')?.parentElement, 'low');
    this.heat = bar($('hud-heat'));
    this.heatHot = cls($('hud-heat')?.parentElement, 'low');
    this.boost = bar($('hud-boost'));
    this.shieldsEl = $('hud-shields');
    this.weapon = text($('hud-weapon'));

    this.altMarker = $('alt-marker');
    this.altValue = text($('alt-value'));
    this.altHazard = $('alt-hazard');
    this.altHazardOn = cls($('alt-hazard'), 'on');
    this.altDanger = cls($('alt-marker'), 'danger');
    this.altTrack = $('alt-track');

    this.bossWrap = $('hud-boss');
    this.bossOn = cls($('hud-boss'), 'on');
    this.bossName = text($('hud-boss-name'));
    this.bossFill = bar($('hud-boss-fill'));
    this.bossGhost = bar($('hud-boss-ghost'));
    this.bossPhase = text($('hud-boss-phase'));

    this.gradeEl = $('hud-grade');
    this.gradeLetter = $('hud-grade-letter');
    this.gradeTitle = $('hud-grade-title');
    this.gradeDetail = $('hud-grade-detail');
    this._gradeTimer = 0;
    this.warnEl = $('hud-warn');
    this.warnOn = cls($('hud-warn'), 'on');
    this.lockEl = $('hud-lock');
    this.floatersEl = $('floaters');
    this.damageFlash = $('damage-flash');
    this.perfEl = $('perf');

    this.radarCanvas = $('radar-canvas');
    this.radarCtx = this.radarCanvas?.getContext('2d');

    this._shieldPips = [];
    this._floaters = [];
    this._floaterPool = [];
    this._warnTimer = 0;
    this._scoreShown = 0;
    this._bossGhostHp = 1;

    this._buildAltTicks();
    this._buildShieldPips(3);
  }

  _buildAltTicks() {
    const el = document.getElementById('alt-ticks');
    if (!el) return;
    let html = '';
    for (let i = 0; i <= 10; i++) {
      const major = i % 5 === 0;
      html += `<span class="${major ? 'major' : ''}" style="bottom:${i * 10}%"></span>`;
    }
    el.innerHTML = html;
  }

  _buildShieldPips(n) {
    if (!this.shieldsEl) return;
    this.shieldsEl.innerHTML = '<b></b>'.repeat(n);
    this._shieldPips = [...this.shieldsEl.children];
  }

  setLive(on) {
    this.root?.classList.toggle('is-live', on);
    this.root?.setAttribute('aria-hidden', String(!on));
    this.setControlsLive(on);
  }

  setControlsLive(on) {
    const touch = document.getElementById('touch');
    touch?.classList.toggle('is-live', on);
    if (touch) { touch.inert = !on; touch.setAttribute('aria-hidden', String(!on)); }
  }

  /* ------------------------------------------------------------------ */

  /**
   * @param {object} s snapshot of everything the HUD shows
   */
  update(s, dt) {
    /* --- score, with a rolling count-up ------------------------------ */
    const target = s.score;
    if (this._scoreShown !== target) {
      const diff = target - this._scoreShown;
      this._scoreShown += Math.sign(diff) * Math.max(1, Math.abs(diff) * Math.min(1, dt * 9));
      if (Math.abs(target - this._scoreShown) < 1) this._scoreShown = target;
      this.scoreEl?.classList.add('bump');
      clearTimeout(this._bumpT);
      this._bumpT = setTimeout(() => this.scoreEl?.classList.remove('bump'), 110);
    }
    this.score.set(pad(this._scoreShown, 6));
    this.best.set(pad(s.best, 6));

    this._updateChain(s, dt);

    /* --- sector ------------------------------------------------------- */
    this.sector.set(s.sectorLabel);
    this.sectorType.set(s.sectorSub);
    this.progress.set(clamp01(s.progress));
    if (Number.isInteger(s.sectorIndex) && s.sectorIndex !== this._routeIndex) {
      this._routeIndex = s.sectorIndex;
      this.routePips.forEach((pip,i)=>{pip.classList.toggle('passed',i<s.sectorIndex);pip.classList.toggle('active',i===s.sectorIndex);});
    }

    /* --- systems ------------------------------------------------------- */
    this.fuel.set(clamp01(s.fuel));
    this.fuelPct.set(Math.round(s.fuel * 100));
    this.fuelLow.set(s.fuel < 0.25);
    const hullT = s.hull / s.hullMax;
    this.hull.set(clamp01(hullT));
    this.hullPct.set(Math.round(hullT * 100));
    this.hullLow.set(hullT <= 0.34);
    this.heat.set(clamp01(s.heat));
    this.heatHot.set(s.overheated);
    this.boost.set(clamp01(s.boost));
    this.weapon.set(s.weapon);

    for (let i = 0; i < this._shieldPips.length; i++) {
      this._shieldPips[i].classList.toggle('on', i < s.shields);
    }

    /* --- altimeter ------------------------------------------------------ */
    const altT = clamp01((s.altitude - ALT_MIN) / (ALT_MAX - ALT_MIN));
    if (this.altMarker) this.altMarker.style.bottom = `${altT * 100}%`;
    this.altValue.set(pad(Math.round(s.altitude * 4), 3));

    const hz = s.hazard;
    this.altHazardOn.set(!!hz);
    if (hz && this.altHazard) {
      // paint the *safe* band in amber; everything else at that Z is solid
      const y0 = clamp01((hz.y0 - ALT_MIN) / (ALT_MAX - ALT_MIN));
      const y1 = clamp01((hz.y1 - ALT_MIN) / (ALT_MAX - ALT_MIN));
      this.altHazard.style.bottom = `${y0 * 100}%`;
      this.altHazard.style.height = `${Math.max(0, y1 - y0) * 100}%`;
    }
    this.altDanger.set(!!hz && (s.altitude < hz.y0 || s.altitude > hz.y1));

    /* --- boss ----------------------------------------------------------- */
    this.bossOn.set(!!s.boss);
    if (s.boss) {
      this.bossName.set(s.boss.name);
      const t = clamp01(s.boss.hp / s.boss.hpMax);
      this.bossFill.set(t);
      // the ghost bar drains a beat later, showing the damage you just did
      this._bossGhostHp = Math.max(t, this._bossGhostHp - dt * 0.22);
      this.bossGhost.set(this._bossGhostHp);
      this.bossPhase.set(`PHASE ${s.boss.phase + 1}`);
    } else {
      this._bossGhostHp = 1;
    }

    if (this._gradeTimer > 0) {
      this._gradeTimer -= dt;
      if (this._gradeTimer <= 0) this.gradeEl?.classList.remove('on');
    }

    /* --- warnings -------------------------------------------------------- */
    if (this._warnTimer > 0) {
      this._warnTimer -= dt;
      if (this._warnTimer <= 0) this.warnOn.set(false);
    }

    this._updateAltitudeEcho(s);
    this._updateLock(s.lock, s.camera);
    this._updateFloaters(dt, s.camera);

    /* --- perf ------------------------------------------------------------ */
    if (s.stats && this.perfEl?.classList.contains('on')) {
      this.perfEl.textContent =
        `${s.stats.fps.toFixed(0)} fps  ${s.stats.ms.toFixed(1)} ms  ` +
        `${s.stats.calls} calls  ${(s.stats.tris / 1000).toFixed(0)}k tri  ` +
        `${(s.stats.scale * 100).toFixed(0)}%  ent ${s.entities}  geo ${s.stats.geometries ?? 0} tex ${s.stats.textures ?? 0}`;
    }

    this._drawRadar(s);
  }

  /**
   * Position the target bracket over the current lock. Screen-projected each
   * frame so it tracks moving targets exactly.
   */
  comboEvent(chain, mult, lost = false) {
    this._comboTimer = lost ? 1.2 : 1.0;
    this._comboPulse = lost ? 0 : 1;
    if (this.chainEventEl) {
      const milestone = chain % 3 === 0 && chain <= 21;
      this.chainEventEl.textContent = lost ? 'CHAIN LOST' : mult === 8 ? 'MAX CHAIN' : milestone ? 'MULTIPLIER UP' : 'CHAIN +1';
      this.chainEventEl.classList.toggle('lost', lost);
      this._comboAnimation?.cancel();
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this._comboAnimation = this.chainEventEl.animate?.([
          {transform:'translateY(5px)',opacity:0}, {transform:'translateY(0)',opacity:1}
        ], {duration:180,easing:'ease-out'});
      }
    }
  }

  _updateChain(s, dt) {
    const chain = s.chain ?? 0;
    const remaining = clamp01(s.chainTime);
    this._comboTimer = Math.max(0, this._comboTimer - dt);
    this._comboPulse = Math.max(0, this._comboPulse - dt * 4);
    this.chainOn.set(chain > 0 || s.chainMult > 1 || this._comboTimer > 0);
    this.chainMult.set('x' + s.chainMult);
    this.chainFill.set(remaining);
    this.chainDetail.set(chain > 0 ? chain + ' KILLS / ' + (s.chainMult === 8 ? 'MAX' : (3 - chain % 3) + ' TO x' + (s.chainMult + 1)) : 'BUILD YOUR CHAIN');
    this.chainWrap?.classList.toggle('urgent', chain > 0 && remaining < 0.3);
    this.chainWrap?.classList.toggle('max-chain', s.chainMult === 8);
    if (this.chainMult.el) this.chainMult.el.style.transform = 'scale(' + (1 + this._comboPulse * 0.22) + ')';
    this.chainEventEl?.classList.toggle('on', this._comboTimer > 0);
  }

  _updateAltitudeEcho(s) {
    const echo=s.altitudeEcho;
    this.altEchoOn.set(!!echo);
    const level=!!echo && s.altitude>=echo.min && s.altitude<=echo.max;
    this.altEchoLevel.set(level);
    this.altEchoStatus.set(echo ? (level ? 'LEVEL' : 'CONTACT') : s.hazard ? 'GAP' : s.hasDeck === false ? 'SPACE' : 'ALT');
    if (this.altFill) this.altFill.style.transform='scaleY('+clamp01((s.altitude-ALT_MIN)/(ALT_MAX-ALT_MIN))+')';
    if (!echo || !this.altEcho) return;
    this.altEcho.style.bottom=(clamp01((echo.min-ALT_MIN)/(ALT_MAX-ALT_MIN))*100)+'%';
    this.altEcho.style.height=(clamp01((echo.max-echo.min)/(ALT_MAX-ALT_MIN))*100)+'%';
  }

  _updateLock(lock, camera) {
    const el = this.lockEl;
    if (!el) return;
    if (!lock || !camera || lock.obj?.alive === false || !inCombatView(camera, lock.x, lock.y, lock.z)) { el.classList.remove('on'); return; }
    _p.set(lock.x, lock.y, lock.z).project(camera);
    if (_p.z > 1) { el.classList.remove('on'); return; }
    const x = (_p.x * 0.5 + 0.5) * innerWidth;
    const y = (-_p.y * 0.5 + 0.5) * innerHeight;
    el.style.transform = 'translate(' + x + 'px, ' + y + 'px) translate(-50%, -50%)';
    el.classList.add('on');
    el.classList.toggle('hot', lock.obj?.kind === 'fuel');
  }

  /* ------------------------------------------------------------------ */
  /* Floating combat text                                                */
  /* ------------------------------------------------------------------ */

  /**
   * @param {THREE.Vector3} worldPos
   * @param {string} label
   */
  floater(worldPos, label, color = '#ffffff', size = 1) {
    if (!this.floatersEl) return;
    const el = this._floaterPool.pop() ?? (() => {
      const d = document.createElement('div');
      d.className = 'floater';
      return d;
    })();
    el.textContent = label;
    el.style.color = color;
    el.style.fontSize = `${size}em`;
    el.style.opacity = '1';
    this.floatersEl.appendChild(el);
    this._floaters.push({
      el,
      world: worldPos.clone(),
      life: 1.05,
      maxLife: 1.05,
      drift: (Math.random() - 0.5) * 26,
    });
  }

  _updateFloaters(dt, camera) {
    if (!camera) return;
    for (let i = this._floaters.length - 1; i >= 0; i--) {
      const f = this._floaters[i];
      f.life -= dt;
      if (f.life <= 0) {
        f.el.remove();
        this._floaterPool.push(f.el);
        this._floaters.splice(i, 1);
        continue;
      }
      const t = 1 - f.life / f.maxLife;
      _p.copy(f.world).project(camera);
      if (_p.z > 1) { f.el.style.opacity = '0'; continue; }
      const x = (_p.x * 0.5 + 0.5) * innerWidth + f.drift * t;
      const y = (-_p.y * 0.5 + 0.5) * innerHeight - t * 62;
      f.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${1 + (1 - t) * 0.25})`;
      f.el.style.opacity = String(clamp01(1 - t * t));
    }
  }

  clearFloaters() {
    for (const f of this._floaters) { f.el.remove(); this._floaterPool.push(f.el); }
    this._floaters.length = 0;
  }

  /* ------------------------------------------------------------------ */

  /** Sector report card, shown over play without covering the ship. */
  grade(letter, title, detail, duration = 2.8) {
    if (!this.gradeEl) return;
    this.gradeEl.dataset.grade = letter;
    if (this.gradeLetter) this.gradeLetter.textContent = letter;
    if (this.gradeTitle) this.gradeTitle.textContent = title;
    if (this.gradeDetail) this.gradeDetail.textContent = detail;
    this.gradeEl.classList.add('on');
    this._gradeTimer = duration;
  }

  warn(label, duration = 1.6) {
    if (!this.warnEl) return;
    this.warnEl.textContent = label;
    this.warnOn.set(true);
    this._warnTimer = duration;
  }

  /* ------------------------------------------------------------------ */
  /* Radar                                                               */
  /* ------------------------------------------------------------------ */

  _drawRadar(s) {
    const ctx = this.radarCtx;
    if (!ctx || !s.player) return;
    const W = this.radarCanvas.width;
    const H = this.radarCanvas.height;
    const RANGE = 230;           // how far ahead the sweep reaches
    const px = s.player.pos.x;
    const pz = s.player.pos.z;

    ctx.clearRect(0, 0, W, H);

    // grid
    ctx.strokeStyle = 'rgba(69,224,255,0.13)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 4; i++) {
      const y = H - (i / 4) * H;
      ctx.moveTo(0, y); ctx.lineTo(W, y);
    }
    ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H);
    ctx.stroke();

    // corridor edges
    const toX = (x) => W / 2 - (x / (CORRIDOR_HALF + 6)) * (W / 2);
    const toY = (z) => H - ((z - pz) / RANGE) * H;

    ctx.strokeStyle = 'rgba(69,224,255,0.28)';
    ctx.beginPath();
    ctx.moveTo(toX(-CORRIDOR_HALF), 0); ctx.lineTo(toX(-CORRIDOR_HALF), H);
    ctx.moveTo(toX(CORRIDOR_HALF), 0); ctx.lineTo(toX(CORRIDOR_HALF), H);
    ctx.stroke();

    // walls ahead
    ctx.strokeStyle = 'rgba(255,180,58,0.85)';
    ctx.lineWidth = 2;
    for (const w of s.wallsAhead ?? []) {
      const y = toY(w.z);
      if (y < -4 || y > H + 4) continue;
      ctx.beginPath();
      if (w.gapX == null) {
        ctx.moveTo(0, y); ctx.lineTo(W, y);
      } else {
        ctx.moveTo(0, y); ctx.lineTo(toX(w.gapX + w.gapW / 2), y);
        ctx.moveTo(toX(w.gapX - w.gapW / 2), y); ctx.lineTo(W, y);
      }
      ctx.stroke();
    }

    // contacts
    for (const e of s.contacts ?? []) {
      const x = toX(e.x);
      const y = toY(e.z);
      if (y < -6 || y > H + 6) continue;
      ctx.fillStyle = e.color;
      const r = e.big ? 3.4 : 2.2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // player
    const px2 = toX(px);
    ctx.fillStyle = '#a8f4ff';
    ctx.beginPath();
    ctx.moveTo(px2, H - 8);
    ctx.lineTo(px2 - 4.5, H - 1);
    ctx.lineTo(px2 + 4.5, H - 1);
    ctx.closePath();
    ctx.fill();

    // sweep line
    const sweep = (performance.now() * 0.00022) % 1;
    ctx.strokeStyle = 'rgba(69,224,255,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const sy = H - sweep * H;
    ctx.moveTo(0, sy); ctx.lineTo(W, sy);
    ctx.stroke();
  }

  /* ------------------------------------------------------------------ */

  /** Red edge pulse when the player is hurt. */
  pulseDamage(strength = 1) {
    const el = this.damageFlash;
    if (!el) return;
    el.style.transition = 'none';
    el.style.opacity = String(clamp01(strength));
    if (this._damageRaf != null) cancelAnimationFrame(this._damageRaf);
    this._damageRaf = requestAnimationFrame(() => {
      this._damageRaf = null;
      el.style.transition = 'opacity 0.5s ease-out';
      el.style.opacity = '0';
    });
  }

  dispose() { clearTimeout(this._bumpT); this.reset(); this.setLive(false); }

  reset() {
    clearTimeout(this._bumpT);
    if (this._damageRaf != null) cancelAnimationFrame(this._damageRaf);
    this._damageRaf = null;
    this._warnTimer = 0;
    this._gradeTimer = 0;
    this.gradeEl?.classList.remove('on');
    this._comboTimer = this._comboPulse = 0;
    this.chainEventEl?.classList.remove('on', 'lost');
    this.chainWrap?.classList.remove('urgent', 'max-chain');
    if (this.chainMult.el) this.chainMult.el.style.transform = '';
    this.altEchoOn.set(false); this.altEchoLevel.set(false); this.altEchoStatus.set('ALT');
    this._comboAnimation?.cancel(); this._comboAnimation = null;
    this._routeIndex = -1;
    if (this.damageFlash) { this.damageFlash.style.transition = 'none'; this.damageFlash.style.opacity = '0'; }
    this.scoreEl?.classList.remove('bump');
    this.lockEl?.classList.remove('on');
    this.chainOn.set(false); this.altHazardOn.set(false);
    this._scoreShown = 0;
    this._bossGhostHp = 1;
    this.clearFloaters();
    this.warnOn.set(false);
    this.bossOn.set(false);
  }
}
