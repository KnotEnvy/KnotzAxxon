import { Lifetime } from '../core/Lifetime.js';
/**
 * Screens and menus.
 *
 * One small state machine over the `.screen` elements, plus the settings list
 * which is generated from the settings schema so the two can never drift.
 * Every screen is navigable by keyboard, gamepad and pointer.
 */

import { settings, SCHEMA, Scores } from '../core/Settings.js';
import { commafy, timeString, clamp } from '../core/Utils.js';
import { audio } from '../audio/Audio.js';

const BOOT_LINES = [
  'KNOTZ TACTICAL SYSTEMS  //  BIOS 4.11',
  '',
  'POST ............................. OK',
  'INERTIAL PLATFORM ................ OK',
  'PULSE ARRAY CAPACITORS ........... OK',
  'SHIELD LATTICE ................... OK',
  'TERRAIN SHADOW PROJECTOR ......... OK',
  'FUSING PROCEDURAL GEOMETRY ....... OK',
  'SYNTHESISING AUDIO BANKS ......... OK',
  '',
  'TARGET: IRON FORTRESS, GRID 7-A',
  'PILOT AUTHORISATION ACCEPTED.',
];

export class Screens extends EventTarget {
  constructor() {
    super();
    this._lifetime = new Lifetime();
    this.screens = new Map();
    for (const el of document.querySelectorAll('.screen')) {
      this.screens.set(el.id.replace('screen-', ''), el);
    }
    this.current = 'boot';
    this.stack = [];
    this._selection = new Map();
    this.selIndex = 0;

    this._bindPointer();
    this._bindKeys();
    this._buildSettings();
    this.show('boot');
  }

  /* ------------------------------------------------------------------ */

  show(name, { push = false, restore = false } = {}) {
    if (this.current) this._selection?.set(this.current, this.selIndex);
    this._callsignEditing = false;
    if (push && this.current) this.stack.push(this.current);
    for (const [id, el] of this.screens) {
      el.classList.toggle('is-active', id === name);
      el.inert = id !== name;
      el.setAttribute('aria-hidden', String(id !== name));
      el.setAttribute('role', id === 'boot' || id === 'sector' ? 'status' : 'dialog');
      el.setAttribute('aria-label', el.querySelector('h1, h2')?.textContent ?? id);
      if (id !== 'boot' && id !== 'sector') el.setAttribute('aria-modal', String(id === name));
      el.tabIndex = -1;
    }
    this.current = name;
    if (name === 'scores') this._renderScores();
    if (name === 'settings') this._refreshSettings();
    this.selIndex = restore ? (this._selection?.get(name) ?? 0) : 0;
    if (name === 'over' && !restore) this.selIndex = Math.max(0, this._items().findIndex(n => n.classList.contains('mi')));
    this._refreshSelection({ focus: name !== 'boot' });
    this.dispatchEvent(new CustomEvent('shown', { detail: name }));
  }

  hide() {
    for (const animation of this._cardAnimations ?? []) animation.cancel();
    this._cardAnimations = [];
    for (const el of this.screens.values()) { el.classList.remove('is-active'); el.inert = true; el.setAttribute('aria-hidden', 'true'); }
    document.activeElement?.blur?.();
    this.current = null;
  }

  back() {
    const prev = this.stack.pop() ?? 'title';
    this.show(prev, { restore: true });
  }

  get isOpen() {
    return !!this.current && this.current !== 'sector';
  }

  _items() {
    const el = this.screens.get(this.current);
    if (!el) return [];
    return [...el.querySelectorAll('.mi, .setting, .pilot-entry input')].filter((n) => n.offsetParent !== null);
  }

  _refreshSelection({ focus = false } = {}) {
    const items = this._items();
    this.selIndex = clamp(this.selIndex, 0, Math.max(0, items.length - 1));
    items.forEach((n, i) => n.classList.toggle('sel', i === this.selIndex));
    const selected = items[this.selIndex];
    selected?.scrollIntoView?.({ block: 'nearest' });
    if (focus) (selected?.matches('button, input') ? selected : selected?.querySelector('input, button'))?.focus({ preventScroll: true });
  }

  /* ------------------------------------------------------------------ */

  _syncSelection(target) {
    const item = target?.closest?.('.mi, .setting, .pilot-entry input');
    const index = this._items().indexOf(item);
    if (index !== -1) { this.selIndex = index; this._refreshSelection(); }
  }

  _owns(target) { return !!this.screens.get(this.current)?.contains(target); }

