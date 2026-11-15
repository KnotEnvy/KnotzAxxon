import { test } from 'node:test';
import assert from 'node:assert/strict';
import { El, installDom } from './fixtures/opus-ui-dom.mjs';

const SCREEN_IDS = ['boot', 'title', 'settings', 'over', 'sector', 'pause'];
const IDS = ['settings-list', 'settings-status', 'title-hint', 'sc-num', 'sc-name', 'sc-rhythm', 'sc-desc',
  'over-title', 'over-results', 'btn-continue', 'hud-warn'];
const { nodes, root } = installDom(IDS, { screens: SCREEN_IDS });
const { Screens, storageWritable, engageHint } = await import('../src/ui/Screens.js');
const { HUD, warnTone, fitAltimeter } = await import('../src/ui/HUD.js');
const { settings } = await import('../src/core/Settings.js');

// Every label the game and boss currently raise, with the tone it must carry.
const LABELS = {
  alert: ['MISSILE LAUNCH', 'MISSILE LOCK - ROLL', 'MISSILES INBOUND', 'BARRAGE', 'SENTINEL ENRAGED',
    'COOLANT DISCHARGE', 'ELECTRIC BARRIER', 'HULL SCRAPE', 'HULL BREACH', 'FUEL CRITICAL'],
  notice: ['SENTINEL ENGAGED', 'MISSILE CHARGING', 'LOOP 2 - THREAT ESCALATED', 'LOOP 12 - THREAT ESCALATED'],
  gain: ['CORE EXPOSED', 'ARMOUR BREACHED', 'SENTINEL STAGGERED', 'ENEMY TRACKING BLINDED', 'RACK 3/6'],
};

test('opus-ui: warnings keep red pulsing alerts for damage and threats, steady amber notices, steady green gains', () => {
  for (const [tone, list] of Object.entries(LABELS)) for (const label of list) assert.equal(warnTone(label), tone, label);
  assert.equal(warnTone(undefined), 'alert');
  assert.equal(warnTone('rack 1/6'), 'gain');
});

test('opus-ui: HUD.warn tags the tone without changing text, duration or expiry', () => {
  const warn = nodes['hud-warn'];
  const hud = Object.create(HUD.prototype);
  Object.assign(hud, { warnEl: warn, _warnTimer: 0, warnOn: { set: v => warn.classList.toggle('on', !!v) } });
  hud.warn('CORE EXPOSED', 1.6);
  assert.equal(warn.textContent, 'CORE EXPOSED'); assert.equal(warn.dataset.tone, 'gain'); assert.equal(hud._warnTimer, 1.6);
  hud.warn('MISSILE LOCK - ROLL');
  assert.equal(warn.dataset.tone, 'alert'); assert.equal(hud._warnTimer, 1.6);
  assert.equal(warn.classList.contains('on'), true);
});

const rect = (top, bottom, left, right) => ({ top, bottom, left, right, width: right - left, height: bottom - top });

test('opus-ui: altimeter fits between the right-edge instrument blocks it used to overlap at 1280x720', () => {
  // measured baseline: altimeter 206..495 over a 216px track; radar block from 473; sector block to 105
  const alt = rect(206, 495, 1188, 1264), br = rect(473, 703, 1100, 1264), tr = rect(16, 105, 1046, 1264);
  const fit = fitAltimeter({ alt, track: 216, want: 216, tr, br, viewH: 720 });
  const chrome = alt.height - 216, height = chrome + fit.track;
  assert.ok(fit.centre - height / 2 >= tr.bottom + 10 - 0.5, 'clears the sector block');
  assert.ok(fit.centre + height / 2 <= br.top - 10 + 0.5, 'clears the radar block');
  assert.ok(fit.track <= 216 && fit.track >= 64);
  // a roomy 1080p layout keeps the full track and stays centred
  const roomy = fitAltimeter({ alt: rect(330, 750, 1830, 1896), track: 324, want: 324, tr: rect(25, 140, 1700, 1896), br: rect(800, 1055, 1700, 1896), viewH: 1080 });
  assert.equal(roomy.track, 324); assert.equal(roomy.centre, 540);
});

