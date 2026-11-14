import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import { home, root, THREE, write } from './source-harness.mjs';

globalThis.localStorage={getItem:()=> '{}',setItem:()=>{}};
const { settings, CAMERA_MODES }=await import(pathToFileURL(`${root}/src/core/Settings.js`));
const { CameraRig }=await import(pathToFileURL(`${root}/src/game/CameraRig.js`));
const { FlightCamera }=await import(pathToFileURL(`${root}/src/core/FlightCamera.js`));
const world=JSON.parse(fs.readFileSync(`${home}/evidence/world-candidate-seed42-chunk0.json`));
const source=JSON.parse(fs.readFileSync(`${home}/evidence/source-geometry.json`));
const recipe=JSON.parse(fs.readFileSync(`${home}/asset/covered-fighter.recipe.json`));
const placement=world.placements[0];
const state=process.env.COVERED_CAMERA_STATE ?? 'near-shoulder';
const player={pos:new THREE.Vector3(state==='centerlane'?0:14,9,placement.z-18),velocity:new THREE.Vector3()};
const cameras=[];
for (const mode of ['classic','modern','chase']) {
  settings.values.camera=mode;
  const camera=new FlightCamera(58,1280/720,.1,1000);
  const rig=new CameraRig(camera);
  rig.snap(player);
  const projections={};
  for (const variant of ['source','candidate']) {
    const positions=variant==='source'?[...source.buckets.hull.positions,...source.buckets.dark.positions]:recipe.parts.filter(part=>part.bucket!=='paint').flatMap(part=>part.positions);
    const projected=[];
    for (let index=0;index<positions.length;index+=3) {
      const [x,y,z]=positions.slice(index,index+3);
      const point=new THREE.Vector3(x*Math.cos(placement.yaw)+z*Math.sin(placement.yaw)+placement.x,y,-x*Math.sin(placement.yaw)+z*Math.cos(placement.yaw)+placement.z).project(camera);
      projected.push(point);
    }
    const min=[0,1,2].map(axis=>Math.min(...projected.map(point=>point.getComponent(axis))));
    const max=[0,1,2].map(axis=>Math.max(...projected.map(point=>point.getComponent(axis))));
    projections[variant]={ndcMin:min,ndcMax:max,pixelWidth:(max[0]-min[0])*640,pixelHeight:(max[1]-min[1])*360,insideFrustum:min.every(value=>value>=-1)&&max.every(value=>value<=1),occlusionChecked:false};
  }
  cameras.push({mode,state,sourceRig:CAMERA_MODES[mode],eye:camera.position.toArray(),lookAt:rig.lookAt.toArray(),fov:camera.fov,orthographic:camera.classic,halfHeight:camera.halfHeight,width:1280,height:720,player:player.pos.toArray(),placement,projections});
}
write(state==='centerlane'?'evidence/camera-evidence-centerlane.json':'evidence/camera-evidence.json',{method:'Actual source CameraRig.snap and FlightCamera matrices under deterministic stationary player, no shake/boost/boss framing. NDC projection is finite-frustum evidence only; rendered offline images are not live GPU acceptance.',cameras});
console.log(JSON.stringify(cameras.map(({mode,projections})=>({mode,projections})),null,2));
