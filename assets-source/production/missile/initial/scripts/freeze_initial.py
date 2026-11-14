import hashlib
import json
import os
import shutil
import stat
import zipfile
from datetime import datetime, timezone
from pathlib import Path

WORK = Path(__file__).resolve().parents[1]
ROOT = WORK.parent
INITIAL = ROOT / 'initial'
ALLOWED = {'assets', 'source', 'references', 'scripts', 'evidence', 'README.md', 'ADAPTER_RECIPE.md', 'manifest.json', 'gallery.html'}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


assert not INITIAL.exists(), 'Frozen initial must never be overwritten or edited.'
binary = json.loads((WORK / 'evidence/glb-binary-inspection.json').read_text())
build = json.loads((WORK / 'evidence/build-metrics.json').read_text())
source = json.loads((WORK / 'evidence/source-contract.json').read_text())
pool = json.loads((WORK / 'evidence/pool-asset-cpu-verification.json').read_text())
viewed = json.loads((WORK / 'evidence/viewed-pngs.json').read_text())
renders = json.loads((WORK / 'evidence/render-records.json').read_text())
assert build['build_number'] == 2 and int((ROOT / '.runtime/build-count.txt').read_text()) == 2
assert binary['triangles'] == 464 and binary['visible_primitives'] == 1
assert viewed['actually_opened_pngs'] and viewed['source_camera_findings']
assert len({entry['file'] for entry in renders['records']}) >= 36
assert pool['disposal_counters'] == {'owned_geometry': 1, 'owned_material': 1, 'library_material': 0, 'template_geometry': 0, 'template_material': 0}
assert digest(WORK / 'source/src/entities/Projectiles.js') == source['baseline']['source_sha256']
frozen_at = datetime.now(timezone.utc).isoformat()
manifest = {'asset': 'MISSILE projectile', 'stage': 'pending_deferred_opus_review', 'formal_reviews': 0, 'formal_fix_passes': 0, 'construction_builds': 2, 'construction_note': 'Original geometry design, second build corrects nozzle winding for FrontSide; no formal review/polish pass.', 'helpers': 0, 'claude_attempts': 0, 'production_edits': False, 'publishing': False, 'checkout_updates': False, 'baseline_commit': 'ee221ad3e05cd66292fe02b71b50f513696bdda2', 'frozen_at_utc': frozen_at, 'asset_files': {str(path.relative_to(WORK)): {'bytes': path.stat().st_size, 'sha256': digest(path)} for path in sorted((WORK / 'assets').iterdir()) if path.suffix in ('.blend', '.glb')}, 'measurements': binary, 'editable_parts': build['editable_parts'], 'palette_srgb': build['palette_srgb'], 'palette_linear': build['palette_linear'], 'source_mechanics': 'evidence/source-contract.json and README.md', 'source_material_and_disposal': 'ADAPTER_RECIPE.md', 'detach_charge_animation': 'N/A: static munition; existing launcher precharge remains source-owned and unchanged', 'source_snapshots': {str(path.relative_to(WORK)): {'sha256': digest(path), 'bytes': path.stat().st_size} for path in sorted((WORK / 'source').rglob('*')) if path.is_file()}, 'selected_reference_binaries': {str(path.relative_to(WORK)): {'sha256': digest(path), 'bytes': path.stat().st_size, 'use': 'same-world-scale style/launch-context evidence only; not merged/exported into missile'} for path in sorted((WORK / 'references').iterdir())}, 'evidence': {'render_records': 'evidence/render-records.json', 'png_count': len(list((WORK / 'evidence/png').glob('*.png'))), 'viewed_record': 'evidence/viewed-pngs.json', 'live_webgl': False, 'cpu_only_source_harness': True, 'analytic_pixel_extents': True, 'runtime_gpu_draw_count_measured': False, 'source_collision_simulation': False, 'sentinel_pose': 'shipped rest hierarchy; actual source launcher methods, not Boss.update animation'}, 'frozen_scope': 'Only asset/source/generator/evidence/reference snapshots; no runtime binaries, dependencies, caches, credentials, temp, unrelated work or .blend1 backups.', 'checksum_contract': 'Every content file listed by SHA256SUMS except SHA256SUMS itself; no frozen content may change after hashing.', 'delivery': {'authorization': 'Explicit original user and assignment authorization; no redundant confirmation', 'mechanism': 'Windows Tailscale CLI Taildrop', 'destination': '100.112.66.64:', 'status_at_freeze': 'Sender transfer follows archive freeze; outer delivery-receipt.json records actual outcome', 'receiver_hash_verification': 'orchestrator responsibility, not claimed'}}
(WORK / 'manifest.json').write_text(json.dumps(manifest, indent=2))
INITIAL.mkdir()
for path in sorted(WORK.rglob('*')):
    relative = path.relative_to(WORK)
    if relative.parts[0] not in ALLOWED or not path.is_file():
        continue
    if '__pycache__' in relative.parts or path.suffix in ('.pyc', '.blend1'):
        continue
    assert not path.is_symlink()
    target = INITIAL / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(path, target)
content_files = sorted(path for path in INITIAL.rglob('*') if path.is_file())
checksums = ''.join(f'{digest(path)}  {path.relative_to(INITIAL).as_posix()}\n' for path in content_files)
(INITIAL / 'SHA256SUMS').write_text(checksums)
for path in INITIAL.rglob('*'):
    if path.is_file():
        path.chmod(0o444)
for path in sorted((path for path in INITIAL.rglob('*') if path.is_dir()), reverse=True):
    path.chmod(0o555)
INITIAL.chmod(0o555)
for entry in checksums.splitlines():
    expected, relative = entry.split('  ', 1)
    assert digest(INITIAL / relative) == expected
archive = ROOT / 'missile-INITIAL.zip'
assert not archive.exists()
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
    for path in sorted(INITIAL.rglob('*')):
        if path.is_file():
            bundle.write(path, 'missile-INITIAL/' + path.relative_to(INITIAL).as_posix())
with zipfile.ZipFile(archive) as bundle:
    assert bundle.testzip() is None
    assert len(bundle.namelist()) == len(content_files) + 1
    for path in content_files:
        assert hashlib.sha256(bundle.read('missile-INITIAL/' + path.relative_to(INITIAL).as_posix())).hexdigest() == digest(path)
(ROOT / (archive.name + '.sha256')).write_text(f'{digest(archive)}  {archive.name}\n')
receipt = {'archive': archive.name, 'archive_bytes': archive.stat().st_size, 'archive_sha256': digest(archive), 'glb_sha256': digest(INITIAL / 'assets/missile.glb'), 'blend_sha256': digest(INITIAL / 'assets/missile.blend'), 'SHA256SUMS_sha256': digest(INITIAL / 'SHA256SUMS'), 'content_files_excluding_checksum': len(content_files), 'readonly': 'files0444/directories0555', 'local_checksum_verification': 'PASS, filesystem and every archive member', 'sender_status': 'PENDING_AUTHORIZED_TAILDROP', 'destination': '100.112.66.64:', 'receiver_verified': False, 'frozen_at_utc': frozen_at}
(ROOT / 'delivery-receipt.json').write_text(json.dumps(receipt, indent=2))
print(json.dumps(receipt, indent=2))
