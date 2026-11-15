"""CPU-only Pillow compositor. Full originals stay untouched; no viewing acknowledgment."""
import hashlib
import json
import pathlib
import sys
import time
from PIL import Image, ImageDraw, ImageFont


def sha256(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def compose(manifest_path):
    started = time.perf_counter()
    manifest_path = pathlib.Path(manifest_path)
    data = json.loads(manifest_path.read_text(encoding='utf-8'))
    base = manifest_path.parent.resolve()
    rows = data['frames']
    if not 1 <= len(rows) <= 3:
        raise ValueError('Contact sheet must contain 1–3 frames')
    name = data['file']
    if pathlib.Path(name).name != name or not name.endswith('.png'):
        raise ValueError('Unsafe output filename')
    output = base / name
    if output.exists():
        raise ValueError('Refusing to overwrite contact sheet')
    prepared = []
    for row in rows:
        filename = row['file']
        if pathlib.Path(filename).name != filename:
            raise ValueError('Unsafe input filename')
        source = base / filename
        if sha256(source) != row['sha256']:
            raise ValueError('Original screenshot hash mismatch')
        with Image.open(source) as image:
            original = image.convert('RGB')
        ratio = min(1, 960 / original.width, 600 / original.height)
        size = (max(1, round(original.width * ratio)), max(1, round(original.height * ratio)))
        display = original.resize(size, Image.Resampling.LANCZOS) if size != original.size else original
        prepared.append((row, display, original.size, ratio))
    width = max(680, max(image.width for _, image, _, _ in prepared))
    header, label = 66, 66
    sheet = Image.new('RGB', (width, header + sum(image.height + label for _, image, _, _ in prepared)), '#111820')
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype('C:/Windows/Fonts/consola.ttf', 15)
    except OSError:
        font = ImageFont.load_default(size=15)
    draw.text((10, 7), data['id'], fill='#ffffff', font=font)
    draw.text((10, 29), 'CAPTURED MOMENTS ONLY / NOT CONTINUOUS ACTION / VIEWING NOT ACKNOWLEDGED', fill='#ffc470', font=font)
    panels = []
    y = header
    for index, (row, image, original_size, ratio) in enumerate(prepared, 1):
        draw.text((10, y + 3), f"P{index} {row['id']} | telemetry frame {row['frame']} (before capture)", fill='#ffffff', font=font)
        draw.text((10, y + 23), f"START {row['startedAt']} | END {row['completedAt']}", fill='#8edee7', font=font)
        draw.text((10, y + 43), f"state {row['state']} | original {original_size[0]}x{original_size[1]} | display scale {ratio:.3f}", fill='#dddddd', font=font)
        sheet.paste(image, (0, y + label))
        panels.append({**row, 'panel': index, 'rect': [0, y + label, image.width, image.height],
                       'originalSize': list(original_size), 'displayScale': ratio})
        y += label + image.height
    sheet.save(output, format='PNG')
    return {'id': data['id'], 'file': name, 'sha256': sha256(output), 'panels': panels,
            'width': sheet.width, 'height': sheet.height, 'compositionMs': (time.perf_counter() - started) * 1000,
            'viewed': False, 'note': 'Composition does not acknowledge viewing; panel notes required'}


if __name__ == '__main__':
    print(json.dumps(compose(sys.argv[1])))
