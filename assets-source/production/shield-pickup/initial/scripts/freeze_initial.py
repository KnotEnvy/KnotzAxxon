import datetime
import hashlib
import json
import os
import pathlib
import shutil
import tarfile

WORK = pathlib.Path(__file__).resolve().parents[1]
ROOT = WORK.parent
INITIAL = ROOT / 'initial'
assert not INITIAL.exists(), 'Immutable initial already exists; never overwrite it'
assert json.loads((WORK / 'manifest.json').read_text())['status'] == 'pending_deferred_opus_review'
assert (WORK / 'evidence' / 'viewed-pngs.json').is_file()
INITIAL.mkdir()
for name in ['asset', 'scripts', 'source', 'evidence']:
    shutil.copytree(WORK / name, INITIAL / name, ignore=shutil.ignore_patterns('__pycache__', '*.pyc', '*.blend1', '*.tmp'))
for name in ['README.md', 'manifest.json', 'runtime-map.json']:
    shutil.copy2(WORK / name, INITIAL / name)
files = sorted(path for path in INITIAL.rglob('*') if path.is_file())
checksums = []
for path in files:
    checksums.append(hashlib.sha256(path.read_bytes()).hexdigest() + '  ' + path.relative_to(INITIAL).as_posix())
(INITIAL / 'SHA256SUMS').write_text('\n'.join(checksums) + '\n')
for line in checksums:
    digest, name = line.split('  ', 1)
    assert hashlib.sha256((INITIAL / name).read_bytes()).hexdigest() == digest
for path in sorted(INITIAL.rglob('*'), reverse=True):
    os.chmod(path, path.stat().st_mode & ~0o222)
os.chmod(INITIAL, 0o555)
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
archive = pathlib.Path('/tmp') / ('shield-pickup-initial-' + stamp + '.tar.gz')
with tarfile.open(archive, 'w:gz', compresslevel=6) as output:
    output.add(INITIAL, arcname='shield-pickup/initial', recursive=True)
with tarfile.open(archive) as output:
    members = output.getnames()
    assert all(name == 'shield-pickup/initial' or name.startswith('shield-pickup/initial/') for name in members)
    assert not any(part in ('.runtime', '__pycache__', 'node_modules', 'sysroot') for name in members for part in pathlib.PurePosixPath(name).parts)
delivery = {'asset': 'shield-pickup', 'frozen_initial': str(INITIAL), 'files_hashed_excluding_SHA256SUMS': len(files),
            'archive': str(archive), 'archive_bytes': archive.stat().st_size,
            'archive_sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
            'glb_sha256': hashlib.sha256((INITIAL / 'asset' / 'shield-pickup.glb').read_bytes()).hexdigest(),
            'blend_sha256': hashlib.sha256((INITIAL / 'asset' / 'shield-pickup.blend').read_bytes()).hexdigest(),
            'formal_reviews': 0, 'formal_review_fix_rounds': 0, 'status': 'pending_deferred_opus_review',
            'taildrop_target': '100.112.66.64:', 'transfer_status': 'not_attempted_yet', 'receiver_verification': 'orchestrator pending'}
(ROOT / 'delivery.json').write_text(json.dumps(delivery, indent=2) + '\n')
archive.with_suffix(archive.suffix + '.sha256').write_text(delivery['archive_sha256'] + '  ' + archive.name + '\n')
print(json.dumps(delivery, indent=2))