test('opus-ui: altimeter fitting is a no-op when nothing shares its edge and floors the track on tiny bands', () => {
  const alt = rect(110, 280, 765, 830);
  assert.equal(fitAltimeter({ alt, track: 100, want: 100, tr: rect(10, 77, 500, 740), br: rect(177, 265, 520, 744), viewH: 390 }), null);
  const cramped = fitAltimeter({ alt, track: 100, want: 100, tr: rect(10, 200, 700, 830), br: rect(240, 380, 700, 830), viewH: 390 });
  assert.equal(cramped.track, 64);
  assert.ok(cramped.centre - (70 + 64) / 2 >= 210 - 0.5, 'top-anchored under the upper block rather than above the screen');
});

test('opus-ui: title prompt follows the device in hand and keeps a shared fortress code', () => {
  const base = 'ENTER / CLICK TO ENGAGE', shared = 'SHARED FORTRESS 4F9K2A // ENTER TO ENGAGE';
  assert.equal(engageHint(base, 'keyboard'), base);
  assert.equal(engageHint(base, 'mouse'), base);
  assert.equal(engageHint(base, 'gamepad'), 'PRESS A TO ENGAGE');
  assert.equal(engageHint(base, 'keyboard', true), 'TAP ENGAGE TO LAUNCH');
  assert.equal(engageHint(base, 'gamepad', true), 'PRESS A TO ENGAGE');
  assert.equal(engageHint(shared, 'gamepad'), 'SHARED FORTRESS 4F9K2A // PRESS A TO ENGAGE');
  assert.equal(engageHint(shared, 'touch'), 'SHARED FORTRESS 4F9K2A // TAP ENGAGE TO LAUNCH');
});

test('opus-ui: device prompt updates only on a device change, even while no menu is open', () => {
  const screens = new Screens();
  const hint = nodes['title-hint']; hint.textContent = 'ENTER / CLICK TO ENGAGE';
  screens.hide();
  const input = { lastDevice: 'gamepad', _padDown: new Set(), justPressed: () => false };
  screens.updateGamepad(input, 1 / 60);
  assert.equal(hint.textContent, 'PRESS A TO ENGAGE');
  const writes = hint.textWrites;
  for (let i = 0; i < 30; i++) screens.updateGamepad(input, 1 / 60);
  assert.equal(hint.textWrites, writes, 'no per-frame DOM writes');
  input.lastDevice = 'keyboard'; screens.updateGamepad(input, 1 / 60);
  assert.equal(hint.textContent, 'ENTER / CLICK TO ENGAGE');
  screens.dispose();
});

test('opus-ui: SYSTEMS reports where a change went, and says so when storage is blocked', () => {
  const screens = new Screens();
  const status = nodes['settings-status'];
  screens.show('settings');
  assert.equal(status.textContent, 'CHANGES SAVE ON THIS DEVICE');
  settings.set('camera', settings.get('camera') === 'chase' ? 'modern' : 'chase');
  assert.match(status.textContent, /^CAMERA RIG (CHASE|MODERN 20) · SAVED ON THIS DEVICE$/);
  assert.equal(status.classList.contains('changed'), true);

  const storage = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
  try {
    assert.equal(storageWritable(), false);
    settings.set('shake', 0.5);
    assert.equal(status.textContent, 'SCREEN SHAKE 33% · THIS SESSION ONLY: BROWSER STORAGE UNAVAILABLE');
    assert.equal(status.classList.contains('session'), true);
    screens.show('settings');
    assert.equal(status.textContent, 'BROWSER STORAGE UNAVAILABLE: CHANGES LAST THIS SESSION');
  } finally { globalThis.localStorage = storage; }

  // changes made elsewhere (e.g. the perf hotkey in flight) do not rewrite a hidden panel
  screens.hide(); const before = status.textContent; settings.set('perf', !settings.get('perf'));
  assert.equal(status.textContent, before);
  screens.dispose();
  const after = status.textContent; settings.set('perf', !settings.get('perf'));
  assert.equal(status.textContent, after, 'disposed screens stop listening');
});

