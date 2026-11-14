import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { Batch, THREE, burnOriginalDreadnought, Rng } from './source_contract.mjs';

const initial = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const widths = { SCALAR:1, VEC2:2, VEC3:3, VEC4:4 };
const formats = {5121:[1,'getUint8'],5123:[2,'getUint16'],5125:[4,'getUint32'],5126:[4,'getFloat32']};

export function loadTemplate(filename) {
  const bytes = fs.readFileSync(filename);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  let document, binary;
  for (let offset = 12; offset < bytes.length;) {
    const length = bytes.readUInt32LE(offset), kind = bytes.readUInt32LE(offset + 4);
    offset += 8;
    if (kind === 0x4e4f534a) document = JSON.parse(bytes.subarray(offset, offset + length).toString());
    if (kind === 0x004e4942) binary = bytes.subarray(offset, offset + length);
    offset += length;
  }
  const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  function accessor(index) {
    const definition = document.accessors[index], buffer = document.bufferViews[definition.bufferView];
    const [size, getter] = formats[definition.componentType], width = widths[definition.type];
    const stride = buffer.byteStride ?? size * width;
    const begin = (buffer.byteOffset ?? 0) + (definition.byteOffset ?? 0);
    const values = Array.from({length:definition.count}, (_, item) => Array.from({length:width}, (_, component) => {
      const raw = view[getter](begin + item * stride + component * size, true);
      return definition.normalized ? raw / (definition.componentType === 5123 ? 65535 : 255) : raw;
    }));
    return values;
  }
  const modules = [];
  function visit(index, parent) {
    const node = document.nodes[index];
    const local = node.matrix ? new THREE.Matrix4().fromArray(node.matrix) : new THREE.Matrix4().compose(
      new THREE.Vector3().fromArray(node.translation ?? [0,0,0]),
      new THREE.Quaternion().fromArray(node.rotation ?? [0,0,0,1]),
      new THREE.Vector3().fromArray(node.scale ?? [1,1,1]));
    const world = parent.clone().multiply(local);
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(world);
    if (node.mesh !== undefined) for (const primitive of document.meshes[node.mesh].primitives) {
      const attributes = Object.fromEntries(Object.entries(primitive.attributes).map(([name, index]) => [name, accessor(index)]));
      assert(attributes._ANIM && attributes._PART && attributes.COLOR_0);
      const vertices = attributes.POSITION.map((position, index) => ({
        position: new THREE.Vector3().fromArray(position).applyMatrix4(world).toArray(),
        normal: new THREE.Vector3().fromArray(attributes.NORMAL[index]).applyMatrix3(normalMatrix).normalize().toArray(),
        uv: attributes.TEXCOORD_0[index], color: attributes.COLOR_0[index].slice(0,3), anim: attributes._ANIM[index],
        part: attributes._PART[index][0]
      }));
      const indices = primitive.indices !== undefined ? accessor(primitive.indices).flat() : vertices.map((_,index) => index);
      const bucket = document.materials[primitive.material].name.replace('DN_', '');
      const geometry = new THREE.BufferGeometry();
      for (const [attribute, property, size] of [['position','position',3],['normal','normal',3],['uv','uv',2],['color','color',3],['aAnim','anim',3]]) {
        geometry.setAttribute(attribute, new THREE.Float32BufferAttribute(indices.flatMap(index => vertices[index][property]), size));
      }
      geometry.computeBoundingBox();
      modules.push({ name:node.name, bucket, vertices:indices.map(index => vertices[index]), geometry,
        minZ:geometry.boundingBox.min.z, maxZ:geometry.boundingBox.max.z });
    }
    for (const child of node.children ?? []) visit(child, world);
  }
  for (const index of document.scenes[document.scene ?? 0].nodes) visit(index, new THREE.Matrix4());
  return { modules, dispose:() => modules.forEach(module => module.geometry.dispose()) };
}

function interpolate(before, after, fraction) {
  const vertex = { part:before.part };
  for (const property of ['position','normal','uv','color','anim']) {
    vertex[property] = before[property].map((value, axis) => value + fraction * (after[property][axis] - value));
  }
  return vertex;
}

