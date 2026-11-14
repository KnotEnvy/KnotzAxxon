/** Allocation-free swept sphere query. Returns first segment contact or Infinity. */
export function segmentSphere(ax, ay, az, bx, by, bz, cx, cy, cz, radius) {
  const dx=bx-ax, dy=by-ay, dz=bz-az;
  const ox=ax-cx, oy=ay-cy, oz=az-cz;
  const c=ox*ox+oy*oy+oz*oz-radius*radius;
  if(c<=0) return 0;
  const a=dx*dx+dy*dy+dz*dz;
  if(a<1e-12) return Infinity;
  const b=ox*dx+oy*dy+oz*dz, disc=b*b-a*c;
  if(disc<0) return Infinity;
  const t=(-b-Math.sqrt(disc))/a;
  return t>=0 && t<=1 ? t : Infinity;
}

/** Slab intersection against a box expanded by projectile radius. */
export function segmentBox(ax,ay,az,bx,by,bz,c,r=0) {
  let near=0, far=1;
  for(let axis=0;axis<3;axis++) {
    const a=axis===0?ax:axis===1?ay:az, b=axis===0?bx:axis===1?by:bz;
    const min=(axis===0?c.minX:axis===1?c.minY:c.minZ)-r;
    const max=(axis===0?c.maxX:axis===1?c.maxY:c.maxZ)+r;
    const d=b-a;
    if(Math.abs(d)<1e-12) { if(a<min || a>max) return Infinity; continue; }
    let lo=(min-a)/d, hi=(max-a)/d;
    if(lo>hi) { const temp=lo; lo=hi; hi=temp; }
    near=Math.max(near,lo); far=Math.min(far,hi);
    if(near>far) return Infinity;
  }
  return near;
}

/** Sweep against a box whose faces move linearly during the simulation step. */
export function segmentMovingBox(ax,ay,az,bx,by,bz,previous,current,r=0) {
  let near=0, far=1;
  for(let axis=0;axis<3;axis++) {
    const a=axis===0?ax:axis===1?ay:az, b=axis===0?bx:axis===1?by:bz;
    const minKey=axis===0?'minX':axis===1?'minY':'minZ';
    const maxKey=axis===0?'maxX':axis===1?'maxY':'maxZ';
    for(let face=0;face<2;face++) {
      const f=face===0 ? a-previous[minKey]+r : previous[maxKey]+r-a;
      const slope=face===0 ? b-a-current[minKey]+previous[minKey] : current[maxKey]-previous[maxKey]-b+a;
      if(Math.abs(slope)<1e-12) { if(f<0) return Infinity; continue; }
      const crossing=-f/slope;
      if(slope>0) near=Math.max(near,crossing); else far=Math.min(far,crossing);
      if(near>far) return Infinity;
    }
  }
  return near;
}
