// CPU-only admission checks. Outstanding means captured but not explicitly acknowledged.
function admitCapture(observations){
 if(observations.filter(o=>!o.viewed).length>=2)throw Error('Pipeline bounded to two unacknowledged screenshots; view/note an existing frame first');
}
function admitNote(observation){
 if(!observation)throw Error('Unknown pipeline screenshot');
 if(observation.viewed)throw Error('Pipeline screenshot already acknowledged');
}
function acquisitionDelay(command){
 const delay=command.acquireDelayMs??0;
 if(!Number.isInteger(delay)||delay<0||delay>5000)throw Error('Pipeline acquireDelayMs must be integer0..5000');
 return delay;
}
module.exports={admitCapture,admitNote,acquisitionDelay};
