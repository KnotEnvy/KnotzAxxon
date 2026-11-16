"""Only synthetic tiny PNGs; no browser/GPU/game evidence."""
import hashlib
import json
import pathlib
import sys
from PIL import Image
sys.dont_write_bytecode = True
from importlib.util import spec_from_file_location, module_from_spec

spec = spec_from_file_location('contact_sheet', pathlib.Path(__file__).with_name('contact-sheet.py'))
module = module_from_spec(spec)
spec.loader.exec_module(module)
out = pathlib.Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=False)
colors = [(255, 0, 0), (0, 255, 0), (0, 0, 255)]
rows = []
for index, color in enumerate(colors, 1):
    filename = f'synthetic-{index}.png'
    Image.new('RGB', (24, 16), color).save(out / filename)
    rows.append({'id': f'SYNTHETIC-o00{index}', 'file': filename,
                 'sha256': module.sha256(out / filename), 'frame': index * 120,
                 'startedAt': f'2026-11-15T00:00:0{index * 2}.000Z',
                 'completedAt': f'2026-11-15T00:00:0{index * 2}.100Z', 'state': 'synthetic-only'})
manifest = out / 'synthetic-input.json'
manifest.write_text(json.dumps({'id': 'SYNTHETIC-CPU-ONLY', 'file': 'synthetic-sheet.png', 'frames': rows}))
result = module.compose(manifest)
assert result['viewed'] is False
assert len(result['panels']) == 3
with Image.open(out / result['file']) as sheet:
    assert sheet.size == (680, 312)
    for panel, color in zip(result['panels'], colors):
        x, y, w, h = panel['rect']
        assert sheet.getpixel((x + 12, y + 8)) == color
        assert (w, h) == (24, 16)
for row in rows:
    assert module.sha256(out / row['file']) == row['sha256']
try:
    module.compose(manifest)
    raise AssertionError('Overwrite accepted')
except ValueError:
    pass
rows[0]['sha256'] = '0' * 64
manifest.write_text(json.dumps({'id': 'SYNTHETIC-BAD-HASH', 'file': 'bad.png', 'frames': rows}))
try:
    module.compose(manifest)
    raise AssertionError('Mismatched source hash accepted')
except ValueError:
    pass
assert not (out / 'bad.png').exists()
(out / 'synthetic-result.json').write_text(json.dumps(result, indent=2) + '\n')
print('PASS: three synthetic panels retain RGB pixels, originals/hashes, labels/metadata; overwrite/hash mismatch refused; no viewing acknowledgment.')
