const assert=require('node:assert/strict');
const {admitCapture,admitNote}=require('./pipeline.cjs');
const frames=[{id:'N',viewed:false}];
admitCapture(frames);frames.push({id:'N+1',viewed:false});
assert.throws(()=>admitCapture(frames));
admitNote(frames[0]);assert.equal(frames[0].viewed,false); // validation never acknowledges
frames[0].viewed=true;admitCapture(frames);
assert.throws(()=>admitNote(frames[0]));assert.throws(()=>admitNote(undefined));
assert.equal(frames[1].viewed,false);
console.log('PASS pipeline max two outstanding; no automatic acknowledgment; duplicate/unknown note rejected');

const {acquisitionDelay}=require('./pipeline.cjs');
assert.equal(acquisitionDelay({}),0);assert.equal(acquisitionDelay({acquireDelayMs:4000}),4000);
assert.equal(acquisitionDelay({acquireDelayMs:5000}),5000);
for(const acquireDelayMs of [-1,5001,1.2,'4000'])assert.throws(()=>acquisitionDelay({acquireDelayMs}));
console.log('PASS bounded integer acquisition delay0..5000; no timers executed by CPU validator');
