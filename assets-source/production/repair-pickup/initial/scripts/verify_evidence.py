import json
import pathlib
import runpy

WORK = pathlib.Path(__file__).resolve().parents[1]
helpers = runpy.run_path(str(WORK / 'scripts/compose_evidence.py'), run_name='png_helpers')
load_png, crop = helpers['load_png'], helpers['crop']
out = WORK / 'evidence/png'
width, height, pixels = load_png(out / 'exact-green-front.png')
offset = ((height // 2) * width + width // 2) * 4
exact_pixel = list(pixels[offset:offset + 4])
assert exact_pixel == [82, 255, 168, 255]
gray_images = []
for path in sorted(out.glob('grayscale-*.png')):
    width, height, pixels = load_png(path)
    assert all(pixels[index] == pixels[index + 1] == pixels[index + 2] for index in range(0, len(pixels), 4))
    gray_images.append(path.name)
renders = json.loads((WORK / 'evidence/renders.json').read_text())
native = []
for mode in ['classic', 'modern', 'chase']:
    for context in ['near', 'far']:
        frame = f'offline-{mode}-{context}.png'
        entry = next(item for item in renders if item['file'] == frame)
        bounds = entry['badge_pixel_bounds']
        center = ((bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2)
        expected = crop(load_png(out / frame), round(center[0]) - 70, round(center[1]) - 70, 140, 140)
        actual = load_png(out / f'native-crop-{mode}-{context}.png')
        assert expected == actual
        assert entry['camera_facing_normal_dot'] > .99999
        native.append({'mode': mode, 'context': context, 'native_pixel_width': bounds[2] - bounds[0],
                       'unresized_pixel_identical_crop': True, 'billboard_normal_dot': entry['camera_facing_normal_dot']})
report = {'exact_source_green_rgba_center': exact_pixel, 'grayscale_channels_equal': gray_images,
          'native_crops': native, 'formal_review': False,
          'limits': 'Offline Blender evidence pixel checks, not real Three.js output/postfx or integrated gameplay acceptance.'}
(WORK / 'evidence/evidence-pixel-checks.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
