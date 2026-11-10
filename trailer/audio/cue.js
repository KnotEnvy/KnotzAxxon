// The trailer score: a 50-bar cue played on the game's own synth voices
// (src/audio/Audio.js: kick, snare, tom, hat, crash, bass, arp, pad, lead)
// plus a few trailer instruments built from the same Web Audio parts.
//
// 144 bpm: one beat = 25 video frames at 60 fps, one bar = 100 frames.
// The edit (edit/timeline.ts) uses the same bar numbers.
//
//   bars  0-2   cold open, CLASSIC: the sector-1 hook as an arcade chiptune
//   bar   2     the swoop: the chip bus opens up, riser, reverse cymbal
//   bar   3     the hit as the ship clears the outer wall; title ring-out
//   bars  4-11  the theme on the game's voices: the three rigs, then combat
//   bars 12-15  sector tour, driving B section, riser
//   bars 16-23  the break: half time, glass arp, the build
//   bars 24-31  escalation: gallop bass, march snare, the theme in full
//   bars 32-39  the Iron Sentinel: E phrygian-dominant riff (the game's boss hook)
//   bars 40-43  the duel and the lift: F - G - A, the kill on bar 44
//   bars 44-49  A major under the title, the chip hook returns at the end

export const BPM = 144;
export const BARS = 50;
export const SPB = 60 / BPM;          // seconds per beat
export const BAR = SPB * 4;
const S = SPB / 4;                    // a sixteenth

const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// The game's sector-1 hook (src/audio/Audio.js, SONGS.s0.hook), A aeolian,
// two bars of eighths as MIDI notes (null = rest).
const HOOK = [69, null, 76, null, 81, 79, 76, null, 77, 76, 72, null, 76, null, null, null];
// The answer phrase: the hook a third up, resolving down.
const HOOK2 = [72, null, 79, null, 84, 83, 79, null, 81, 79, 76, null, 74, null, 76, null];
// Cadence: walks back to the tonic.
const HOOK3 = [77, null, 76, 74, 76, null, 72, null, 71, null, 72, 74, 69, null, null, null];
// The boss hook (SONGS.boss.hook), E phrygian dominant.
const BOSS = [64, 64, 65, null, 64, null, 68, null, 69, 68, 65, null, 64, null, null, null];

// Chords (root MIDI in the bass octave, quality).
const CH = {
  Am: [45, [0, 3, 7]], F: [41, [0, 4, 7]], C: [48, [0, 4, 7]], G: [43, [0, 4, 7]],
  Dm: [50, [0, 3, 7]], E: [40, [0, 4, 7]], Esus: [40, [0, 5, 7]], A: [45, [0, 4, 7]],
  Fmaj7: [41, [0, 4, 7, 11]], Am9: [45, [0, 3, 7, 14]], Bb: [46, [0, 4, 7]],
};
const THEME_PROG = ['Am', 'F', 'C', 'G', 'Am', 'F', 'Dm', 'E'];
const THEME_MEL = [HOOK.slice(0, 8), HOOK.slice(8), HOOK2.slice(0, 8), HOOK2.slice(8), HOOK.slice(0, 8), HOOK.slice(8), HOOK3.slice(0, 8), HOOK3.slice(8)];

// The 4:5 short (edit/Short.tsx) plays trailer bars in a new order: bar i of the
// short is trailer bar SHORT_MAP[i]. The trailer is the identity map.
export const SHORT_MAP = [0, 2, 3, 4, 5, 6, 7, 8, 9, 16, 23, 24, 25, 30, 31, 32, 36, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48];

