import hashlib
import json
import pathlib
import subprocess

WORK = pathlib.Path(__file__).resolve().parents[1]


def digest(name):
    return hashlib.sha256((WORK / 'asset' / name).read_bytes()).hexdigest()


before = {name: digest(name) for name in ['fuel-pickup.glb', 'fuel-pickup.blend']}
with (WORK / 'evidence' / 'determinism-rebuild.log').open('w') as log:
    subprocess.run(['bash', str(WORK / 'scripts' / 'native-blender.sh'), '--background', '--threads', '4',
                    '--factory-startup', '--python', str(WORK / 'scripts' / 'build_fuel.py')],
                   stdout=log, stderr=subprocess.STDOUT, check=True)
after = {name: digest(name) for name in before}
assert before['fuel-pickup.glb'] == after['fuel-pickup.glb'], (before, after)
report = {'before_sha256': before, 'after_sha256': after,
          'glb_byte_identical_independent_factory_startup_build': True,
          'blend_byte_identical': before['fuel-pickup.blend'] == after['fuel-pickup.blend'],
          'method': 'One fresh independent Blender factory-startup rerun of delivered editable generator; complete GLB SHA256 comparison.',
          'limits': 'Demonstrates repeatability on this installed Blender/exporter, not across Blender versions/platforms. Blend session/serialization metadata may differ.'}
(WORK / 'evidence' / 'determinism.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