function clip(vertices, station, greater) {
  const result = [];
  for (let index=0; index<vertices.length; index++) {
    const current=vertices[index], before=vertices[(index+vertices.length-1)%vertices.length];
    const inside = greater ? current.position[2]>=station-1e-6 : current.position[2]<=station+1e-6;
    const prior = greater ? before.position[2]>=station-1e-6 : before.position[2]<=station+1e-6;
    if (inside !== prior) result.push(interpolate(before,current,(station-before.position[2])/(current.position[2]-before.position[2])));
    if (inside) result.push(current);
  }
  return result;
}

export function appendDreadnought(batch, rng, z0, sector, template) {
  burnOriginalDreadnought(rng,z0,sector);
  const delta=(sector.zStart ?? 0)-3200;
  let emitted=0;
  for (const module of template.modules) {
    if (module.maxZ+delta<=z0+1e-6 || module.minZ+delta>=z0+96-1e-6) continue;
    const bucket=batch._bucket(module.bucket);
    for (let offset=0; offset<module.vertices.length; offset+=3) {
      const triangle=module.vertices.slice(offset,offset+3).map(vertex => ({...vertex,position:[vertex.position[0],vertex.position[1],vertex.position[2]+delta]}));
      const polygon=clip(clip(triangle,z0,true),z0+96,false);
      for (let corner=1; corner<polygon.length-1; corner++) {
        const face=[polygon[0],polygon[corner],polygon[corner+1]];
        const first=new THREE.Vector3().fromArray(face[1].position).sub(new THREE.Vector3().fromArray(face[0].position));
        const second=new THREE.Vector3().fromArray(face[2].position).sub(new THREE.Vector3().fromArray(face[0].position));
        if(first.cross(second).length()<1e-6) continue;
        bucket.reserve(3);
        for(const vertex of face) {
          const normal=vertex.normal;
          const lift=module.bucket==='neon' ? 1 : (normal[1]>.7 ? 1.1 : 1) * (normal[2]<-.7 ? batch.frontLift : Math.abs(normal[0])>.7 ? batch.sideLift : 1);
          batch._vertex(bucket,...vertex.position,...normal,...vertex.uv,...vertex.color,lift,{anim:vertex.anim},0,0,0);
        }
        emitted++;
      }
    }
  }
  return emitted;
}