export function score(a, out, map = null) {
  const bars = map ?? Array.from({ length: BARS }, (_, i) => i);
  const ctx = a.ctx;
  const bus = a.musicBus;

  /* ---------------- trailer buses ---------------- */
  // Chip bus: square/triangle voices through a 4-bit-ish stair-step shaper and a
  // low-pass, the "arcade cabinet" version of the game's sound.
  const chipIn = ctx.createGain();
  const crush = ctx.createWaveShaper();
  { const n = 4096, c = new Float32Array(n), steps = 12; for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.round(x * steps) / steps; } crush.curve = c; }
  const chipLP = ctx.createBiquadFilter(); chipLP.type = 'lowpass'; chipLP.frequency.value = 5200; chipLP.Q.value = 0.4;
  const chipOut = ctx.createGain(); chipOut.gain.value = 0.9;
  chipIn.connect(crush); crush.connect(chipLP); chipLP.connect(chipOut); chipOut.connect(out);

  // Section levels (dB) on the band; the arc of the trailer lives here.
  const LEVELS = [[0, 0], [4, 0], [8, 2.5], [12, 2], [16, -2.5], [17, -4.5], [23, 0], [24, 3], [32, 2.5], [40, 3.5], [44, 0], [45, -1]];
  const mix = ctx.createGain(); mix.connect(out);
  const levelAt = (b) => LEVELS.filter(([lb]) => lb <= b).pop()[1];
  bars.forEach((b, i) => mix.gain.setValueAtTime(Math.pow(10, levelAt(b) / 20), i * BAR));
  bus.disconnect(); bus.connect(mix); bus.connect(a.musicSend);

  const wide = (pan) => { const p = ctx.createStereoPanner(); p.pan.value = pan; p.connect(bus); return p; };
  const L = wide(-0.45), R = wide(0.45);

  /* ---------------- instruments ---------------- */
  const env = (g, t, att, hold, rel, peak) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + att);
    g.gain.setValueAtTime(Math.max(peak, 0.0002), t + att + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + att + hold + rel);
  };
  const osc = (type, f, t, dur, dest, detune = 0) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
    o.connect(dest); o.start(t); o.stop(t + dur + 0.05); return o;
  };
  const noise = (t, dur, dest, rate = 1, buf = a.noise) => {
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
    s.connect(dest); s.start(t); s.stop(t + dur + 0.05); return s;
  };

  function chip(t, m, dur, gain, type = 'square') {
    const g = ctx.createGain(); g.connect(chipIn);
    env(g, t, 0.004, Math.max(0, dur - 0.05), 0.05, gain);
    osc(type, hz(m), t, dur, g);
  }
  function chipNoise(t, gain, len = 0.03) {
    const g = ctx.createGain(); const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
    g.connect(f); f.connect(chipIn); env(g, t, 0.001, 0, len, gain); noise(t, len + 0.02, g, 0.5);
  }
  function chipKick(t, gain) {
    const g = ctx.createGain(); g.connect(chipIn); env(g, t, 0.002, 0.02, 0.1, gain);
    const o = osc('triangle', 180, t, 0.14, g); o.frequency.exponentialRampToValueAtTime(45, t + 0.1);
  }
  // A sustained lead on the game's lead timbre (detuned saw + square, filter sweep).
  function lead(t, m, dur, gain, { pan = 0, bright = 1 } = {}) {
    const g = ctx.createGain(); const f = ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(1800 + 2400 * bright, t); f.frequency.exponentialRampToValueAtTime(900 + 700 * bright, t + Math.min(dur, 0.6));
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    g.connect(f); f.connect(p); p.connect(bus);
    env(g, t, 0.008, Math.max(0, dur - 0.12), 0.18, gain);
    osc('sawtooth', hz(m), t, dur + 0.2, g, -6); osc('square', hz(m), t, dur + 0.2, g, 6);
  }
  // Brass-like stab/swell: stacked saws, filter envelope.
  function brass(t, notes, dur, gain, { attack = 0.015, bright = 1, pan = 0 } = {}) {
    const g = ctx.createGain(); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(900 + 2600 * bright, t + attack + 0.06);
    f.frequency.exponentialRampToValueAtTime(700 + 900 * bright, t + attack + dur);
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    g.connect(f); f.connect(p); p.connect(bus);
    env(g, t, attack, Math.max(0, dur - attack - 0.2), 0.35, gain);
    for (const m of notes) { osc('sawtooth', hz(m), t, dur + 0.4, g, -9); osc('sawtooth', hz(m), t, dur + 0.4, g, 9); }
  }
  function pad(t, notes, dur, gain, cutoff = 1400) {
    const g = ctx.createGain(); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
    g.connect(f); f.connect(bus);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.35, dur * 0.3));
    g.gain.setValueAtTime(gain, t + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3);
    for (const m of notes) { osc('sawtooth', hz(m), t, dur + 0.35, g, -8); osc('sawtooth', hz(m), t, dur + 0.35, g, 8); }
  }
  function sub(t, m, dur, gain) {
    const g = ctx.createGain(); g.connect(bus); env(g, t, 0.01, Math.max(0, dur - 0.1), 0.12, gain); osc('sine', hz(m), t, dur, g);
  }
  function boom(t, gain = 1) {
    gain *= 0.5;
    const g = ctx.createGain(); g.connect(out); env(g, t, 0.004, 0.05, 1.6, gain);
    const o = osc('sine', 90, t, 1.8, g); o.frequency.exponentialRampToValueAtTime(28, t + 1.2);
    const g2 = ctx.createGain(); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    g2.connect(f); f.connect(out); env(g2, t, 0.002, 0, 0.5, gain * 0.5); noise(t, 0.6, g2, 0.6, a.brown);
  }
  function riser(t, dur, gain = 0.25) {
    const g = ctx.createGain(); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.5;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(7000, t + dur);
    g.connect(f); f.connect(bus);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.95); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.02);
    noise(t, dur, g, 1);
    const g2 = ctx.createGain(); g2.connect(bus);
    g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(gain * 0.25, t + dur * 0.95); g2.gain.linearRampToValueAtTime(0.0001, t + dur + 0.02);
    const o = osc('sawtooth', 110, t, dur, g2); o.frequency.exponentialRampToValueAtTime(880, t + dur);
  }
  function revCymbal(t, dur, gain = 0.3) {
    const g = ctx.createGain(); const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3500;
    g.connect(f); f.connect(bus);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.01);
    noise(t, dur, g, 1.1);
  }
  const kick = (t, v) => a._kick(t, v), snare = (t, v) => a._snare(t, v), hat = (t, v, o = false) => a._hat(t, v, o);
  const crash = (t, v) => a._crash(t, v), tom = (t, f, v) => a._tom(t, f, v);
  const bassNote = (t, m, v, gritty = false) => a._bass(t, hz(m), v, gritty);
  const arp = (t, m, v) => a._arp(t, hz(m), v);

  function impact(t, chordNotes, v = 1) {
    boom(t, 0.9 * v);
    crash(t, 0.32 * v);
    kick(t, 0.6 * v);
    tom(t, 90, 0.4 * v);
    brass(t, chordNotes, 1.2, 0.075 * v, { attack: 0.01, bright: 1 });
    sub(t + 0.03, chordNotes[0] - 12, 1.4, 0.2 * v);
  }
  function tomFill(t0, from = 12, v = 0.3) {
    const freqs = [220, 196, 165, 147, 131, 110];
    for (let k = from, n = 0; k < 16; k++, n++) tom(t0 + k * S, freqs[Math.min(5, n)], v + n * 0.03);
  }
  const chordNotes = (name, base = 60) => {
    const [r, q] = CH[name];
    let root = r; while (root < base - 6) root += 12;
    return q.map(i => root + i);
  };
  const play8ths = (t0, notes, fn) => notes.forEach((m, i) => { if (m != null) fn(t0 + i * 2 * S, m, i); });
  const pattern = (t0, pat, fn) => [...pat].forEach((c, i) => { if (c !== '.' && c !== '-') fn(t0 + i * S, c, i); });

  /* ---------------- the cue, bar by bar ---------------- */
  for (let i0 = 0; i0 < bars.length; i0++) {
    const b = bars[i0], t = i0 * BAR;

    /* --- 0-2: the classic, as a chiptune --- */
    if (b <= 2) {
      // two-bar hook on bars 0-1, the answer on bar 2 (eighths)
      const phrase = b === 0 ? HOOK.slice(0, 8) : b === 1 ? HOOK.slice(8) : HOOK2.slice(0, 8);
      play8ths(t, phrase, (tt, m) => chip(tt, m, 2 * S * 0.9, 0.11));
      play8ths(t, phrase.slice(0, 8), (tt, m) => chip(tt, m + 12, 2 * S * 0.5, 0.025, 'square'));
      const root = b === 0 ? 45 : b === 1 ? 41 : 48;
      for (let k = 0; k < 8; k++) chip(t + k * 2 * S, root - 12 + (k % 2 ? 12 : 0), 2 * S * 0.8, 0.16, 'triangle');
      pattern(t, 'x.......x.......', (tt) => chipKick(tt, 0.35));
      pattern(t, '..x...x...x...x.', (tt) => chipNoise(tt, 0.06));
      if (b === 2) {
        // the swoop: chip bus opens and fades, the modern voices swell under it
        chipLP.frequency.setValueAtTime(5200, t); chipLP.frequency.exponentialRampToValueAtTime(14000, t + BAR * 0.6);
        chipOut.gain.setValueAtTime(0.9, t + BAR * 0.5); chipOut.gain.exponentialRampToValueAtTime(0.0001, t + BAR);
        pad(t, chordNotes('C', 60), BAR, 0.045, 900);
        riser(t, BAR, 0.3);
        revCymbal(t + BAR * 0.5, BAR * 0.5, 0.32);
        for (let k = 8; k < 16; k++) snare(t + k * S, 0.06 + (k - 8) * 0.025);
        tomFill(t, 12, 0.32);
      }
    }

    /* --- 3: the hit, the title ring-out --- */
    if (b === 3) {
      impact(t, [57, 64, 69, 72, 76], 1.1);
      pad(t, [57, 64, 69, 71, 76], BAR, 0.06, 1800);
      lead(t + BAR * 0.5, 76, BAR * 0.45, 0.035, { bright: 0.6 });
      revCymbal(t + BAR * 0.6, BAR * 0.4, 0.26);
      bassNote(t, 33, 0.3, true);
    }

    /* --- 4-11: the theme on the game's voices --- */
    if (b >= 4 && b <= 11) {
      const i = (b - 4) % 8, full = b >= 8;
      const ch = THEME_PROG[i], [root] = CH[ch];
      if (i === 0) crash(t, 0.22);
      if (b === 8) { crash(t, 0.3); boom(t, 0.45); }
      play8ths(t, THEME_MEL[i], (tt, m) => lead(tt, m, 2 * S * 0.92, full ? 0.05 : 0.045, { bright: full ? 1 : 0.8 }));
      if (full) play8ths(t, THEME_MEL[i], (tt, m) => lead(tt, m - 12, 2 * S * 0.9, 0.022, { pan: -0.3, bright: 0.5 }));
      pad(t, chordNotes(ch, 60), BAR, full ? 0.035 : 0.04, full ? 1800 : 1300);
      pattern(t, 'x.x.x.x.x.x.x.x.', (tt, c, k) => bassNote(tt, root - 12 + ([6, 14].includes(k) ? 7 : 0), 0.2, full));
      pattern(t, 'x...x...x...x...', (tt) => kick(tt, 0.62));
      pattern(t, full ? '....x.......x...' : '............x...', (tt) => snare(tt, 0.32));
      pattern(t, full ? '.x.x.x.x.x.x.x.x' : '..x...x...x...x.', (tt, c, k) => hat(tt, 0.09, k % 4 === 3));
      if (full || i >= 2) pattern(t, 'xxxxxxxxxxxxxxxx', (tt, c, k) => arp(tt, chordNotes(ch, 72)[k % 3] + (k % 8 >= 4 ? 12 : 0), full ? 0.05 : 0.04));
      if (b === 7) tomFill(t, 12, 0.3);
      if (b === 11) { tomFill(t, 8, 0.28); revCymbal(t + BAR * 0.5, BAR * 0.5, 0.26); }
    }

    /* --- 12-15: sector tour, driving B section --- */
    if (b >= 12 && b <= 15) {
      const prog = ['F', 'G', 'Am', 'E'], ch = prog[b - 12], [root] = CH[ch];
      crash(t, b === 12 ? 0.3 : 0.16);
      if (b === 12) boom(t, 0.5);
      // the hook in half-bar chunks, one per sector card
      const mel = b < 14 ? HOOK2 : HOOK;
      play8ths(t, mel.slice(0, 8), (tt, m) => lead(tt, m, 2 * S * 0.9, 0.048, { bright: 1 }));
      play8ths(t, mel.slice(0, 8), (tt, m) => lead(tt, m + 12, 2 * S * 0.6, 0.012, { pan: 0.35 }));
      brass(t, chordNotes(ch, 60), BAR * 0.95, 0.03, { attack: 0.2, bright: 0.6 });
      pattern(t, 'x.xxx.xxx.xxx.xx', (tt) => bassNote(tt, root - 12, 0.22, true));
      pattern(t, 'x...x...x...x...', (tt) => kick(tt, 0.7));
      pattern(t, '....x.......x...', (tt) => snare(tt, 0.36));
      pattern(t, 'xxxxxxxxxxxxxxxx', (tt, c, k) => hat(tt, k % 2 ? 0.06 : 0.1));
      pattern(t, 'x.......x.......', (tt) => tom(tt + 6 * S, 130, 0.22));
      if (b === 15) {
        riser(t, BAR, 0.3); revCymbal(t + BAR * 0.5, BAR * 0.5, 0.34);
        for (let k = 8; k < 16; k++) snare(t + k * S, 0.08 + (k - 8) * 0.03);
      }
    }

    /* --- 16-23: the break --- */
    if (b >= 16 && b <= 23) {
      const prog = ['Am9', 'Fmaj7', 'C', 'G', 'Am9', 'Fmaj7', 'Dm', 'Esus'];
      const i = b - 16, ch = prog[i], [root] = CH[ch];
      if (b === 16) { impact(t, [57, 64, 69, 72], 0.55); }
      pad(t, chordNotes(ch, 60), BAR, 0.05, 900 + i * 120);
      sub(t, root - 12, BAR * 0.9, 0.16);
      // glass: the hook as a slow, high arp
      const notes = chordNotes(ch, 76);
      for (let k = 0; k < 8; k++) arp(t + k * 2 * S, notes[k % notes.length] + (k >= 4 ? 12 : 0), 0.035);
      // half time heartbeat
      kick(t, 0.5); if (i >= 2) kick(t + 10 * S, 0.3);
      if (i >= 4) pattern(t, '........x.......', (tt) => snare(tt, 0.26));
      if (i >= 4) pattern(t, '..x...x...x...x.', (tt) => hat(tt, 0.06, true));
      if (i === 1 || i === 3 || i === 5) play8ths(t, HOOK.slice(0, 8).map(m => (m == null ? null : m)), (tt, m) => lead(tt, m, 2 * S * 0.7, 0.02, { bright: 0.3 }));
      if (b === 22) { for (let k = 0; k < 16; k += 2) snare(t + k * S, 0.08 + k * 0.012); riser(t, BAR * 2, 0.28); }
      if (b === 23) {
        for (let k = 0; k < 16; k++) snare(t + k * S, 0.14 + k * 0.022);
        tomFill(t, 8, 0.35); revCymbal(t + BAR * 0.25, BAR * 0.75, 0.38);
        brass(t + BAR * 0.5, chordNotes('E', 60), BAR * 0.5, 0.05, { attack: BAR * 0.45, bright: 0.8 });
      }
    }

    /* --- 24-31: escalation, the theme in full as a march --- */
    if (b >= 24 && b <= 31) {
      const i = b - 24, ch = THEME_PROG[i], [root] = CH[ch];
      if (i === 0) impact(t, [57, 64, 69, 72, 76], 0.9);
      else if (i === 4) { crash(t, 0.26); boom(t, 0.4); }
      play8ths(t, THEME_MEL[i], (tt, m) => lead(tt, m, 2 * S * 0.92, 0.052, { bright: 1 }));
      play8ths(t, THEME_MEL[i], (tt, m) => lead(tt, m - 12, 2 * S * 0.9, 0.026, { pan: -0.3, bright: 0.6 }));
      play8ths(t, THEME_MEL[i], (tt, m) => lead(tt, m + 12, 2 * S * 0.5, 0.012, { pan: 0.35, bright: 1 }));
      brass(t, chordNotes(ch, 60), BAR * 0.95, 0.03, { attack: 0.03, bright: 0.7 });
      pattern(t, 'x.xxx.xxx.xxx.xx', (tt, c, k) => bassNote(tt, root - 12 + (k === 14 ? 7 : 0), 0.24, true));
      pattern(t, 'x...x...x...x..x', (tt) => kick(tt, 0.75));
      pattern(t, '....x.......x.xx', (tt) => snare(tt, 0.36));
      pattern(t, 'x.x.x.x.x.x.x.x.', (tt, c, k) => hat(tt, 0.1, k % 8 === 6));
      pattern(t, 'xxxxxxxxxxxxxxxx', (tt, c, k) => arp(tt, chordNotes(ch, 72)[k % 3] + (k % 8 >= 4 ? 12 : 0), 0.045));
      if (i % 2 === 1) pattern(t, '........x..x..x.', (tt) => tom(tt, 120, 0.28));
      if (b === 31) { riser(t, BAR, 0.3); revCymbal(t + BAR * 0.5, BAR * 0.5, 0.36); tomFill(t, 8, 0.36); }
    }

    /* --- 32-39: the Iron Sentinel (E phrygian dominant) --- */
    if (b >= 32 && b <= 39) {
      const i = b - 32;
      const roots = [40, 40, 41, 40, 40, 40, 38, 40];   // E E F E | E E D E
      const root = roots[i];
      if (i === 0) { impact(t, [52, 56, 59, 64], 1); }
      if (i === 4) { crash(t, 0.3); boom(t, 0.55); }
      // the game's boss riff bass pattern (SONGS.boss, BASS.riff)
      const riff = [0, null, 1, 0, null, 0, 7, null, 0, null, 1, 0, null, 3, 1, null];
      const PD = [0, 1, 4, 5, 7, 8, 10];
      riff.forEach((d, k) => { if (d == null) return; const semi = PD[d % 7] + Math.floor(d / 7) * 12; bassNote(t + k * S, root - 12 + semi, 0.26, true); });
      pattern(t, 'x...x.x.x...x.xx', (tt) => kick(tt, 0.78));
      pattern(t, '....x.......x...', (tt) => snare(tt, 0.4));
      pattern(t, '.x.x.x.x.x.x.x.x', (tt, c, k) => hat(tt, 0.11, k % 8 === 7));
      pattern(t, '...........x....', (tt) => tom(tt, 130, 0.3));
      const mel = i % 2 === 0 ? BOSS.slice(0, 8) : BOSS.slice(8);
      if (i >= 1) play8ths(t, mel, (tt, m) => lead(tt, m + (i >= 4 ? 12 : 0), 2 * S * 0.9, 0.05, { bright: 1 }));
      if (i >= 4) play8ths(t, mel, (tt, m) => lead(tt, m, 2 * S * 0.9, 0.03, { pan: -0.3, bright: 0.7 }));
      brass(t, [root + 12, root + 16, root + 19].map(m => m + 12), BAR * (i >= 4 ? 0.5 : 0.95), 0.03, { attack: 0.02 });
      if (i >= 4) brass(t + BAR * 0.5, [root + 12, root + 16, root + 19].map(m => m + 12), BAR * 0.45, 0.03, { attack: 0.02 });
      if (i >= 4) pattern(t, 'xxxxxxxxxxxxxxxx', (tt, c, k) => arp(tt, [64, 68, 71, 76][k % 4] + 12, 0.045));
      if (b === 35) tomFill(t, 12, 0.34);
      if (b === 39) { riser(t, BAR, 0.32); revCymbal(t + BAR * 0.5, BAR * 0.5, 0.38); for (let k = 8; k < 16; k++) snare(t + k * S, 0.1 + (k - 8) * 0.035); }
    }

    /* --- 40-43: the duel and the lift (bVI - bVII - I) --- */
    if (b >= 40 && b <= 43) {
      const prog = ['F', 'G', 'F', 'G'], ch = prog[b - 40], [root] = CH[ch];
      if (b === 40) impact(t, chordNotes('F', 60), 0.9);
      if (b === 42) impact(t, chordNotes('F', 60).map(m => m + 12), 1.05);
      crash(t, 0.2);
      const mel = b < 42 ? HOOK2 : HOOK2.map(m => (m == null ? null : m + 2));
      play8ths(t, mel.slice(0, 8), (tt, m) => lead(tt, m, 2 * S * 0.92, 0.055, { bright: 1 }));
      play8ths(t, mel.slice(0, 8), (tt, m) => lead(tt, m - 12, 2 * S * 0.9, 0.03, { pan: -0.3 }));
      brass(t, chordNotes(ch, 60), BAR * 0.95, 0.045, { attack: 0.03 });
      pad(t, chordNotes(ch, 72), BAR, 0.03, 2400);
      pattern(t, 'x.x.x.x.x.x.x.x.', (tt) => bassNote(tt, root - 12, 0.26, true));
      pattern(t, b >= 42 ? 'x.x.x.x.x.x.x.x.' : 'x...x...x...x...', (tt) => kick(tt, 0.78));
      pattern(t, b >= 42 ? '..x...x...x...x.' : '....x.......x...', (tt) => snare(tt, 0.38));
      pattern(t, 'xxxxxxxxxxxxxxxx', (tt, c, k) => hat(tt, k % 2 ? 0.07 : 0.12));
      pattern(t, 'xxxxxxxxxxxxxxxx', (tt, c, k) => arp(tt, chordNotes(ch, 76)[k % 3] + (k % 8 >= 4 ? 12 : 0), 0.05));
      if (b === 43) {
        for (let k = 0; k < 16; k++) snare(t + k * S, 0.12 + k * 0.025);
        tomFill(t, 8, 0.4); riser(t, BAR, 0.34); revCymbal(t + BAR * 0.25, BAR * 0.75, 0.42);
      }
    }

    /* --- 44-49: A major under the title, then the chip hook bookend --- */
    if (b === 44) {
      impact(t, [57, 61, 64, 69, 73], 1.15);
      brass(t, [57, 61, 64, 69], BAR * 3.6, 0.05, { attack: 0.02, bright: 0.8 });
      pad(t, [57, 64, 69, 73, 76], BAR * 4, 0.05, 2000);
      sub(t, 33, BAR * 3.5, 0.2);
      play8ths(t, [81, null, 88, null, 93, 92, 88, null], (tt, m) => lead(tt, m - 12, 2 * S * 0.95, 0.04, { bright: 0.9 }));
    }
    if (b === 45) play8ths(t, [89, 88, 85, null, 88, null, null, null].map(m => (m == null ? null : m - 12)), (tt, m) => lead(tt, m, m === 76 ? BAR * 0.6 : 2 * S * 0.95, 0.04, { bright: 0.8 }));
    if (b >= 46 && b <= 47) {
      // the classic returns: the hook on the chip, quietly, over the end card
      chipLP.frequency.setValueAtTime(5200, t);
      chipOut.gain.setValueAtTime(0.7, t);
      const phrase = b === 46 ? HOOK.slice(0, 8) : HOOK.slice(8);
      play8ths(t, phrase, (tt, m) => chip(tt, m, 2 * S * 0.9, 0.08));
      for (let k = 0; k < 8; k++) chip(t + k * 2 * S, (b === 46 ? 45 : 41) - 12 + (k % 2 ? 12 : 0), 2 * S * 0.8, 0.11, 'triangle');
      pattern(t, '..x...x...x...x.', (tt) => chipNoise(tt, 0.04));
      pad(t, chordNotes(b === 46 ? 'Am' : 'F', 60), BAR, 0.025, 1000);
    }
    if (b === 48) {
      chip(t, 69, BAR * 1.2, 0.08); chip(t, 33, BAR * 1.2, 0.1, 'triangle');
      pad(t, [57, 64, 69, 72], BAR * 2, 0.03, 1200);
      chipOut.gain.setValueAtTime(0.7, t + BAR); chipOut.gain.exponentialRampToValueAtTime(0.0001, t + BAR * 2.2);
    }
  }
}
