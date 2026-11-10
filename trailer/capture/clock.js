// Virtual clock, injected before the game loads (Playwright addInitScript).
//
// Boot runs on real time. T.setup() calls __vt.start(); from then on
// performance.now, Date.now, setTimeout/setInterval, requestAnimationFrame
// and every CSS animation/transition only move when the harness calls
// __vt.advance(ms). Math.random is seeded, so every run is identical.
(() => {
  const q = new URLSearchParams(location.search);
  let s = (Number(q.get('rng')) || 20261101) >>> 0;
  const mulberry = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Math.random = mulberry;

  const real = {
    setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window),
    setInterval: window.setInterval.bind(window), clearInterval: window.clearInterval.bind(window),
    raf: window.requestAnimationFrame.bind(window), caf: window.cancelAnimationFrame.bind(window),
    pnow: performance.now.bind(performance), dnow: Date.now,
  };
  const EPOCH = Date.UTC(2026, 10, 1, 12, 0, 0);
  let virtual = false, vnow = 0, nextId = 1e7;
  const timers = new Map();      // id -> { at, fn, args, every }
  let rafs = new Map();
  const animStart = new WeakMap();

  performance.now = () => (virtual ? vnow : real.pnow());
  Date.now = () => (virtual ? EPOCH + vnow : real.dnow());
  window.setTimeout = (fn, ms = 0, ...args) => {
    if (!virtual) return real.setTimeout(fn, ms, ...args);
    const id = nextId++; timers.set(id, { at: vnow + Math.max(0, +ms || 0), fn, args, every: 0 }); return id;
  };
  window.setInterval = (fn, ms = 0, ...args) => {
    if (!virtual) return real.setInterval(fn, ms, ...args);
    const every = Math.max(1, +ms || 1);
    const id = nextId++; timers.set(id, { at: vnow + every, fn, args, every }); return id;
  };
  window.clearTimeout = (id) => { if (timers.has(id)) timers.delete(id); else real.clearTimeout(id); };
  window.clearInterval = (id) => { if (timers.has(id)) timers.delete(id); else real.clearInterval(id); };
  window.requestAnimationFrame = (fn) => {
    if (!virtual) return real.raf(fn);
    const id = nextId++; rafs.set(id, fn); return id;
  };
  window.cancelAnimationFrame = (id) => { if (rafs.has(id)) rafs.delete(id); else real.caf(id); };

  function syncAnimations() {
    for (const a of document.getAnimations()) {
      if (!animStart.has(a)) { animStart.set(a, vnow); try { a.pause(); } catch (_) {} }
      try { a.currentTime = (vnow - animStart.get(a)) * (a.playbackRate || 1); } catch (_) {}
    }
  }

  // Captures run in several overlapping windows: never let the page think it
  // is hidden (the game pauses itself on visibilitychange).
  Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
  Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
  window.addEventListener('visibilitychange', (e) => e.stopImmediatePropagation(), true);
  document.addEventListener('visibilitychange', (e) => e.stopImmediatePropagation(), true);

  window.__vt = {
    get virtual() { return virtual; },
    get now() { return vnow; },
    reseed(n) { s = n >>> 0; },
    start() {
      if (virtual) return;
      vnow = Math.ceil(real.pnow());
      virtual = true;
      // Freeze anything already running at its current offset.
      syncAnimations();
    },
    advance(ms) {
      const target = vnow + ms;
      // Timers in time order, each at its own due time.
      for (;;) {
        let id = null, best = Infinity;
        for (const [k, t] of timers) if (t.at <= target && t.at < best) { best = t.at; id = k; }
        if (id == null) break;
        const t = timers.get(id);
        vnow = Math.max(vnow, t.at);
        if (t.every) t.at += t.every; else timers.delete(id);
        try { t.fn(...t.args); } catch (e) { console.error(e); }
      }
      vnow = target;
      const list = rafs; rafs = new Map();
      for (const fn of list.values()) { try { fn(vnow); } catch (e) { console.error(e); } }
    },
    syncAnimations,
  };
})();
