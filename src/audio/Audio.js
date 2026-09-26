import { Lifetime } from '../core/Lifetime.js';
/**
 * Procedural audio.
 *
 * Every sound in the game is synthesised at runtime — there are no audio
 * files. Sound effects are one-shot node graphs; the music is a lookahead
 * scheduler playing a per-sector song table in 16-bar phrases, with layers
 * that fade in and out with combat intensity.
 *
 * Signal flow:
 *   sfx voices  -> [pan -> distance lowpass/gain] -> sfxBus ----------\
 *   music voices -> musicBus -> duck -> musicComp ---------------------> comp -> limiter -> muffle -> master
 *   sfxBus/musicBus -> reverb sends -> convolver (per environment) ---/
 *
 * The duck gain dips the music under explosions and hits so impacts cut
 * through instead of pumping the whole mix through one compressor.
 */

import { settings } from '../core/Settings.js';
import { clamp, clamp01, rand, Rng } from '../core/Utils.js';

const SCALES = {
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  phrygianDom: [0, 1, 4, 5, 7, 8, 10],
};

/**
 * One song per sector. `root` is the MIDI tonic in the bass octave, `prog`
 * the per-bar root offsets for the A section and `progB` for the B section.
 * Drum kits: four (driving), march (military rolls), half (open space),
 * breaks (syncopated), toms (reactor), riff (boss ostinato).
 */
const SONGS = {
  menu: { bpm: 96, root: 45, scale: 'dorian', prog: [0, -4, -2, -5], progB: [0, -4, -7, -5], kit: 'none', bass: 'pulse', arp: [0, 2, 4, 6, 7, 6, 4, 2], pad: 0.12, lead: 0.05 },
  // `hook` is a hand-written 2-bar lead (8th notes, scale degrees, null rests);
  // songs without one improvise a seeded motif.
  s0: { bpm: 126, root: 45, scale: 'aeolian', prog: [0, 5, 3, -2], progB: [0, -4, 3, -2], kit: 'four', bass: 'eighths', arp: [0, 2, 4, 6, 7, 6, 4, 2], pad: 0.06, lead: 0.07,
    hook: [0, null, 4, null, 7, 6, 4, null, 5, 4, 2, null, 4, null, null, null] },
  s1: { bpm: 132, root: 43, scale: 'aeolian', prog: [0, 0, -2, -4], progB: [3, 1, 0, -2], kit: 'march', bass: 'gallop', arp: [0, 4, 7, 4, 2, 4, 7, 9], pad: 0.05, lead: 0.08 },
  s2: { bpm: 128, root: 50, scale: 'dorian', prog: [0, -2, -4, -2], progB: [0, 3, -4, -2], kit: 'half', bass: 'pulse', arp: [0, 4, 7, 11, 14, 11, 7, 4], pad: 0.1, lead: 0.06 },
  s3: { bpm: 136, root: 40, scale: 'phrygian', prog: [0, 1, 0, -2], progB: [0, 1, 3, 1], kit: 'toms', bass: 'gallop', arp: [0, 1, 4, 1, 7, 4, 1, 0], pad: 0.06, lead: 0.08,
    hook: [0, 1, 0, null, 4, null, 3, 1, 0, null, 1, null, 5, 4, 3, null] },
  s4: { bpm: 140, root: 48, scale: 'dorian', prog: [0, -4, -2, 3], progB: [0, -4, 5, 3], kit: 'breaks', bass: 'eighths', arp: [0, 2, 4, 7, 9, 7, 4, 2], pad: 0.08, lead: 0.08 },
  s5: { bpm: 138, root: 42, scale: 'harmonic', prog: [0, -4, -3, -5], progB: [0, 1, -3, -5], kit: 'four', bass: 'gallop', arp: [0, 2, 4, 6, 7, 6, 4, 2], pad: 0.06, lead: 0.09 },
  s6: { bpm: 146, root: 41, scale: 'phrygian', prog: [0, 1, -2, -1], progB: [0, 1, 3, 1], kit: 'breaks', bass: 'eighths', arp: [0, 1, 4, 7, 8, 7, 4, 1], pad: 0.05, lead: 0.09,
    hook: [7, null, 6, 7, null, 4, null, 1, 0, 1, 3, null, 1, null, 0, null] },
  boss: { bpm: 152, root: 40, scale: 'phrygianDom', prog: [0, 0, -2, -3], progB: [0, 1, 0, -3], kit: 'riff', bass: 'riff', arp: [0, 1, 4, 5, 7, 5, 4, 1], pad: 0.05, lead: 0.1,
    hook: [0, 0, 1, null, 0, null, 4, null, 5, 4, 1, null, 0, null, null, null] },
};

