// Results on short screens: the outcome and its context lead, the sticky actions
// never scroll the heading away, and screens cut (not fade) when flight starts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { El, installDom } from './fixtures/opus-ui-dom.mjs';

const SCREEN_IDS = ['boot', 'title', 'settings', 'over', 'sector', 'pause'];
const IDS = ['settings-list', 'settings-status', 'title-hint', 'sc-num', 'sc-name', 'sc-rhythm', 'sc-desc',
  'over-title', 'over-summary', 'over-results', 'btn-continue', 'hud-warn'];
const { nodes } = installDom(IDS, { screens: SCREEN_IDS });
const { Screens } = await import('../src/ui/Screens.js');

const nb = text => text.replace(/ /g, '\u00a0');
const ROWS = [
  { label: 'FORTRESS CODE', value: '2T8K1Q' },
  { label: 'SECTOR REACHED', value: '08' },
  { label: 'SECTOR GRADES', chips: ['S', 'A'] },
  { label: 'TARGETS DESTROYED', value: '144' },
  { label: 'TOTAL', value: '128,060', total: true },
];

test('results: the heading carries outcome, sector, total and record context', () => {
  const screens = new Screens();
  screens.results({ title: 'FORTRESS NEUTRALISED', rows: ROWS, rank: 0, canContinue: true, continueLabel: 'CONTINUE: LOOP 2' });
  assert.equal(nodes['screen-over'].dataset.outcome, 'victory');
  assert.equal(nodes['over-summary'].textContent, [nb('SECTOR 08'), nb('TOTAL 128,060'), nb('NEW RECORD · RANK 01')].join('  ·  '));
  screens.results({ title: 'MISSION FAILED', rows: ROWS, rank: -1 });
  assert.equal(nodes['screen-over'].dataset.outcome, 'defeat');
  assert.equal(nodes['over-summary'].textContent, [nb('SECTOR 08'), nb('TOTAL 128,060')].join('  ·  '));
  screens.dispose();
});

test('results: a fresh results panel opens at its heading; a restored one keeps its place', () => {
  const screens = new Screens();
  const panel = new El('panel'); panel.scrollTop = 900;
  nodes['screen-over']._query = { '.panel': panel };
  screens.results({ title: 'MISSION FAILED', rows: ROWS, rank: -1 });
  assert.equal(panel.scrollTop, 0);
  panel.scrollTop = 120;
  screens.show('over', { restore: true });
  assert.equal(panel.scrollTop, 120, 'returning from a sub-screen keeps the reader where they were');
  screens.dispose();
});

test('selection: sticky action-bar items never scroll the panel; content items still do', () => {
  const scrolled = [];
  const item = (sticky, name) => ({ name, classList: { toggle() {}, contains: c => c === 'mi' },
    closest: sel => (sticky && sel === '.panel > .menu:last-child' ? {} : null),
    scrollIntoView() { scrolled.push(name); }, matches: () => true, focus() {} });
  const items = [item(false, 'callsign'), item(true, 'continue'), item(true, 'retry')];
  const screens = Object.create(Screens.prototype);
  Object.assign(screens, { selIndex: 1, _items: () => items });
  screens._refreshSelection({ focus: true });
  screens.selIndex = 2; screens._refreshSelection({ focus: true });
  assert.deepEqual(scrolled, []);
  screens.selIndex = 0; screens._refreshSelection({ focus: true });
  assert.deepEqual(scrolled, ['callsign']);
});

test('lifecycle: leaving for flight cuts every panel; the sector card and the next screen still fade', () => {
  const screens = new Screens();
  screens.results({ title: 'MISSION FAILED', rows: ROWS, rank: -1 });
  screens.hide();
  for (const id of ['title', 'settings', 'over', 'pause']) assert.equal(nodes['screen-' + id].classList.contains('cut'), true, id);
  assert.equal(nodes['screen-sector'].classList.contains('cut'), false, 'sector card keeps its fade');
  screens.show('pause');
  for (const id of SCREEN_IDS) assert.equal(nodes['screen-' + id].classList.contains('cut'), false, id);
  screens.dispose();
});
