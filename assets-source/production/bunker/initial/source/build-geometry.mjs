import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export function generateBunker() {
  const parts = [];
  let current;
  function part(name, bucket, purpose) {
    current = { name, bucket, purpose, positions: [], normals: [] };
    parts.push(current);
  }
  function triangle(first, second, third, outward) {
    let edgeA = second.map((value, axis) => value - first[axis]);
    let edgeB = third.map((value, axis) => value - first[axis]);
    let normal = [edgeA[1] * edgeB[2] - edgeA[2] * edgeB[1], edgeA[2] * edgeB[0] - edgeA[0] * edgeB[2], edgeA[0] * edgeB[1] - edgeA[1] * edgeB[0]];
    if (normal.reduce((sum, value, axis) => sum + value * outward[axis], 0) < 0) {
      [second, third] = [third, second];
      normal = normal.map(value => -value);
    }
    const length = Math.hypot(...normal);
    if (length < 1e-9) throw new Error(`Degenerate triangle in ${current.name}`);
    normal = normal.map(value => value / length);
    for (const vertex of [first, second, third]) {
      current.positions.push(...vertex);
      current.normals.push(...normal);
    }
  }
  function polygon(vertices, outward) {
    for (let index = 1; index < vertices.length - 1; index++) triangle(vertices[0], vertices[index], vertices[index + 1], outward);
  }
  const quad = (vertices, outward) => polygon(vertices, outward);
  const octagon = (width, depth, chamfer, height) => [[-width + chamfer, height, -depth], [width - chamfer, height, -depth], [width, height, -depth + chamfer], [width, height, depth - chamfer], [width - chamfer, height, depth], [-width + chamfer, height, depth], [-width, height, depth - chamfer], [-width, height, -depth + chamfer]];
  function connect(lower, upper) {
    for (let index = 0; index < lower.length; index++) {
      const next = (index + 1) % lower.length;
      const outward = [lower[index][0] + lower[next][0], 0, lower[index][2] + lower[next][2]];
      quad([lower[index], lower[next], upper[next], upper[index]], outward);
    }
  }
  function octPrism(name, bucket, lower, upper, purpose) {
    part(name, bucket, purpose);
    connect(lower, upper);
    polygon(lower, [0, -1, 0]);
    polygon(upper, [0, 1, 0]);
  }
  function box(name, bucket, center, dimensions, purpose) {
    part(name, bucket, purpose);
    const [centerX, centerY, centerZ] = center, [width, height, depth] = dimensions;
    const vertices = [[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1],[-1,1,-1],[1,1,-1],[1,1,1],[-1,1,1]].map(([axisX, axisY, axisZ]) => [centerX + axisX * width / 2, centerY + axisY * height / 2, centerZ + axisZ * depth / 2]);
    for (const [indices, normal] of [[[0,1,5,4],[0,0,-1]],[[1,2,6,5],[1,0,0]],[[2,3,7,6],[0,0,1]],[[3,0,4,7],[-1,0,0]],[[4,5,6,7],[0,1,0]],[[3,2,1,0],[0,-1,0]]]) quad(indices.map(index => vertices[index]), normal);
  }
  octPrism('ground-contact-skirt', 'dark', octagon(3.45, 3.95, .65, 0), octagon(3.45, 3.95, .65, .24), 'Broad continuous ground footing; furthest extent remains inset from source envelope.');
  octPrism('lower-armored-plinth', 'hull', octagon(3.42, 3.92, .64, .24), octagon(3.34, 3.84, .62, .60), 'Sloped bolted foundation belt without corridor overhang.');
  const lower = octagon(3.34, 3.84, .62, .60), upper = octagon(2.62, 3.12, .46, 3.05);
  const normalFor = face => [lower[face][0] + lower[(face + 1) % 8][0], 0, lower[face][2] + lower[(face + 1) % 8][2]];
  function surface(face, coordinate, height, inset = 0) {
    const vertical = (height - .60) / 2.45, horizontal = (coordinate + 1) / 2;
    const next = (face + 1) % 8;
    const vertex = [0,1,2].map(axis => (lower[face][axis] * (1 - horizontal) + lower[next][axis] * horizontal) * (1 - vertical) + (upper[face][axis] * (1 - horizontal) + upper[next][axis] * horizontal) * vertical);
    const normal = normalFor(face), length = Math.hypot(normal[0], normal[2]);
    return vertex.map((value, axis) => value - (axis === 1 ? 0 : normal[axis] * inset / length));
  }
  for (const face of [1, 2, 3, 4, 5, 7]) {
    part(`raked-armor-face-${face}`, 'hull', 'Continuous octagonal raked shell, broad planar armor instead of box pile.');
    quad([lower[face], lower[(face + 1) % 8], upper[(face + 1) % 8], upper[face]], normalFor(face));
  }
  function recessedFace(face, name, horizontal, bottom, top, depth) {
    part(`${name}-shell`, 'hull', 'Genuine omitted shell patch surrounding recessed static hardware.');
    const cuts = [-1, -horizontal, horizontal, 1], heights = [.60, bottom, top, 3.05];
    for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) {
      if (row === 1 && column === 1) continue;
      quad([surface(face, cuts[column], heights[row]), surface(face, cuts[column + 1], heights[row]), surface(face, cuts[column + 1], heights[row + 1]), surface(face, cuts[column], heights[row + 1])], normalFor(face));
    }
    const outer = [[-horizontal,bottom],[horizontal,bottom],[horizontal,top],[-horizontal,top]].map(([coordinate,height]) => surface(face,coordinate,height));
    const inner = [[-horizontal,bottom],[horizontal,bottom],[horizontal,top],[-horizontal,top]].map(([coordinate,height]) => surface(face,coordinate,height,depth));
    part(`${name}-reveal`, 'dark', 'Four real setback reveal walls, not a coplanar painted rectangle.');
    const center = outer[0].map((value, axis) => outer.reduce((sum, vertex) => sum + vertex[axis], 0) / 4);
    for (let edge = 0; edge < 4; edge++) {
      const next = (edge + 1) % 4;
      const outward = center.map((value, axis) => value - (outer[edge][axis] + outer[next][axis]) / 2);
      quad([outer[edge], outer[next], inner[next], inner[edge]], outward);
    }
    part(`${name}-backplate`, 'dark', 'Closed static backing; no interior, door, collision or mechanics.');
    quad(inner, normalFor(face));
  }
  recessedFace(0, 'sealed-service-recess', .39, .84, 2.50, .22);
  recessedFace(6, 'observation-service-recess', .66, 1.58, 2.26, .25);
  function facePanel(face, name, bucket, left, right, bottom, top, inset) {
    part(name, bucket, 'Fitted structural panel on the raked plane.');
    quad([surface(face,left,bottom,inset),surface(face,right,bottom,inset),surface(face,right,top,inset),surface(face,left,top,inset)], normalFor(face));
  }
  facePanel(0,'sealed-service-cover', 'hull', -.335,.335,.94,2.37,.205);
  facePanel(0,'service-cover-tool-inset', 'dark', -.11,.11,1.52,1.70,.198);
  for (const coordinate of [-.29,.29]) {
    facePanel(0,`cover-fixed-clamp-${coordinate}`, 'dark',coordinate-.035,coordinate+.035,1.14,1.34,.193);
    facePanel(0,`cover-fixed-clamp-upper-${coordinate}`, 'dark',coordinate-.035,coordinate+.035,2.03,2.23,.193);
  }
  facePanel(6,'warm-status-strip','neon',-.60,.60,1.70,1.87,.105);
  for (const coordinate of [-.24,.24]) facePanel(6,`observation-mullion-${coordinate}`, 'hull',coordinate-.024,coordinate+.024,1.90,2.21,.19);
  facePanel(6,'recess-shadow-brow','hull',-.66,.66,2.26,2.36,-.025);
  for (const face of [0,2,4,6]) {
    const left = face === 0 ? -.68 : -.81;
    facePanel(face,`fitted-panel-seam-${face}`, 'dark',left,left+.018,.77,2.86,-.009);
    facePanel(face,`lower-belt-joint-${face}`, 'dark',-.96,.96,.63,.685,-.012);
  }
  part('roof-perimeter-bevel','hull','Shallow roof chamfer terminates the shell and catches a readable sky edge.');
  const roof = octagon(2.56,3.06,.46,3.18);
  connect(upper,roof);
  polygon(roof,[0,1,0]);
  octPrism('roof-plant-isolation-seat','dark',octagon(1.31,1.47,.20,3.18),octagon(1.31,1.47,.20,3.29),'Low broad machinery seat, never a turret turntable.');
  part('roof-air-handler-armor','hull','Fixed broad roof machinery hood with tapered chamfers and a real vent opening.');
  const hoodBottom = octagon(1.25,1.41,.20,3.29), hoodTop = octagon(1.06,1.20,.18,3.93), ventOpening = octagon(.85,.98,.12,3.93), ventBack = octagon(.85,.98,.12,3.79);
  connect(hoodBottom,hoodTop);
  for (let edge=0;edge<8;edge++) quad([hoodTop[edge],hoodTop[(edge+1)%8],ventOpening[(edge+1)%8],ventOpening[edge]],[0,1,0]);
  part('roof-vent-recess','dark','Setback intake tray inside hood, no dish, barrel, beacon or weapon emission.');
  for(let edge=0;edge<8;edge++) quad([ventOpening[edge],ventOpening[(edge+1)%8],ventBack[(edge+1)%8],ventBack[edge]],[0,1,0]);
  polygon(ventBack,[0,1,0]);
  for(let index=0;index<5;index++) box(`roof-fixed-louver-${index}`,'hull',[0,3.865,-.76+index*.38],[1.60,.08,.16],'Five static structural slats are readable without fine greeble.');
  for(const side of [-1,1]) {
    box(`roof-load-spreader-${side}`,'dark',[side*1.71,3.23,0],[.22,.10,2.50],'Fitted roof support rails, visibly attached and contained by roof.');
    for(const end of [-1,1]) box(`roof-anchor-${side}-${end}`,'hull',[side*1.71,3.27,end*1.13],[.38,.12,.30],'Broad restrained anchor shoes instead of decorative rivet clouds.');
  }
  octPrism('aft-sealed-access-cap','dark',octagon(.70,.43,.14,3.18).map(([axisX,axisY,axisZ])=>[axisX,axisY,axisZ+2.30]),octagon(.64,.37,.14,3.28).map(([axisX,axisY,axisZ])=>[axisX,axisY,axisZ+2.30]),'Flush static maintenance cap, not an opening door.');
  for(const side of [-1,1]) for(const end of [-1,1]) box(`foundation-key-${side}-${end}`,'dark',[side*2.68,.39,end*3.66],[.38,.28,.24],'Four fitted foundation keys stop short of source bounds.');
  const buckets = {};
  const bounds = [[Infinity,Infinity,Infinity],[-Infinity,-Infinity,-Infinity]];
  for(const bucket of ['hull','dark','neon']) {
    const selected = parts.filter(item=>item.bucket===bucket);
    buckets[bucket]={positions:selected.flatMap(item=>item.positions),normals:selected.flatMap(item=>item.normals)};
  }
  for(const item of parts) for(let index=0;index<item.positions.length;index++) {
    const axis=index%3,value=item.positions[index];
    bounds[0][axis]=Math.min(bounds[0][axis],value);
    bounds[1][axis]=Math.max(bounds[1][axis],value);
  }
  return {schema:1,axis:'Y-up, +Z travel, ground-centered origin',parts,buckets,bounds,triangles:parts.reduce((sum,item)=>sum+item.positions.length/9,0)};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const result=generateBunker(), encoded=JSON.stringify(result);
  fs.writeFileSync(`${output}/asset/bunker-geometry.json`,encoded);
  const ranges={};
  const map=result.parts.map(item=>{
    const start=ranges[item.bucket]??0, count=item.positions.length/9;
    ranges[item.bucket]=start+count;
    return {name:item.name,bucket:item.bucket,triangleOffset:start,triangles:count,purpose:item.purpose};
  });
  fs.writeFileSync(`${output}/asset/part-runtime-map.json`,JSON.stringify({parts:map,materials:{hull:'materials.hull: existing mapped PBR; source tint 0x8a929c; world UV /4',dark:'materials.darkMetal: existing unmapped PBR; source tint white; world UV /3',neon:'materials.neonVertex: existing shared unlit; theme.warm; gain1.1; aAnim [3,.3,sourcePhase]; world UV /8'},bounds:result.bounds,triangles:result.triangles,buckets:ranges},null,2));
  fs.writeFileSync(`${output}/evidence/generator-determinism.json`,JSON.stringify({sha256:crypto.createHash('sha256').update(encoded).digest('hex'),secondRunIdentical:encoded===JSON.stringify(generateBunker()),triangles:result.triangles,bounds:result.bounds},null,2));
  console.log(JSON.stringify({triangles:result.triangles,bounds:result.bounds,buckets:ranges,parts:map.length},null,2));
}
