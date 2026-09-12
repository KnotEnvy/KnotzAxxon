import * as THREE from 'three';
import { markerVisible } from './CombatVisibility.js';
import { traceWorld } from './WorldCollision.js';
import { ALT_MIN, ALT_MAX } from '../world/Level.js';

const core = new THREE.Vector3();
const scratch = [];
/** One height echo for a visible target intersecting the next muzzle's forward lane.
 * The band is the actual sphere cross-section at that lane, not an aim instruction. */
export function findAltitudeEcho(game, out = {}) {
  const p = game.player, sx = p.pos.x + (p.muzzleSide ?? 1)*1.6, sz = p.pos.z + 2.4;
  let nearest = 120, found = false;
  const consider = (obj,x,y,z,radius,padding=.9) => {
    const dz=z-p.pos.z, dx=x-sx, r=radius+padding;
    if (dz<6 || dz>=nearest || Math.abs(dx)>=r) return;
    if (!markerVisible(game.engine.camera,game.level,game.fortress?.animated,p.pos.z,x,y,z)) return;
    if (traceWorld(game.level,game.fortress?.animated,sx,y,sz,sx,y,z,.9,scratch,false).t<1) return;
    const half=Math.sqrt(r*r-dx*dx), center=y+.1;
    const min=Math.max(ALT_MIN,center-half), max=Math.min(ALT_MAX,center+half);
    if (min>=max) return;
    nearest=dz;found=true;
    out.min=min;out.max=max;out.center=Math.max(min,Math.min(max,center));
    out.kind=obj.kind ?? 'boss';
  };
  for (const e of game.enemies) if (e.alive && e.kind!=='mine') consider(e,e.pos.x,e.pos.y+e.radius*.4,e.pos.z,e.radius);
  const b=game.boss;
  if (b?.alive && b.active) {
    for (const pod of b.pods) if(pod.alive) consider(b,pod.pos.x,pod.pos.y,pod.pos.z,pod.radius,0);
    if(b.coreOpen>.55){b.coreGroup.getWorldPosition(core);consider(b,core.x,core.y,core.z,6.5,0);}
  }
  scratch.length=0;
  return found ? out : null;
}
