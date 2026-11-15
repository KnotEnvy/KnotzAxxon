// Minimal DOM for driving Screens and HUD in node: ids, classes, attributes,
// text writes and rects. Enough to observe UI state, nothing more.
export class El extends EventTarget {
  constructor(id = '', { rect, parent } = {}) {
    super();
    this.id = id; this.children = []; this.style = { setProperty: (k, v) => { this.style[k] = v; } };
    this.dataset = {}; this.attrs = {}; this.inert = false; this.tabIndex = 0; this.hidden = false;
    this.offsetParent = {}; this._rect = rect ?? { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
    this.parentElement = parent ?? null; this._text = ''; this.textWrites = 0; this.innerHTML = '';
    const classes = this._classes = new Set();
    this.classList = {
      add: (...c) => c.forEach(k => classes.add(k)), remove: (...c) => c.forEach(k => classes.delete(k)),
      contains: c => classes.has(c), toggle: (c, on = !classes.has(c)) => (on ? classes.add(c) : classes.delete(c), on),
    };
  }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); this.textWrites++; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  getBoundingClientRect() { return { ...this._rect }; }
  querySelector(sel) { return this._query?.[sel] ?? null; }
  querySelectorAll() { return []; }
  insertAdjacentHTML(_, html) { this.innerHTML += html; }
  append(...nodes) { this.children.push(...nodes); }
  contains(n) { return n === this; }
  closest() { return null; }
  matches() { return false; }
  focus() { globalThis.document.activeElement = this; }
  blur() {}
  animate() { return { cancel() {} }; }
}

/** Install a document with the given ids; returns the element map. */
export function installDom(ids = [], { screens = [], touch = false, storage = 'ok' } = {}) {
  const nodes = {};
  for (const id of ids) nodes[id] = new El(id);
  const screenEls = screens.map(name => (nodes['screen-' + name] = new El('screen-' + name)));
  const root = new El('html');
  if (touch) root.classList.add('touch-device');
  const store = new Map();
  globalThis.localStorage = storage === 'blocked'
    ? { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } }
    : { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.window ??= new EventTarget();
  globalThis.innerWidth = 1280; globalThis.innerHeight = 720;
  globalThis.HTMLInputElement ??= class extends El {};
  globalThis.document = Object.assign(new EventTarget(), {
    activeElement: null, documentElement: root,
    getElementById: id => nodes[id] ?? null,
    querySelector: sel => nodes[sel] ?? null,
    querySelectorAll: sel => (sel === '.screen' ? screenEls : []),
    createElement: tag => new El(tag),
  });
  return { nodes, root, store };
}
