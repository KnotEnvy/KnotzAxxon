/**
 * Persisted player settings + quality presets.
 *
 * Settings are declared once here as a schema; the settings UI is generated
 * from it, so adding an option never means touching the DOM code.
 */

import { clamp } from './Utils.js';

const KEY = 'knotzaxxon.settings.v2';

/**
 * Quality tiers. `resolution` is a device-pixel-ratio cap; the renderer also
 * applies dynamic resolution on top of this when frames get expensive.
 */
export const QUALITY_PRESETS = {
  low: {
    label: 'LOW',
    resolution: 0.75,
    maxPixelRatio: 1,
    shadows: false,
    shadowMapSize: 1024,
    bloom: true,
    bloomStrength: 0.34,
    chromatic: false,
    grain: false,
    particleBudget: 900,
    debrisBudget: 120,
    drawDistance: 320,
    anisotropy: 1,
    lights: 2,
  },
  medium: {
    label: 'MEDIUM',
    resolution: 1,
    maxPixelRatio: 1.25,
    shadows: true,
    shadowMapSize: 1024,
    bloom: true,
    bloomStrength: 0.42,
    chromatic: true,
    grain: true,
    particleBudget: 2200,
    debrisBudget: 260,
    drawDistance: 440,
    anisotropy: 4,
    lights: 4,
  },
  high: {
    label: 'HIGH',
    resolution: 1,
    maxPixelRatio: 1.75,
    shadows: true,
    shadowMapSize: 2048,
    bloom: true,
    bloomStrength: 0.5,
    chromatic: true,
    grain: true,
    particleBudget: 4200,
    debrisBudget: 460,
    drawDistance: 560,
    anisotropy: 8,
    // Pool lights are always live (a constant count avoids shader recompiles),
    // so the pool stays small: each one is per-fragment work on lit surfaces.
    lights: 5,
  },
  ultra: {
    label: 'ULTRA',
    resolution: 1,
    maxPixelRatio: 2,
    shadows: true,
    shadowMapSize: 2048,
    bloom: true,
    bloomStrength: 0.58,
    chromatic: true,
    grain: true,
    particleBudget: 7000,
    debrisBudget: 800,
    drawDistance: 700,
    anisotropy: 16,
    lights: 6,
  },
};

export const CAMERA_MODES = {
  classic: { label: 'CLASSIC 45', yaw: 45, dist: 64, height: 45.255, fov: 52 },
  modern: { label: 'MODERN 20', yaw: 20, dist: 29, height: 14, fov: 58 },
  chase: { label: 'CHASE', yaw: 6, dist: 24, height: 9.5, fov: 66 },
};

/** Declarative schema — the SYSTEMS screen renders straight from this. */
export const SCHEMA = [
  {
    id: 'quality',
    name: 'GRAPHICS PRESET',
    desc: 'Shadows, post-processing and particle budgets.',
    type: 'choice',
    options: ['low', 'medium', 'high', 'ultra'],
    labels: ['LOW', 'MEDIUM', 'HIGH', 'ULTRA'],
    def: 'high',
  },
  {
    id: 'camera',
    name: 'CAMERA RIG',
    desc: 'Orthographic arcade flight, perspective tactical, or chase view.',
    type: 'choice',
    options: ['classic', 'modern', 'chase'],
    labels: ['CLASSIC 45', 'MODERN 20', 'CHASE'],
    def: 'classic',
  },
  {
    id: 'master',
    name: 'MASTER VOLUME',
    desc: '',
    type: 'range',
    min: 0, max: 1, step: 0.05, def: 0.8,
  },
  { id: 'music', name: 'MUSIC', desc: '', type: 'range', min: 0, max: 1, step: 0.05, def: 0.6 },
  { id: 'sfx', name: 'EFFECTS', desc: '', type: 'range', min: 0, max: 1, step: 0.05, def: 0.9 },
  {
    id: 'shake',
    name: 'SCREEN SHAKE',
    desc: 'Scales all camera trauma.',
    type: 'range', min: 0, max: 1.5, step: 0.1, def: 1,
  },
  {
    id: 'scanlines',
    name: 'CRT OVERLAY',
    desc: 'Arcade cabinet scanlines.',
    type: 'toggle', def: false,
  },
  {
    id: 'shadowLine',
    name: 'ALTITUDE GUIDE',
    desc: 'Draws a drop-line from the ship to the deck.',
    type: 'toggle', def: true,
  },
  {
    id: 'invertY',
    name: 'INVERT CLIMB AXIS',
    desc: '',
    type: 'toggle', def: false,
  },
  {
    id: 'assist',
    name: 'FLIGHT ASSIST',
    desc: 'Aim steering, softer collisions and slower fuel burn.',
    type: 'toggle', def: false,
  },
  {
    id: 'perf',
    name: 'PERFORMANCE READOUT',
    desc: 'Frame time, draw calls, entity counts.',
    type: 'toggle', def: false,
  },
];

