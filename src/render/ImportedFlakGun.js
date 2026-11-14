// Adapted from the frozen rooftop flak initial runtime recipe.
import * as THREE from 'three';

export function prepareFlakGun(data) {
  if(data.schema!=='fortress-flak-gun-v1')throw new Error('Unsupported flak template');
  const triangles=data.triangles;
  let positions=new Float32Array(data.positions),normals=new Float32Array(data.normals);
  let posed=new Float32Array(positions.length),posedNormals=new Float32Array(normals.length);
  let parts=data.parts.map(part=>({...part,linearTint:new Float32Array(part.linearTint)}));
  const countHull=parts.filter(part=>part.bucket==='hull').reduce((sum,part)=>sum+part.count,0);
  const countDark=parts.filter(part=>part.bucket==='dark').reduce((sum,part)=>sum+part.count,0);
  let retained=true,stamps=0;
  function stamp(batch,pitch,yaw,x,z,roofY=0) {
    if(!retained)throw new Error('Flak template released');
    if(pitch<1||pitch>1.3||yaw< -1.1||yaw> -.6)throw new Error('Outside full source pose range');
    const cosYaw=Math.cos(yaw),sinYaw=Math.sin(yaw),alpha=Math.PI/2-pitch,cosPitch=Math.cos(alpha),sinPitch=Math.sin(alpha);
    const hull=batch._bucket('hull'),dark=batch._bucket('dark');
    hull.reserve(countHull);dark.reserve(countDark);
    for(const part of parts) {
      let minY=Infinity,maxY=-Infinity;
      const end=(part.start+part.count)*3;
      for(let offset=part.start*3;offset<end;offset+=3) {
        let px=positions[offset],py=positions[offset+1],pz=positions[offset+2];
        let nx=normals[offset],ny=normals[offset+1],nz=normals[offset+2];
        if(part.motion===2) {
          const pivotY=py-2.1,tiltedY=pivotY*cosPitch+pz*sinPitch;
          pz=-pivotY*sinPitch+pz*cosPitch;py=tiltedY+2.1;
          const tiltedNormalY=ny*cosPitch+nz*sinPitch;nz=-ny*sinPitch+nz*cosPitch;ny=tiltedNormalY;
        }
        if(part.motion!==0) {
          const rotatedX=px*cosYaw+pz*sinYaw;pz=-px*sinYaw+pz*cosYaw;px=rotatedX;
          const rotatedNormalX=nx*cosYaw+nz*sinYaw;nz=-nx*sinYaw+nz*cosYaw;nx=rotatedNormalX;
        }
        posed[offset]=px;posed[offset+1]=py;posed[offset+2]=pz;
        posedNormals[offset]=nx;posedNormals[offset+1]=ny;posedNormals[offset+2]=nz;
        minY=Math.min(minY,py);maxY=Math.max(maxY,py);
      }
      const bucket=part.bucket==='hull'?hull:dark,span=maxY-minY,tint=part.linearTint;
      for(let offset=part.start*3;offset<end;offset+=9) {
        const edgeAX=posed[offset+3]-posed[offset],edgeAY=posed[offset+4]-posed[offset+1],edgeAZ=posed[offset+5]-posed[offset+2];
        const edgeBX=posed[offset+6]-posed[offset],edgeBY=posed[offset+7]-posed[offset+1],edgeBZ=posed[offset+8]-posed[offset+2];
        const faceX=Math.abs(edgeAY*edgeBZ-edgeAZ*edgeBY),faceY=Math.abs(edgeAZ*edgeBX-edgeAX*edgeBZ),faceZ=Math.abs(edgeAX*edgeBY-edgeAY*edgeBX);
        const plane=faceX>=faceY&&faceX>=faceZ?0:faceY>=faceZ?1:2;
        for(let corner=0;corner<3;corner++) {
          const vertex=offset+corner*3;
          const wx=posed[vertex]+x,wy=posed[vertex+1]+roofY,wz=posed[vertex+2]+z;
          const nx=posedNormals[vertex],ny=posedNormals[vertex+1],nz=posedNormals[vertex+2];
          let shade=span>.6?.58+.42*Math.sqrt(Math.max(0,posed[vertex+1]-minY)/span):1;
          if(ny>.7)shade*=1.1;
          if(nz< -.7)shade*=batch.frontLift;else if(Math.abs(nx)>.7)shade*=batch.sideLift;
          const u=(plane===0?wz:wx)/part.uvScale,v=(plane===1?wz:wy)/part.uvScale;
          batch._vertex(bucket,wx,wy,wz,nx,ny,nz,u,v,tint[0],tint[1],tint[2],shade,null,x,roofY,z);
        }
      }
    }
    stamps++;
  }
  function flakGun(batch,rng,x,z,emit,y=0) {
    const pitch=rng.range(1.0,1.3),yaw=-rng.range(0.6,1.1);
    stamp(batch,pitch,yaw,x,z,y);
    const tip=new THREE.Vector3(0,4.2*Math.cos(Math.PI/2-pitch)+2.1,-4.2*Math.sin(Math.PI/2-pitch)).applyAxisAngle(new THREE.Vector3(0,1,0),yaw);
    const dir=new THREE.Vector3(0,Math.cos(Math.PI/2-pitch),-Math.sin(Math.PI/2-pitch)).applyAxisAngle(new THREE.Vector3(0,1,0),yaw);
    emit('flak',x+tip.x,y+tip.y,z+tip.z,rng.range(0.25,0.45),dir);
  }
  return {stamp,flakGun,get statistics(){return{retained,stamps,triangles,templateBytes:positions?.byteLength+normals?.byteLength||0,scratchBytes:posed?.byteLength+posedNormals?.byteLength||0};},dispose(){if(!retained)return;positions=normals=posed=posedNormals=parts=null;retained=false;}};
}

let loadedTemplate;
export async function loadImportedFlakGun(base) {
  const response = await fetch(base + 'flak-gun.template.json');
  if (!response.ok) throw new Error('Flak template failed to load');
  loadedTemplate = prepareFlakGun(await response.json());
}
export function appendImportedFlakGun(batch, rng, x, z, emit, y = 0) {
  if (!loadedTemplate) return false;
  // Keep the original base rectangle when a caller requests decorative surfaces.
  if (batch.captureSurfaces) batch.surfaces.push({minX:x-1.7,maxX:x+1.7,minZ:z-1.7,maxZ:z+1.7,top:y+1.2});
  loadedTemplate.flakGun(batch, rng, x, z, emit, y);
  return true;
}
export function disposeImportedFlakGun() { loadedTemplate?.dispose();loadedTemplate = undefined; }
