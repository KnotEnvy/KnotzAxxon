// Pure validation; caller appends returned notes only after explicit viewing acknowledgment.
function sheetNotes(sheet,command,trialId,acceptedAt=new Date().toISOString()){
 if(command.viewed!==true||!Array.isArray(command.frames)||!command.frames.length)throw Error('Explicit viewed:true and per-panel frames required');
 const accepted=Date.parse(acceptedAt);
 const selected=new Set();
 return command.frames.map(frame=>{
  if(!Number.isInteger(frame.panel)||selected.has(frame.panel))throw Error('Invalid/duplicate panel');selected.add(frame.panel);
  const panel=sheet.panels.find(p=>p.panel===frame.panel);
  const viewedAt=frame.viewedAt??command.viewedAt,viewed=Date.parse(viewedAt);
  if(!Number.isFinite(viewed)||viewed<Date.parse(sheet.completedAt)||viewed>accepted+1000)throw Error('Explicit actual viewedAt must follow sheet creation and precede note acceptance');
  frame={...frame,interpretations:frame.interpretations??command.interpretations??[],confidence:frame.confidence??command.confidence,limits:frame.limits??command.limits};
  if(!panel||!Array.isArray(frame.facts)||!frame.facts.length||frame.facts.some(x=>typeof x!=='string'||!x.trim())||
   !Array.isArray(frame.interpretations)||!Array.isArray(frame.limits)||!['low','medium','high'].includes(frame.confidence))throw Error('Each selected panel needs facts[], interpretations[], limits[], confidence');
  return {trialId,observationId:panel.id,sheetId:sheet.id,panel:panel.panel,sourceScreenshotSha256:panel.sha256,
   sheetSha256:sheet.sha256,viewedAt,noteAcceptedAt:acceptedAt,viewedAtSource:'explicit observer timestamp',
   captureToViewedMs:viewed-Date.parse(panel.completedAt),viewMethod:'labelled contact sheet',observer:'Terra medium visual agent',
   facts:frame.facts,interpretations:frame.interpretations,confidence:frame.confidence,limits:frame.limits};
 });
}
function singleNote(observation,command,trialId,acceptedAt=new Date().toISOString()){
 if(!observation||command.viewed!==true||!Array.isArray(command.facts)||!command.facts.length||command.facts.some(x=>typeof x!=='string'||!x.trim())||!Array.isArray(command.interpretations??[])||!Array.isArray(command.limits)||!['low','medium','high'].includes(command.confidence))throw Error('Explicit viewed:true, known screenshot, facts, confidence and limits required');
 return {trialId,observationId:observation.id,sourceScreenshotSha256:observation.sha256,
 viewedAt:acceptedAt,noteAcceptedAt:acceptedAt,viewedAtSource:'conservative note acceptance after explicit observer acknowledgment',
 captureToViewedMs:Date.parse(acceptedAt)-Date.parse(observation.completedAt),viewMethod:'original single screenshot',observer:'Terra medium visual agent',
 facts:command.facts,interpretations:command.interpretations??[],confidence:command.confidence,limits:command.limits};
}
module.exports={sheetNotes,singleNote};
