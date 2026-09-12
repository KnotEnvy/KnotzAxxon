import { Lifetime } from './Lifetime.js';
/**
 * Input abstraction: keyboard, gamepad and touch all collapse into one
 * intent struct the game reads each frame. Nothing else in the codebase
 * knows what a KeyboardEvent is.
 */

import { clamp } from './Utils.js';
import { settings } from './Settings.js';

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  Space: 'fire', KeyJ: 'fire',
  ShiftLeft: 'boost', ShiftRight: 'boost', KeyK: 'boost',
  KeyL: 'roll', ControlLeft: 'roll',
  Escape: 'pause', KeyP: 'pause',
  Enter: 'confirm', NumpadEnter: 'confirm',
  Backspace: 'cancel',
  KeyF: 'debugPerf',
};

/** Gamepad button indices (standard mapping). */
const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

export class Input extends EventTarget {
  constructor(root = window) {
    super();
    this.root = root;
    this._lifetime = new Lifetime();

    /** Continuous axes, -1..1. */
    this.moveX = 0;
    this.moveY = 0;
    /** Held buttons. */
    this.fire = false;
    this.boost = false;
    /** Edge-triggered this frame. */
    this.pressed = new Set();

    this._down = new Set();
    this._mouseDown = new Set();
    this._padDown = new Set();
    this._prevPad = new Set();
    this._touchVec = { x: 0, y: 0 };
    this._touchFire = false;
    this._touchBoost = false;
    this._touchRollQueued = false;
    this.hasGamepad = false;
    this.lastDevice = 'keyboard';

    this._bindKeyboard();
    this._bindPointer();
    this._bindTouch();

    this._lifetime.listen(this.root, 'gamepadconnected', () => { this.hasGamepad = true; });
    this._lifetime.listen(this.root, 'gamepaddisconnected', () => { this.hasGamepad = !!navigator.getGamepads?.().find(Boolean); });
  }

  /* ---------------------------------------------------------------- */

