/**
 * Writes a capture.cjs plan that checks the results screen on short and
 * portrait viewports, before (base) and after (patched) a UI change.
 *
 *   node scripts/brand/launch/results-plan.cjs <out.json> <baseUrl> <patchedUrl>
 *
 * Per viewport and outcome (victory with a new record, defeat) it opens the real
 * results through Game._finish. That call is staging, not gameplay, and is
 * labelled so. It then measures:
 *   - heading, summary and total: in view and actually on top (elementFromPoint);
 *   - every action: in view and unobstructed; the focused element; scroll state;
 *   - a keyboard walk (Arrow keys), and the gamepad path through Screens.handleControl;
 *   - wheel scrolling of the panel, with the sticky actions still reachable;
 *   - leaving for flight (Enter or tap on RE-ENGAGE): the results opacity 60 ms
 *     and 200 ms later, plus a screenshot, to show no panel lingers over the run.
 */
const fs = require('node:fs');
const [out, baseUrl, patchedUrl] = process.argv.slice(2);
if (!out || !baseUrl || !patchedUrl) throw Error('usage: results-plan.cjs <out.json> <baseUrl> <patchedUrl>');

const LAYOUT = String(() => {
  const vh = innerHeight, vw = innerWidth;
  const probe = (el) => {
    if (!el || el.offsetParent === null) return null;
    const r = el.getBoundingClientRect();
    const x = Math.min(vw - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(vh - 1, Math.max(0, r.top + r.height / 2));
    const top = document.elementFromPoint(x, y);
    return { text: (el.textContent || el.value || '').trim().slice(0, 48), top: Math.round(r.top), bottom: Math.round(r.bottom),
      inView: r.top >= -0.5 && r.bottom <= vh + 0.5 && r.left >= -0.5 && r.right <= vw + 0.5,
      unobstructed: !!top && (el === top || el.contains(top)) };
  };
  const panel = document.querySelector('#screen-over .panel');
  return {
    viewport: [vw, vh], scrollWidth: document.documentElement.scrollWidth,
    outcome: document.getElementById('screen-over')?.dataset.outcome ?? null,
    heading: probe(document.getElementById('over-title')),
    summary: probe(document.getElementById('over-summary')),
    total: probe([...document.querySelectorAll('#over-results .result-row.total')][0]),
    callsign: probe(document.querySelector('#over-results .pilot-entry input')),
    actions: [...document.querySelectorAll('#screen-over .menu .mi')].filter(b => !b.hidden).map(probe),
    focused: (document.activeElement?.textContent || document.activeElement?.value || '').trim(),
    panel: panel && { scrollTop: Math.round(panel.scrollTop), scrollHeight: panel.scrollHeight, clientHeight: panel.clientHeight },
  };
}) ;
const WALK = String(async () => {
  const steps = [];
  const inView = (el) => { const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { text: (el.textContent || el.value || '').trim().slice(0, 32), inView: r.top >= 0 && r.bottom <= innerHeight, unobstructed: !!t && (el === t || el.contains(t)) }; };
  const items = KZ.screens._items();
  for (let i = 0; i < items.length + 1; i++) {
    KZ.screens.handleControl('down'); await new Promise(r => setTimeout(r, 60));
    steps.push(inView(items[KZ.screens.selIndex]));
  }
  return { path: 'Screens.handleControl (the gamepad/keyboard menu path; no physical pad)', steps };
});
const WHEEL = String(async () => {
  const panel = document.querySelector('#screen-over .panel'); const before = panel.scrollTop;
  panel.scrollBy(0, 4000); await new Promise(r => setTimeout(r, 120));
  const after = panel.scrollTop; const bar = document.querySelector('#screen-over .panel > .menu:last-child .mi:not([hidden])');
  const r = bar.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  panel.scrollTo(0, 0); await new Promise(r => setTimeout(r, 120));
  return { before, after, scrollable: after > before || panel.scrollHeight <= panel.clientHeight, actionsReachableAtBottom: !!t && bar.contains(t), backToTop: panel.scrollTop };
});
const GHOST = String(async () => {
  const over = document.getElementById('screen-over'); const sample = () => +getComputedStyle(over).opacity;
  await new Promise(r => setTimeout(r, 60)); const at60 = sample();
  await new Promise(r => setTimeout(r, 140)); const at200 = sample();
  return { at60ms: at60, at200ms: at200, state: KZ.game.state, cut: over.classList.contains('cut') };
});

const STAGE = (victory) => `(()=>{const g=KZ.game;localStorage.removeItem('knotzaxxon.scores.v2');g.start({seed:170001});` +
  `g.runTime=${victory ? 294.5 : 8.8};g.kills=${victory ? 144 : 4};g.score=${victory ? 103340 : 4400};g.sectorIndex=${victory ? 7 : 0};` +
  `g._finish(${victory});return {state:g.state,screen:KZ.screens.current};})()`;
const NOTE = 'staged results via Game._finish (instrumentation, not gameplay); real Screens/CSS/DOM';

const VIEWPORTS = [
  { id: '960x540', viewport: { width: 960, height: 540 }, dpr: 1, touch: false },
  { id: '667x375-touch', viewport: { width: 667, height: 375 }, dpr: 2, touch: true },
  { id: '390x844-touch', viewport: { width: 390, height: 844 }, dpr: 2, touch: true },
  { id: '1280x720', viewport: { width: 1280, height: 720 }, dpr: 1, touch: false },
];
const jobs = [];
for (const [build, url] of [['base', baseUrl], ['patched', patchedUrl]]) {
  for (const v of VIEWPORTS) for (const victory of [true, false]) {
    const tag = `${build}-${v.id}-${victory ? 'victory' : 'defeat'}`;
    const leave = v.touch ? { tap: '#screen-over [data-action="retry"]' } : { press: 'Enter' };
    jobs.push({ name: tag, url, viewport: v.viewport, dpr: v.dpr, touch: v.touch,
      settings: { quality: 'medium', camera: 'classic', shake: 0.3 },
      steps: [
        { wait: 2500 },
        { measure: 'stage', fn: STAGE(victory) },
        { wait: 700 },
        { measure: 'opened', fn: `(${LAYOUT})()` },
        { shot: `${tag}-opened`, note: NOTE },
        { measure: 'walk', fn: `(${WALK})()` },
        { measure: 'wheel', fn: `(${WHEEL})()` },
        // Leave for flight from RE-ENGAGE (keyboard: focus it, then Enter; touch: tap).
        ...(v.touch ? [] : [{ eval: `document.querySelector('#screen-over [data-action="retry"]').focus()` }]),
        leave,
        { measure: 'leave', fn: `(${GHOST})()` },
        { shot: `${tag}-after-leave`, note: 'about 200 ms after leaving the results' },
      ] });
  }
}
fs.writeFileSync(out, JSON.stringify({ name: 'results-shortview', jobs }, null, 1));
console.log(`wrote ${out}: ${jobs.length} jobs`);
