import { Lifetime } from '../core/Lifetime.js';
/**
 * Procedural audio.
 *
 * Every sound in the game is synthesised at runtime — there are no audio
 * files. Sound effects are one-shot node graphs; the music is a lookahead
 * scheduler driving a small synth with layers that fade in and out with
 * combat intensity.
 *
 * Signal flow:
 *   sources -> [sfxBus | musicBus] -> compressor -> master -> destination
 *                     \-> reverbSend -> convolver -> compressor
 */

import { settings } from '../core/Settings.js';
import { clamp, clamp01, rand } from '../core/Utils.js';

/** A minor scale gives the whole thing its "besieged fortress" colour. */
const SCALE = [0, 2, 3, 5, 7, 8, 10];
const ROOT = 55; // A1

const noteHz = (semi) => 440 * Math.pow(2, (semi - 69) / 12);

export class Audio {
  constructor() {
    this._lifetime = new Lifetime();
    this.ready = false;
    this.ctx = null;
    this.enabled = true;
    this._musicOn = false;
    this._intensity = 0;
    this._targetIntensity = 0;
    this._engineNodes = null;
    this._lastSfx = new Map();
  }

  /**
   * Must be called from a user gesture. Safe to call repeatedly.
   */
  async init() {
    if (this._lifetime.closed) this._lifetime = new Lifetime();
    if (this.ctx) {
      // Never await resume(): outside a user gesture the promise can stay
      // pending forever, and nothing should block on audio coming back.
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) { this.enabled = false; return; }

    const ctx = new Ctor({ latencyHint: 'interactive' });
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 8;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.22;

    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();

    // A gentle low-pass on the whole mix, swept when the game is paused.
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.muffle.Q.value = 0.2;

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(2.4, 2.6);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.24;

    this.sfxBus.connect(this.comp);
    this.musicBus.connect(this.comp);
    this.sfxBus.connect(this.reverbGain);
    this.musicBus.connect(this.reverbGain);
    this.reverbGain.connect(this.reverb);
    this.reverb.connect(this.comp);
    this.comp.connect(this.muffle);
    this.muffle.connect(this.master);
    this.master.connect(ctx.destination);

    this.noise = this._noiseBuffer(2);

    this._applyVolumes();
    this._lifetime.listen(settings, 'change', () => this._applyVolumes());

    this.ready = true;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    this._startScheduler();
  }

  dispose() {
    this.stopMusic(); this.stopEngine();
    this._lifetime.dispose();
    clearInterval(this._schedTimer);
    this.ready = false;
    if (this.ctx) {
      for (const key of ['master', 'comp', 'sfxBus', 'musicBus', 'muffle', 'reverb', 'reverbGain']) {
        this[key]?.disconnect(); this[key] = null;
      }
      this.ctx.close().catch(() => {});
    }
    this.ctx = this.noise = null;
    this._lastSfx.clear();
  }

