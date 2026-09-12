import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FlightCamera } from '../src/core/FlightCamera.js';
import { Vector3 } from 'three';
test('orthographic image scale is depth independent and survives resize',()=>{
 const c=new FlightCamera(52,16/9,.35,1000); c.setFlightProjection(true,44);
 const a=new Vector3(5,0,-50).project(c), b=new Vector3(5,0,-100).project(c);
 assert.equal(a.x,b.x); c.aspect=1; c.updateProjectionMatrix();
 assert.equal(c.right,44); assert.equal(c.isOrthographicCamera,true);
 c.setFlightProjection(false); assert.notEqual(new Vector3(5,0,-50).project(c).x,new Vector3(5,0,-100).project(c).x);
});