  _bindKeyboard() {
    this._lifetime.listen(this.root, 'keydown', (e) => {
      if (e.defaultPrevented || e.target?.matches?.('button, select, textarea')) return;
      if (e.target instanceof HTMLInputElement || e.target?.isContentEditable) return;
      const a = KEYMAP[e.code];
      if (!a) return;
      // Space and arrows scroll the page otherwise.
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.repeat) return;
      this.lastDevice = 'keyboard';
      this._down.add(a);
      this.pressed.add(a);
      this.dispatchEvent(new CustomEvent('press', { detail: a }));
    });
    this._lifetime.listen(this.root, 'keyup', (e) => {
      const a = KEYMAP[e.code];
      if (a) this._down.delete(a);
    });
    // Releasing everything on blur avoids a stuck throttle when alt-tabbing.
    this._lifetime.listen(this.root, 'blur', () => this.reset(true));
  }

  _bindPointer() {
    const canvas = document.getElementById('viewport');
    if (!canvas) return;
    this._lifetime.listen(canvas, 'contextmenu', (e) => e.preventDefault());
    this._lifetime.listen(canvas, 'pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      this.lastDevice = 'mouse';
      if (e.button === 0) {
        this._mouseDown.add('fire'); this.pressed.add('fire');
        this.dispatchEvent(new CustomEvent('press', { detail: 'fire' }));
      }
      if (e.button === 2) {
        this._mouseDown.add('roll');
        this.pressed.add('roll');
        this.dispatchEvent(new CustomEvent('press', { detail: 'roll' }));
      }
    });
    this._lifetime.listen(this.root, 'pointerup', (e) => {
      if (e.pointerType === 'touch') return;
      if (e.button === 0) this._mouseDown.delete('fire');
      if (e.button === 2) this._mouseDown.delete('roll');
    });
  }

  _bindTouch() {
    this._lifetime.listen(document.getElementById('tb-pause'), 'click', () => {
      this.lastDevice = 'touch'; this.dispatchEvent(new CustomEvent('press', { detail: 'pause' }));
    });
    const stick = document.getElementById('touch-stick');
    const knob = stick?.querySelector('i');
    if (!stick) return;

    let id = null;
    let cx = 0, cy = 0, radius = 60;

    this._resetStick = () => {
      id = null;
      if (knob) knob.style.transform = 'translate(-50%, -50%)';
    };
    const start = (e) => {
      const t = e.changedTouches[0];
      id = t.identifier;
      const r = stick.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      radius = r.width * 0.42;
      this.lastDevice = 'touch';
      move(e);
    };
    const move = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== id) continue;
        let dx = (t.clientX - cx) / radius;
        let dy = (t.clientY - cy) / radius;
        const len = Math.hypot(dx, dy);
        if (len > 1) { dx /= len; dy /= len; }
        this._touchVec.x = dx;
        this._touchVec.y = -dy;
        if (knob) knob.style.transform = `translate(calc(-50% + ${dx * radius}px), calc(-50% + ${dy * radius}px))`;
      }
    };
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== id) continue;
        id = null;
        this._touchVec.x = this._touchVec.y = 0;
        if (knob) knob.style.transform = 'translate(-50%, -50%)';
      }
    };

    this._lifetime.listen(stick, 'touchstart', start, { passive: true });
    this._lifetime.listen(stick, 'touchmove', move, { passive: true });
    this._lifetime.listen(stick, 'touchend', end, { passive: true });
    this._lifetime.listen(stick, 'touchcancel', end, { passive: true });

    const hold = (el, set) => {
      if (!el) return;
      this._lifetime.listen(el, 'touchstart', (e) => { e.preventDefault(); this.lastDevice = 'touch'; set(true); }, { passive: false });
      this._lifetime.listen(el, 'touchend', (e) => { e.preventDefault(); set(false); }, { passive: false });
      this._lifetime.listen(el, 'touchcancel', () => set(false));
    };
    hold(document.getElementById('tb-fire'), (v) => { if (v && !this._touchFire) this.pressed.add('fire'); this._touchFire = v; });
    hold(document.getElementById('tb-boost'), (v) => { this._touchBoost = v; });
    this._lifetime.listen(document.getElementById('tb-roll'), 'touchstart', (e) => {
      e.preventDefault();
      this._touchRollQueued = true;
    }, { passive: false });
  }

  /* ---------------------------------------------------------------- */

  reset(releaseGamepad = false) {
    this._down.clear(); this._mouseDown.clear(); this.pressed.clear();
    // Menu transitions clear intent, but retain physical pad edges until release.
    if (releaseGamepad) { this._padDown.clear(); this._prevPad.clear(); }
    this.moveX = this.moveY = this._padVecX = this._padVecY = 0;
    this._touchVec.x = this._touchVec.y = 0;
    this.fire = this.boost = this._touchFire = this._touchBoost = this._touchRollQueued = false;
    this._resetStick?.();
  }

  dispose() { this._lifetime.dispose(); this.reset(true); }

  /** True on the frame a control went down. */
  justPressed(action) {
    return this.pressed.has(action);
  }

  isDown(action) {
    return this._down.has(action) || this._mouseDown.has(action) || this._padDown.has(action);
  }

  /**
   * Poll everything and fold it into the intent struct.
   * Call once per frame, before game update.
   */
  update() {
    this._pollGamepad();

    let x = 0, y = 0;
    if (this.isDown('left')) x -= 1;
    if (this.isDown('right')) x += 1;
    if (this.isDown('down')) y -= 1;
    if (this.isDown('up')) y += 1;

    // Analog sources win when they are actually deflected.
    if (Math.abs(this._padVecX) > 0.001 || Math.abs(this._padVecY) > 0.001) {
      x = this._padVecX;
      y = this._padVecY;
    }
    if (Math.abs(this._touchVec.x) > 0.001 || Math.abs(this._touchVec.y) > 0.001) {
      x = this._touchVec.x;
      y = this._touchVec.y;
    }

    this.moveX = clamp(x, -1, 1);
    this.moveY = clamp(y, -1, 1) * (settings.get('invertY') ? -1 : 1);
    this.fire = this.isDown('fire') || this._touchFire;
    this.boost = this.isDown('boost') || this._touchBoost;

    if (this._touchRollQueued) {
      this._touchRollQueued = false;
      this.pressed.add('roll');
      this.dispatchEvent(new CustomEvent('press', { detail: 'roll' }));
    }
  }

  /** Clear edge-triggered state. Call at the very end of the frame. */
  endFrame() {
    this.pressed.clear();
  }

  _padVecX = 0;
  _padVecY = 0;

  _pollGamepad() {
    this._padVecX = this._padVecY = 0;
    const pads = navigator.getGamepads?.();
    if (!pads) return;
    let pad = null;
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    if (!pad) { this._padDown.clear(); return; }
    this.hasGamepad = true;

    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
    this._padVecX = dz(pad.axes[0] ?? 0);
    this._padVecY = -dz(pad.axes[1] ?? 0);
    if (this._padVecX || this._padVecY) this.lastDevice = 'gamepad';

    this._prevPad.clear();
    for (const action of this._padDown) this._prevPad.add(action);
    this._padDown.clear();

    const btn = (i) => pad.buttons[i]?.pressed || pad.buttons[i]?.value > 0.4;
    if (btn(PAD.A) || btn(PAD.RT) || btn(PAD.RB)) this._padDown.add('fire');
    if (btn(PAD.LT) || btn(PAD.LB) || btn(PAD.X)) this._padDown.add('boost');
    if (btn(PAD.B) || btn(PAD.Y)) this._padDown.add('roll');
    if (btn(PAD.B)) this._padDown.add('cancel');
    if (btn(PAD.START) || btn(PAD.BACK)) this._padDown.add('pause');
    if (btn(PAD.A)) this._padDown.add('confirm');
    if (btn(PAD.LEFT) || this._padVecX < -0.55) this._padDown.add('left');
    if (btn(PAD.RIGHT) || this._padVecX > 0.55) this._padDown.add('right');
    if (btn(PAD.UP) || this._padVecY > 0.55) this._padDown.add('up');
    if (btn(PAD.DOWN) || this._padVecY < -0.55) this._padDown.add('down');

    for (const a of this._padDown) {
      if (!this._prevPad.has(a)) {
        this.pressed.add(a);
        this.lastDevice = 'gamepad';
        this.dispatchEvent(new CustomEvent('press', { detail: a }));
      }
    }
  }

  /** Rumble, when the pad supports it. Silently no-ops otherwise. */
  rumble(strong = 0.5, weak = 0.3, ms = 120) {
    const pads = navigator.getGamepads?.();
    if (!pads) return;
    for (const p of pads) {
      p?.vibrationActuator?.playEffect?.('dual-rumble', {
        startDelay: 0, duration: ms, strongMagnitude: strong, weakMagnitude: weak,
      }).catch(() => {});
    }
  }
}