test('opus-ui: warnings dock under an active sector card and release when it ends or a menu takes over', async () => {
  const screens = new Screens();
  const card = new El('card', { rect: { top: 84, bottom: 236, left: 300, right: 980, width: 680, height: 152 } });
  nodes['screen-sector']._query = { '.sector-card': card };
  screens.hide();
  screens.sectorCard({ index: 0, name: 'OUTER FORTRESS', rhythm: 'LEARN THE RUN', brief: 'x' }, 0.02);
  assert.equal(root.classList.contains('sector-card-on'), true);
  assert.equal(root.style['--card-bottom'], '236px');
  await new Promise(r => setTimeout(r, 40));
  assert.equal(root.classList.contains('sector-card-on'), false);
  assert.equal(nodes['screen-sector'].classList.contains('is-active'), false);

  screens.sectorCard({ index: 1, name: 'B', sub: 'y' }, 30);
  screens.show('pause');
  assert.equal(root.classList.contains('sector-card-on'), false, 'pause releases the dock and its timer');
  screens.sectorCard({ index: 1, name: 'B', sub: 'y' }, 30);
  screens.dispose();
  assert.equal(root.classList.contains('sector-card-on'), false);
});

test('opus-ui: results grade chips name every sector for assistive tech and mark ungraded ones', () => {
  const screens = new Screens();
  screens.results({ title: 'MISSION FAILED', rank: -1, rows: [{ label: 'SECTOR GRADES', chips: ['S', 'A', undefined] }] });
  const html = nodes['over-results'].innerHTML;
  assert.match(html, /role="list"/);
  assert.match(html, /aria-label="Sector 1: grade S"/);
  assert.match(html, /aria-label="Sector 3: not graded"/);
  assert.match(html, /<small aria-hidden="true">2<\/small><b aria-hidden="true">A<\/b>/);
  assert.doesNotMatch(html, /title="Sector/);
  screens.dispose();
});

test('opus-ui: a window too short for both right-edge blocks reports no fit so the weapons block can step aside', () => {
  // 1280x440 desktop: sector block to 105, radar block from 193, altimeter chrome ~85 px
  const fit = fitAltimeter({ alt: rect(120, 320, 1188, 1264), track: 115, want: 115, tr: rect(16, 105, 1046, 1264), br: rect(193, 423, 1100, 1264), viewH: 440 });
  assert.equal(fit.fits, false); assert.equal(fit.sharesBr, true);
  // once the block has moved left of the column only the upper block constrains it, and it fits
  const moved = fitAltimeter({ alt: rect(120, 320, 1188, 1264), track: 115, want: 115, tr: rect(16, 105, 1046, 1264), br: rect(193, 423, 1012, 1176), viewH: 440 });
  assert.equal(moved.fits, true); assert.equal(moved.track, 115);
  assert.ok(moved.centre - 100 >= 115 - 0.5);
});

test('opus-ui: the sector grade banner pushes warnings beneath it and releases them on expiry, dismissal and reset', () => {
  const hud = new HUD();   // fake DOM: missing instruments are tolerated, as in production
  const root = hud.root = new El('hud');
  hud.gradeEl = new El('hud-grade', { rect: { top: 72, bottom: 150, left: 500, right: 780, width: 280, height: 78 } });
  hud.grade('A', 'SECTOR 02 CLEAR', '14/16', 0.5);
  assert.equal(root.classList.contains('grade-on'), true);
  assert.equal(root.style['--grade-bottom'], '158px', 'measured mid-entrance, compensated for the 8px slide');
  hud.dismissGrade(); assert.equal(root.classList.contains('grade-on'), false);

  const state = { score: 0, best: 0, chain: 0, chainMult: 1, chainTime: 0, sectorLabel: 'SECTOR 01', sectorSub: 'X', sectorIndex: 0,
    progress: 0, fuel: 1, hull: 3, hullMax: 3, heat: 0, overheated: false, boost: 1, weapon: 'PULSE ARRAY', altitude: 8, shields: 0 };
  hud.grade('S', 'x', 'y', 0.5);
  hud.update(state, 0.3); assert.equal(root.classList.contains('grade-on'), true);
  hud.update(state, 0.3); assert.equal(root.classList.contains('grade-on'), false, 'expiry releases the warning');
  hud.grade('B', 'x', 'y', 5); hud.reset();
  assert.equal(root.classList.contains('grade-on'), false, 'reset releases the warning');
  hud.dispose();
});
