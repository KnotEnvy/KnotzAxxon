const assert=require('node:assert/strict');
const {sheetNotes}=require('./visual-notes.cjs');
const sheet={id:'SYNTHETIC',sha256:'sheet-hash',completedAt:'2026-11-15T00:00:05.000Z',panels:[
 {panel:1,id:'o1',sha256:'original1',completedAt:'2026-11-15T00:00:00.000Z'},
 {panel:2,id:'o2',sha256:'original2',completedAt:'2026-11-15T00:00:02.000Z'},
 {panel:3,id:'o3',sha256:'original3',completedAt:'2026-11-15T00:00:04.000Z'}]};
const frame=panel=>({panel,facts:['Synthetic red/green/blue panel'],interpretations:[],confidence:'high',limits:['Synthetic only']});
const command={viewed:true,viewedAt:'2026-11-15T00:00:06.000Z',frames:[frame(1),frame(3)]};
const result=sheetNotes(sheet,command,'synthetic','2026-11-15T00:00:07.000Z');
assert.deepEqual(result.map(r=>r.panel),[1,3]);assert.deepEqual(result.map(r=>r.captureToViewedMs),[6000,2000]);
assert(!('viewed' in sheet));assert(!('viewed' in sheet.panels[0]));
assert.throws(()=>sheetNotes(sheet,{...command,viewed:false},'synthetic'));
assert.throws(()=>sheetNotes(sheet,{...command,viewedAt:'invalid'},'synthetic'));
assert.throws(()=>sheetNotes(sheet,{...command,viewedAt:'2026-11-14T00:00:00Z'},'synthetic'));
assert.throws(()=>sheetNotes(sheet,{...command,frames:[frame(1),frame(1)]},'synthetic'));
assert.throws(()=>sheetNotes(sheet,{...command,frames:[frame(4)]},'synthetic'));
assert.throws(()=>sheetNotes(sheet,{...command,frames:[{...frame(1),facts:[]}]},'synthetic'));
const stale=sheetNotes(sheet,{...command,viewedAt:'2026-11-15T00:00:20Z'},'synthetic','2026-11-15T00:00:21Z');
assert.equal(stale[0].captureToViewedMs,20000); // age preserved, not rounded away or waived
console.log('PASS: explicit per-panel acknowledgment/timestamps/age; subset viewing, invalid/duplicate rejection, no mutation or automatic acknowledgment.');
const compact=sheetNotes(sheet,{viewed:true,viewedAt:'2026-11-15T00:00:06Z',confidence:'medium',limits:['Only captured moments'],frames:[
 {panel:1,facts:['Red']},{panel:2,facts:['Green'],viewedAt:'2026-11-15T00:00:07Z'},{panel:3,facts:['Blue']}]},'synthetic','2026-11-15T00:00:08Z');
assert.equal(compact.length,3);assert.equal(compact[0].confidence,'medium');assert.deepEqual(compact[0].interpretations,[]);
assert.equal(compact[1].viewedAt,'2026-11-15T00:00:07Z');assert.equal(compact[1].captureToViewedMs,5000);
console.log('PASS: compact explicit shared confidence/limits, panel-specific facts and optional distinct actual viewedAt.');
