import { Lifetime } from './core/Lifetime.js';
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
import { Game, STATE } from './game/Game.js';
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
    lifetime.dispose();
    engine?.stop(); game?.dispose(); screens.dispose(); audio.dispose();
    disposeEnemyGeometry(); disposePickupGeometry(); disposeFortressTemplates();
    engine?.dispose(); disposeTextures();
    if (window.KZ?.engine === engine) delete window.KZ;
  };

  await screens.boot(async () => {
    if (lifetime.closed) return;
    // Everything expensive happens here: shader compiles, procedural textures,
    // the sky bake. The boot log is covering real work, not a fake progress bar.
    engine = new Engine(canvas);
    game = new Game(engine, screens);
    // Warm the pipeline so no first sighting in the campaign is a shader-compile stall.
    // Compile against the composer's target: rendering to a target selects
    // different tone-mapping and colour-space variants than the canvas does.
    game.prewarm(() => {
      const renderer = engine.renderer, previous = renderer.getRenderTarget();
      renderer.setRenderTarget(engine.postfx.composer.readBuffer);
      renderer.compile(engine.scene, engine.camera);
      renderer.setRenderTarget(previous);
    });
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

  lifetime.listen(screens, 'action', (e) => {
    switch (e.detail) {
      case 'start':
      case 'retry':
        game.start();
        break;
      case 'resume':
        game.resume();
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
      else if (game.state === STATE.PAUSED) game.resume();
      return;
    }

    if (action === 'debugPerf') {
      settings.set('perf', !settings.get('perf'));
      return;
    }

    // Enter on the title screen is handled by Screens; this covers the
    // gamepad "A" shortcut when no item happens to be focused.
    if (action === 'confirm' && game.state === STATE.IDLE && screens.current === 'title') {
      game.start();
    }
  });

  // Any first interaction unlocks the audio context.
  const unlock = () => { audio.init(); };
  lifetime.listen(window, 'pointerdown', unlock, { once: true });
  lifetime.listen(window, 'keydown', unlock, { once: true });

  /* ------------------------------------------------------------------ */

  engine.start();
  game.toTitle();

  // Handy for tinkering from the console.
  if (import.meta.env?.DEV) {
    window.KZ = { engine, game, screens, settings, audio };
  }
}

main().catch((err) => {
  shutdown();
  console.error(err);
  const log = document.getElementById('boot-log');
  if (log) {
    log.style.color = '#ff3d55';
    log.textContent += `\n\nFATAL: ${err?.message ?? err}\n\nThis build needs WebGL 2.`;
  }
});
