/**
 * Renders the launch compositions in assets-source/launch-marketing/ to PNG and
 * writes export-manifest.json (dimensions, bytes, sha256, source frame and its
 * capture facts). Static HTML only: no WebGL, so the Linux headless shell runs
 * it with the GPU disabled. Still a browser launch: take the GPU reservation
 * when the coordination protocol requires one.
 *
 *   kz-pw node scripts/brand/launch/compose.cjs [--only id,id]
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require(process.env.KZ_PLAYWRIGHT_PATH || 'playwright');

const ROOT = path.resolve(__dirname, '../../..');
const SRC = path.join(ROOT, 'assets-source/launch-marketing');
const spec = JSON.parse(fs.readFileSync(path.join(SRC, 'compositions.json'), 'utf8'));
const EVIDENCE = process.env.KZ_COMPOSE_EVIDENCE || null;
if (EVIDENCE) fs.mkdirSync(EVIDENCE, { recursive: true });
const only = (process.argv.find(a => a.startsWith('--only='))?.slice(7) ?? '').split(',').filter(Boolean);
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
/** Width and height straight from the PNG header. */
const pngSize = file => { const b = fs.readFileSync(file); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
  const records = [];
  try {
    for (const o of spec.outputs) {
      if (only.length && !only.includes(o.id)) continue;
      const [w, h] = o.size;
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      await page.goto('file://' + path.join(SRC, spec.template));
      const frame = o.frame ? spec.frames[o.frame] : null;
      await page.evaluate(({ o, frameUrl, w, h }) => {
        const root = document.documentElement.style;
        root.setProperty('--w', `${w}px`); root.setProperty('--h', `${h}px`); root.setProperty('--s', String(w / 1200));
        if (o.focus) { root.setProperty('--focus-x', o.focus[0]); root.setProperty('--focus-y', o.focus[1]); }
        document.body.className = [o.layout, o.transparent ? 'transparent' : ''].join(' ').trim();
        document.documentElement.classList.toggle('transparent', !!o.transparent);
        const img = document.querySelector('[data-bind="frame"]');
        if (frameUrl) {
          img.src = frameUrl;
          // inset first: setting it after left/top would reset them.
          if (o.place) Object.assign(img.style, { inset: 'auto', width: `${1920 * o.place.scale}px`, height: `${1080 * o.place.scale}px`,
            left: `${o.place.left}px`, top: `${o.place.top}px`, objectFit: 'fill',
            ...(o.place.fadeLeft ? { maskImage: 'linear-gradient(90deg, transparent, #000 22%)', webkitMaskImage: 'linear-gradient(90deg, transparent, #000 22%)' } : {}) });
        } else { img.remove(); document.querySelector('.scrim')?.remove(); }
        for (const el of document.querySelectorAll('[data-show]')) el.hidden = !(o.show ?? []).includes(el.dataset.show);
        for (const el of document.querySelectorAll('[data-bind]')) if (el.dataset.bind !== 'frame' && o[el.dataset.bind] != null) el.textContent = o[el.dataset.bind];
      }, { o, frameUrl: frame ? 'file://' + path.join(SRC, frame.file) : null, w, h });
      await page.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map(i => i.decode())]));
      if (o.place) {
        const r = await page.evaluate(() => { const b = document.querySelector('.frame').getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; });
        if (r[0] > (o.place.fadeLeft ? w : 0.5) || r[1] > 0.5 || r[2] < w - 0.5 || r[3] < h - 0.5) throw Error(`${o.id}: placed frame ${r} does not cover ${w}x${h}`);
        if (o.place.scale * 1080 > (frame.drawing_buffer?.[1] ?? 1080)) throw Error(`${o.id}: placement would upscale the source buffer`);
      }
      const overflow = await page.evaluate(() => [...document.querySelectorAll('.copy > *:not([hidden])')]
        .filter(n => { const r = n.getBoundingClientRect(); return r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5 || r.left < -0.5; })
        .map(n => n.className));
      const fonts = await page.evaluate(() => getComputedStyle(document.querySelector('.wordmark')).fontFamily);
      for (const rel of o.out) {
        const file = path.join(ROOT, rel);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        await page.screenshot({ path: file, type: 'png', omitBackground: !!o.transparent, clip: { x: 0, y: 0, width: w, height: h } });
        const bytes = fs.statSync(file).size, dims = pngSize(file);
        if (dims[0] !== w || dims[1] !== h) throw Error(`${rel}: ${dims} != ${w}x${h}`);
        if (o.transparent && fs.readFileSync(file)[25] !== 6) throw Error(`${rel}: expected an RGBA PNG for a transparent export`);
        if (o.maxBytes && bytes > o.maxBytes) throw Error(`${rel}: ${bytes} bytes exceeds ${o.maxBytes}`);
        if (overflow.length) throw Error(`${rel}: copy overflows the canvas (${overflow})`);
        records.push({ id: o.id, file: rel, width: w, height: h, format: 'png', bytes, sha256: sha(file), spec: o.spec,
          transparent: !!o.transparent, source_frame: frame ? { key: o.frame, file: path.join('assets-source/launch-marketing', frame.file),
            sha256: sha(path.join(SRC, frame.file)), native_viewport: frame.viewport, drawing_buffer: frame.drawing_buffer,
            renderer: frame.renderer, render_class: frame.render_class, staging: frame.staging } : null,
          scaling: frame ? `downscaled from a ${frame.drawing_buffer.join('x')} drawing buffer` : 'type only', font_stack: fonts });
        console.log(`wrote ${rel} ${w}x${h} ${bytes}B`);
        // Inspection previews (e.g. itch's 315x250 thumbnail): the export itself, scaled, kept outside the repo.
        for (const [pw, ph] of (EVIDENCE ? o.previews ?? [] : [])) {
          const preview = await browser.newPage({ viewport: { width: pw, height: ph }, deviceScaleFactor: 1 });
          await preview.setContent(`<body style="margin:0;background:#888"><img src="data:image/png;base64,${fs.readFileSync(file).toString('base64')}" style="display:block;width:${pw}px;height:${ph}px;object-fit:cover"></body>`);
          await preview.evaluate(() => document.images[0].decode());
          const target = path.join(EVIDENCE, `${o.id}-preview-${pw}x${ph}.png`);
          await preview.screenshot({ path: target, type: 'png' }); await preview.close();
          console.log(`preview ${target}`);
        }
      }
      await page.close();
    }
  } finally { await browser.close(); }
  const manifestFile = path.join(SRC, 'export-manifest.json');
  const previous = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : { exports: [] };
  const merged = [...previous.exports.filter(e => !records.some(r => r.file === e.file)), ...records];
  fs.writeFileSync(manifestFile, JSON.stringify({ schema: 'knotzaxxon.launch-export-manifest.v1', generated_at: new Date().toISOString(),
    composer: 'scripts/brand/launch/compose.cjs', compositor: 'Chromium headless shell, --disable-gpu (static HTML; no WebGL)',
    print: 'Screen RGB only. No CMYK, bleed or print profile is claimed.',
    font_resolution: process.env.KZ_COMPOSE_FONT_NOTE || 'Linux headless shell via kz-pw uses a private fontconfig with DejaVu and Liberation only, so this stack resolves to DejaVu Sans Mono; the in-game title on Windows/macOS uses Cascadia Mono, SF Mono, Menlo or Consolas where installed.', exports: merged }, null, 2) + '\n');
})().catch(e => { console.error(e.stack ?? e); process.exitCode = 1; });