  _applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(settings.get('master'), t, 0.05);
    this.sfxBus.gain.setTargetAtTime(settings.get('sfx') * 0.9, t, 0.05);
    this.musicBus.gain.setTargetAtTime(settings.get('music') * (this._paused ? 0.22 : 0.55), t, 0.05);
  }

  /* ------------------------------------------------------------------ */
  /* Buffers                                                             */
  /* ------------------------------------------------------------------ */

  _noiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Exponentially-decaying noise, stereo-decorrelated — a decent hall. */
  _impulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // a short pre-delay keeps the early reflections from smearing transients
        const gate = i < rate * 0.012 ? 0 : 1;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * gate;
      }
    }
    return buf;
  }

  /* ------------------------------------------------------------------ */
  /* Primitives                                                          */
  /* ------------------------------------------------------------------ */

  _now() {
    return this.ctx.currentTime;
  }

  /** Throttle a sound so rapid-fire events don't stack into mush. */
  _throttled(key, minGap) {
    const now = this._now();
    const last = this._lastSfx.get(key) ?? -1;
    if (now - last < minGap) return false;
    this._lastSfx.set(key, now);
    return true;
  }

  _env(gain, t0, attack, decay, peak = 1, sustain = 0, hold = 0) {
    gain.gain.cancelScheduledValues(t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + attack);
    if (hold > 0) gain.gain.setValueAtTime(Math.max(peak, 0.0002), t0 + attack + hold);
    gain.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t0 + attack + hold + decay);
  }

  _osc(type, freq, t0, dur, gainNode, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (detune) o.detune.setValueAtTime(detune, t0);
    o.connect(gainNode);
    o.start(t0);
    o.stop(t0 + dur);
    return o;
  }

  _noiseSrc(t0, dur, dest, playbackRate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.playbackRate.value = playbackRate;
    s.connect(dest);
    s.start(t0, Math.random() * 1.5);
    s.stop(t0 + dur);
    return s;
  }

  /** 3D-ish panning from world X relative to the player. */
  _pan(x = 0) {
    const p = this.ctx.createStereoPanner();
    p.pan.value = clamp(x, -1, 1);
    return p;
  }

  /* ------------------------------------------------------------------ */
  /* Sound effects                                                       */
  /* ------------------------------------------------------------------ */

  /** Player pulse laser: bright, short, downward chirp. */
  laser(pan = 0, pitch = 1) {
    if (!this.ready || !this._throttled('laser', 0.035)) return;
    const t = this._now();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(2600 * pitch, t);
    f.frequency.exponentialRampToValueAtTime(700 * pitch, t + 0.11);
    f.Q.value = 2.5;
    const p = this._pan(pan);
    g.connect(f); f.connect(p); p.connect(this.sfxBus);

    this._env(g, t, 0.002, 0.11, 0.34);

    const o1 = this._osc('sawtooth', 1500 * pitch, t, 0.13, g);
    o1.frequency.exponentialRampToValueAtTime(360 * pitch, t + 0.12);
    const o2 = this._osc('square', 2260 * pitch, t, 0.09, g, 12);
    o2.frequency.exponentialRampToValueAtTime(600 * pitch, t + 0.09);
  }

  /** Charged / heavy shot. */
  heavyShot(pan = 0) {
    if (!this.ready) return;
    const t = this._now();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2400, t);
    f.frequency.exponentialRampToValueAtTime(320, t + 0.3);
    const p = this._pan(pan);
    g.connect(f); f.connect(p); p.connect(this.sfxBus);
    this._env(g, t, 0.004, 0.32, 0.5);
    const o = this._osc('sawtooth', 320, t, 0.34, g);
    o.frequency.exponentialRampToValueAtTime(64, t + 0.3);
    const n = this.ctx.createGain();
    n.connect(f);
    this._env(n, t, 0.002, 0.14, 0.22);
    this._noiseSrc(t, 0.16, n, 0.7);
  }

  /**
   * Explosion. `size` 0.3..3 scales pitch, length and low-end weight.
   */
  explosion(size = 1, pan = 0) {
    if (!this.ready || !this._throttled(`boom${Math.round(size)}`, 0.045)) return;
    const t = this._now();
    const dur = 0.55 + size * 0.55;

    const p = this._pan(pan);
    p.connect(this.sfxBus);

    // body: filtered noise sweeping down
    const ng = this.ctx.createGain();
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'lowpass';
    nf.frequency.setValueAtTime(3200 / Math.sqrt(size), t);
    nf.frequency.exponentialRampToValueAtTime(120, t + dur * 0.8);
    nf.Q.value = 1.1;
    ng.connect(nf); nf.connect(p);
    this._env(ng, t, 0.005, dur, 0.62 * Math.min(1.4, size));
    this._noiseSrc(t, dur, ng, 0.55 + 0.5 / size);

    // sub thump
    const sg = this.ctx.createGain();
    sg.connect(p);
    this._env(sg, t, 0.008, dur * 0.7, 0.85 * Math.min(1.5, size));
    const so = this._osc('sine', 130 / size, t, dur * 0.75, sg);
    so.frequency.exponentialRampToValueAtTime(26 / size, t + dur * 0.6);

    // crackle tail
    const cg = this.ctx.createGain();
    const cf = this.ctx.createBiquadFilter();
    cf.type = 'highpass';
    cf.frequency.value = 1800;
    cg.connect(cf); cf.connect(p);
    this._env(cg, t + 0.02, 0.02, dur * 1.1, 0.16 * size);
    this._noiseSrc(t + 0.02, dur * 1.1, cg, 1.6);
  }

  /** Bullet striking armour. */
  impact(pan = 0) {
    if (!this.ready || !this._throttled('impact', 0.03)) return;
    const t = this._now();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2400;
    f.Q.value = 1.4;
    const p = this._pan(pan);
    g.connect(f); f.connect(p); p.connect(this.sfxBus);
    this._env(g, t, 0.001, 0.09, 0.3);
    this._noiseSrc(t, 0.1, g, 1.8);
    const o = this._osc('triangle', 620, t, 0.07, g);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.07);
  }

  /** Shield absorbed damage — metallic ring. */
  shield(pan = 0) {
    if (!this.ready) return;
    const t = this._now();
    const g = this.ctx.createGain();
    const p = this._pan(pan);
    g.connect(p); p.connect(this.sfxBus);
    this._env(g, t, 0.003, 0.5, 0.34);
    for (const [mult, det] of [[1, 0], [1.5, 8], [2.41, -6], [3.2, 14]]) {
      this._osc('sine', 640 * mult, t, 0.52, g, det);
    }
  }

  /** Player took hull damage. */
  hurt() {
    if (!this.ready) return;
    const t = this._now();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1400, t);
    f.frequency.exponentialRampToValueAtTime(220, t + 0.4);
    g.connect(f); f.connect(this.sfxBus);
    this._env(g, t, 0.004, 0.42, 0.62);
    const o = this._osc('sawtooth', 190, t, 0.44, g);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.4);
    this._noiseSrc(t, 0.2, g, 0.5);
  }

  /** Pickup / fuel collected — bright rising arpeggio. */
  pickup(step = 0) {
    if (!this.ready) return;
    const t = this._now();
    const g = this.ctx.createGain();
    g.connect(this.sfxBus);
    this._env(g, t, 0.005, 0.34, 0.26);
    const base = 72 + (step % 5) * 2;
    [0, 4, 7, 12].forEach((s, i) => {
      const o = this._osc('triangle', noteHz(base + s), t + i * 0.035, 0.2, g);
      o.detune.value = 4;
    });
  }

  /** Score chain tick — pitch climbs with the multiplier. */
  chain(mult = 1) {
    if (!this.ready || !this._throttled('chain', 0.04)) return;
    const t = this._now();
    const g = this.ctx.createGain();
    g.connect(this.sfxBus);
    this._env(g, t, 0.002, 0.14, 0.15);
    this._osc('square', noteHz(76 + Math.min(mult, 8) * 2), t, 0.15, g);
  }

  /** Warning klaxon. */
  alarm() {
    if (!this.ready || !this._throttled('alarm', 0.9)) return;
    const t = this._now();
    const g = this.ctx.createGain();
    g.connect(this.sfxBus);
    this._env(g, t, 0.02, 0.6, 0.26, 0.0001, 0.1);
    const o = this._osc('sawtooth', 440, t, 0.75, g);
    o.frequency.setValueAtTime(440, t);
    o.frequency.linearRampToValueAtTime(300, t + 0.35);
    o.frequency.linearRampToValueAtTime(440, t + 0.7);
  }

  /** Enemy fire. Duller and lower than the player's, so it reads as "theirs". */
  enemyShot(pan = 0) {
    if (!this.ready || !this._throttled('eshot', 0.05)) return;
    const t = this._now();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1400;
    const p = this._pan(pan);
    g.connect(f); f.connect(p); p.connect(this.sfxBus);
    this._env(g, t, 0.003, 0.16, 0.17);
    const o = this._osc('square', 380, t, 0.18, g);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.16);
  }

  /** Missile launch whoosh. */
  missile(pan = 0) {
    if (!this.ready) return;
    const t = this._now();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.45);
    f.Q.value = 1.6;
    const p = this._pan(pan);
    g.connect(f); f.connect(p); p.connect(this.sfxBus);
    this._env(g, t, 0.05, 0.5, 0.3);
    this._noiseSrc(t, 0.55, g, 1.1);
  }

  /** UI blip. */
  ui(kind = 'move') {
    if (!this.ready) return;
    const t = this._now();
    const g = this.ctx.createGain();
    g.connect(this.sfxBus);
    if (kind === 'move') {
      this._env(g, t, 0.001, 0.07, 0.14);
      this._osc('square', 880, t, 0.08, g);
    } else if (kind === 'confirm') {
      this._env(g, t, 0.002, 0.22, 0.2);
      this._osc('triangle', 660, t, 0.1, g);
      this._osc('triangle', 990, t + 0.06, 0.16, g);
    } else {
      this._env(g, t, 0.002, 0.16, 0.16);
      const o = this._osc('sawtooth', 330, t, 0.18, g);
      o.frequency.exponentialRampToValueAtTime(120, t + 0.16);
    }
  }

  /** Sector transition sting. */
  sting(up = true) {
    if (!this.ready) return;
    const t = this._now();
    const g = this.ctx.createGain();
    g.connect(this.sfxBus);
    this._env(g, t, 0.01, 1.1, 0.3);
    const notes = up ? [0, 7, 12, 19] : [19, 12, 7, 0];
    notes.forEach((s, i) => {
      this._osc('sawtooth', noteHz(ROOT + 24 + s), t + i * 0.09, 0.9 - i * 0.1, g, i * 3);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Engine drone                                                        */
  /* ------------------------------------------------------------------ */

  startEngine() {
    if (!this.ready || this._engineNodes) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.sfxBus);

    // low rumble
    const lf = ctx.createBiquadFilter();
    lf.type = 'lowpass';
    lf.frequency.value = 320;
    lf.Q.value = 3;
    const lg = ctx.createGain();
    lg.gain.value = 0.5;
    lf.connect(lg); lg.connect(out);
    const rumble = ctx.createBufferSource();
    rumble.buffer = this.noise;
    rumble.loop = true;
    rumble.playbackRate.value = 0.35;
    rumble.connect(lf);
    rumble.start(t);

    // tonal whine, two detuned saws
    const wg = ctx.createGain();
    wg.gain.value = 0.06;
    const wf = ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 620;
    wf.Q.value = 4;
    wg.connect(wf); wf.connect(out);
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = 92;
    const o2 = ctx.createOscillator();
    o2.type = 'sawtooth';
    o2.frequency.value = 92;
    o2.detune.value = 11;
    o1.connect(wg); o2.connect(wg);
    o1.start(t); o2.start(t);

    this._engineNodes = { out, rumble, o1, o2, wf, lf, wg, lg };
    out.gain.setTargetAtTime(0.16, t, 0.4);
  }

  /** @param {number} throttle 0..1 @param {number} boost 0..1 */
  setEngine(throttle, boost) {
    const n = this._engineNodes;
    if (!n) return;
    const t = this.ctx.currentTime;
    const rate = 0.3 + throttle * 0.25 + boost * 0.5;
    n.rumble.playbackRate.setTargetAtTime(rate, t, 0.12);
    n.o1.frequency.setTargetAtTime(86 + throttle * 26 + boost * 70, t, 0.12);
    n.o2.frequency.setTargetAtTime(86 + throttle * 26 + boost * 70, t, 0.12);
    n.wf.frequency.setTargetAtTime(560 + boost * 1400, t, 0.15);
    n.lf.frequency.setTargetAtTime(280 + boost * 420, t, 0.15);
    n.out.gain.setTargetAtTime(0.13 + boost * 0.16, t, 0.15);
  }

  stopEngine() {
    const n = this._engineNodes;
    if (!n) return;
    const t = this.ctx.currentTime;
    n.out.gain.setTargetAtTime(0.0001, t, 0.15);
    this._lifetime.delay(600).then(() => {
      for (const node of Object.values(n)) {
        try { node.stop?.(); } catch { /* already stopped */ }
        node.disconnect();
      }
    });
    this._engineNodes = null;
  }

  /* ------------------------------------------------------------------ */
  /* Music                                                               */
  /* ------------------------------------------------------------------ */

  /**
   * Lookahead scheduler. Web Audio needs notes queued ahead of time; a
   * setInterval tick that schedules the next 120 ms is the standard pattern.
   */
  _startScheduler() {
    this._step = 0;
    this._nextNoteTime = this.ctx.currentTime + 0.1;
    this._bpm = 132;
    clearInterval(this._schedTimer);
    this._schedTimer = setInterval(() => this._schedule(), 25);
  }

  startMusic(mood = 'combat') {
    this._musicOn = true;
    this._mood = mood;
    this._step = 0;
    if (this.ctx) this._nextNoteTime = this.ctx.currentTime + 0.08;
  }

  stopMusic() {
    this._musicOn = false;
  }

  /** 0 = calm, 1 = everything on fire. Drives which layers play. */
  setIntensity(v) {
    this._targetIntensity = clamp01(v);
  }

  _schedule() {
    if (!this.ready || !this._musicOn) return;
    const spb = 60 / this._bpm;
    const sixteenth = spb / 4;
    // A suspended/background tab must not replay minutes of missed notes.
    const now = this.ctx.currentTime;
    if (this._nextNoteTime < now - sixteenth) {
      const skipped = Math.ceil((now + 0.02 - this._nextNoteTime) / sixteenth);
      this._step += skipped;
      this._nextNoteTime += skipped * sixteenth;
    }
    const lookahead = now + 0.12;

    this._intensity += (this._targetIntensity - this._intensity) * 0.05;

    while (this._nextNoteTime < lookahead) {
      this._playStep(this._step, this._nextNoteTime);
      this._nextNoteTime += sixteenth;
      this._step++;
    }
  }

  _playStep(step, t) {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const I = this._intensity;
    const boss = this._mood === 'boss';
    const menu = this._mood === 'menu';

    /* --- chord progression ------------------------------------------ */
    const prog = boss ? [0, 0, -2, -3] : [0, 5, 3, -2];
    const rootOffset = prog[bar % prog.length];

    /* --- drums -------------------------------------------------------- */
    if (!menu) {
      if (s % 4 === 0) this._kick(t, 0.55 + I * 0.25);
      if (s === 4 || s === 12) this._snare(t, 0.3 + I * 0.25);
      if (I > 0.25 && s % 2 === 1) this._hat(t, 0.1 + I * 0.12);
      if (I > 0.7 && (s === 14 || s === 7)) this._kick(t, 0.32);
    }

    /* --- bass --------------------------------------------------------- */
    if (!menu && (s % 2 === 0 || (I > 0.5 && s % 4 === 3))) {
      const pat = [0, 0, 7, 0, 3, 0, 5, 7];
      const semi = ROOT + rootOffset + SCALE[pat[(s / 2 | 0) % 8] % 7] + (pat[(s / 2 | 0) % 8] >= 7 ? 12 : 0);
      this._bass(t, noteHz(semi), 0.16 + I * 0.1, boss);
    }

    /* --- arpeggio ----------------------------------------------------- */
    if (I > 0.35 || menu) {
      const arp = [0, 3, 7, 10, 12, 10, 7, 3];
      const semi = ROOT + 24 + rootOffset + arp[s % 8];
      this._arp(t, noteHz(semi), (menu ? 0.10 : 0.055 + I * 0.07));
    }

    /* --- pad ---------------------------------------------------------- */
    if (s === 0) {
      const semis = [0, 3, 7].map((x) => ROOT + 12 + rootOffset + x);
      this._pad(t, semis, (menu ? 0.10 : 0.05 + I * 0.06), (60 / this._bpm) * 4);
    }

    /* --- lead stab ---------------------------------------------------- */
    if (I > 0.8 && (s === 6 || s === 10) && bar % 2 === 1) {
      const semi = ROOT + 36 + rootOffset + SCALE[(bar + s) % 7];
      this._lead(t, noteHz(semi), 0.09);
    }
  }

  _kick(t, gain) {
    const g = this.ctx.createGain();
    g.connect(this.musicBus);
    this._env(g, t, 0.002, 0.26, gain);
    const o = this._osc('sine', 150, t, 0.28, g);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.09);
    const cg = this.ctx.createGain();
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 1200;
    cg.connect(hp); hp.connect(this.musicBus);
    this._env(cg, t, 0.001, 0.02, gain * 0.35);
    this._noiseSrc(t, 0.03, cg, 1.4);
  }

  _snare(t, gain) {
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1900;
    f.Q.value = 0.9;
    g.connect(f); f.connect(this.musicBus);
    this._env(g, t, 0.001, 0.17, gain);
    this._noiseSrc(t, 0.18, g, 1.2);
    const tg = this.ctx.createGain();
    tg.connect(this.musicBus);
    this._env(tg, t, 0.001, 0.1, gain * 0.4);
    this._osc('triangle', 220, t, 0.1, tg);
  }

  _hat(t, gain) {
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7200;
    g.connect(f); f.connect(this.musicBus);
    this._env(g, t, 0.001, 0.045, gain);
    this._noiseSrc(t, 0.05, g, 2.4);
  }

  _bass(t, hz, gain, gritty) {
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(gritty ? 1400 : 700, t);
    f.frequency.exponentialRampToValueAtTime(180, t + 0.2);
    f.Q.value = 6;
    g.connect(f); f.connect(this.musicBus);
    this._env(g, t, 0.006, 0.2, gain, 0.0001, 0.02);
    this._osc(gritty ? 'sawtooth' : 'square', hz, t, 0.24, g);
    this._osc('sine', hz / 2, t, 0.24, g);
  }

  _arp(t, hz, gain) {
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = hz * 2.2;
    f.Q.value = 3;
    g.connect(f); f.connect(this.musicBus);
    this._env(g, t, 0.003, 0.13, gain);
    this._osc('square', hz, t, 0.14, g, 6);
    this._osc('square', hz, t, 0.14, g, -6);
  }

  _pad(t, semis, gain, dur) {
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1100;
    g.connect(f); f.connect(this.musicBus);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const s of semis) {
      this._osc('sawtooth', noteHz(s), t, dur, g, -7);
      this._osc('sawtooth', noteHz(s), t, dur, g, 7);
    }
  }

  _lead(t, hz, gain) {
    const g = this.ctx.createGain();
    g.connect(this.musicBus);
    this._env(g, t, 0.004, 0.3, gain);
    const o = this._osc('sawtooth', hz, t, 0.32, g);
    o.frequency.setValueAtTime(hz, t);
    o.frequency.linearRampToValueAtTime(hz * 1.01, t + 0.3);
  }

  /* ------------------------------------------------------------------ */

  /** Muffle the mix behind a pause menu. */
  setPaused(paused) {
    this._paused = paused;
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.muffle.frequency.setTargetAtTime(paused ? 420 : 20000, t, 0.08);
    this.musicBus.gain.setTargetAtTime(
      settings.get('music') * (paused ? 0.22 : 0.55), t, 0.1,
    );
  }

  /** Where a world-space X sits in the stereo field. */
  panFor(worldX, playerX = 0) {
    return clamp((playerX - worldX) / 26, -0.85, 0.85);
  }
}

export const audio = new Audio();
