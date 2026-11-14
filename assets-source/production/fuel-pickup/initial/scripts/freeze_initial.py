import hashlib
import json
import os
import pathlib
import shutil
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORK = ROOT / 'work'
INITIAL = ROOT / 'initial'
assert not INITIAL.exists(), 'INITIAL is immutable; never overwrite a delivery'
assert (WORK / 'manifest.json').exists()
shutil.copytree(WORK, INITIAL, ignore=shutil.ignore_patterns('__pycache__', '*.pyc', '*.blend1'))
record = {'revision': 'INITIAL', 'immutable': True, 'formal_reviews': 0, 'formal_fix_passes': 0,
          'opus_review_polish': 'deferred', 'helpers': 0, 'claude_retries': 0,
          'hash_policy': 'SHA256SUMS covers every payload file except itself. Its digest and archive digest/transfer receipt remain outside INITIAL.'}
(INITIAL / 'INITIAL_FREEZE.json').write_text(json.dumps(record, indent=2) + '\n')
files = sorted(path for path in INITIAL.rglob('*') if path.is_file())
checksums = ''.join(hashlib.sha256(path.read_bytes()).hexdigest() + '  ' + str(path.relative_to(INITIAL)) + '\n' for path in files)
(INITIAL / 'SHA256SUMS').write_text(checksums)
archive = ROOT / 'fuel-pickup-INITIAL.zip'
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as output:
    for path in sorted(path for path in INITIAL.rglob('*') if path.is_file()):
        entry = zipfile.ZipInfo('fuel-pickup-INITIAL/' + str(path.relative_to(INITIAL)), date_time=(2026, 11, 14, 0, 0, 0))
        entry.external_attr = 0o100444 << 16
        output.writestr(entry, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
for path in INITIAL.rglob('*'):
    os.chmod(path, 0o555 if path.is_dir() else 0o444)
os.chmod(INITIAL, 0o555)
receipt = {'archive': archive.name, 'bytes': archive.stat().st_size,
           'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
           'SHA256SUMS_sha256': hashlib.sha256((INITIAL / 'SHA256SUMS').read_bytes()).hexdigest(),
           'file_count': len(files) + 1, 'initial_permissions': 'directories0555/files0444', 'taildrop': 'pending'}
(ROOT / 'delivery-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt, indent=2))
