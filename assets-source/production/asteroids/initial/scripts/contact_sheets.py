import json
import pathlib

import bpy
import numpy as np


ROOT = pathlib.Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'evidence'
GROUPS = [
    ('studio-details-contact', [slug + '-' + view for view in ['crater', 'back'] for slug in ['talus-basin', 'keel-double-impact', 'scar-cleaved']], 3, 450, 450),
    ('actual-radius-spin-contact', ['actual-radius-spin-' + angle for angle in ['000', '090', '180', '270']], 2, 600, 420),
    ('world-rest-contact', ['world-' + mode + '-' + variant for mode in ['classic', 'modern', 'chase'] for variant in ['source', 'kit']], 2, 640, 360),
    ('world-spin-contact', ['world-' + mode + '-' + variant + '-t12-5' for mode in ['classic', 'modern', 'chase'] for variant in ['source', 'kit']], 2, 640, 360),
]
rows = []
for name, files, columns, width, height in GROUPS:
    row_count = (len(files) + columns - 1) // columns
    output = np.zeros((row_count * height, columns * width, 4), dtype=np.float32)
    for ordinal, file in enumerate(files):
        image = bpy.data.images.load(str(EVIDENCE / (file + '.png')), check_existing=False)
        image_width, image_height = image.size
        pixels = np.empty(image_width * image_height * 4, dtype=np.float32)
        image.pixels.foreach_get(pixels)
        pixels = pixels.reshape((image_height, image_width, 4))
        row_index = ordinal // columns
        column_index = ordinal % columns
        sample_y = np.linspace(0, image_height - 1, height).astype(int)
        sample_x = np.linspace(0, image_width - 1, width).astype(int)
        thumb = pixels[sample_y[:, None], sample_x[None, :], :]
        y_start = (row_count - row_index - 1) * height
        output[y_start:y_start + height, column_index * width:(column_index + 1) * width] = thumb
        bpy.data.images.remove(image)
    sheet = bpy.data.images.new(name, width=columns * width, height=row_count * height, alpha=True)
    sheet.pixels.foreach_set(output.ravel())
    sheet.filepath_raw = str(EVIDENCE / (name + '.png'))
    sheet.file_format = 'PNG'
    sheet.save()
    rows.append({'file': 'evidence/' + name + '.png', 'sourceFiles': ['evidence/' + file + '.png' for file in files], 'columns': columns,
                 'note': 'Nearest-neighbor contact derivative of actual labeled renders; not a fresh render or live game capture.'})
(ROOT / 'measurements/contact-sheets.json').write_text(json.dumps(rows, indent=2) + '\n')
print('CONTACT_SHEETS_COMPLETE')
