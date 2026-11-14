import hashlib
import json
import pathlib
import runpy
import sys


ROOT = pathlib.Path(__file__).resolve().parents[1]
target = pathlib.Path(sys.argv[sys.argv.index('--') + 1]).resolve()
assert target != ROOT and target.name == 'regeneration'
for folder in ['assets', 'source', 'measurements']:
    (target / folder).mkdir(parents=True, exist_ok=True)
module = runpy.run_path(str(ROOT / 'scripts/build.py'), run_name='asteroid_reproduction')
module['build'].__globals__['ROOT'] = target
module['build']()
reports = []
for original in sorted((ROOT / 'assets').glob('*.glb')):
    regenerated = target / 'assets' / original.name
    first = hashlib.sha256(original.read_bytes()).hexdigest()
    second = hashlib.sha256(regenerated.read_bytes()).hexdigest()
    assert first == second, original.name
    reports.append({'file': str(original.relative_to(ROOT)), 'originalSha256': first, 'regeneratedSha256': second, 'byteIdentical': True})
(ROOT / 'measurements/deterministic-rebuild.json').write_text(json.dumps({'method': 'Separate factory-empty native Blender invocation, same analytic generator/specs, separate regeneration directory; GLB binaries compared independently.', 'glbs': reports, 'blendByteIdentityPromised': False}, indent=2) + '\n')
print('DETERMINISTIC_GLB_REBUILD_PASS')
