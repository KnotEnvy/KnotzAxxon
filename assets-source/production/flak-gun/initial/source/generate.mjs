import fs from 'node:fs';
import * as THREE from 'three';
import { output, write } from './source-harness.mjs';

const parts = [], positions = [], normals = [];
function add(name, bucket, motion, tint, vertices, faces) {
  const start = positions.length / 3;
  for (const face of faces) {
    for (let corner = 1; corner < face.length - 1; corner++) {
      const triangle = [vertices[face[0]], vertices[face[corner]], vertices[face[corner + 1]]];
      const edgeA = new THREE.Vector3().fromArray(triangle[1]).sub(new THREE.Vector3().fromArray(triangle[0]));
      const edgeB = new THREE.Vector3().fromArray(triangle[2]).sub(new THREE.Vector3().fromArray(triangle[0]));
      const normal = edgeA.cross(edgeB).normalize().toArray();
      if (Math.hypot(...normal) < .99) throw new Error(`Degenerate ${name}`);
      for (const vertex of triangle) { positions.push(...vertex); normals.push(...normal); }
    }
  }
  const color = new THREE.Color(tint);
  parts.push({ name, bucket, motion, tint: `0x${tint.toString(16).padStart(6,'0')}`, linearTint: color.toArray(), start, count: positions.length / 3 - start, triangles: (positions.length / 3 - start) / 3, uvScale: 3 });
}
function lathe(name, bucket, motion, tint, profile, segments = 8, centerX = 0, centerZ = 0, axis = 'y') {
  const vertices = [], faces = [];
  for (const [height, radius] of profile) for (let index = 0; index < segments; index++) {
    const angle = Math.PI * 2 * index / segments;
    const point = [radius * Math.cos(angle), height, radius * Math.sin(angle)];
    if (axis === 'x') vertices.push([height + centerX, point[0], point[2] + centerZ]);
    else vertices.push([point[0] + centerX, height, point[2] + centerZ]);
  }
  for (let ring = 0; ring < profile.length - 1; ring++) for (let index = 0; index < segments; index++) {
    const next = (index + 1) % segments;
    const face = [ring * segments + index, (ring + 1) * segments + index, (ring + 1) * segments + next, ring * segments + next];
    faces.push(axis === 'x' ? face.reverse() : face);
  }
  add(name, bucket, motion, tint, vertices, faces);
}
function closedCylinder(name, bucket, motion, tint, bottom, top, radius, segments = 8, centerX = 0, centerZ = 0) {
  const vertices = [], faces = [];
  for (const height of [bottom, top]) for (let index = 0; index < segments; index++) {
    const angle = index * Math.PI * 2 / segments;
    vertices.push([centerX + radius * Math.cos(angle), height, centerZ + radius * Math.sin(angle)]);
  }
  for (let index = 0; index < segments; index++) { const next = (index+1)%segments; faces.push([index,index+segments,next+segments,next]); }
  faces.push(Array.from({length:segments},(_,index)=>index), Array.from({length:segments},(_,index)=>segments*2-1-index));
  add(name,bucket,motion,tint,vertices,faces);
}
function prism(name,bucket,motion,tint,outline,bottom,top) {
  const vertices = [...outline.map(([x,z])=>[x,bottom,z]),...outline.map(([x,z])=>[x,top,z])], count=outline.length;
  const faces = [];
  for(let index=0;index<count;index++){const next=(index+1)%count;faces.push([index,index+count,next+count,next]);}
  faces.push(Array.from({length:count},(_,index)=>index),Array.from({length:count},(_,index)=>count*2-1-index));
  add(name,bucket,motion,tint,vertices,faces);
}
function chamfer(name,bucket,motion,tint,width,depth,bottom,top,cut=.2,centerX=0,centerZ=0) {
  const halfX=width/2,halfZ=depth/2;
  const outline=[[-halfX+cut,-halfZ],[halfX-cut,-halfZ],[halfX,-halfZ+cut],[halfX,halfZ-cut],[halfX-cut,halfZ],[-halfX+cut,halfZ],[-halfX,halfZ-cut],[-halfX,-halfZ+cut]].map(([x,z])=>[x+centerX,z+centerZ]);
  prism(name,bucket,motion,tint,outline,bottom,top);
}
function box(name,bucket,motion,tint,width,height,depth,x,y,z) {
  prism(name,bucket,motion,tint,[[-width/2,-depth/2],[width/2,-depth/2],[width/2,depth/2],[-width/2,depth/2]].map(([px,pz])=>[px+x,pz+z]),y-height/2,y+height/2);
}
chamfer('roof_contact_shoe','dark',0,0xffffff,3.3,3.3,0,.22,.34);
chamfer('sloped_armour_plinth','hull',0,0x8a8e96,2.94,2.94,.22,.72,.38);
closedCylinder('fixed_azimuth_bearing','dark',0,0xffffff,.72,1.14,1.27,12);
lathe('azimuth_split_ring','hull',1,0x8a8e96,[[1.14,1.27],[1.23,1.27],[1.23,1.08],[1.14,1.08]],12);
chamfer('rotating_cradle_deck','hull',1,0x8a8e96,2.48,1.7,1.23,1.43,.24);
for(const [side,label] of [[-1,'L'],[1,'R']]) {
  const profile=[[-.54,1.40],[-.54,1.88],[-.29,2.34],[.28,2.34],[.53,1.87],[.53,1.40]];
  const vertices=[];
  for(const x of [side*.94-.13,side*.94+.13])for(const [z,y] of profile) vertices.push([x,y,z]);
  const faces=[];
  for(let index=0;index<6;index++){const next=(index+1)%6;faces.push([index,next,next+6,index+6]);}
  faces.push([5,4,3,2,1,0],[6,7,8,9,10,11]);
  add(`trunnion_yoke_${label}`,'hull',1,0x8a8e96,vertices,faces);
  const hubVertices=[],hubFaces=[];
  for(const x of [side*1.08,side*1.20]) for(let index=0;index<8;index++){
    const angle=index*Math.PI/4;hubVertices.push([x,2.1+.25*Math.cos(angle),.25*Math.sin(angle)]);
  }
  for(let index=0;index<8;index++){const next=(index+1)%8;hubFaces.push([index,index+8,next+8,next]);}
  hubFaces.push([7,6,5,4,3,2,1,0],[8,9,10,11,12,13,14,15]);
  add(`bearing_cap_${label}`,'dark',1,0xffffff,hubVertices,side>0?hubFaces.map(face=>face.reverse()):hubFaces);
  box(`recoil_receiver_${label}`,'hull',2,0x8a8e96,.53,.75,.53,side*.45,2.27,0);
  lathe(`jacket_and_recessed_bore_${label}`,'dark',2,0xffffff,[[2.55,.185],[3.50,.185],[3.63,.165],[5.81,.145],[5.89,.155],[6.30,.138],[6.30,.096],[6.03,.096]],8,side*.45);
  closedCylinder(`bore_shadow_floor_${label}`,'dark',2,0x555c68,6.025,6.03,.096,8,side*.45);
  closedCylinder(`recoil_piston_${label}`,'dark',2,0xffffff,2.04,3.24,.065,6,side*.45,.25);
  box(`yoke_heel_brace_${label}`,'dark',1,0xffffff,.20,.42,.64,side*.85,1.52,.28);
}
box('paired_receiver_bridge','dark',2,0xffffff,.44,.24,.38,0,2.30,0);
const shaftVertices=[],shaftFaces=[];
for(const x of [-.98,.98])for(let index=0;index<8;index++){
  const angle=index*Math.PI/4;shaftVertices.push([x,2.1+.13*Math.cos(angle),.13*Math.sin(angle)]);
}
for(let index=0;index<8;index++){const next=(index+1)%8;shaftFaces.push([index,next,next+8,index+8]);}
shaftFaces.push([0,7,6,5,4,3,2,1],[8,9,10,11,12,13,14,15]);
add('elevation_cross_shaft','dark',1,0xffffff,shaftVertices,shaftFaces);
const data={schema:'fortress-flak-gun-v1',coordinateSystem:'game X right, Y up, Z travel; metres/world units',referencePose:{pitch:1.15,yaw:-.85,roofY:0,x:0,z:0},pivotY:2.1,barrelLength:4.2,offsets:[-.45,.45],positions,normals,parts,buckets:['hull','dark'],triangles:positions.length/9};
write('asset/flak-gun.template.json',data);
write('runtime-map.json',{
  schema:data.schema,root:'FORTRESS_ROOFTOP_FLAK',pivot:'barrel_elevation_pivot',yaw:'azimuth_turntable',
  materialMap:{
    hull:{name:'FG_hull_mapped_response',runtime:'materials.hull',maps:'existing shared hull map/normalMap/roughnessMap',normalScale:[1.1,1.1],metalness:.36,roughness:1,vertexColors:true,envMapIntensity:1.5},
    dark:{name:'FG_darkMetal_unmapped_response',runtime:'materials.darkMetal',baseColor:'0x3a4a5e',metalness:.5,roughness:.46,vertexColors:true,maps:null}
  },
  vertexAttributes:{
    position:'Canonical template positions: motion0 roof frame, motion1 yaw about origin, motion2 pitch about Y2.1 then yaw; final x/roofY/z translation; no per-prop scale',
    normal:'Canonical per-triangle flat normals undergo matching orthonormal pitch/yaw transform, then existing shared hull normalMap perturbs them only in the hull bucket; dark stays unmapped',
    color:'Runtime uses per-part sRGB-decoded linearTint with source-style height/up/front/side AO. Reference GLB COLOR_0 = Batch color/1.1; decode using node.extras.GLB_COLOR0_decode_gain=1.1. Preview PBR factor includes this gain.',
    uv:'Runtime dominant-world-face box projection (u,v) = world coordinates/3. Reference GLB stores (u,1-v), decode V=1-GLB_V. Recompute after posing and placement rather than repeating local reference UVs.'
  },
  parts,draws:'No new draws: both buckets already present in every affected chunk; GLB nodes are authoring structure only, never instantiated per prop',
  lifetime:'prepare once at startup; stamp transformed vertices once per chunk build; chunk-owned merged geometry disposed exactly once by Fortress._disposeChunk; shared templates/materials/maps survive until application shutdown'
});
console.log(JSON.stringify({triangles:data.triangles,parts:parts.length,buckets:Object.fromEntries(data.buckets.map(bucket=>[bucket,parts.filter(part=>part.bucket===bucket).reduce((sum,part)=>sum+part.triangles,0)]))}));
