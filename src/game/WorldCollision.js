import { segmentBox, segmentMovingBox } from '../core/Collision.js';
import { DECK_HALF, ALT_MAX } from '../world/Level.js';

/** One collision contract for hull, bolts, missiles and sight lines. */
export function traceWorld(level, gates, ax,ay,az,bx,by,bz,r,scratch, moving=true) {
  let nearest=Infinity, collider=null;
  const accept=(c, previous=c)=>{
    const t=previous===c ? segmentBox(ax,ay,az,bx,by,bz,c,r) : segmentMovingBox(ax,ay,az,bx,by,bz,previous,c,r);
    if(t<nearest) { nearest=t; collider=c; }
  };
  for(const c of level.collidersNear(Math.min(az,bz)-r,Math.max(az,bz)+r,scratch)) accept(c);
  for(const gate of gates ?? []) {
    if(gate.feature?.kind!=='gate') continue;
    const z=gate.feature.z;
    if(z+1+r<Math.min(az,bz) || z-1-r>Math.max(az,bz)) continue;
    const boxes=gate.collisionBoxes ??= [0,1].map(()=>({minX:-DECK_HALF,maxX:DECK_HALF,minZ:z-1,maxZ:z+1,tag:'gate'}));
    const previous=gate.previousCollisionBoxes ??= boxes.map(c=>({...c}));
    for(let i=0;i<2;i++) {
      boxes[i].minY=i===0?-5:gate.gapY+gate.gapH;
      boxes[i].maxY=i===0?gate.gapY:ALT_MAX+10;
      previous[i].minY=i===0?-5:(gate.previousGapY ?? gate.gapY)+gate.gapH;
      previous[i].maxY=i===0?(gate.previousGapY ?? gate.gapY):ALT_MAX+10;
      accept(boxes[i],moving?previous[i]:boxes[i]);
    }
  }
  return { t:nearest, collider };
}
