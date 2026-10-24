/**
 * Link-preview art: renders the social/share card and app icons from a clean
 * frame of the running game, so the art always matches the shipped visuals.
 *
 *   KZ_TEST_URL=http://localhost:5173/ node scripts/brand/render-link-art.cjs
 *
 * Writes PNGs into public/ (copied verbatim to the site root by Vite):
 *   og-image.png          1200x630  Open Graph / Twitter / Discord / Slack cards
 *   social-preview.png    1280x640  GitHub repository social preview upload
 *   apple-touch-icon.png  180x180   iOS home-screen icon
 *   icon-512.png          512x512   Android / PWA-sized icon
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.KZ_PLAYWRIGHT_PATH || 'playwright');

const URL = process.env.KZ_TEST_URL || 'http://localhost:5173/';
const OUT = path.join(__dirname, '..', '..', 'public');

const PALETTE = { bg: '#04070c', ink: '#d8f0ff', dim: '#8fb0c6', cyan: '#45e0ff', hot: '#a8f4ff', amber: '#ffb43a' };
const MONO = 'ui-monospace, "Cascadia Mono", "SF Mono", "Roboto Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';
const SITE = 'knotenvy.github.io/KnotzAxxon';

/** Same diamond emblem as the inline favicon in index.html. */
const EMBLEM = `
<svg viewBox="0 0 32 32" width="100%" height="100%" aria-hidden="true">
  <rect width="32" height="32" fill="${PALETTE.bg}"/>
  <path d="M16 4 28 16 16 28 4 16Z" fill="none" stroke="${PALETTE.cyan}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M16 11 21 16 16 21 11 16Z" fill="${PALETTE.amber}"/>
</svg>`;

function cardHtml(background, width, height) {
  const scale = width / 1200;
  const pad = Math.round(72 * scale);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:${PALETTE.bg};font-family:${MONO}}
    .scene{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center}
    .shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(4,7,12,.94) 0%,rgba(4,7,12,.78) 42%,rgba(4,7,12,.12) 80%),
      linear-gradient(0deg,rgba(4,7,12,.85) 0%,rgba(4,7,12,0) 30%)}
    .copy{position:absolute;left:${pad}px;top:${Math.round(96 * scale)}px;right:${pad}px;bottom:${pad}px;display:flex;flex-direction:column}
    .kicker{color:${PALETTE.amber};font-size:${Math.round(20 * scale)}px;letter-spacing:.3em;text-transform:uppercase}
    h1{margin:${Math.round(18 * scale)}px 0 0;color:#fff;font-size:${Math.round(128 * scale)}px;line-height:.95;font-weight:800;letter-spacing:-.01em;
      text-shadow:0 0 ${Math.round(28 * scale)}px rgba(69,224,255,.55),0 0 ${Math.round(6 * scale)}px rgba(69,224,255,.35)}
    .sub{margin-top:${Math.round(18 * scale)}px;color:${PALETTE.cyan};font-size:${Math.round(29 * scale)}px;letter-spacing:.24em;text-transform:uppercase}
    .rule{margin-top:${Math.round(26 * scale)}px;width:${Math.round(480 * scale)}px;height:2px;background:linear-gradient(90deg,${PALETTE.cyan},rgba(69,224,255,0))}
    .tag{margin-top:${Math.round(24 * scale)}px;color:${PALETTE.ink};font-size:${Math.round(27 * scale)}px;line-height:1.5}
    .tag span{color:${PALETTE.dim}}
    .foot{margin-top:auto;display:flex;align-items:center;gap:${Math.round(22 * scale)}px}
    .pill{border:2px solid ${PALETTE.amber};color:${PALETTE.amber};padding:${Math.round(10 * scale)}px ${Math.round(22 * scale)}px;font-size:${Math.round(20 * scale)}px;letter-spacing:.2em;text-transform:uppercase}
    .site{color:${PALETTE.dim};font-size:${Math.round(19 * scale)}px;letter-spacing:.06em}
  </style></head><body>
    <img class="scene" alt="" src="${background}"><div class="shade"></div>
    <div class="copy">
      <div class="kicker">Knotz Interactive / Flight Division</div>
      <h1>KNOTZAXXON</h1>
      <div class="sub">Assault on the Iron Fortress</div>
      <div class="rule"></div>
      <div class="tag">A 3D isometric rail shooter. Eight hostile sectors.<br><span>Match altitude. Read your shadow. Break the fortress.</span></div>
      <div class="foot"><div class="pill">Play in browser</div><div class="site">${SITE}</div></div>
    </div>
  </body></html>`;
}

function iconHtml(size) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;width:${size}px;height:${size}px;overflow:hidden;background:${PALETTE.bg}}
    svg{display:block;width:${size}px;height:${size}px}
  </style></head><body>${EMBLEM}</body></html>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
  });
  try {
    // 1. A clean frame of the title scene: hide every UI layer, keep the 3D playfield.
    const game = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await game.addInitScript(() => localStorage.setItem('knotzaxxon.settings.v2', JSON.stringify({ quality: 'high', camera: 'classic', shake: 0 })));
    await game.goto(URL);
    await game.waitForFunction(() => window.KZ && KZ.game, { timeout: 120000 });
    await game.addStyleTag({ content: '.screen,#hud,.hud,.boot,#boot{display:none!important}' });
    await game.waitForTimeout(4000);
    const frame = await game.screenshot({ type: 'png' });
    await game.close();
    const background = `data:image/png;base64,${frame.toString('base64')}`;

    // 2. Compose the cards and icons from the same frame and palette.
    const card = await browser.newPage({ deviceScaleFactor: 1 });
    const targets = [
      { file: 'og-image.png', width: 1200, height: 630, html: () => cardHtml(background, 1200, 630) },
      { file: 'social-preview.png', width: 1280, height: 640, html: () => cardHtml(background, 1280, 640) },
      { file: 'apple-touch-icon.png', width: 180, height: 180, html: () => iconHtml(180) },
      { file: 'icon-512.png', width: 512, height: 512, html: () => iconHtml(512) },
    ];
    for (const t of targets) {
      await card.setViewportSize({ width: t.width, height: t.height });
      await card.setContent(t.html(), { waitUntil: 'load' });
      await card.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map(img => img.decode())]));
      await card.screenshot({ path: path.join(OUT, t.file), type: 'png', clip: { x: 0, y: 0, width: t.width, height: t.height } });
      console.log(`wrote public/${t.file} (${t.width}x${t.height})`);
    }
    await card.close();
  } finally {
    await browser.close();
  }
})().catch(err => {
  console.error('render-link-art failed:', err.message);
  process.exit(1);
});
