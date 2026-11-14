"""One-way INITIAL freeze. Run after all evidence is generated and actually viewed."""
import json,hashlib,shutil,datetime,tarfile,os
from pathlib import Path
P=Path(__file__).resolve().parent.parent
asset=P.parent;dest=asset/'initial'
assert not dest.exists(),'INITIAL already exists; never mutate a frozen INITIAL.'
assert (P/'evidence/viewing-record.json').exists(),'Evidence must be viewed before freezing.'
manifest=json.loads((P/'manifest.json').read_text());assert manifest['formal_reviews']==0 and manifest['status']=='pending_deferred_opus_review'
dest.mkdir()
for f in ['heavy-turret.blend','heavy-turret.glb','manifest.json','runtime-map.json','README.md']:shutil.copy2(P/f,dest/f)
for directory in ['scripts','source','verification','evidence']:
 shutil.copytree(P/directory,dest/directory,ignore=shutil.ignore_patterns('__pycache__','*.pyc','*.blend1','.runtime','*.tmp'))
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
(dest/'freeze.json').write_text(json.dumps({'state':'INITIAL','status':'pending_deferred_opus_review','frozenUtc':stamp,'formal_reviews':0,'formal_review_fix_rounds':0,'final_art_approval':False,'immutable':True,'hashPolicy':'SHA256SUMS hashes every delivered regular file except SHA256SUMS. No post-freeze modifications.'},indent=2))
hashes=[]
for f in sorted(dest.rglob('*')):
 if f.is_file():hashes.append((hashlib.sha256(f.read_bytes()).hexdigest(),f.relative_to(dest).as_posix()))
(dest/'SHA256SUMS').write_text(''.join(h+'  '+f+'\n' for h,f in hashes))
for h,f in hashes:assert hashlib.sha256((dest/f).read_bytes()).hexdigest()==h
for f in dest.rglob('*'):
 if f.is_file():f.chmod(0o555 if f.name=='blender.sh' else 0o444)
for f in sorted(dest.rglob('*'),reverse=True):
 if f.is_dir():f.chmod(0o555)
dest.chmod(0o555)
archive=Path('/tmp')/('heavy-turret-initial-'+stamp+'.tar.gz')
assert not archive.exists()
with tarfile.open(archive,'w:gz',compresslevel=6) as tar:tar.add(dest,arcname='heavy-turret/initial')
with tarfile.open(archive,'r:gz') as tar:
 assert all(m.name.startswith('heavy-turret/initial') and not any(bad in m.name for bad in ['.runtime','__pycache__','.blend1']) for m in tar.getmembers())
result={'archive':str(archive),'archiveSha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'archiveBytes':archive.stat().st_size,'deliveredHashedFiles':len(hashes),'glbSha256':hashlib.sha256((dest/'heavy-turret.glb').read_bytes()).hexdigest(),'blendSha256':hashlib.sha256((dest/'heavy-turret.blend').read_bytes()).hexdigest(),'checksumManifestSha256':hashlib.sha256((dest/'SHA256SUMS').read_bytes()).hexdigest(),'freeze':str(dest),'transfer':'pending'}
(asset/'transfer-receipt.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2))
