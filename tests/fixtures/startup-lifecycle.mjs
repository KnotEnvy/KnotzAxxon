// Execute the actual entry module with injected runtime owners; no DOM/WebGL renderer needed.
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';
import { Lifetime, runCleanups } from '../../src/core/Lifetime.js';

const source = await readFile(process.env.LIFECYCLE_ENTRY ?? new URL('../../src/main.js', import.meta.url), 'utf8');
const results = [];
for (const failure of ['compile', 'upload', 'compile and restore', 'warm target', 'restore', 'shutdown']) {
  const calls = [], errors = [], fault = Error(`${failure} failed`);
  const previousTarget = {}, warmTarget = {};
  let target = previousTarget, disposeHot, engine, game;
  const log = { style: {}, textContent: '' };
  const dispose = name => () => {
    calls.push(name);
    if (name === 'game') throw Error('game teardown failed');
  };
  class Engine {
    constructor() {
      engine = this;
      this.input = new EventTarget();
      this.scene = { traverse(fn) { fn({ material: { map: { isTexture: true } } }); } };
      this.renderer = {
        getRenderTarget: () => target,
        setRenderTarget: value => {
          target = value; calls.push(value === previousTarget ? 'restore-target' : 'warm-target');
          if (value === warmTarget && failure === 'warm target') throw fault;
          if (value === previousTarget && failure === 'restore') throw fault;
          if (value === previousTarget && failure === 'compile and restore') throw Error('secondary restore failure');
        },
        compile() { if (failure === 'compile' || failure === 'compile and restore') throw fault; },
        initTexture() { if (failure === 'upload') throw fault; },
      };
      this.postfx = { composer: { readBuffer: warmTarget } };
      this.stop = () => calls.push('stop'); this.dispose = dispose('engine');
    }
    onUpdate() {} onLateUpdate() {} start() {}
  }
  class Game {
    constructor() { game = this; this.dispose = dispose('game'); }
    prewarm(compile) { compile(); }
    toTitle() {}
  }
  class Screens extends EventTarget {
    async boot(work) { await work(); }
    dispose = dispose('screens');
  }
  const window = new EventTarget();
  const context = createContext({
    window, URLSearchParams, location: { search: '' },
    document: { getElementById: id => id === 'boot-log' ? log : null },
    matchMedia: () => ({ matches: false }),
    console: { error: error => errors.push(error) },
  });
  const modules = {
    './style.css': {}, './core/Lifetime.js': { Lifetime, runCleanups },
    './core/Engine.js': { Engine },
    './game/Game.js': { Game, STATE: {}, parseSeedCode: () => null, seedCode: () => '' },
    './ui/Screens.js': { Screens }, './core/Settings.js': { settings: { get() {} } },
    './audio/Audio.js': { audio: { dispose: dispose('audio') } },
    './render/ImportedModels.js': { loadImportedModels: async () => {}, disposeImportedModels: dispose('imports') },
    './render/Textures.js': { disposeTextures: dispose('textures') },
    './entities/Enemies.js': { disposeEnemyGeometry: dispose('enemies') },
    './entities/Pickup.js': { disposePickupGeometry: dispose('pickups') },
    './world/Fortress.js': { disposeFortressTemplates: dispose('fortress') },
  };
  const main = new SourceTextModule(source, {
    context,
    initializeImportMeta(meta) {
      meta.env = { DEV: true };
      meta.hot = { dispose(fn) { disposeHot = fn; } };
    },
  });
  await main.link(specifier => {
    const exports = modules[specifier];
    if (!exports) throw Error(`Unexpected entry import: ${specifier}`);
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context });
  });
  await main.evaluate();
  await new Promise(resolve => setTimeout(resolve, 20));
  let shutdownThrew = false;
  if (failure === 'shutdown') {
    if (window.KZ?.game !== game) throw Error('Startup did not finish');
    try { disposeHot(); } catch { shutdownThrew = true; }
    disposeHot(); // repeated disposal must not revisit already-attempted owners
  }
  results.push({ failure, calls, targetRestored: target === previousTarget,
    loggedOriginal: errors.length === 1 && errors[0] === fault,
    fatalContainsOriginal: log.textContent.includes(fault.message),
    shutdownThrew, debugRemoved: !window.KZ,
  });
}
process.stdout.write(JSON.stringify(results));
