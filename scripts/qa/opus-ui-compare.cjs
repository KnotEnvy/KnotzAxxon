/**
 * Compose labelled before/after devlog comparisons from audit captures (plain HTML,
 * no WebGL). The source frames are SwiftShader software captures.
 *
 *   kz-pw node scripts/qa/opus-ui-compare.cjs <pairs.json> <outdir>
 *   pairs.json: [{ "name", "title", "note", "before", "after" }]   (absolute PNG paths)
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.KZ_PLAYWRIGHT_PATH || 'playwright');
const [pairsFile, out] = process.argv.slice(2);
const pairs = JSON.parse(fs.readFileSync(pairsFile, 'utf8'));
fs.mkdirSync(out, { recursive: true });
const uri = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
const esc = (s) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.KZ_CHROME || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    for (const p of pairs) {
      await page.setContent(`<!doctype html><meta charset="utf-8"><style>
        body{margin:0;background:#04070c;color:#d8f0ff;font:14px "DejaVu Sans Mono",monospace;padding:18px 22px}
        h1{font-size:18px;letter-spacing:.12em;margin:0 0 4px} p{margin:0 0 14px;color:#9fbccc;font-size:13px}
        .row{display:flex;gap:16px;align-items:flex-start} figure{margin:0;flex:1} img{width:100%;display:block;border:1px solid #1d3a48}
        figcaption{font-size:12px;letter-spacing:.2em;margin:0 0 6px;color:#ffc46b} figure+figure figcaption{color:#8dffc1}
        footer{margin-top:10px;font-size:11px;color:#6f8fa0}</style>
        <h1>${esc(p.title)}</h1><p>${esc(p.note)}</p>
        <div class="row"><figure><figcaption>BEFORE</figcaption><img src="${uri(p.before)}"></figure>
        <figure><figcaption>AFTER</figcaption><img src="${uri(p.after)}"></figure></div>
        <footer>Headless Chromium, SwiftShader software WebGL. Layout/legibility evidence only, not a frame-rate measurement.</footer>`);
      await page.waitForFunction(() => [...document.images].every(i => i.complete));
      const h = await page.evaluate(() => Math.ceil(document.body.getBoundingClientRect().bottom + 18));
      await page.setViewportSize({ width: 1600, height: h });
      await page.screenshot({ path: path.join(out, p.name + '.png'), timeout: 120000 });
      console.log('wrote', p.name);
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
