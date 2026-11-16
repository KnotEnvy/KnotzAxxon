function assertMode(pilotMode,kind,runId){
 if(typeof pilotMode!=='boolean')throw Error('Explicit boolean pilotMode required');
 if(pilotMode ? kind!=='development-live-pilot'||!/^pilot-live-[a-zA-Z0-9_-]+$/.test(runId) : kind!=='final-candidate-live-observation'||!/^final-live-[a-zA-Z0-9_-]+$/.test(runId))throw Error('Run kind/id guard mismatch');
}
function assertRow(pilotMode,spec){
 if(pilotMode ? !/^pilot-live-/.test(spec.id)||spec.seed>=2600001&&spec.seed<=2600060 : !/^live-l(0|1|2|3|7|30)-0[1-5]$/.test(spec.id))throw Error('Trial row mode mismatch');
}
module.exports={assertMode,assertRow};