/** 16th-note bass patterns: scale degrees, null for rest, +7 is an octave. */
const BASS = {
  pulse: [0, null, null, null, 0, null, null, null, 0, null, null, null, 4, null, null, null],
  eighths: [0, null, 0, null, 0, null, 4, null, 0, null, 0, null, 2, null, 4, null],
  gallop: [0, null, 0, 0, 0, null, 0, 0, 0, null, 0, 0, 4, null, 2, 2],
  riff: [0, null, 1, 0, null, 0, 7, null, 0, null, 1, 0, null, 3, 1, null],
};

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
    this._ambience = null;
    this._lastSfx = new Map();
    this._song = SONGS.menu;
    this._songKey = 'menu';
    this._pendingSong = null;
    this._bpm = SONGS.menu.bpm;
    this._motif = motif('menu', SONGS.menu);
  }

  /**
   * Must be called from a user gesture. Safe to call repeatedly.
   * `offline` renders into an OfflineAudioContext instead (tools and
   * auditions): no scheduler timer runs and callers place events with `at()`.
   */
  async init(offline = null) {
    if (this._lifetime.closed) this._lifetime = new Lifetime();
    if (this.ctx) {
      // Never await resume(): outside a user gesture the promise can stay
      // pending forever, and nothing should block on audio coming back.
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor && !offline) { this.enabled = false; return; }

    const ctx = offline ?? new Ctor({ latencyHint: 'interactive' });
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -12;
    this.comp.knee.value = 18;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.2;

    // A brick-wall compressor catches peaks, then a unity-gain tanh rounds
    // off anything that still gets through: it never hard-clips.
    this.brickwall = ctx.createDynamicsCompressor();
    this.brickwall.threshold.value = -3;
    this.brickwall.ratio.value = 20;
    this.brickwall.knee.value = 0;
    this.brickwall.attack.value = 0.001;
    this.brickwall.release.value = 0.1;
    this.limiter = ctx.createWaveShaper();
    this.limiter.curve = softClipCurve();
    this.limiter.oversample = '2x';

    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.duck = ctx.createGain();
    // Big impacts also carve the music's low end, where the riff lives.
    this.musicShelf = ctx.createBiquadFilter();
    this.musicShelf.type = 'lowshelf';
    this.musicShelf.frequency.value = 180;
    this.musicShelf.gain.value = 0;
    // Cues (lock tick, bonuses, pips) get a pocket in the 1-3 kHz band.
    this.musicPocket = ctx.createBiquadFilter();
    this.musicPocket.type = 'peaking';
    this.musicPocket.frequency.value = 1900;
    this.musicPocket.Q.value = 0.9;
    this.musicPocket.gain.value = 0;
    this.musicComp = ctx.createDynamicsCompressor();
    this.musicComp.threshold.value = -18;
    this.musicComp.ratio.value = 3;
    this.musicComp.attack.value = 0.01;
    this.musicComp.release.value = 0.25;

    // A gentle low-pass on the whole mix, swept when the game is paused.
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.muffle.Q.value = 0.2;

    this.noise = this._noiseBuffer(2, 'white');
    this.pink = this._noiseBuffer(2, 'pink');
    this.brown = this._noiseBuffer(2, 'brown');

    // One room per environment; swapped with a short dip on sector entry. The
    // campaign opens in the fortress, so the two long tails are built shortly
    // after start-up rather than on the first key press.
    this._rooms = { fortress: this._impulse(1.3, 3.2, 0) };
    if (offline) this._buildRooms();
    else this._lifetime.delay(1500).then((ok) => { if (ok) this._buildRooms(); });
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._rooms.fortress;
    this._room = 'fortress';
    this.reverbIn = ctx.createGain();
    this.sfxSend = ctx.createGain();
    this.sfxSend.gain.value = 0.26;
    this.musicSend = ctx.createGain();
    this.musicSend.gain.value = 0.1;

    this.sfxBus.connect(this.comp);
    this.musicBus.connect(this.duck);
    this.duck.connect(this.musicShelf);
    this.musicShelf.connect(this.musicPocket);
    this.musicPocket.connect(this.musicComp);
    this.musicComp.connect(this.comp);
    this.sfxBus.connect(this.sfxSend);
    this.musicBus.connect(this.musicSend);
    this.sfxSend.connect(this.reverbIn);
    this.musicSend.connect(this.reverbIn);
    this.reverbIn.connect(this.reverb);
    this.reverb.connect(this.comp);
    this.comp.connect(this.brickwall);
    this.brickwall.connect(this.limiter);
    this.limiter.connect(this.muffle);
    this.muffle.connect(this.master);
    this.master.connect(ctx.destination);

    this._applyVolumes();
    this._lifetime.listen(settings, 'change', () => this._applyVolumes());

    this.ready = true;
    if (offline) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    this._startScheduler();
  }

  /** Offline rendering: subsequent effects start at `seconds` instead of now. */
  at(seconds) {
    this._clock = seconds;
    return this;
  }

  dispose() {
    this.stopMusic(); this.stopEngine();
    this._lifetime.dispose();
    clearInterval(this._schedTimer);
    this.ready = false;
    if (this.ctx) {
      for (const key of ['master', 'comp', 'brickwall', 'limiter', 'sfxBus', 'musicBus', 'duck', 'musicShelf', 'musicPocket',
        'musicComp', 'muffle', 'reverb', 'reverbIn', 'sfxSend', 'musicSend']) {
        this[key]?.disconnect(); this[key] = null;
      }
      this.ctx.close().catch(() => {});
    }
    this.ctx = this.noise = this.pink = this.brown = this._rooms = null;
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

  /** White, pink (Voss-McCartney approximation) or brown (integrated) noise. */
  _noiseBuffer(seconds, color = 'white') {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (color === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else if (color === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  /**
   * Exponentially-decaying noise, stereo-decorrelated. `dark` low-passes the
   * tail so large spaces bloom without hiss.
   */
  _impulse(seconds, decay, dark = 0) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    // a short pre-delay keeps the early reflections from smearing transients
    const pre = Math.floor(rate * 0.012);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      // The envelope and the tail darkening move slowly: evaluate them once
      // per 128-sample block instead of calling pow() for every sample.
      for (let i0 = pre; i0 < len; i0 += 128) {
        const t = i0 / len;
        const env = Math.pow(1 - t, decay);
        const k = 1 - dark * Math.min(1, t * 2.5);
        const end = Math.min(len, i0 + 128);
        for (let i = i0; i < end; i++) {
          lp += (Math.random() * 2 - 1 - lp) * k;
          d[i] = lp * env;
        }
      }
    }
    return buf;
  }

  /** The long space and arena tails; applies a room that was asked for early. */
  _buildRooms() {
    if (!this.ctx || this._rooms?.space) return;
    this._rooms.space = this._impulse(3.6, 2.2, 0.55);
    this._rooms.arena = this._impulse(2.4, 2.6, 0.2);
    if (this._bedKind && this._bedKind !== this._room) this.setEnvironment(this._bedKind, this._bedFlavor);
  }

  /* ------------------------------------------------------------------ */
  /* Primitives                                                          */
  /* ------------------------------------------------------------------ */

  _now() {
    return this._clock ?? this.ctx.currentTime;
  }

  /** Throttle a sound so rapid-fire events don't stack into mush. */
  _throttled(key, minGap) {
    const now = this._now();
    const last = this._lastSfx.get(key) ?? -1;
    if (now - last < minGap) return false;
    this._lastSfx.set(key, now);
    return true;
  }

  /** Small random detune so repeated effects never sound machine-gunned. */
  _vary(amount = 0.04) {
    return 1 + (rand.next() * 2 - 1) * amount;
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

  _noiseSrc(t0, dur, dest, playbackRate = 1, buffer = this.noise) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
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

  /**
   * An effect voice positioned in the world: stereo pan, then a distance
   * model (quieter and duller the further ahead the source is). Returns the
   * gain node the effect should drive.
   */
  _voice(pan = 0, dist = 0, bus = this.sfxBus) {
    const g = this.ctx.createGain();
    let tail = g;
    const d = Math.max(0, dist);
    if (d > 6) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 12000 - Math.min(1, d / 120) * 9500;
      const dg = this.ctx.createGain();
      dg.gain.value = 1 / (1 + d / 40);
      g.connect(f); f.connect(dg); tail = dg;
    }
    const p = this._pan(pan);
    tail.connect(p); p.connect(bus);
    return g;
  }

  /**
   * Pull the music down under an impact, then let it breathe back. Heavy
   * impacts also cut the music's low end so their thump owns the sub band.
   */
  duckMusic(amount = 0.5, release = 0.35, low = false) {
    if (!this.ready) return;
    const t = this._now();
    this.duck.gain.cancelScheduledValues(t);
    this.duck.gain.setTargetAtTime(Math.max(0.1, 1 - amount), t, 0.012);
    this.duck.gain.setTargetAtTime(1, t + 0.06, release);
    if (low) {
      this.musicShelf.gain.cancelScheduledValues(t);
      this.musicShelf.gain.setTargetAtTime(-9, t, 0.01);
      this.musicShelf.gain.setTargetAtTime(0, t + 0.1, release * 1.4);
    }
  }

  /** Open a short pocket in the music's cue band under a gameplay cue. */
  _cuePocket() {
    const t = this._now();
    this.musicPocket.gain.cancelScheduledValues(t);
    this.musicPocket.gain.setTargetAtTime(-6, t, 0.005);
    this.musicPocket.gain.setTargetAtTime(0, t + 0.08, 0.12);
  }

  /**
   * Swap the reverb room (fortress, space or arena) and the ambient bed.
   * `flavor` 'ember' adds the reactor hum and steam hiss to a fortress.
   */
  setEnvironment(kind, flavor = null) {
    this._bedKind = kind;
    this._bedFlavor = flavor;
    this._applyBed();
    if (!this.ready || !this._rooms?.[kind] || this._room === kind) return;
    this._room = kind;
    const t = this._now();
    // dip the send, swap the impulse inside the dip, restore
    this.reverbIn.gain.setTargetAtTime(0, t, 0.03);
    this._lifetime.delay(140).then(() => {
      if (!this.ready) return;
      this.reverb.buffer = this._rooms[kind];
      this.reverbIn.gain.setTargetAtTime(1, this._now(), 0.2);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Weapons and impacts                                                 */
  /* ------------------------------------------------------------------ */

  /** Player pulse laser: bright, short, downward chirp; pans with the firing pod. */
  laser(pan = 0, pitch = 1) {
    if (!this.ready || !this._throttled('laser', 0.035)) return;
    const t = this._now();
    pitch *= this._vary(0.03);
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(2600 * pitch, t);
    f.frequency.exponentialRampToValueAtTime(700 * pitch, t + 0.11);
    f.Q.value = 2.5;
    const p = this._pan(pan);
    g.connect(f); f.connect(p); p.connect(this.sfxBus);

    this._env(g, t, 0.002, 0.11, 0.3);

    const o1 = this._osc('sawtooth', 1500 * pitch, t, 0.13, g);
    o1.frequency.exponentialRampToValueAtTime(360 * pitch, t + 0.12);
    const o2 = this._osc('square', 2260 * pitch, t, 0.09, g, 12);
    o2.frequency.exponentialRampToValueAtTime(600 * pitch, t + 0.09);
    // a sub click gives the bolt a body without adding brightness
    const k = this.ctx.createGain();
    k.connect(p);
    this._env(k, t, 0.001, 0.035, 0.18);
    const ko = this._osc('sine', 180, t, 0.05, k);
    ko.frequency.exponentialRampToValueAtTime(60, t + 0.04);
  }

  /**
   * Explosion. `size` 0.3..3 scales pitch, length and low-end weight; `dist`
   * is metres ahead of the ship. Big blasts duck the music and drive a
   * waveshaper for weight.
   */
  explosion(size = 1, pan = 0, dist = 0) {
    if (!this.ready || !this._throttled(`boom${Math.round(size)}`, 0.045)) return;
    const t = this._now();
    const dur = 0.55 + size * 0.55;
    const v = this._vary(0.06);
    const out = this._voice(pan, dist);
    out.gain.value = 1;
    let bodyOut = out;
    if (size >= 1.5) {
      const drive = this.ctx.createWaveShaper();
      drive.curve = driveCurve();
      drive.connect(out);
      bodyOut = drive;
      this.duckMusic(Math.min(0.7, 0.3 + size * 0.15), 0.5, size >= 2);
    }

    // body: brown noise sweeping down
    const ng = this.ctx.createGain();
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'lowpass';
    nf.frequency.setValueAtTime(3200 / Math.sqrt(size), t);
    nf.frequency.exponentialRampToValueAtTime(110, t + dur * 0.8);
    nf.Q.value = 1.1;
    ng.connect(nf); nf.connect(bodyOut);
    this._env(ng, t, 0.005, dur, 0.7 * Math.min(1.4, size));
    this._noiseSrc(t, dur, ng, (0.6 + 0.4 / size) * v, this.pink);

    // sub thump
    const sg = this.ctx.createGain();
    sg.connect(bodyOut);
    this._env(sg, t, 0.008, dur * 0.7, 0.85 * Math.min(1.5, size));
    const so = this._osc('sine', (130 / size) * v, t, dur * 0.75, sg);
    so.frequency.exponentialRampToValueAtTime(26 / size, t + dur * 0.6);

    // crackle tail
    const cg = this.ctx.createGain();
    const cf = this.ctx.createBiquadFilter();
    cf.type = 'highpass';
    cf.frequency.value = 1800;
    cg.connect(cf); cf.connect(out);
    this._env(cg, t + 0.02, 0.02, dur * 1.1, 0.14 * size);
    this._noiseSrc(t + 0.02, dur * 1.1, cg, 1.6);
  }

  /** Fuel cell ignition: a hollow whoomp with a bubbling tail. */
  fuelBoom(pan = 0, dist = 0) {
    if (!this.ready || !this._throttled('fuel', 0.06)) return;
    const t = this._now();
    const out = this._voice(pan, dist);
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(140, t + 0.5);
    g.connect(f); f.connect(out);
    this._env(g, t, 0.01, 0.55, 0.7);
    const o = this._osc('sine', 95 * this._vary(), t, 0.6, g);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.45);
    this._noiseSrc(t, 0.55, g, 0.5, this.brown);
    // bubbles
    for (let i = 0; i < 4; i++) {
      const b = this.ctx.createGain();
      b.connect(out);
      const tb = t + 0.08 + i * 0.07;
      this._env(b, tb, 0.004, 0.06, 0.08);
      const bo = this._osc('sine', 300 + rand.range(0, 400), tb, 0.08, b);
      bo.frequency.exponentialRampToValueAtTime(900, tb + 0.06);
    }
  }

  /** Bullet striking armour. */
  impact(pan = 0, dist = 0) {
    if (!this.ready || !this._throttled('impact', 0.03)) return;
    const t = this._now();
    const out = this._voice(pan, dist);
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2400 * this._vary(0.1);
    f.Q.value = 1.4;
    g.connect(f); f.connect(out);
    this._env(g, t, 0.001, 0.09, 0.3);
    this._noiseSrc(t, 0.1, g, 1.8);
    const o = this._osc('triangle', 620 * this._vary(0.08), t, 0.07, g);
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
    this.duckMusic(0.35, 0.3);
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
    this._noiseSrc(t, 0.2, g, 0.5, this.pink);
    this.duckMusic(0.6, 0.6);
  }

  /** Pickup collected — a rising arpeggio whose shape tells you what it was. */
  pickup(step = 0, kind = 'fuel') {
    if (!this.ready) return;
    const t = this._now();
    const g = this.ctx.createGain();
    g.connect(this.sfxBus);
    this._env(g, t, 0.005, 0.4, 0.26);
    const base = 72 + (step % 5) * 2;
    const shapes = {
      fuel: [0, 4, 7, 12], shield: [0, 7, 12, 19], spread: [0, 5, 7, 12, 17], repair: [0, 4, 7, 11, 14],
    };
    (shapes[kind] ?? shapes.fuel).forEach((s, i) => {
      const o = this._osc(kind === 'shield' ? 'sine' : 'triangle', noteHz(base + s), t + i * 0.035, 0.22, g);
      o.detune.value = 4;
    });
  }

  /** Score chain tick — pitch climbs with the multiplier; milestones ring. */
  chain(mult = 1) {
    if (!this.ready || !this._throttled('chain', 0.04)) return;
    const t = this._now();
    const g = this.ctx.createGain();
    g.connect(this.sfxBus);
    this._env(g, t, 0.002, 0.3, 0.14);
    const n = 76 + Math.min(mult, 8) * 2;
    this._osc('square', noteHz(n), t, 0.12, g);
    this._osc('triangle', noteHz(n + 7), t + 0.06, 0.2, g);
    if (mult >= 8) this._osc('triangle', noteHz(n + 12), t + 0.12, 0.3, g);
  }

  /** Style bonus (gap threading, arch dive, graze): a bright two-note ping. */
  bonus(level = 1) {
    if (!this.ready || !this._throttled('bonus', 0.15)) return;
    const t = this._now();
    this._cuePocket();
    const g = this.ctx.createGain();
    g.connect(this.sfxBus);
    this._env(g, t, 0.003, 0.35, 0.16);
    const n = 84 + Math.min(3, level) * 2;
    this._osc('triangle', noteHz(n), t, 0.14, g, 5);
    this._osc('triangle', noteHz(n + 5), t + 0.07, 0.25, g, -5);
  }

  /** The ship punched through a gap: a whoosh that brightens with tightness. */
  pass(tightness = 0, pan = 0) {
    if (!this.ready || !this._throttled('pass', 0.2)) return;
    const t = this._now();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(1400 + tightness * 3200, t + 0.12);
    f.frequency.exponentialRampToValueAtTime(260, t + 0.4);
    const p = this.ctx.createStereoPanner();
    p.pan.setValueAtTime(clamp(-pan, -1, 1), t);
    p.pan.linearRampToValueAtTime(clamp(pan, -1, 1), t + 0.4);
    g.connect(f); f.connect(p); p.connect(this.sfxBus);
    this._env(g, t, 0.05, 0.36, 0.45 + tightness * 0.2);
    this._noiseSrc(t, 0.45, g, 1, this.pink);
  }

  /** Barrel roll: a panned air rip that follows the roll direction. */
  roll(dir = 1) {
    if (!this.ready) return;
    const t = this._now();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(700, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.25);
    f.frequency.exponentialRampToValueAtTime(900, t + 0.5);
    const p = this.ctx.createStereoPanner();
    // world +X is screen-left; the roll direction is in world X
    p.pan.setValueAtTime(clamp(dir * 0.6, -1, 1), t);
    p.pan.linearRampToValueAtTime(clamp(-dir * 0.6, -1, 1), t + 0.5);
    g.connect(f); f.connect(p); p.connect(this.sfxBus);
    this._env(g, t, 0.04, 0.46, 0.4);
    this._noiseSrc(t, 0.55, g, 1.2, this.pink);
  }

  /** Weapon overheated: steam vent and a falling servo tone. */
  overheat() {
    if (!this.ready) return;
    const t = this._now();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 3200;
    g.connect(f); f.connect(this.sfxBus);
    this._env(g, t, 0.01, 0.7, 0.24);
    this._noiseSrc(t, 0.75, g, 1.4);
    const tg = this.ctx.createGain();
    tg.connect(this.sfxBus);
    this._env(tg, t, 0.005, 0.4, 0.12);
    const o = this._osc('square', 660, t, 0.42, tg);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.4);
  }

  /** Weapon cooled back into the green. */
  cooled() {
    if (!this.ready) return;
    const t = this._now();
    const g = this.ctx.createGain();
    g.connect(this.sfxBus);
    this._env(g, t, 0.002, 0.12, 0.1);
    this._osc('triangle', 1320, t, 0.06, g);
    this._osc('triangle', 1760, t + 0.05, 0.08, g);
  }

  /** Low-fuel warning. `urgent` doubles the pips. */
  lowFuel(urgent = false) {
    if (!this.ready) return;
    const t = this._now();
    const g = this.ctx.createGain();
    g.connect(this.sfxBus);
    for (let i = 0; i < (urgent ? 2 : 1); i++) {
      const b = this.ctx.createGain();
      b.connect(g);
      this._env(b, t + i * 0.13, 0.004, 0.09, 0.16);
      this._osc('square', urgent ? 1046 : 880, t + i * 0.13, 0.1, b);
    }
    g.gain.value = 1;
  }

  /** A target sits at your firing height in your lane. */
  lockTick() {
    if (!this.ready || !this._throttled('lock', 0.35)) return;
    const t = this._now();
    this._cuePocket();
    const g = this.ctx.createGain();
    g.connect(this.sfxBus);
    this._env(g, t, 0.002, 0.1, 0.12);
    this._osc('sine', 1568, t, 0.05, g);
    this._osc('sine', 2093, t + 0.045, 0.06, g);
    // a 3 kHz click on the front edge so it cuts through a busy mix
    const c = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 3000; f.Q.value = 2;
    c.connect(f); f.connect(this.sfxBus);
    this._env(c, t, 0.001, 0.02, 0.2);
    this._noiseSrc(t, 0.03, c, 2);
  }

  /** Warning klaxon. */
  alarm() {
    if (!this.ready || !this._throttled('alarm', 0.9)) return;
    const t = this._now();
    const g = this.ctx.createGain();
    g.connect(this.sfxBus);
    this._env(g, t, 0.02, 0.6, 0.24, 0.0001, 0.1);
    const o = this._osc('sawtooth', 440, t, 0.75, g);
    o.frequency.setValueAtTime(440, t);
    o.frequency.linearRampToValueAtTime(300, t + 0.35);
    o.frequency.linearRampToValueAtTime(440, t + 0.7);
  }

  /**
   * Enemy fire. Duller and lower than the player's, so it reads as "theirs".
   * Each source type throttles separately so a battery never collapses to
   * one blip.
   */
  enemyShot(pan = 0, dist = 0, kind = 'turret') {
    if (!this.ready || !this._throttled(`eshot:${kind}`, 0.045)) return;
    const t = this._now();
    const out = this._voice(pan, dist);
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = kind === 'boss' ? 1100 : 1500;
    g.connect(f); f.connect(out);
    const heavy = kind === 'heavy' || kind === 'boss';
    this._env(g, t, 0.003, heavy ? 0.24 : 0.16, heavy ? 0.22 : 0.17);
    const base = (kind === 'flyer' ? 520 : heavy ? 260 : 380) * this._vary(0.05);
    const o = this._osc(kind === 'flyer' ? 'sawtooth' : 'square', base, t, 0.2, g);
    o.frequency.exponentialRampToValueAtTime(base * 0.32, t + 0.16);
    if (heavy) this._noiseSrc(t, 0.12, g, 0.6, this.pink);
  }

  /** Missile launch whoosh. */
  missile(pan = 0, dist = 0) {
    if (!this.ready) return;
    const t = this._now();
    const out = this._voice(pan, dist);
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.45);
    f.Q.value = 1.6;
    g.connect(f); f.connect(out);
    this._env(g, t, 0.05, 0.5, 0.3);
    this._noiseSrc(t, 0.55, g, 1.1);
  }

  /** Contact with an electric barrier: a crackling buzz. */
  zap() {
    if (!this.ready || !this._throttled('zap', 0.3)) return;
    const t = this._now();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 0.8;
    g.connect(f); f.connect(this.sfxBus);
    this._env(g, t, 0.002, 0.45, 0.4);
    this._osc('square', 120, t, 0.5, g);
    this._osc('sawtooth', 181, t, 0.5, g, 20);
    this._noiseSrc(t, 0.45, g, 2.6);
  }

  /** Mine arming: two close pips. */
  mineArm(pan = 0) {
    if (!this.ready || !this._throttled('mine', 0.3)) return;
    const t = this._now();
    const g = this.ctx.createGain();
    const p = this._pan(pan);
    g.connect(p); p.connect(this.sfxBus);
    for (let i = 0; i < 2; i++) {
      const b = this.ctx.createGain();
      b.connect(g);
      this._env(b, t + i * 0.09, 0.003, 0.06, 0.12);
      this._osc('square', 1240, t + i * 0.09, 0.07, b);
    }
    g.gain.value = 1;
  }

  /** A fighter tears past: noise with a falling Doppler pitch across the stereo field. */
  flyby(pan = 0) {
    if (!this.ready || !this._throttled('flyby', 0.25)) return;
    const t = this._now();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(2200, t);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.5);
    const p = this.ctx.createStereoPanner();
    p.pan.setValueAtTime(clamp(pan, -1, 1), t);
    p.pan.linearRampToValueAtTime(clamp(pan * 0.2, -1, 1), t + 0.5);
    g.connect(f); f.connect(p); p.connect(this.sfxBus);
    this._env(g, t, 0.06, 0.45, 0.22);
    this._noiseSrc(t, 0.55, g, 1, this.pink);
    const o = this._osc('sawtooth', 240, t, 0.5, g);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.5);
  }

  /** Radar tower destroyed: an FM power-down sweep and a burst of static. */
  radarDown(pan = 0) {
    if (!this.ready) return;
    const t = this._now();
    const g = this.ctx.createGain();
    const p = this._pan(pan);
    g.connect(p); p.connect(this.sfxBus);
    this._env(g, t, 0.005, 1.1, 0.26);
    const carrier = this._osc('sine', 880, t, 1.15, g);
    carrier.frequency.exponentialRampToValueAtTime(70, t + 1.1);
    const mod = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    mod.frequency.setValueAtTime(60, t);
    mod.frequency.exponentialRampToValueAtTime(8, t + 1.1);
    modGain.gain.value = 300;
    mod.connect(modGain); modGain.connect(carrier.frequency);
    mod.start(t); mod.stop(t + 1.15);
    const s = this.ctx.createGain();
    const sf = this.ctx.createBiquadFilter();
    sf.type = 'bandpass'; sf.frequency.value = 3000; sf.Q.value = 0.7;
    s.connect(sf); sf.connect(p);
    this._env(s, t + 0.05, 0.01, 0.4, 0.14);
    this._noiseSrc(t + 0.05, 0.45, s, 2.2);
  }

  /* --- boss voice ---------------------------------------------------- */

  /** A mechanical servo whine: arms rising, shutters grinding. */
  servo(pan = 0, up = true) {
    if (!this.ready || !this._throttled('servo', 0.25)) return;
    const t = this._now();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 5; f.frequency.value = 900;
    const p = this._pan(pan);
    g.connect(f); f.connect(p); p.connect(this.sfxBus);
    this._env(g, t, 0.03, 0.5, 0.14, 0.0001, 0.12);
    const o = this._osc('square', up ? 140 : 260, t, 0.7, g);
    o.frequency.exponentialRampToValueAtTime(up ? 260 : 120, t + 0.6);
    const c = this.ctx.createGain();
    c.connect(p);
    this._env(c, t + 0.62, 0.002, 0.12, 0.2);
    this._noiseSrc(t + 0.62, 0.14, c, 0.5, this.brown);
  }

  /** Charging weapon: a rising tone the player learns to fear. */
  charge(duration = 1.5) {
    if (!this.ready) return;
    const t = this._now();
    const g = this.ctx.createGain();
    g.connect(this.sfxBus);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + duration * 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration + 0.05);
    const o = this._osc('sawtooth', 110, t, duration + 0.1, g);
    o.frequency.exponentialRampToValueAtTime(880, t + duration);
    const o2 = this._osc('sine', 220, t, duration + 0.1, g, 7);
    o2.frequency.exponentialRampToValueAtTime(1760, t + duration);
  }

  /** The robot's roar: a detuned saw growl with vibrato. */
  roar() {
    if (!this.ready) return;
    const t = this._now();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(300, t);
    f.frequency.linearRampToValueAtTime(1400, t + 0.5);
    f.frequency.exponentialRampToValueAtTime(200, t + 1.6);
    g.connect(f); f.connect(this.sfxBus);
    this._env(g, t, 0.15, 1.5, 0.4);
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 7; lfoGain.gain.value = 14;
    lfo.connect(lfoGain);
    for (const [hz, det] of [[55, 0], [55, 14], [82.4, -10]]) {
      const o = this._osc('sawtooth', hz, t, 1.7, g, det);
      lfoGain.connect(o.frequency);
    }
    lfo.start(t); lfo.stop(t + 1.7);
    this._noiseSrc(t, 1.4, g, 0.4, this.brown);
    this.duckMusic(0.5, 0.8);
  }

  /* ------------------------------------------------------------------ */
  /* UI and stingers                                                     */
  /* ------------------------------------------------------------------ */

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
    this._env(g, t, 0.01, 1.1, 0.26);
    const root = this._song.root + 24;
    const notes = up ? [0, 7, 12, 19] : [19, 12, 7, 0];
    notes.forEach((s, i) => {
      this._osc('sawtooth', noteHz(root + s), t + i * 0.09, 0.9 - i * 0.1, g, i * 3);
    });
  }

  /**
   * Short scored cues outside the song loop: victory fanfare, defeat,
   * sector cleared, sector grade and loop start.
   */
  jingle(kind) {
    if (!this.ready) return;
    const t = this._now() + 0.02;
    const g = this.ctx.createGain();
    g.connect(this.musicBus);
    g.gain.value = 1;
    const note = (semi, at, dur, gain, type = 'sawtooth') => {
      const v = this.ctx.createGain();
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 3200;
      v.connect(f); f.connect(g);
      this._env(v, t + at, 0.01, dur, gain, 0.0001, dur * 0.3);
      this._osc(type, noteHz(semi), t + at, dur * 1.4, v, -6);
      this._osc(type, noteHz(semi), t + at, dur * 1.4, v, 6);
    };
    if (kind === 'victory') {
      [[60, 0], [64, 0.14], [67, 0.28], [72, 0.42]].forEach(([n, at]) => note(n, at, 0.22, 0.12));
      for (const n of [60, 64, 67, 72, 76]) note(n, 0.62, 1.6, 0.07);
      note(36, 0.62, 1.8, 0.14, 'triangle');
    } else if (kind === 'defeat') {
      [[64, 0], [63, 0.3], [62, 0.6], [57, 0.9]].forEach(([n, at]) => note(n, at, 0.34, 0.1));
      note(33, 0.9, 1.6, 0.14, 'triangle');
    } else if (kind === 'clear') {
      [[72, 0], [76, 0.08], [79, 0.16], [84, 0.24]].forEach(([n, at]) => note(n, at, 0.16, 0.08, 'square'));
    } else if (kind === 'grade') {
      [[79, 0], [84, 0.1]].forEach(([n, at]) => note(n, at, 0.3, 0.09, 'triangle'));
    } else if (kind === 'loop') {
      [[57, 0], [60, 0.1], [64, 0.2], [69, 0.3], [72, 0.4]].forEach(([n, at]) => note(n, at, 0.2, 0.1));
    }
  }

  /* ------------------------------------------------------------------ */
  /* Engine drone and ambient beds                                       */
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
    rumble.buffer = this.brown;
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

    // Proximity loops: force-field hum and incoming-missile whistle.
    const hum = ctx.createGain(); hum.gain.value = 0; hum.connect(this.sfxBus);
    const humF = ctx.createBiquadFilter(); humF.type = 'bandpass'; humF.frequency.value = 240; humF.Q.value = 2;
    humF.connect(hum);
    const h1 = ctx.createOscillator(); h1.type = 'sawtooth'; h1.frequency.value = 60;
    const h2 = ctx.createOscillator(); h2.type = 'sawtooth'; h2.frequency.value = 120.6;
    h1.connect(humF); h2.connect(humF); h1.start(t); h2.start(t);
    const crackle = ctx.createBufferSource(); crackle.buffer = this.noise; crackle.loop = true;
    const crackleF = ctx.createBiquadFilter(); crackleF.type = 'highpass'; crackleF.frequency.value = 4000;
    const crackleG = ctx.createGain(); crackleG.gain.value = 0;
    crackle.connect(crackleF); crackleF.connect(crackleG); crackleG.connect(this.sfxBus); crackle.start(t);

    const whistle = ctx.createGain(); whistle.gain.value = 0; whistle.connect(this.sfxBus);
    const wo = ctx.createOscillator(); wo.type = 'triangle'; wo.frequency.value = 900;
    wo.connect(whistle); wo.start(t);

    // Environment beds, crossfaded by setEnvironment: deck wind, open-space
    // air, reactor hum and hiss, and the arena's rising sub drone.
    const bed = (node, gainNode) => { node.connect(gainNode); gainNode.connect(this.sfxBus); gainNode.gain.value = 0; return gainNode; };
    const wind = ctx.createBufferSource(); wind.buffer = this.brown; wind.loop = true; wind.playbackRate.value = 0.6;
    const windF = ctx.createBiquadFilter(); windF.type = 'lowpass'; windF.frequency.value = 500;
    wind.connect(windF); const windG = bed(windF, ctx.createGain()); wind.start(t);
    const air = ctx.createBufferSource(); air.buffer = this.pink; air.loop = true;
    const airF = ctx.createBiquadFilter(); airF.type = 'bandpass'; airF.frequency.value = 900; airF.Q.value = 1.4;
    const airLfo = ctx.createOscillator(); airLfo.frequency.value = 0.07;
    const airDepth = ctx.createGain(); airDepth.gain.value = 600;
    airLfo.connect(airDepth); airDepth.connect(airF.frequency); airLfo.start(t);
    air.connect(airF); const airG = bed(airF, ctx.createGain()); air.start(t);
    const reactor = ctx.createOscillator(); reactor.type = 'sawtooth'; reactor.frequency.value = 50;
    const reactorF = ctx.createBiquadFilter(); reactorF.type = 'lowpass'; reactorF.frequency.value = 220;
    reactor.connect(reactorF); const reactorG = bed(reactorF, ctx.createGain()); reactor.start(t);
    const hiss = ctx.createBufferSource(); hiss.buffer = this.noise; hiss.loop = true;
    const hissF = ctx.createBiquadFilter(); hissF.type = 'highpass'; hissF.frequency.value = 5000;
    hiss.connect(hissF); hissF.connect(reactorG); hiss.start(t);
    const drone = ctx.createOscillator(); drone.type = 'sine'; drone.frequency.value = 41;
    const drone2 = ctx.createOscillator(); drone2.type = 'triangle'; drone2.frequency.value = 61.7;
    const droneG = ctx.createGain(); droneG.gain.value = 0; droneG.connect(this.sfxBus);
    drone.connect(droneG); drone2.connect(droneG); drone.start(t); drone2.start(t);

    this._engineNodes = { out, rumble, o1, o2, wf, lf, wg, lg, hum, humF, h1, h2, crackle, crackleF, crackleG, whistle, wo,
      wind, windF, windG, air, airF, airLfo, airDepth, airG, reactor, reactorF, reactorG, hiss, hissF, drone, drone2, droneG };
    this._applyBed();
    out.gain.setTargetAtTime(0.16, t, 0.4);
  }

  /** Crossfade the environment beds toward the current room and flavour. */
  _applyBed() {
    const n = this._engineNodes;
    if (!n) return;
    const t = this.ctx.currentTime, kind = this._bedKind ?? 'fortress';
    n.windG.gain.setTargetAtTime(kind === 'fortress' ? 0.05 : 0.0001, t, 0.8);
    n.airG.gain.setTargetAtTime(kind === 'space' ? 0.045 : 0.0001, t, 0.8);
    n.reactorG.gain.setTargetAtTime(kind === 'fortress' && this._bedFlavor === 'ember' ? 0.035 : 0.0001, t, 0.8);
    n.droneG.gain.setTargetAtTime(kind === 'arena' ? 0.06 + (this._bossPhase ?? 0) * 0.03 : 0.0001, t, 0.8);
  }

  /** The arena drone climbs with the Sentinel's phase. */
  setBossPhase(phase) {
    this._bossPhase = phase;
    const n = this._engineNodes;
    if (n) {
      const t = this.ctx.currentTime;
      n.drone.frequency.setTargetAtTime(41 * Math.pow(2, phase / 12 * 3), t, 0.5);
      n.drone2.frequency.setTargetAtTime(61.7 * Math.pow(2, phase / 12 * 3), t, 0.5);
    }
    this._applyBed();
  }

  /**
   * The boss's fire curtain: a noise wall sweeping left to right that drops
   * out as it passes the gap, so the opening is audible.
   */
  curtain(gapPan = 0) {
    if (!this.ready) return;
    const t = this._now(), dur = 0.7;
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.7;
    const p = this.ctx.createStereoPanner();
    p.pan.setValueAtTime(-1, t);
    p.pan.linearRampToValueAtTime(1, t + dur);
    g.connect(f); f.connect(p); p.connect(this.sfxBus);
    const gapAt = t + dur * (clamp(gapPan, -1, 1) + 1) / 2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28, t + 0.04);
    g.gain.setValueAtTime(0.28, Math.max(t + 0.05, gapAt - 0.08));
    g.gain.exponentialRampToValueAtTime(0.02, gapAt);
    g.gain.exponentialRampToValueAtTime(0.28, Math.min(t + dur - 0.05, gapAt + 0.08));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    this._noiseSrc(t, dur + 0.1, g, 1.3, this.pink);
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

  /**
   * Continuous proximity cues, set once per rendered frame.
   * @param {number} field 0..1 closeness to an active force field
   * @param {number} missile 0..1 closeness of the nearest homing missile
   */
  setProximity(field, missile) {
    const n = this._engineNodes;
    if (!n) return;
    const t = this.ctx.currentTime;
    n.hum.gain.setTargetAtTime(field * 0.1, t, 0.1);
    n.crackleG.gain.setTargetAtTime(field > 0.6 ? (field - 0.6) * 0.12 : 0, t, 0.08);
    n.whistle.gain.setTargetAtTime(missile * 0.05, t, 0.08);
    n.wo.frequency.setTargetAtTime(700 + missile * 1100, t, 0.08);
  }

  stopEngine() {
    const n = this._engineNodes;
    if (!n) return;
    const t = this.ctx.currentTime;
    n.out.gain.setTargetAtTime(0.0001, t, 0.15);
    n.hum.gain.setTargetAtTime(0.0001, t, 0.1);
    n.crackleG.gain.setTargetAtTime(0.0001, t, 0.1);
    n.whistle.gain.setTargetAtTime(0.0001, t, 0.1);
    for (const g of [n.windG, n.airG, n.reactorG, n.droneG]) g.gain.setTargetAtTime(0.0001, t, 0.15);
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
    this._bpm = this._song.bpm;
    clearInterval(this._schedTimer);
    this._schedTimer = setInterval(() => this._schedule(), 25);
  }

  /**
   * Start or change the song. `mood` is a song key: 'menu', 'boss', a sector
   * index, or legacy 'combat'. A running song switches on the next bar so the
   * groove never trips over itself.
   */
  startMusic(mood = 'combat') {
    const key = typeof mood === 'number' ? `s${Math.min(6, mood)}` : mood === 'combat' ? 's0' : mood;
    const song = SONGS[key] ?? SONGS.s0;
    const running = this._musicOn;
    this._musicOn = true;
    this._mood = key === 'boss' ? 'boss' : key === 'menu' ? 'menu' : 'combat';
    if (running && key !== this._songKey) {
      this._pendingSong = key;
      return;
    }
    this._setSong(key, song);
    this._step = 0;
    if (this.ctx) this._nextNoteTime = this.ctx.currentTime + 0.08;
  }

  _setSong(key, song = SONGS[key]) {
    this._songKey = key;
    this._song = song;
    this._bpm = song.bpm;
    this._motif = motif(key, song);
    this._crashNext = true;
  }

  stopMusic() {
    this._musicOn = false;
    this._pendingSong = null;
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
      // Pending song changes land on a bar line, with the new song's first bar.
      if (this._pendingSong && this._step % 16 === 0) {
        this._setSong(this._pendingSong);
        this._pendingSong = null;
        this._step = 0;
      }
      this._playStep(this._step, this._nextNoteTime);
      this._nextNoteTime += (60 / this._bpm) / 4;
      this._step++;
    }
  }

  _playStep(step, t) {
    const song = this._song;
    const scale = SCALES[song.scale];
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const phraseBar = bar % 16;
    const sectionB = phraseBar >= 8;
    const fill = phraseBar === 15 || phraseBar === 7;
    const I = this._intensity;
    const menu = this._mood === 'menu';
    const half = song.kit === 'half';

    /* --- harmony ------------------------------------------------------ */
    const prog = sectionB && song.progB ? song.progB : song.prog;
    const rootOffset = prog[bar % prog.length];
    const root = song.root + rootOffset;
    const degree = (d) => {
      const oct = Math.floor(d / 7);
      return scale[((d % 7) + 7) % 7] + oct * 12;
    };

    /* --- crash on phrase starts and song entries ------------------------ */
    if (s === 0 && (phraseBar === 0 || this._crashNext) && !menu) {
      this._crash(t, 0.14 + I * 0.08);
      this._crashNext = false;
    }

    /* --- drums -------------------------------------------------------- */
    if (!menu && song.kit !== 'none') {
      if (fill && s >= 8) {
        // snare roll into the next phrase, toms falling underneath
        this._snare(t, 0.12 + (s - 8) * 0.03 + I * 0.1);
        if (s % 2 === 0) this._tom(t, 220 - (s - 8) * 14, 0.28);
      } else {
        this._drums(song.kit, s, t, I, half);
      }
    }

    /* --- bass --------------------------------------------------------- */
    const bassPat = BASS[song.bass] ?? BASS.eighths;
    const bd = bassPat[s];
    if (bd != null && (!menu || s % 4 === 0) && !(half && s % 2 === 1)) {
      const semi = root + degree(bd);
      this._bass(t, noteHz(semi), (menu ? 0.1 : 0.14 + I * 0.1), song.kit === 'riff' || song.kit === 'toms');
    }

    /* --- arpeggio ----------------------------------------------------- */
    if (I > 0.3 || menu || half) {
      const arp = song.arp;
      const every = half ? 2 : 1;
      if (s % every === 0) {
        const idx = (s / every + (sectionB ? 2 : 0)) % arp.length;
        const semi = root + 24 + degree(arp[idx]) + (sectionB && I > 0.6 ? 12 : 0);
        this._arp(t, noteHz(semi), (menu ? 0.09 : 0.045 + I * 0.065));
      }
    }

    /* --- pad ---------------------------------------------------------- */
    if (s === 0) {
      const semis = [0, 2, 4].map((d) => root + 12 + degree(d));
      if (half || menu) semis.push(root + 24 + degree(6));
      this._pad(t, semis, song.pad * (menu ? 1 : 0.8 + I * 0.5), (60 / this._bpm) * 4);
    }

    /* --- lead motif in the B section ------------------------------------ */
    const leadOn = (sectionB && I > 0.45) || this._mood === 'boss' && I > 0.6;
    if (leadOn && s % 2 === 0) {
      const m = this._motif[(bar % 2) * 8 + s / 2];
      if (m != null) this._lead(t, noteHz(root + 24 + degree(m)), song.lead * (0.8 + I * 0.3));
    }
  }

  _drums(kit, s, t, I, half) {
    switch (kit) {
      case 'four':
        if (s % 4 === 0) this._kick(t, 0.55 + I * 0.25);
        if (s === 4 || s === 12) this._snare(t, 0.28 + I * 0.25);
        if (I > 0.25 && s % 2 === 1) this._hat(t, 0.08 + I * 0.12, s % 4 === 3);
        break;
      case 'march':
        if (s === 0 || s === 8 || (I > 0.6 && s === 10)) this._kick(t, 0.6 + I * 0.2);
        if (s === 4 || s === 12) this._snare(t, 0.3 + I * 0.25);
        if (I > 0.35 && (s === 14 || s === 15 || s === 6)) this._snare(t, 0.08 + I * 0.08);
        if (s % 2 === 0) this._hat(t, 0.06 + I * 0.1, false);
        break;
      case 'half':
        if (s === 0 || (I > 0.5 && s === 10)) this._kick(t, 0.55 + I * 0.2);
        if (s === 8) this._snare(t, 0.26 + I * 0.2);
        if (I > 0.3 && s % 4 === 2) this._hat(t, 0.06 + I * 0.08, true);
        break;
      case 'breaks':
        if (s === 0 || s === 6 || s === 10 || (I > 0.7 && s === 14)) this._kick(t, 0.55 + I * 0.25);
        if (s === 4 || s === 12) this._snare(t, 0.3 + I * 0.25);
        if (I > 0.4 && s === 15) this._snare(t, 0.1);
        if (I > 0.2) this._hat(t, (s % 2 ? 0.05 : 0.09) + I * 0.08, s === 7);
        break;
      case 'toms':
        if (s % 4 === 0) this._kick(t, 0.55 + I * 0.25);
        if (s === 4 || s === 12) this._snare(t, 0.26 + I * 0.25);
        if (s === 10 || s === 14) this._tom(t, s === 10 ? 150 : 110, 0.22 + I * 0.1);
        if (I > 0.3 && s % 2 === 1) this._hat(t, 0.06 + I * 0.1, false);
        break;
      case 'riff':
        if (s % 4 === 0 || s === 6 || (I > 0.6 && s === 14)) this._kick(t, 0.6 + I * 0.25);
        if (s === 4 || s === 12) this._snare(t, 0.34 + I * 0.25);
        if (s % 2 === 1) this._hat(t, 0.08 + I * 0.12, s % 8 === 7);
        if (s === 11) this._tom(t, 130, 0.25);
        break;
    }
    if (I > 0.75 && !half && (s === 14 || s === 7)) this._kick(t, 0.3);
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

  _tom(t, hz, gain) {
    const g = this.ctx.createGain();
    g.connect(this.musicBus);
    this._env(g, t, 0.002, 0.3, gain);
    const o = this._osc('sine', hz, t, 0.32, g);
    o.frequency.exponentialRampToValueAtTime(hz * 0.55, t + 0.28);
  }

  _hat(t, gain, open = false) {
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7200;
    g.connect(f); f.connect(this.musicBus);
    this._env(g, t, 0.001, open ? 0.16 : 0.045, gain);
    this._noiseSrc(t, open ? 0.18 : 0.05, g, 2.4);
  }

  _crash(t, gain) {
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 4200;
    g.connect(f); f.connect(this.musicBus);
    this._env(g, t, 0.002, 1.6, gain);
    this._noiseSrc(t, 1.7, g, 1.1);
  }

  _bass(t, hz, gain, gritty) {
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(gritty ? 1500 : 800, t);
    f.frequency.exponentialRampToValueAtTime(180, t + 0.2);
    f.Q.value = gritty ? 3 : 6;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 45;
    g.connect(f); f.connect(hp); hp.connect(this.musicBus);
    this._env(g, t, 0.006, 0.2, gain, 0.0001, 0.02);
    this._osc(gritty ? 'sawtooth' : 'square', hz, t, 0.24, g);
    this._osc('sine', hz / 2, t, 0.24, g);
  }

  _arp(t, hz, gain) {
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    // centred just above the note, keeping the arpeggio out of the cue band
    f.frequency.value = hz * 1.4;
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
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3600, t);
    f.frequency.exponentialRampToValueAtTime(1200, t + 0.25);
    g.connect(f); f.connect(this.musicBus);
    this._env(g, t, 0.006, 0.26, gain);
    const o = this._osc('sawtooth', hz, t, 0.3, g, -5);
    o.frequency.setValueAtTime(hz, t);
    o.frequency.linearRampToValueAtTime(hz * 1.004, t + 0.25);
    this._osc('square', hz, t, 0.3, g, 5);
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

/** A seeded two-bar lead motif (8th notes, scale degrees, null rests). */
function motif(key, song) {
  if (song.hook) return song.hook;
  const rng = new Rng([...key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7));
  const out = [];
  let d = rng.pick([0, 2, 4]);
  for (let i = 0; i < 16; i++) {
    if (i % 8 === 7 || rng.bool(0.2)) { out.push(null); continue; }
    d = clamp(d + rng.pick([-2, -1, 1, 1, 2, 0]), -2, 9);
    out.push(i === 15 ? 0 : d);
  }
  out[0] = song.kit === 'riff' ? 0 : out[0] ?? 0;
  return out;
}

let _softCurve = null;
function softClipCurve() {
  if (_softCurve) return _softCurve;
  const n = 2048;
  _softCurve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    // tanh(kx)/k has unity slope at zero: colour on peaks, no gain on the mix
    _softCurve[i] = Math.tanh(x * 1.1) / 1.1;
  }
  return _softCurve;
}

let _driveCurve = null;
function driveCurve() {
  if (_driveCurve) return _driveCurve;
  const n = 1024;
  _driveCurve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    _driveCurve[i] = Math.tanh(x * 2.6);
  }
  return _driveCurve;
}

export const audio = new Audio();
