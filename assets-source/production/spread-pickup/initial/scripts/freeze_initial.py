import datetime
import hashlib
import json
import pathlib
import shutil
import tarfile

WORK = pathlib.Path(__file__).resolve().parents[1]
ROOT = WORK.parent
INITIAL = ROOT / 'initial'


def sha(filename):
    return hashlib.sha256(filename.read_bytes()).hexdigest()


assert not INITIAL.exists(), 'Never alter an existing frozen INITIAL'
manifest = json.loads((WORK / 'manifest.json').read_text())
assert manifest['formal_reviews'] == manifest['formal_review_fix_passes'] == 0
assert manifest['production_edits'] is False
shutil.copytree(WORK, INITIAL, ignore=shutil.ignore_patterns('.runtime', '__pycache__', '*.blend1', '*.pyc'))
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
(INITIAL / 'INITIAL_FREEZE.json').write_text(json.dumps({
    'frozen_at_utc': stamp, 'status': 'pending_deferred_opus_review', 'formal_reviews': 0,
    'formal_review_fix_passes': 0, 'mutation_policy': 'Never edit INITIAL; authorized future revisions use another folder',
    'filesystem_protection': 'Read-only 0444 files / 0555 directories, not OS immutable-flag protection',
}, indent=2) + '\n')
files = sorted(filename for filename in INITIAL.rglob('*') if filename.is_file())
checksums = {str(filename.relative_to(INITIAL)): sha(filename) for filename in files}
(INITIAL / 'SHA256SUMS').write_text(''.join(f'{value}  {name}\n' for name, value in checksums.items()))
for filename in INITIAL.rglob('*'):
    if filename.is_file():
        filename.chmod(0o444)
for directory in sorted((filename for filename in INITIAL.rglob('*') if filename.is_dir()), reverse=True):
    directory.chmod(0o555)
INITIAL.chmod(0o555)
archive = pathlib.Path('/tmp') / f'spread-pickup-initial-{stamp}.tar.gz'
with tarfile.open(archive, 'w:gz', compresslevel=9) as package:
    package.add(INITIAL, arcname='spread-pickup-initial')
with tarfile.open(archive, 'r:gz') as package:
    for name, expected in checksums.items():
        data = package.extractfile('spread-pickup-initial/' + name).read()
        assert hashlib.sha256(data).hexdigest() == expected
archive_hash = sha(archive)
sidecar = pathlib.Path(str(archive) + '.sha256')
sidecar.write_text(f'{archive_hash}  {archive.name}\n')
receipt = {
    'asset': 'spread-shot-pickup', 'frozen_initial': str(INITIAL.resolve()),
    'files_hashed_excluding_SHA256SUMS': len(checksums),
    'tree_SHA256SUMS_sha256': sha(INITIAL / 'SHA256SUMS'),
    'archive': str(archive), 'archive_bytes': archive.stat().st_size, 'archive_sha256': archive_hash,
    'archive_sidecar': str(sidecar), 'glb_sha256': sha(INITIAL / 'asset' / 'spread-pickup.glb'),
    'blend_sha256': sha(INITIAL / 'asset' / 'spread-pickup.blend'),
    'formal_reviews': 0, 'formal_review_fix_passes': 0, 'status': 'pending_deferred_opus_review',
    'taildrop_target': '100.112.66.64:', 'transfer_status': 'not yet sent',
    'receiver_verification': 'pending; sender transfer alone is not receiver hash verification',
    'archive_internal_hashes_verified': True,
}
(ROOT / 'delivery.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt, indent=2))
