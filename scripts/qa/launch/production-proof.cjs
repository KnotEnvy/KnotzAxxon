// Shared provenance rules for coordinators and the offline release auditor.
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const identityKeys=['sourceHash','manifestSHA256','fileCount','entry','entrySHA256'];
function samePackage(a,b){return !!a&&!!b&&identityKeys.every(key=>a[key]===b[key]);}
function packageIdentity(bundle){
  return {sourceHash:bundle.manifest.source.sourceHash,manifestSHA256:bundle.manifestSHA256,
    fileCount:bundle.files.size,entry:bundle.entry,entrySHA256:bundle.files.get(bundle.entry).sha256};
}
function validProof(proof,candidate){
  return !!proof&&proof.kind==='hash-verified-production'&&proof.sourceHash===candidate&&
    hash(proof.manifestSHA256)&&hash(proof.entrySHA256)&&Number.isInteger(proof.fileCount)&&proof.fileCount>0&&
    proof.browserFilesHashMatched===proof.fileCount&&typeof proof.entry==='string'&&
    /^assets\/[A-Za-z0-9_.-]+\.js$/.test(proof.entry)&&
    proof.bridge?.debugApiAbsentBeforeQA===true&&proof.bridge?.shippedBytesUnmodified===true&&
    proof.bridge?.debuggerDetachedBeforePlay===true&&proof.bridge?.entrySHA256===proof.entrySHA256;
}
function productionCreditError(row,receipt,candidate,expectedFreeze){
  if(!validProof(row.servedBuild,candidate))return 'missing-or-invalid-production-proof';
  if(!validProof(receipt?.servedBuild,candidate)||!samePackage(row.servedBuild,receipt.servedBuild)||
    receipt.stablePackage!==true||!samePackage(row.servedBuild,receipt.productionPackageBefore)||
    !samePackage(row.servedBuild,receipt.productionPackageAfter))return 'unverified-or-changing-production-package';
  if(expectedFreeze&&!expectedFreeze.productionPackages?.some(p=>samePackage(p,row.servedBuild)))return 'package-not-in-frozen-candidate';
  return null;
}
module.exports={packageIdentity,samePackage,validProof,productionCreditError};
