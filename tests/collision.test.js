import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segmentSphere } from '../src/core/Collision.js';
test('fast projectile crossing a target between frames hits',()=>assert.equal(segmentSphere(0,0,-10,0,0,10,0,0,0,1),.45));
test('altitude-separated projectile misses',()=>assert.equal(segmentSphere(0,3,-10,0,3,10,0,0,0,1),Infinity));
test('stationary overlap and stationary miss',()=>{assert.equal(segmentSphere(0,0,0,0,0,0,0,0,0,1),0);assert.equal(segmentSphere(2,0,0,2,0,0,0,0,0,1),Infinity);});
test('target behind projectile does not hit',()=>assert.equal(segmentSphere(0,0,3,0,0,5,0,0,0,1),Infinity));
