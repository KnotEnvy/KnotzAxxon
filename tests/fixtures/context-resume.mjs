// Exercise actual entry resume handlers and the actual Screens cancel/pause routes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import { Lifetime, runCleanups } from '../../src/core/Lifetime.js';

globalThis.localStorage = { getItem: () => null };
globalThis.matchMedia = () => ({ matches: false });
const { Screens: RealScreens } = await import('../../src/ui/Screens.js');
const source = await readFile(new URL('../../src/main.js', import.meta.url), 'utf8');
const results = [];
for (const pendingRenderer of [false, true]) for (const route of ['keyboard-pause', 'screen-cancel', 'screen-pause', 'resume-button']) {
  const window = new EventTarget(), errors = [];
  let engine, game, screens, cleanup;
  class Engine {
    constructor() {
      engine = this; this._contextLost = false; this.input = new EventTarget(); this.input.lastDevice = 'keyboard';
      this.scene = { traverse() {} }; this.renderer = { getRenderTarget() {}, setRenderTarget() {}, compile() {} };
      this.postfx = { composer: { readBuffer: {} } };
    }
    onUpdate() {} onLateUpdate() {} start() {} stop() {} dispose() {}
  }
  class Screens extends EventTarget {
    constructor() { super(); screens = this; this.current = 'title'; this.stack = []; }
    async boot(work) { await work(); }
    get isOpen() { return this.current === 'pause'; }
    _items() { return []; }
    _act(detail) { this.dispatchEvent(new CustomEvent('action', { detail })); }
    handleControl(action) { return RealScreens.prototype.handleControl.call(this, action); }
    dispose() {}
  }
  class Game {
    constructor() { game = this; this.state = 'idle'; this.resumes = 0; }
    prewarm(compile) { compile(); }
    toTitle() {} dispose() {}
    pause() { this.state = 'paused'; screens.current = 'pause'; }
    resume() { this.state = 'playing'; screens.current = null; this.resumes++; }
  }
  const noOp = () => {};
  const modules = {
    './style.css': {}, './core/Lifetime.js': { Lifetime, runCleanups }, './core/Engine.js': { Engine },
    './game/Game.js': { Game, STATE: { IDLE: 'idle', PLAYING: 'playing', PAUSED: 'paused' }, parseSeedCode: () => null, seedCode: () => '' },
    './ui/Screens.js': { Screens }, './core/Settings.js': { settings: { get: noOp } },
    './audio/Audio.js': { audio: { dispose: noOp } },
    './render/ImportedModels.js': { loadImportedModels: async () => {}, disposeImportedModels: noOp },
    './render/Textures.js': { disposeTextures: noOp }, './entities/Enemies.js': { disposeEnemyGeometry: noOp },
    './entities/Pickup.js': { disposePickupGeometry: noOp }, './world/Fortress.js': { disposeFortressTemplates: noOp },
  };
  const context = createContext({ window, URLSearchParams, location: { search: '' }, matchMedia: globalThis.matchMedia,
    document: { getElementById: () => null }, console: { error: e => errors.push(e) } });
  const entry = new SourceTextModule(source, { context, initializeImportMeta(meta) {
    meta.env = { DEV: true }; meta.hot = { dispose: fn => { cleanup = fn; } };
  } });
  await entry.link(specifier => {
    const values = modules[specifier]; assert.ok(values, specifier);
    return new SyntheticModule(Object.keys(values), function () {
      for (const [name, value] of Object.entries(values)) this.setExport(name, value);
    }, { context });
  });
  await entry.evaluate();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(errors.length, 0); assert.equal(window.KZ?.game, game);
  const attempt = () => {
    if (route === 'keyboard-pause') engine.input.dispatchEvent(new CustomEvent('press', { detail: 'pause' }));
    else if (route === 'resume-button') screens._act('resume');
    else screens.handleControl(route === 'screen-cancel' ? 'cancel' : 'pause');
  };
  game.pause(); engine._contextLost = !pendingRenderer; engine._resumeAfterRestore = true;
  attempt();
  assert.equal(game.state, 'paused', route + ': resume while context lost');
  assert.equal(game.resumes, 0);
  engine._contextLost = false; engine._resumeAfterRestore = false;
  assert.equal(game.state, 'paused', route + ': restore must not replay resume');
  attempt();
  assert.equal(game.state, 'playing', route + ': fresh post-restore resume');
  assert.equal(game.resumes, 1);
  cleanup();
  results.push({ route, pendingRenderer, blockedWhileLost: true, manualResume: true });
}
process.stdout.write(JSON.stringify(results));