const DEFAULTS = Object.fromEntries(SCHEMA.map((s) => [s.id, s.def]));

class SettingsStore extends EventTarget {
  constructor() {
    super();
    this.values = { ...DEFAULTS, ...this._load() };
    this._autoDetect();
  }

  _load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.values));
    } catch {
      /* private browsing — settings just won't persist */
    }
  }

  /** First run only: guess a sane preset from the device. */
  _autoDetect() {
    try { if (localStorage.getItem(KEY)) return; } catch { /* storage unavailable */ }
    const mobile = matchMedia('(pointer: coarse)').matches;
    const cores = navigator.hardwareConcurrency || 4;
    const mem = navigator.deviceMemory || 4;
    if (mobile) this.values.quality = cores >= 8 ? 'medium' : 'low';
    else if (cores >= 12 && mem >= 8) this.values.quality = 'ultra';
    else if (cores >= 6) this.values.quality = 'high';
    else this.values.quality = 'medium';
    if (mobile) this.values.camera = 'chase';
  }

  get(id) {
    return this.values[id];
  }

  set(id, value) {
    const spec = SCHEMA.find((s) => s.id === id);
    if (!spec) return;
    if (spec.type === 'range') value = clamp(Math.round(value / spec.step) * spec.step, spec.min, spec.max);
    if (this.values[id] === value) return;
    this.values[id] = value;
    this.save();
    this.dispatchEvent(new CustomEvent('change', { detail: { id, value } }));
  }

  /** Cycle a choice/toggle by `dir` (+1 / -1). Returns the new value. */
  cycle(id, dir = 1) {
    const spec = SCHEMA.find((s) => s.id === id);
    if (!spec) return;
    if (spec.type === 'toggle') {
      this.set(id, !this.values[id]);
    } else if (spec.type === 'choice') {
      const i = spec.options.indexOf(this.values[id]);
      const n = spec.options.length;
      this.set(id, spec.options[(i + dir + n) % n]);
    } else if (spec.type === 'range') {
      this.set(id, this.values[id] + spec.step * dir);
    }
    return this.values[id];
  }

  /** Human-readable current value, for the UI. */
  display(id) {
    const spec = SCHEMA.find((s) => s.id === id);
    const v = this.values[id];
    if (spec.type === 'toggle') return v ? 'ON' : 'OFF';
    if (spec.type === 'choice') return spec.labels[spec.options.indexOf(v)] ?? String(v);
    return `${Math.round((v / spec.max) * 100)}%`;
  }

  get quality() {
    return QUALITY_PRESETS[this.values.quality] ?? QUALITY_PRESETS.high;
  }

  get cameraRig() {
    return CAMERA_MODES[this.values.camera] ?? CAMERA_MODES.modern;
  }
}

export const settings = new SettingsStore();

/* ------------------------------------------------------------------ */
/* High-score table                                                    */
/* ------------------------------------------------------------------ */

const SCORE_KEY = 'knotzaxxon.scores.v2';

function cleanScores(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(e => e && typeof e === 'object' && Number.isFinite(e.score) && e.score >= 0)
    .map(e => ({
      name: String(e.name ?? 'ACE').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'ACE',
      score: Math.min(1e12, Math.floor(e.score)),
      sector: Number.isFinite(e.sector) ? Math.max(1, Math.min(10000, Math.floor(e.sector))) : 1,
      time: Number.isFinite(e.time) ? Math.max(0, Math.min(1e8, e.time)) : 0,
      date: Number.isFinite(e.date) ? Math.max(0, e.date) : 0,
    })).sort((a,b) => b.score-a.score).slice(0,10);
}

export const Scores = {
  persistent: true,
  _session: [],
  save(list) {
    this._session = cleanScores(list);
    try { localStorage.setItem(SCORE_KEY, JSON.stringify(this._session)); this.persistent = true; }
    catch { this.persistent = false; }
    return this.persistent;
  },
  all() {
    if (!this.persistent) return this._session.map(e => ({...e}));
    try {
      const raw = localStorage.getItem(SCORE_KEY);
      this._session = cleanScores(raw ? JSON.parse(raw) : []);
    } catch { this.persistent = false; }
    return this._session.map(e => ({...e}));
  },
  best() { return this.all()[0]?.score ?? 0; },
  /** Returns rank even in session-only mode; the UI discloses persistence. */
  submit(entry) {
    const clean = cleanScores([entry])[0];
    if (!clean) return -1;
    Object.assign(entry, clean);
    // A continued run re-submits its growing score: replace, don't duplicate.
    const list = this.all().filter(e => e.date !== entry.date); list.push(entry); list.sort((a,b)=>b.score-a.score);
    const rank = list.indexOf(entry); this.save(list);
    return rank < 10 ? rank : -1;
  },
};
