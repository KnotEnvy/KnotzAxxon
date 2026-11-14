"""Verify a frozen production archive before retaining sources in this checkout."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import stat
import tarfile
import zipfile

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('asset')
p.add_argument('archive', type=Path)
p.add_argument('sha256')
p.add_argument('--checksums', type=Path, help='External all-content SHA256 manifest')
p.add_argument('--archive-root', default='', help='Root directory in archive when using external checksums')
args = p.parse_args()
if not re.fullmatch(r'[a-z0-9-]+', args.asset):
    raise ValueError('Use a simple asset directory name')
digest = hashlib.sha256(args.archive.read_bytes()).hexdigest()
if digest != args.sha256:
    raise ValueError('Archive hash differs from builder handoff')
files, modes = {}, {}


def add_file(name, data, mode):
    path = PurePosixPath(name)
    if path.is_absolute() or '..' in path.parts or path in files:
        raise ValueError(f'Unsafe or duplicate member: {path}')
    files[path], modes[path] = data, mode


if zipfile.is_zipfile(args.archive):
    with zipfile.ZipFile(args.archive) as archive:
        for member in archive.infolist():
            if member.is_dir():
                continue
            mode = member.external_attr >> 16
            if stat.S_IFMT(mode) not in (0, stat.S_IFREG):
                raise ValueError(f'Unsupported ZIP member: {member.filename}')
            add_file(member.filename, archive.read(member), mode)
else:
    with tarfile.open(args.archive) as archive:
        for member in archive.getmembers():
            if member.isdir():
                continue
            if not member.isfile():
                raise ValueError(f'Unsupported TAR member: {member.name}')
            add_file(member.name, archive.extractfile(member).read(), member.mode)
manifests = [path for path in files if path.name == 'SHA256SUMS']
if args.checksums:
    base = PurePosixPath(args.archive_root)
    if base.is_absolute() or '..' in base.parts:
        raise ValueError('Unsafe archive root')
    checksum_text = args.checksums.read_text()
    excluded = set()
elif len(manifests) == 1:
    manifest = manifests[0]
    base = manifest.parent
    checksum_text = files[manifest].decode()
    excluded = {PurePosixPath('SHA256SUMS')}
else:
    raise ValueError('Expected one frozen SHA256SUMS')
content = {path.relative_to(base): data for path, data in files.items()}
checked = set()
for line in checksum_text.splitlines():
    if not line.strip():
        continue
    expected, name = line.split(maxsplit=1)
    path = PurePosixPath(name.lstrip('*'))
    if path.is_absolute() or '..' in path.parts or path in checked:
        raise ValueError(f'Invalid checksum path: {path}')
    if hashlib.sha256(content[path]).hexdigest() != expected:
        raise ValueError(f'Content mismatch: {path}')
    checked.add(path)
if checked != set(content) - excluded:
    raise ValueError('Frozen manifest does not cover every delivered file')
root = Path(__file__).resolve().parents[2]
dest = root / 'assets-source/production' / args.asset / 'initial'
receipt_path = root / 'docs/asset-production' / f'{args.asset}-receipt.json'
receipt = json.loads(receipt_path.read_text()) if receipt_path.exists() else {}
if receipt and receipt.get('sha256') != digest:
    raise ValueError('Existing receipt refers to another frozen archive')
# Verify an existing receipt idempotently; never overwrite a different frozen file.
for path, data in content.items():
    target = dest / str(path)
    if target.exists() and target.read_bytes() != data:
        raise ValueError(f'Frozen destination differs: {target}')
# Curated snapshots intentionally omit archived evidence. Reverify without restoring it.
retained_manifest = dest / 'retainedSHA256SUMS'
if retained_manifest.exists():
    retained_checked = set()
    for line in retained_manifest.read_text().splitlines():
        if not line.strip():
            continue
        expected, name = line.split(maxsplit=1)
        path = PurePosixPath(name.lstrip('*'))
        if path.is_absolute() or '..' in path.parts or path in retained_checked:
            raise ValueError(f'Invalid retained checksum path: {path}')
        if hashlib.sha256((dest / str(path)).read_bytes()).hexdigest() != expected:
            raise ValueError(f'Retained content mismatch: {path}')
        retained_checked.add(path)
    actual = {PurePosixPath(p.relative_to(dest).as_posix()) for p in dest.rglob('*') if p.is_file()}
    if retained_checked != actual - {PurePosixPath('retainedSHA256SUMS')}:
        raise ValueError('Retained manifest does not cover curated snapshot')
    print(json.dumps({**receipt, 'retainedSnapshotReverified': len(retained_checked),
                      'originalArchiveContentReverified': len(checked),
                      'archivedOmissionsPreserved': True}))
    raise SystemExit(0)
for path, data in content.items():
    target = dest / str(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        target.write_bytes(data)
    target.chmod(0o555 if modes[base / path] & 0o111 else 0o444)
for directory in sorted((p for p in dest.rglob('*') if p.is_dir()),
                        key=lambda p: len(p.parts), reverse=True):
    directory.chmod(0o555)
dest.chmod(0o555)
receipt.update(archive=args.archive.name, sha256=digest,
               contentHashesVerified=len(checked), receiver='SuperBeast',
               destination=str(dest.relative_to(root)),
               stage='frozen_initial_pending_deferred_opus_review',
               readOnly=True, executableModesRetained=True)
if args.checksums:
    saved = receipt_path.with_name(f'{args.asset}-content.sha256')
    saved.write_text(checksum_text)
    receipt.update(externalChecksumManifest=saved.name,
                   externalChecksumSha256=hashlib.sha256(checksum_text.encode()).hexdigest(),
                   archiveRoot=str(base))
receipt_path.write_text(
    json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