function lightGain(anim,time) {
  const cycle=(time*anim[1]+anim[2])%1;
  const smooth=(lower,upper,value) => { const ratio=Math.min(1,Math.max(0,(value-lower)/(upper-lower))); return ratio*ratio*(3-2*ratio); };
  if(anim[0]<.5) return 1;
  if(anim[0]<1.5) return .08+1.45*smooth(0,.03,cycle)*(1-smooth(.12,.2,cycle));
  if(anim[0]<2.5) return .18+1.35*cycle**6;
  if(anim[0]<3.5) return .55+.45*Math.sin(cycle*6.2832);
  const hash=Math.sin(Math.floor(time*anim[1]*7+anim[2]*91)*12.9898)*43758.5453;
  return hash-Math.floor(hash)>.22 ? 1 : .25;
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const template=loadTemplate(path.join(initial,'asset/dreadnought.glb'));
  const shared=new Map(['hull','dark','neon'].map(key => [key,new THREE.MeshBasicMaterial({vertexColors:true})]));
  let materialDisposals=0,templateDisposals=0,chunkDisposals=0;
  shared.forEach(material => material.addEventListener('dispose',() => materialDisposals++));
  template.modules.forEach(module => module.geometry.addEventListener('dispose',() => templateDisposals++));
  const chunks=[];
  for(let index=35;index<=44;index++) {
    const rng=new Rng((index*2654435761+1)>>>0),batch=new Batch(),group=new THREE.Group();
    batch.frontLift=batch.sideLift=1.4;
    const triangles=appendDreadnought(batch,rng,index*96,{zStart:3200},template);
    batch.merge(key => shared.get(key),group);
    assert(group.children.length<=3);
    const cueModes=new Set();
    for(const mesh of group.children) {
      assert.equal(mesh.material,shared.get(mesh.material===shared.get('hull')?'hull':mesh.material===shared.get('dark')?'dark':'neon'));
      mesh.geometry.computeBoundingBox();
      assert(mesh.geometry.boundingBox.min.z>=index*96-1e-3 && mesh.geometry.boundingBox.max.z<=(index+1)*96+1e-3);
      const cue=mesh.geometry.getAttribute('aAnim');
      if(cue) for(let vertex=0;vertex<cue.count;vertex++) cueModes.add(cue.getX(vertex));
      assert.notEqual(mesh.geometry,template.modules[0].geometry);
      mesh.geometry.addEventListener('dispose',() => chunkDisposals++);
      mesh.geometry.dispose();
    }
    chunks.push({index,z0:index*96,triangles,primitives:group.children.length,cueModes:[...cueModes]});
  }
  assert.equal(materialDisposals,0);assert.equal(templateDisposals,0);
  const shifted=[];
  for(const sectorStart of [3217,3288]) {
    let triangles=0;
    for(let index=35;index<=46;index++) {
      const batch=new Batch();
      triangles+=appendDreadnought(batch,new Rng(7),index*96,{zStart:sectorStart},template);
    }
    shifted.push({sectorStart,triangles,reason:'Offset and CPU reclip supported at build time; aligned current campaign uses pre-cut sections.'});
  }
  const quality=[];
  for(const drawDistance of [320,440,560,700]) {
    let visibleMax={triangles:0},residentMax={triangles:0};
    for(let playerZ=3100;playerZ<=4400;playerZ++) {
      const first=Math.floor((playerZ-90)/96),last=Math.floor((playerZ+drawDistance)/96);
      for(const [name,lower,upper] of [['visible',first,last],['resident',first-1,last+2]]) {
        const selected=chunks.filter(chunk => chunk.index>=lower && chunk.index<=upper);
        const sample={playerZ,first:lower,last:upper,sections:selected.map(chunk=>chunk.index),triangles:selected.reduce((total,chunk)=>total+chunk.triangles,0),primitives:selected.reduce((total,chunk)=>total+chunk.primitives,0)};
        if(name==='visible'&&sample.triangles>visibleMax.triangles) visibleMax=sample;
        if(name==='resident'&&sample.triangles>residentMax.triangles) residentMax=sample;
      }
    }
    quality.push({drawDistance,behind:90,retention:'first-1 through last+2 inclusive (conservative capacity, not asserted simultaneous traversal state)',nominalVisibleSpan:drawDistance+90,visibleMax,residentMax});
  }
  const cues=[...new Map(template.modules.flatMap(module=>module.vertices.map(vertex=>[vertex.anim.join(','),vertex.anim]))).values()].filter(anim=>anim[0]);
  const cueSamples=cues.map(anim=>({aAnim:anim,min:Math.min(...Array.from({length:1201},(_,index)=>lightGain(anim,index/60))),max:Math.max(...Array.from({length:1201},(_,index)=>lightGain(anim,index/60)))}));
  const result={chunks,wholeTriangles:chunks.reduce((total,chunk)=>total+chunk.triangles,0),wholePrimitives:chunks.reduce((total,chunk)=>total+chunk.primitives,0),
    quality,shifted,ownership:{chunkGeometriesDisposed:chunkDisposals,sharedMaterialDisposalsBeforeShutdown:materialDisposals,templateDisposalsBeforeShutdown:templateDisposals},cueSamples,
    sourcePrototype:'Actual current Batch._vertex + Batch.merge; source animation constants and clock semantics; no WebGL renderer, live game, bloom or gameplay simulation.'};
  template.dispose();shared.forEach(material=>material.dispose());
  result.ownership.templateDisposalsAtShutdown=templateDisposals;
  result.ownership.materialDisposalsAtShutdown=materialDisposals;
  assert.equal(templateDisposals,template.modules.length);assert.equal(materialDisposals,3);
  assert.equal(result.wholeTriangles,16698);
  fs.writeFileSync(path.join(initial,'checks/runtime-fixture.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({chunks,wholeTriangles:result.wholeTriangles,quality,ownership:result.ownership},null,2));
}
