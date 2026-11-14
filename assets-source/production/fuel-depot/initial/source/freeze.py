import datetime
import hashlib
import json
import tarfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT.parent
ARCHIVE=BASE/'fuel-depot-initial-2026-11-14.tar.gz'
digest=lambda data:hashlib.sha256(data).hexdigest()
manifest=json.loads((ROOT/'manifest.json').read_text())
assert manifest['reviewStatus']=='pending_deferred_opus_review'
assert manifest['formalReviews']==0 and manifest['formalReviewFixRounds']==0
assert json.loads((ROOT/'evidence/inspection.json').read_text())['actuallyViewed']
allowed={'.blend','.glb','.json','.py','.mjs','.png','.txt','.md'}
content=sorted(path for path in ROOT.rglob('*') if path.is_file() and path.name!='SHA256SUMS')
assert not any(path.is_symlink() for path in ROOT.rglob('*'))
assert all(path.suffix in allowed for path in content)
assert all(not any(part.startswith('.') or part in ('node_modules','__pycache__','tools','cache','temp','libs') for part in path.relative_to(ROOT).parts) for path in content)
checksums={str(path.relative_to(ROOT)):digest(path.read_bytes()) for path in content}
(ROOT/'SHA256SUMS').write_text(''.join(f'{value}  {name}\n' for name,value in checksums.items()))
for path in content+[ROOT/'SHA256SUMS']:
    path.chmod(0o444)
for path in sorted((path for path in ROOT.rglob('*') if path.is_dir()),reverse=True):
    path.chmod(0o555)
ROOT.chmod(0o555)
with tarfile.open(ARCHIVE,'w:gz',compresslevel=6) as archive:
    archive.add(ROOT,arcname='initial',recursive=True)
with tarfile.open(ARCHIVE,'r:gz') as archive:
    names=[]
    for member in archive.getmembers():
        if member.isfile():
            name=member.name.removeprefix('initial/')
            payload=archive.extractfile(member).read()
            assert digest(payload)==(digest((ROOT/'SHA256SUMS').read_bytes()) if name=='SHA256SUMS' else checksums[name])
            names.append(name)
    assert set(names)==set(checksums)|{'SHA256SUMS'}
for name,value in checksums.items():
    assert digest((ROOT/name).read_bytes())==value
archive_hash=digest(ARCHIVE.read_bytes())
(BASE/(ARCHIVE.name+'.sha256')).write_text(f'{archive_hash}  {ARCHIVE.name}\n')
receipt=dict(status='frozen_sender_transfer_not_yet_attempted',frozenAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),initial=str(ROOT),contentFilesExcludingChecksum=len(content),everyContentFileCoveredExceptChecksumItself=True,checksumFileSHA256=digest((ROOT/'SHA256SUMS').read_bytes()),initialMode='directories 0555 / files 0444',archive=str(ARCHIVE),archiveBytes=ARCHIVE.stat().st_size,archiveSHA256=archive_hash,archiveMembersExactlyInitial=True,excluded=['blender wrapper','executables','packages/runtime libraries/sysroot','cache/temp/work logs','unrelated builders','production files'],assets={name:checksums[name] for name in ('asset/fortress-fuel-depot.glb','asset/fortress-fuel-depot.blend','asset/fuel-depot.template.json')},reviewStatus='pending_deferred_opus_review',formalReviews=0,formalReviewFixRounds=0,receiverVerified=False,receiverVerificationOwner='orchestrator')
(BASE/'freeze-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,indent=2))
