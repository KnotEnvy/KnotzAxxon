import { Lifetime, runCleanups } from './core/Lifetime.js';
import { loadImportedModels, disposeImportedModels } from './render/ImportedModels.js';
import { disposeTextures } from './render/Textures.js';
import { disposeEnemyGeometry } from './entities/Enemies.js';
import { disposePickupGeometry } from './entities/Pickup.js';
import { disposeFortressTemplates } from './world/Fortress.js';
/**
 * KNOTZAXXON — entry point.
 *
 * Boots the engine, forges the procedural assets behind the boot screen, wires
 * the menus to the game, and starts the frame loop.
 */

import './style.css';
import { Engine } from './core/Engine.js';
import { Game, STATE, parseSeedCode, seedCode } from './game/Game.js';
import { Screens } from './ui/Screens.js';
import { settings } from './core/Settings.js';
import { audio } from './audio/Audio.js';

const canvas = document.getElementById('viewport');

let shutdown = () => {};
if (import.meta.hot) import.meta.hot.dispose(() => shutdown());

async function main() {
  const lifetime = new Lifetime();
  const screens = new Screens();

  // Reflect persisted toggles that live purely in CSS.
  document.getElementById('scanlines')?.classList.toggle('on', settings.get('scanlines'));
  document.getElementById('perf')?.classList.toggle('on', settings.get('perf'));
  if (matchMedia('(pointer: coarse)').matches) {
    document.getElementById('touch')?.classList.add('on');
    document.documentElement.classList.add('touch-device');
  }

  let engine = null;
  let game = null;
  shutdown = () => {
    if (lifetime.closed) return;
    runCleanups([
      () => lifetime.dispose(),
      () => engine?.stop(),
      () => game?.dispose(),
      () => screens.dispose(),
      () => audio.dispose(),
      disposeEnemyGeometry, disposePickupGeometry, disposeFortressTemplates,
      () => engine?.dispose(), disposeTextures, disposeImportedModels,
      () => { if (window.KZ?.engine === engine) delete window.KZ; },
    ]);
  };

  let warmedQuality = null;
  const runPrewarm = () => {
    game.prewarm(() => {
      const renderer = engine.renderer, previous = renderer.getRenderTarget();
      let failed = false;
      try {
        renderer.setRenderTarget(engine.postfx.composer.readBuffer);
        renderer.compile(engine.scene, engine.camera);
        // compile() builds programs only; upload every texture the staged scene
        // uses too, so the first explosion or pickup does not pay for it.
        engine.scene.traverse((object) => {
          for (const material of [].concat(object.material ?? [])) {
            const slots = [...Object.values(material), ...Object.values(material.uniforms ?? {}).map(u => u?.value)];
            for (const t of slots) if (t?.isTexture && !t.isRenderTargetTexture) renderer.initTexture(t);
          }
        });
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        try { renderer.setRenderTarget(previous); }
        catch (error) { if (!failed) throw error; }
      }
    });
    warmedQuality = settings.get('quality');
  };

  await screens.boot(async () => {
    if (lifetime.closed) return;
    await loadImportedModels();
    if (lifetime.closed) { disposeImportedModels(); return; }
    // Everything expensive happens here: shader compiles, procedural textures,
    // the sky bake. The boot log is covering real work, not a fake progress bar.
    engine = new Engine(canvas);
    game = new Game(engine, screens);
    // Warm the pipeline so no first sighting in the campaign is a shader-compile stall.
    // Compile against the composer's target: rendering to a target selects
    // different tone-mapping and colour-space variants than the canvas does.
    runPrewarm();
    // Yield without relying on rAF, which may be suspended in background tabs.
    await lifetime.delay(0);
  });
  if (lifetime.closed) return;

  /* ------------------------------------------------------------------ */
  /* Loop wiring                                                         */
  /* ------------------------------------------------------------------ */

  engine.onUpdate((dt, time, realDt) => game.update(dt, time, realDt));
  engine.onLateUpdate((dt, time) => {
    game.lateUpdate(dt, time);
    screens.updateGamepad(engine.input, engine.realDelta);
  });

  engine.onVisibility = (visible) => {
    if (!visible && game.state === STATE.PLAYING) game.pause();
  };

  /* ------------------------------------------------------------------ */
  /* Menu actions                                                        */
  /* ------------------------------------------------------------------ */

  // A shared fortress code in the URL (?seed=4F9K2A) replaces the random seed.
  const sharedSeed = parseSeedCode(new URLSearchParams(location.search).get('seed'));
  if (sharedSeed !== null) {
    const hint = document.getElementById('title-hint');
    if (hint) hint.textContent = `SHARED FORTRESS ${seedCode(sharedSeed)} // ENTER TO ENGAGE`;
  }

  const ensureWarmed = () => {
    const quality = settings.get('quality');
    if (warmedQuality !== quality && game.state !== STATE.PLAYING && game.state !== STATE.DYING && game.state !== STATE.PAUSED) {
      runPrewarm();
    }
  };

  lifetime.listen(screens, 'action', (e) => {
    switch (e.detail) {
      case 'start':
        ensureWarmed();
        game.start({ daily: false, seed: sharedSeed ?? undefined });
        break;
      case 'daily':
        ensureWarmed();
        game.start({ daily: true });
        break;
      case 'retry':
        ensureWarmed();
        game.start();
        break;
      case 'resume':
        if (!engine._contextLost && !engine._resumeAfterRestore) game.resume();
        break;
      case 'continue':
        game.continueLoop();
        break;
      case 'abort':
      case 'title':
        game.reset();
        game.toTitle();
        break;
    }
  });

  /* ------------------------------------------------------------------ */
  /* Global keys                                                         */
  /* ------------------------------------------------------------------ */

  lifetime.listen(engine.input, 'press', (e) => {
    const action = e.detail;
    if (engine.input.lastDevice === 'gamepad' && screens.handleControl(action)) return;

    if (action === 'pause') {
      if (game.state === STATE.PLAYING) game.pause();
      else if (game.state === STATE.PAUSED && !engine._contextLost && !engine._resumeAfterRestore) game.resume();
      return;
    }

    if (action === 'debugPerf') {
      settings.set('perf', !settings.get('perf'));
      return;
    }

    // Enter on the title screen is handled by Screens; this covers the
    // gamepad "A" shortcut when no item happens to be focused.
    if (action === 'confirm' && game.state === STATE.IDLE && screens.current === 'title') {
      ensureWarmed();
      game.start({ daily: false, seed: sharedSeed ?? undefined });
    }
  });

  // Browsers start audio only inside an activation-triggering event: keydown
  // (not Escape), a mouse pointerdown, or pointerup/touchend/click for touch.
  // Keep listening after the first event so a touch's pointerdown, an Escape
  // press or a later OS interruption (call, app switch) recovers on the next
  // real gesture. init() returns at once while audio is running.
  const unlock = () => { audio.init(); };
  for (const type of ['keydown', 'pointerdown', 'pointerup', 'touchend', 'click']) {
    lifetime.listen(window, type, unlock, { capture: true, passive: true });
  }

  /* ------------------------------------------------------------------ */

  engine.start();
  game.toTitle();

  // Handy for tinkering from the console.
  if (import.meta.env?.DEV) {
    window.KZ = { engine, game, screens, settings, audio };
  }
}

main().catch((err) => {
  try { shutdown(); } catch { /* teardown attempted every owner; report the boot error */ }
  console.error(err);
  const log = document.getElementById('boot-log');
  if (log) {
    log.style.color = '#ff3d55';
    log.textContent += `\n\nFATAL: ${err?.message ?? err}\n\nThis build needs WebGL 2.`;
  }
});
