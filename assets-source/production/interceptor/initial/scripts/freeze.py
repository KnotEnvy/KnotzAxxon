"""Freeze only this authored asset/evidence. No runtime/cache/tool binaries included.
Run only after PNG inspection and manifest completion. Never overwrites initial.
"""
from pathlib import Path
import hashlib,shutil,datetime,tarfile,json,os
OUT=Path(__file__).resolve().parents[1];DEST=OUT.parent/'initial';assert not DEST.exists(),'Immutable initial already exists'
allowed={'.py','.mjs','.js','.json','.md','.txt','.log','.png','.html'}
files=[OUT/'README.md',OUT/'manifest.json',OUT/'interceptor.glb',OUT/'interceptor.blend']
for d in ['scripts','evidence','renders']:
 files.extend(p for p in sorted((OUT/d).rglob('*')) if p.is_file() and p.suffix in allowed and '__pycache__' not in p.parts)
assert (OUT/'evidence/visual-inspection.md') in files
for p in files:
 q=DEST/p.relative_to(OUT);q.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,q)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
lines=[f'{sha(p)}  {p.relative_to(DEST).as_posix()}' for p in sorted(DEST.rglob('*')) if p.is_file()]
(DEST/'SHA256SUMS').write_text('\n'.join(lines)+'\n')
for p in DEST.rglob('*'):
 if p.is_file():p.chmod(0o444)
for p in sorted([x for x in DEST.rglob('*') if x.is_dir()],key=lambda p:len(p.parts),reverse=True):p.chmod(0o555)
DEST.chmod(0o555)
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ');archive=Path('/tmp')/f'enemy-interceptor-initial-ee221ad-{stamp}.tar.gz'
assert not archive.exists()
with tarfile.open(archive,'w:gz',compresslevel=6) as tf:tf.add(DEST,arcname='enemy-interceptor-initial')
sidecar=Path(str(archive)+'.sha256');sidecar.write_text(f'{sha(archive)}  {archive.name}\n')
record={'stage':'pending_deferred_opus_review','frozen_utc':stamp,'initial_directory':str(DEST),'delivered_file_count':len(lines)+1,'all_files_hashed_except_hash_manifest':True,'archive':str(archive),'archive_bytes':archive.stat().st_size,'archive_sha256':sha(archive),'archive_sha_sidecar':str(sidecar),'glb_sha256':sha(DEST/'interceptor.glb'),'blend_sha256':sha(DEST/'interceptor.blend'),'transfer':{'status':'not_attempted_yet','destination':'100.112.66.64:','expected_auto_receive':'/mnt/c/Users/Knotz2/Downloads/','note':'Transfer result recorded outside immutable initial after archive creation.'}}
(OUT.parent/'transfer-record.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record,indent=2))
