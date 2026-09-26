/**
 * Offline audio audition: renders the synthesised score and effects through
 * the game's real mix bus into an OfflineAudioContext, then saves
 *   - audition.wav        (16-bit stereo, for listening)
 *   - audition-spectrum.png (spectrogram with labelled event markers)
 *   - audition.json        (per-segment loudness and the duck depth)
 *
 *   KZ_PLAYWRIGHT_PATH=... KZ_TEST_URL=http://localhost:5177 KZ_OUT=artifacts/audio node artifacts/audio-render.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.KZ_PLAYWRIGHT_PATH || 'playwright');

const OUT = process.env.KZ_OUT || 'artifacts/audio';
const URL = process.env.KZ_TEST_URL || 'http://localhost:5177';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(URL);
    await page.waitForFunction(() => window.KZ, { timeout: 90000 });
    const result = await page.evaluate(async () => {
      const { Audio } = await import('/src/audio/Audio.js');
      const RATE = 44100, SECONDS = 32;
      const ctx = new OfflineAudioContext(2, RATE * SECONDS, RATE);
      const a = new Audio();
      await a.init(ctx);
      const events = [];
      const mark = (t, label) => events.push({ t, label });

      // --- score: sector 1 song, A then B section with a fill, intensity ramp
      a._musicOn = true; a._mood = 'combat';
      a._setSong('s0');
      let t = 0.1, step = 0;
      const spb = () => 60 / a._bpm / 4;
      while (t < 20) {
        const bar = Math.floor(step / 16);
        a._intensity = Math.min(1, 0.3 + bar * 0.08);
        a._playStep(step, t); t += spb(); step++;
      }
      mark(0.1, 'SECTOR 1 SONG (A)');
      mark(0.1 + 8 * 16 * (60 / 126 / 4), 'B SECTION + LEAD');
      // --- then the boss riff
      a._setSong('boss'); a._mood = 'boss'; step = 0; mark(t, 'BOSS RIFF');
      while (t < SECONDS - 1.5) { a._intensity = 1; a._playStep(step, t); t += spb(); step++; }

      // --- effects over the music
      const fx = [
        [1.0, 'LASER x4', () => { for (let k = 0; k < 4; k++) { a.at(1.0 + k * 0.115); a.laser(k % 2 ? 0.22 : -0.22); } }],
        [2.2, 'TURRET FIRE (far)', () => a.at(2.2).enemyShot(0.3, 70, 'turret')],
        [2.6, 'TURRET FIRE (near)', () => a.at(2.6).enemyShot(-0.3, 8, 'heavy')],
        [3.2, 'EXPLOSION + DUCK', () => a.at(3.2).explosion(1.7, 0.2, 20)],
        [4.6, 'FUEL WHOOMP', () => a.at(4.6).fuelBoom(-0.3, 15)],
        [5.4, 'PICKUP FUEL', () => a.at(5.4).pickup(2, 'fuel')],
        [6.2, 'WALL PASS (tight)', () => a.at(6.2).pass(0.9, 0.2)],
        [6.4, 'THREAD BONUS', () => a.at(6.4).bonus(2)],
        [7.4, 'LOCK TICK', () => a.at(7.4).lockTick()],
        [8.2, 'BARREL ROLL', () => a.at(8.2).roll(1)],
        [9.2, 'FLY-BY', () => a.at(9.2).flyby(0.6)],
        [10.2, 'OVERHEAT', () => a.at(10.2).overheat()],
        [11.3, 'COOLED', () => a.at(11.3).cooled()],
        [12.0, 'MINE ARM', () => a.at(12.0).mineArm(-0.4)],
        [12.8, 'RADAR DOWN', () => a.at(12.8).radarDown(0.2)],
        [14.4, 'LOW FUEL', () => { a.at(14.4).lowFuel(false); a.at(15.4).lowFuel(true); }],
        [16.4, 'SHIELD HIT', () => a.at(16.4).shield(0)],
        [17.4, 'HULL HIT', () => a.at(17.4).hurt()],
        [18.6, 'CHAIN x4 / x8', () => { a.at(18.6).chain(4); a.at(19.0).chain(8); }],
        [20.4, 'BOSS ROAR', () => a.at(20.4).roar()],
        [22.4, 'SERVO + CHARGE', () => { a.at(22.4).servo(0.3, true); a.at(23.0).charge(2.4); }],
        [25.6, 'LAUNCHER BLAST', () => a.at(25.6).explosion(2.4, 0.3, 30)],
        [27.4, 'SECTOR CLEAR + GRADE', () => { a.at(27.4).jingle('clear'); a.at(28.0).jingle('grade'); }],
        [29.2, 'VICTORY', () => a.at(29.2).jingle('victory')],
      ];
      for (const [time, label, run] of fx) { run(); mark(time, label); }

      const buffer = await ctx.startRendering();
      const L = buffer.getChannelData(0), R = buffer.getChannelData(1);

      // --- stats: peak, RMS per second, duck depth around the 3.2 s blast
      let peak = 0;
      for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
      const rmsAt = (t0, t1) => {
        let s = 0, n = 0;
        for (let i = Math.floor(t0 * RATE); i < Math.floor(t1 * RATE); i++) { s += L[i] * L[i] + R[i] * R[i]; n += 2; }
        return 20 * Math.log10(Math.sqrt(s / n) + 1e-9);
      };
      const perSecond = [];
      for (let s = 0; s < SECONDS - 1; s++) perSecond.push(+rmsAt(s, s + 1).toFixed(1));

      // --- WAV
      const wav = new DataView(new ArrayBuffer(44 + L.length * 4));
      const str = (o, s) => { for (let i = 0; i < s.length; i++) wav.setUint8(o + i, s.charCodeAt(i)); };
      str(0, 'RIFF'); wav.setUint32(4, 36 + L.length * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
      wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 2, true);
      wav.setUint32(24, RATE, true); wav.setUint32(28, RATE * 4, true); wav.setUint16(32, 4, true); wav.setUint16(34, 16, true);
      str(36, 'data'); wav.setUint32(40, L.length * 4, true);
      for (let i = 0; i < L.length; i++) {
        wav.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true);
        wav.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true);
      }
      const bytes = new Uint8Array(wav.buffer);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      const wavB64 = btoa(bin);

      // --- spectrogram (mono mix, 2048-point FFT, log frequency axis)
      const W = 1400, H = 520, top = 30, plotH = 380;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d');
      g.fillStyle = '#05080e'; g.fillRect(0, 0, W, H);
      const N = 2048, cols = W;
      const hop = Math.floor((L.length - N) / cols);
      const re = new Float32Array(N), im = new Float32Array(N);
      const fft = () => {
        for (let i = 1, j = 0; i < N; i++) {
          let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
          if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
        }
        for (let len = 2; len <= N; len <<= 1) {
          const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
          for (let i = 0; i < N; i += len) {
            let cr = 1, ci = 0;
            for (let k = 0; k < len / 2; k++) {
              const ur = re[i + k], ui = im[i + k];
              const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
              const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
              re[i + k] = ur + vr; im[i + k] = ui + vi;
              re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
              const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
            }
          }
        }
      };
      const img = g.createImageData(cols, plotH);
      const fMin = 30, fMax = 16000;
      for (let x = 0; x < cols; x++) {
        const o = x * hop;
        for (let i = 0; i < N; i++) {
          const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
          re[i] = (L[o + i] + R[o + i]) * 0.5 * w; im[i] = 0;
        }
        fft();
        for (let y = 0; y < plotH; y++) {
          const f = fMin * Math.pow(fMax / fMin, 1 - y / plotH);
          const bin = Math.min(N / 2 - 1, Math.round(f / RATE * N));
          const db = 20 * Math.log10(Math.hypot(re[bin], im[bin]) + 1e-9);
          const v = Math.max(0, Math.min(1, (db + 20) / 70));
          const p = (y * cols + x) * 4;
          img.data[p] = 255 * Math.min(1, v * 1.8);
          img.data[p + 1] = 255 * Math.max(0, v * 1.6 - 0.45);
          img.data[p + 2] = 255 * Math.max(0, 0.55 - Math.abs(v - 0.35)) * 1.6;
          img.data[p + 3] = 255;
        }
      }
      g.putImageData(img, 0, top);
      g.font = '12px monospace'; g.fillStyle = '#9fb4c8';
      g.fillText('KNOTZAXXON audio audition - spectrogram (log frequency 30 Hz - 16 kHz), per-second RMS below', 8, 18);
      for (const f of [60, 250, 1000, 4000, 12000]) {
        const y = top + plotH * (1 - Math.log(f / fMin) / Math.log(fMax / fMin));
        g.fillStyle = '#ffffff55'; g.fillRect(0, y, 6, 1); g.fillStyle = '#9fb4c8'; g.fillText(f >= 1000 ? f / 1000 + 'k' : String(f), 8, y + 4);
      }
      events.forEach((e, i) => {
        const x = e.t / SECONDS * W;
        g.fillStyle = '#ffd27a'; g.fillRect(x, top, 1, plotH);
        g.save(); g.translate(x + 3, top + 6 + (i % 3) * 0); g.rotate(Math.PI / 2);
        g.fillStyle = '#ffe2a8'; g.fillText(e.label, 0, 0); g.restore();
      });
      // loudness strip
      perSecond.forEach((db, s) => {
        const x = s / SECONDS * W, h = Math.max(1, (db + 40) * 2);
        g.fillStyle = '#45e0ff'; g.fillRect(x + 2, H - 8 - h, W / SECONDS - 4, h);
        g.fillStyle = '#9fb4c8'; g.fillText(db.toFixed(0), x + 4, H - 10 - h);
      });
      const pngB64 = c.toDataURL('image/png').split(',')[1];
      return {
        wavB64, pngB64,
        stats: {
          seconds: SECONDS, peakDbfs: +(20 * Math.log10(peak)).toFixed(2),
          rmsPerSecondDb: perSecond,
          musicBeforeBlastDb: +rmsAt(2.7, 3.15).toFixed(1),
          mixDuringBlastDb: +rmsAt(3.25, 3.7).toFixed(1),
          events,
        },
      };
    });
    fs.writeFileSync(path.join(OUT, 'audition.wav'), Buffer.from(result.wavB64, 'base64'));
    fs.writeFileSync(path.join(OUT, 'audition-spectrum.png'), Buffer.from(result.pngB64, 'base64'));
    fs.writeFileSync(path.join(OUT, 'audition.json'), JSON.stringify({ ...result.stats, errors }, null, 2));
    console.log(JSON.stringify({ ...result.stats, events: result.stats.events.length, errors }, null, 2));
    if (errors.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
