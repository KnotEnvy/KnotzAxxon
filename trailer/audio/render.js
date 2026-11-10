// Offline renders for the trailer, in the browser so the game's Web Audio code runs as-is.
//   A.music(seconds, map)     the trailer cue (cue.js) on the game's synth voices (map: the short's bar order)
//   A.sfx(events, frames, ..) replays a shot's logged game-audio calls (sfx-pass.mjs)
import { Audio } from '/src/audio/Audio.js';
import { score } from './cue.js';

const SR = 48000;

export function toWavBase64(buffer) {
  const ch = buffer.numberOfChannels, n = buffer.length, data = [];
  for (let c = 0; c < ch; c++) data.push(buffer.getChannelData(c));
  const bytes = new ArrayBuffer(44 + n * ch * 4), v = new DataView(bytes);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 3, true); v.setUint16(22, ch, true); v.setUint32(24, SR, true);
  v.setUint32(28, SR * ch * 4, true); v.setUint16(32, ch * 4, true); v.setUint16(34, 32, true);
  str(36, 'data'); v.setUint32(40, n * ch * 4, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { v.setFloat32(o, data[c][i], true); o += 4; }
  const u8 = new Uint8Array(bytes); let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

const peakOf = (buf) => { let p = 0; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) p = Math.max(p, Math.abs(d[i])); } return p; };

async function music(seconds, map = null) {
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR);
  const a = new Audio();
  await a.init(ctx);
  // Bypass the game's glue/brick-wall chain: the trailer needs its dynamic arc.
  // A fast, high-threshold peak compressor: catches transients, leaves the arc.
  const peak = ctx.createDynamicsCompressor();
  peak.threshold.value = -5; peak.knee.value = 3; peak.ratio.value = 8; peak.attack.value = 0.002; peak.release.value = 0.12;
  // Trim sub-sonic weight (the game's bass doubles an octave down): headroom for the impacts.
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 32; hp.Q.value = 0.6;
  peak.connect(hp); hp.connect(ctx.destination);
  const out = ctx.createGain(); out.gain.value = 1; out.connect(peak);
  a.musicBus.disconnect(); a.musicBus.gain.value = 1;
  a.musicBus.connect(out); a.musicBus.connect(a.musicSend);
  a.musicSend.gain.value = 0.16;
  a.reverb.disconnect(); a.reverb.connect(out);
  score(a, out, map);
  const buf = await ctx.startRendering();
  return { wav: toWavBase64(buf), peak: peakOf(buf) };
}

// Game sound for one shot: the shot's logged game-audio calls (capture
// harness, frame-stamped while filming) replayed through the game's own
// Audio on an offline clock, one suspend point per video frame, so every
// call lands on the frame it happened. Music is off: the trailer has its own
// score, and the game's musical stingers (sting, jingle) would clash with it.
const SKIP = new Set(['init', 'dispose', 'startMusic', 'stopMusic', 'setIntensity', 'setPaused', 'duckMusic', 'jingle', 'sting']);
async function sfx({ log, frames, env = 'fortress', flavor = null, bossPhase = null, tail = 2 }) {
  const fps = 60;
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * (frames / fps + tail)), SR);
  const a = new Audio();
  await a.init(ctx);
  a._musicOn = false;
  a._bedKind = env; a._bedFlavor = flavor;
  if (a._rooms?.[env]) { a._room = env; a.reverb.buffer = a._rooms[env]; }
  a.startEngine();
  if (bossPhase != null) a.setBossPhase(bossPhase);
  const byFrame = new Map();
  for (const e of log) { if (SKIP.has(e.n)) continue; if (!byFrame.has(e.f)) byFrame.set(e.f, []); byFrame.get(e.f).push(e); }
  const counts = {};
  let k = 0, errors = 0;
  const done = new Promise((resolve, reject) => {
    const step = () => {
      try {
        a._clock = undefined;
        for (const e of byFrame.get(k) ?? []) {
          try { a[e.n](...e.a); counts[e.n] = (counts[e.n] || 0) + 1; } catch (err) { errors++; }
        }
        k++;
        if (k < frames) ctx.suspend((k + 0.25) / fps).then(step);
        ctx.resume();
      } catch (err) { reject(err); }
    };
    ctx.suspend(0.25 / fps).then(step);
    ctx.startRendering().then(resolve, reject);
  });
  const buf = await done;
  return { wav: toWavBase64(buf), peak: peakOf(buf), counts, errors };
}

window.A = { music, sfx, ready: true, SR };
