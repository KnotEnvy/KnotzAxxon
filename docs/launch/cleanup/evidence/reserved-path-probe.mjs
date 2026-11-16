// Fault injection into actual reserved-path methods. No browser, audio device or GPU.
import { Audio } from '../../../../src/audio/Audio.js';
import { Screens } from '../../../../src/ui/Screens.js';
import { HUD } from '../../../../src/ui/HUD.js';
import { Game } from '../../../../src/game/Game.js';
const output = [], calls = [];
const fault = () => { throw Error('injected cleanup fault'); };
const audio = Object.assign(Object.create(Audio.prototype), {
  stopMusic: () => calls.push('stopMusic'), stopEngine: () => calls.push('stopEngine'),
  _lifetime: { dispose: fault }, _releaseGraph: () => calls.push('releaseGraph'),
  ctx: { close: () => { calls.push('close'); return Promise.resolve(); } },
});
try { audio.dispose(); } catch {}
output.push({path:'src/audio/Audio.js',method:'dispose',calls:[...calls],expectedAdditional:['releaseGraph','close','scheduler clear']});
calls.length = 0;
const screens = Object.assign(Object.create(Screens.prototype), {
  _cardAnimations:[{cancel:fault}], _lifetime:{dispose:()=>calls.push('lifetime')}, _cardDone:()=>calls.push('card timeout'),
});
try { screens.dispose(); } catch {}
output.push({path:'src/ui/Screens.js',method:'dispose',calls:[...calls],expectedAdditional:['lifetime','card timeout']});
calls.length = 0;
const hud = Object.assign(Object.create(HUD.prototype), {
  _layoutObserver:{disconnect:fault}, reset:()=>calls.push('reset including damage RAF'), setLive:()=>calls.push('hide'),
});
try { hud.dispose(); } catch {}
output.push({path:'src/ui/HUD.js',method:'dispose',calls:[...calls],expectedAdditional:['reset including damage RAF','hide']});
calls.length = 0;
const game = Object.assign(Object.create(Game.prototype), {
  fortress:{clear:fault}, enemies:[{dispose:()=>calls.push('enemy')}], pickups:[{dispose:()=>calls.push('pickup')}],
  boss:{dispose:()=>calls.push('boss')}, projectiles:{clear:()=>calls.push('projectiles')}, fx:{clear:()=>calls.push('fx')}, hud:{reset:()=>calls.push('hud')},
});
try { game.reset(1); } catch {}
output.push({path:'src/game/Game.js',method:'reset',calls:[...calls],expectedAdditional:['enemy','pickup','boss','projectiles','fx','hud']});
const windowTarget = globalThis.window = new EventTarget();
const docTarget = globalThis.document = Object.assign(new EventTarget(), {querySelectorAll:()=>[]});
let partial, added=0, removed=0;
for(const target of [windowTarget,docTarget]) {
  const add=target.addEventListener.bind(target), remove=target.removeEventListener.bind(target);
  target.addEventListener=(...args)=>{added++;return add(...args)};
  target.removeEventListener=(...args)=>{removed++;return remove(...args)};
}
class BrokenScreens extends Screens { _buildSettings(){partial=this;throw Error('settings construction fault');} }
try {new BrokenScreens()} catch {}
output.push({path:'src/ui/Screens.js',method:'constructor',addedRootListeners:added,removedRootListeners:removed});
partial.dispose();
console.log(JSON.stringify(output,null,2));