  _bindPointer() {
    this._lifetime.listen(document, 'focusin', e => this._syncSelection(e.target));
    this._lifetime.listen(document, 'click', (e) => {
      if (!this.isOpen || !this._owns(e.target)) return;
      const btn = e.target.closest('.mi');
      if (btn && this.isOpen) {
        audio.ui('confirm');
        this._act(btn.dataset.action);
        return;
      }
      const step = e.target.closest('[data-setting-step]');
      if (step) {
        const id = step.closest('.setting').dataset.id;
        settings.cycle(id, Number(step.dataset.settingStep));
        audio.ui('move');
        this._refreshSettings();
      }
    });

    this._lifetime.listen(document, 'input', (e) => {
      if (!this.isOpen || !this._owns(e.target)) return;
      const range = e.target.closest('input[type=range][data-id]');
      if (!range) return;
      settings.set(range.dataset.id, Number(range.value));
      this._refreshSettings();
    });

    this._lifetime.listen(document, 'pointerover', (e) => {
      const item = e.target.closest('.mi, .setting');
      if (!item || !this.isOpen) return;
      const items = this._items();
      const i = items.indexOf(item);
      if (i >= 0 && i !== this.selIndex) {
        this.selIndex = i;
        this._refreshSelection();
        audio.ui('move');
      }
    });
  }

