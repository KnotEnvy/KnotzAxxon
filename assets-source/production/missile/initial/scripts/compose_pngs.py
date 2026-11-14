import json
import math
import struct
import zlib
from pathlib import Path

WORK = Path(__file__).resolve().parents[1]
OUT = WORK / 'evidence/png'


def decode(path):
    data = path.read_bytes()
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    offset = 8
    compressed = b''
    while offset < len(data):
        size = struct.unpack_from('>I', data, offset)[0]
        kind = data[offset + 4:offset + 8]
        chunk = data[offset + 8:offset + 8 + size]
        if kind == b'IHDR':
            width, height, depth, color, compression, filtering, interlace = struct.unpack('>IIBBBBB', chunk)
        if kind == b'IDAT':
            compressed += chunk
        offset += size + 12
    assert depth == 8 and color in (2, 6) and interlace == 0
    channels = 3 if color == 2 else 4
    stride = width * channels
    raw = zlib.decompress(compressed)
    rows = []
    previous = bytearray(stride)
    for row_index in range(height):
        filter_kind = raw[row_index * (stride + 1)]
        row = bytearray(raw[row_index * (stride + 1) + 1:(row_index + 1) * (stride + 1)])
        for index in range(stride):
            left = row[index - channels] if index >= channels else 0
            above = previous[index]
            upper_left = previous[index - channels] if index >= channels else 0
            if filter_kind == 1:
                predictor = left
            elif filter_kind == 2:
                predictor = above
            elif filter_kind == 3:
                predictor = (left + above) // 2
            elif filter_kind == 4:
                estimate = left + above - upper_left
                differences = [abs(estimate - candidate) for candidate in (left, above, upper_left)]
                predictor = (left, above, upper_left)[differences.index(min(differences))]
            else:
                assert filter_kind == 0
                predictor = 0
            row[index] = (row[index] + predictor) & 255
        rows.append(bytes(value for pixel in range(width) for value in row[pixel * channels:pixel * channels + 3]))
        previous = row
    return width, height, rows


def encode(path, width, height, rows):
    def chunk(kind, payload):
        return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', zlib.crc32(kind + payload) & 0xffffffff)
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b''.join(b'\x00' + row for row in rows), 6)) + chunk(b'IEND', b''))


def sheet(name, filenames, columns=2, cell_width=640, cell_height=360):
    decoded = [decode(OUT / filename) for filename in filenames]
    height = math.ceil(len(decoded) / columns) * cell_height
    width = columns * cell_width
    canvas = [bytearray(b'\x10\x18\x22' * width) for row in range(height)]
    for image_index, (source_width, source_height, rows) in enumerate(decoded):
        origin_x = image_index % columns * cell_width
        origin_y = image_index // columns * cell_height
        for target_y in range(cell_height):
            source_y = target_y * source_height // cell_height
            output = bytearray()
            for target_x in range(cell_width):
                source_x = target_x * source_width // cell_width
                output.extend(rows[source_y][source_x * 3:source_x * 3 + 3])
            canvas[origin_y + target_y][origin_x * 3:(origin_x + cell_width) * 3] = output
    encode(OUT / name, width, height, [bytes(row) for row in canvas])
    return {'file': name, 'source_pngs': filenames, 'composition': 'Nearest-neighbor contact sheet of ACTUAL PNG renders, not rerendered geometry', 'dimensions': [width, height]}


records = []
records.append(sheet('sheet-multiview.png', ['diagnostic-quarter.png', 'diagnostic-side.png', 'diagnostic-nose.png', 'diagnostic-aft.png']))
records.append(sheet('sheet-common-neutral.png', ['common-neutral-missile.png', 'common-neutral-baseline.png', 'common-neutral-lineup.png'], columns=1, cell_width=960, cell_height=540))
records.append(sheet('sheet-extreme-orientations.png', [f'orientation-{index}.png' for index in range(8)], columns=4, cell_width=480, cell_height=270))
context_files = [entry['file'].split('/')[-1] for entry in json.loads((WORK / 'evidence/render-records.json').read_text())['records'] if entry['kind'] == 'source_camera']
context_files = sorted(set(context_files))
records.append(sheet('sheet-source-cameras.png', context_files, columns=4, cell_width=480, cell_height=270))
records.append(sheet('sheet-incoming-outgoing.png', ['context-silo-0-modern-new.png', 'context-silo-0-modern-baseline.png', 'context-sentinel-heavy-2-chase-new.png', 'context-sentinel-heavy-2-chase-baseline.png'], columns=2))
records.append(sheet('sheet-homing-and-launchers.png', ['homing-attitudes-silo.png', 'homing-attitudes-sentinel-heavy.png', 'homing-attitudes-sentinel-salvo.png', 'launcher-detail-silo.png', 'launcher-detail-sentinel-heavy.png'], columns=2))
footprints = json.loads((WORK / 'evidence/projected-pixel-footprints.json').read_text())
crop_files = []
crop_records = []
for label, sample_index, mode in [('silo', 0, 'modern'), ('sentinel-heavy', 2, 'chase')]:
    time = 0 if sample_index == 0 else .5
    footprint = next(entry for entry in footprints if entry['context'] == label and entry['time'] == time and entry['mode'] == mode)
    bounds = footprint['bbox_pixels_top_left']
    center_x, center_y = (bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2
    for variant in ['new', 'baseline']:
        filename = f'context-{label}-{sample_index}-{mode}-{variant}.png'
        width, height, rows = decode(OUT / filename)
        left, top = int(center_x) - 32, int(center_y) - 32
        assert left >= 0 and top >= 0 and left + 64 <= width and top + 64 <= height
        cropped = [row[left * 3:(left + 64) * 3] for row in rows[top:top + 64]]
        enlarged = []
        for row in cropped:
            enlarged_row = b''.join(row[index:index + 3] * 4 for index in range(0, len(row), 3))
            enlarged.extend([enlarged_row] * 4)
        crop_name = f'CROP-4X-{label}-{variant}.png'
        encode(OUT / crop_name, 256, 256, enlarged)
        crop_files.append(crop_name)
        crop_records.append({'file': crop_name, 'source_png': filename, 'source_crop_top_left': [left, top], 'source_crop_size': [64, 64], 'resize': '4X nearest-neighbor diagnostic ONLY; not gameplay camera enlargement or model scaling', 'projected_subject_size_pixels': footprint['size_pixels']})
records.append(sheet('sheet-CROPS-4X-DIAGNOSTIC.png', crop_files, columns=2, cell_width=256, cell_height=256))
(WORK / 'evidence/png-composition.json').write_text(json.dumps({'sheets': records, 'crops': crop_records, 'note': 'Incoming = Sentinel heavy toward player. Outgoing = Silo upward/out of well before homing. Crops and attitude strips are explicitly diagnostic, not source full-frame screenshots.'}, indent=2))
print(json.dumps(records, indent=2))