  _bindKeys() {
    this._lifetime.listen(window, 'keydown', e => {
      if (!this.isOpen) return;
      if (e.code === 'Tab') {
        const root = this.screens?.get(this.current);
        const focusable = [...(root?.querySelectorAll('button, input, [tabindex="0"]') ?? [])].filter(n => !n.disabled && n.offsetParent !== null);
        if (focusable.length) {
          const index = focusable.indexOf(document.activeElement);
          const next = index < 0 ? (e.shiftKey ? focusable.length - 1 : 0) : (index + (e.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
          e.preventDefault(); focusable[next].focus();
        }
        return;
      }
      this._syncSelection(e.target);
      const editing = e.target instanceof HTMLInputElement;
      if (editing && e.code !== 'Escape') {
        if (e.code === 'Enter' && e.target.type !== 'range') {
          e.preventDefault(); this._callsignEditing = false; e.target.classList.remove('editing');
          this.selIndex = Math.max(0, this._items().findIndex(n => n.classList.contains('mi')));
          this._refreshSelection({ focus: true });
        }
        return;
      }
      // Native +/- buttons activate themselves; do not also cycle the row.
      if (e.target?.matches?.('[data-setting-step]') && ['Enter', 'Space'].includes(e.code)) return;
      const action = { ArrowUp:'up', KeyW:'up', ArrowDown:'down', KeyS:'down', ArrowLeft:'left', KeyA:'left',
        ArrowRight:'right', KeyD:'right', Enter:'confirm', NumpadEnter:'confirm', Space:'confirm', Escape:'cancel', KeyP:'pause' }[e.code];
      if (action) {
        e.preventDefault();
        if (!e.repeat || !['confirm','pause','cancel'].includes(action)) this.handleControl(action);
      }
    });
  }

  /** Device-neutral menu actions; returns true when a menu owns the input. */
  handleControl(action) {
    if (!this.isOpen) return false;
    const items = this._items();
    const field = items[this.selIndex];
    if (this._callsignEditing && field?.matches?.('.pilot-entry input')) {
      if (action === 'confirm' || action === 'cancel') { this._callsignEditing = false; field.classList.remove('editing'); return true; }
      if (action === 'left' || action === 'right') this._callsignCursor = (this._callsignCursor + (action === 'left' ? 2 : 1)) % 3;
      if (action === 'up' || action === 'down') {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        const name = field.value.padEnd(3, 'A').slice(0, 3).split('');
        const at = Math.max(0, chars.indexOf(name[this._callsignCursor]));
        name[this._callsignCursor] = chars[(at + (action === 'up' ? 1 : chars.length - 1)) % chars.length];
        field.value = name.join(''); field.dispatchEvent(new Event('input', { bubbles: true }));
      }
      field.setSelectionRange(this._callsignCursor, this._callsignCursor + 1);
      return true;
    }
    if (action === 'up' || action === 'down') {
      if (items.length) {
        this.selIndex = (this.selIndex + (action === 'up' ? -1 : 1) + items.length) % items.length;
        this._refreshSelection({ focus: true }); audio.ui('move');
      }
      return true;
    }
    if (action === 'left' || action === 'right' || action === 'confirm') {
      const item = items[this.selIndex];
      if (item?.classList.contains('setting')) {
        settings.cycle(item.dataset.id, action === 'left' ? -1 : 1);
        this._refreshSettings(); audio.ui('move');
      } else if (action === 'confirm' && item?.matches?.('.pilot-entry input')) {
        this._callsignEditing = true; this._callsignCursor = 0;
        item.classList.add('editing'); item.focus(); item.setSelectionRange(0, 1);
      } else if (action === 'confirm' && item?.classList.contains('mi')) {
        audio.ui('confirm'); this._act(item.dataset.action);
      }
      return true;
    }
    if (action === 'cancel' || action === 'pause') {
      if (this.stack.length) this.back();
      else if (this.current === 'pause') this._act('resume');
      return true;
    }
    return false;
  }

  /** Controlled repeat for a held D-pad/stick while a menu is open. */
  updateGamepad(input, realDt) {
    if (!this.isOpen || input.lastDevice !== 'gamepad') { this._padRepeatAction = null; return; }
    const held = ['up', 'down', 'left', 'right'].find(a => input._padDown.has(a));
    if (!held) { this._padRepeatAction = null; return; }
    if (held !== this._padRepeatAction || input.justPressed(held)) {
      this._padRepeatAction = held; this._padRepeatTimer = 0.38; return;
    }
    this._padRepeatTimer -= realDt;
    if (this._padRepeatTimer <= 0) { this.handleControl(held); this._padRepeatTimer = 0.12; }
  }

  _act(action) {
    if (!action) return;
    if (action === 'back') { this.back(); return; }
    if (action === 'settings') { this.show('settings', { push: true }); return; }
    if (action === 'howto') { this.show('howto', { push: true }); return; }
    if (action === 'scores') { this.show('scores', { push: true }); return; }
    this.dispatchEvent(new CustomEvent('action', { detail: action }));
  }

  /* ------------------------------------------------------------------ */
  /* Settings list                                                       */
  /* ------------------------------------------------------------------ */

  _buildSettings() {
    const host = document.getElementById('settings-list');
    if (!host) return;
    host.innerHTML = SCHEMA.map((s) => {
      const ctl = s.type === 'range'
        ? `<input type="range" aria-labelledby="setting-name-${s.id}" aria-describedby="setting-desc-${s.id}" data-id="${s.id}" min="${s.min}" max="${s.max}" step="${s.step}">
           <span class="setting-val" id="setting-value-${s.id}" data-val="${s.id}"></span>`
        : `<button data-setting-step="-1" aria-label="Decrease ${s.name}" aria-describedby="setting-value-${s.id}">&lt;</button>
           <span class="setting-val" id="setting-value-${s.id}" data-val="${s.id}"></span>
           <button data-setting-step="1" aria-label="Increase ${s.name}" aria-describedby="setting-value-${s.id}">&gt;</button>`;
      return `
        <div class="setting" data-id="${s.id}">
          <div>
            <span class="setting-name" id="setting-name-${s.id}">${s.name}</span>
            <span class="setting-desc" id="setting-desc-${s.id}">${s.desc ?? ''}</span>
          </div>
          <div class="setting-ctl">${ctl}</div>
        </div>`;
    }).join('');
    this._refreshSettings();
  }

  _refreshSettings() {
    for (const s of SCHEMA) {
      const val = document.querySelector(`[data-val="${s.id}"]`);
      if (val) val.textContent = settings.display(s.id);
      const range = document.querySelector(`input[data-id="${s.id}"]`);
      if (range) { range.value = settings.get(s.id); range.setAttribute('aria-valuetext', settings.display(s.id)); }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Scores                                                              */
  /* ------------------------------------------------------------------ */

  _renderScores(highlightIndex = -1) {
    const el = document.getElementById('scores-list');
    if (!el) return;
    const list = Scores.all();
    if (!list.length) {
      el.innerHTML = '<li class="empty">NO RECORDED SORTIES</li>';
      return;
    }
    el.innerHTML = list.map((s, i) => `
      <li class="${i === highlightIndex ? 'fresh' : ''}">
        <b>${String(s.name ?? 'ACE').replace(/[^A-Z0-9]/g, '').slice(0, 3)} / ${commafy(s.score)}</b>
        <span>SECTOR ${String(s.sector ?? 1).padStart(2, '0')}</span>
        <span>${timeString(s.time ?? 0)}</span>
      </li>`).join('');
  }

  /* ------------------------------------------------------------------ */
  /* Sector card                                                         */
  /* ------------------------------------------------------------------ */

  sectorCard(sector, duration = 3.0) {
    const el = this.screens.get('sector');
    if (!el) return;
    document.getElementById('sc-num').textContent =
      `SECTOR ${String(sector.index + 1).padStart(2, '0')}`;
    document.getElementById('sc-name').textContent = sector.name;
    const rhythm = document.getElementById('sc-rhythm');
    if (rhythm) rhythm.textContent = sector.rhythm ?? '';
    document.getElementById('sc-desc').textContent = sector.brief ?? sector.sub;
    for (const animation of this._cardAnimations ?? []) animation.cancel();
    this._cardAnimations = [];
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const title = document.getElementById('sc-name');
      const subtitle = document.getElementById('sc-desc');
      const reveal = title?.animate?.([
        {clipPath:'inset(0 100% 0 0)',transform:'translateX(-6px)',opacity:.5},
        {clipPath:'inset(0 0 0 0)',transform:'translateX(0)',opacity:1}
      ], {duration:550,easing:'steps(14, end)'});
      const detail = subtitle?.animate?.([{opacity:0,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:300,delay:220,fill:'backwards'});
      if (reveal) this._cardAnimations.push(reveal);
      if (detail) this._cardAnimations.push(detail);
    }
    el.classList.add('is-active');
    clearTimeout(this._cardT);
    this._cardT = setTimeout(() => el.classList.remove('is-active'), duration * 1000);
  }

  /* ------------------------------------------------------------------ */
  /* Results                                                             */
  /* ------------------------------------------------------------------ */

  results({ title, rows, rank, entry }) {
    document.getElementById('over-title').textContent = title;
    const host = document.getElementById('over-results');
    host.innerHTML = rows.map((r, i) => `
      <div class="result-row ${r.total ? 'total' : ''}" style="animation-delay:${i * 0.07}s">
        <span>${r.label}</span><span>${r.value}</span>
      </div>`).join('');
    if (rank >= 0) {
      host.insertAdjacentHTML('beforeend', `
        <div class="result-row total" style="animation-delay:${rows.length * 0.07}s">
          <span>NEW RECORD</span><span>RANK ${String(rank + 1).padStart(2, '0')}</span>
        </div>`);
    }
    if (rank >= 0 && entry) {
      const label = document.createElement('label');
      label.className = 'pilot-entry'; label.textContent = 'PILOT CALLSIGN';
      const field = document.createElement('input');
      field.type = 'text'; field.autocomplete = 'off'; field.spellcheck = false;
      field.maxLength = 3; field.value = entry.name; field.setAttribute('aria-label', 'Pilot callsign');
      field.addEventListener('input', () => {
        const name = field.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0,3);
        field.value = name;
        const list = Scores.all();
        const saved = list.find(e => e.date === entry.date && e.score === entry.score);
        if (saved) { saved.name = name || 'ACE'; Scores.save(list); }
      });
      const help = document.createElement('span'); help.className = 'callsign-help'; help.id = 'callsign-help';
      help.textContent = 'Type 3 characters. Controller: A edits, left/right selects, up/down changes, A finishes.';
      field.setAttribute('aria-describedby', help.id);
      label.append(field); host.append(label, help);
      if (!Scores.persistent) {
        const note = document.createElement('p'); note.className = 'note'; note.textContent = 'Record kept for this session. Browser storage is unavailable.'; host.append(note);
      }
    }
    this.stack.length = 0;
    this.show('over');
  }

  /* ------------------------------------------------------------------ */
  /* Boot sequence                                                       */
  /* ------------------------------------------------------------------ */

  /**
   * Types the boot log while the game preloads. Resolves when both the
   * animation and `work` have finished.
   */
  async boot(work) {
    const logEl = document.getElementById('boot-log');
    const barEl = document.getElementById('boot-bar');
    const workPromise = Promise.resolve().then(work);
    workPromise.catch(() => {}); // awaited below; avoid a delayed unhandled rejection

    let out = '';
    for (let i = 0; i < BOOT_LINES.length; i++) {
      out += BOOT_LINES[i] + '\n';
      logEl.textContent = out;
      if (barEl) barEl.style.width = `${((i + 1) / BOOT_LINES.length) * 100}%`;
      if (!await this._lifetime.delay(BOOT_LINES[i] === '' ? 30 : 78)) break;
    }
    await workPromise;
    if (this._lifetime.closed) return;
    if (barEl) barEl.style.width = '100%';
    await this._lifetime.delay(260);
  }
  dispose() {
    for (const animation of this._cardAnimations ?? []) animation.cancel();
    this._cardAnimations = []; this._lifetime.dispose(); clearTimeout(this._cardT); }

}
