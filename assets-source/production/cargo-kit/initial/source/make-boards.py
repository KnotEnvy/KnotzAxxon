import json
import struct
import zlib
from pathlib import Path

import bpy
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'evidence'
FRAMES = EVIDENCE / 'frames'
BOARDS = EVIDENCE / 'boards'
BOARDS.mkdir(exist_ok=True)
GLYPHS = {
    'A': [14, 17, 17, 31, 17, 17, 17], 'B': [30, 17, 17, 30, 17, 17, 30], 'C': [14, 17, 16, 16, 16, 17, 14],
    'D': [30, 17, 17, 17, 17, 17, 30], 'E': [31, 16, 16, 30, 16, 16, 31], 'F': [31, 16, 16, 30, 16, 16, 16],
    'G': [14, 17, 16, 23, 17, 17, 15], 'H': [17, 17, 17, 31, 17, 17, 17], 'I': [14, 4, 4, 4, 4, 4, 14],
    'J': [7, 2, 2, 2, 18, 18, 12], 'K': [17, 18, 20, 24, 20, 18, 17], 'L': [16, 16, 16, 16, 16, 16, 31],
    'M': [17, 27, 21, 21, 17, 17, 17], 'N': [17, 25, 21, 19, 17, 17, 17], 'O': [14, 17, 17, 17, 17, 17, 14],
    'P': [30, 17, 17, 30, 16, 16, 16], 'Q': [14, 17, 17, 17, 21, 18, 13], 'R': [30, 17, 17, 30, 20, 18, 17],
    'S': [15, 16, 16, 14, 1, 1, 30], 'T': [31, 4, 4, 4, 4, 4, 4], 'U': [17, 17, 17, 17, 17, 17, 14],
    'V': [17, 17, 17, 17, 17, 10, 4], 'W': [17, 17, 17, 21, 21, 21, 10], 'X': [17, 17, 10, 4, 10, 17, 17],
    'Y': [17, 17, 10, 4, 4, 4, 4], 'Z': [31, 1, 2, 4, 8, 16, 31],
    '0': [14, 17, 19, 21, 25, 17, 14], '1': [4, 12, 4, 4, 4, 4, 14], '2': [14, 17, 1, 2, 4, 8, 31],
    '3': [30, 1, 1, 14, 1, 1, 30], '4': [2, 6, 10, 18, 31, 2, 2], '5': [31, 16, 16, 30, 1, 1, 30],
    '6': [14, 16, 16, 30, 17, 17, 14], '7': [31, 1, 2, 4, 8, 8, 8], '8': [14, 17, 17, 14, 17, 17, 14],
    '9': [14, 17, 17, 15, 1, 1, 14], '.': [0, 0, 0, 0, 0, 12, 12], '-': [0, 0, 0, 31, 0, 0, 0],
    '/': [1, 2, 2, 4, 8, 8, 16], '+': [0, 4, 4, 31, 4, 4, 0], ':': [0, 12, 12, 0, 12, 12, 0],
}


def text(canvas, value, left, top, scale=2, color=(221, 232, 243)):
    for index, char in enumerate(value.upper()):
        for row, bits in enumerate(GLYPHS.get(char, [0] * 7)):
            for column in range(5):
                if bits & (1 << (4 - column)):
                    canvas[top + row * scale:top + (row + 1) * scale, left + (index * 6 + column) * scale:left + (index * 6 + column + 1) * scale] = color


def png(filename, array):
    height, width = array.shape[:2]
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    data = b''.join(b'\x00' + row.tobytes() for row in array)
    filename.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(data, 7)) + chunk(b'IEND', b''))


def image(filename, width, height):
    loaded = bpy.data.images.load(str(filename), check_existing=False)
    loaded.colorspace_settings.name = 'Non-Color'
    loaded.scale(width, height)
    pixels = np.empty(width * height * 4, dtype=np.float32)
    loaded.pixels.foreach_get(pixels)
    result = np.clip(pixels.reshape(height, width, 4)[::-1, :, :3] * 255 + 0.5, 0, 255).astype(np.uint8)
    bpy.data.images.remove(loaded)
    return result


def board(name, items, columns, width, height, heading):
    rows = (len(items) + columns - 1) // columns
    canvas = np.full((rows * (height + 32) + 56, columns * width, 3), (19, 27, 38), dtype=np.uint8)
    text(canvas, heading, 12, 10, scale=2)
    text(canvas, 'OFFLINE EEVEE APPROX / INITIAL / NO LIVE GPU OR FPS CLAIM', 12, 32, scale=1, color=(153, 176, 196))
    for index, (filename, label) in enumerate(items):
        left, top = (index % columns) * width, 56 + (index // columns) * (height + 32)
        canvas[top + 32:top + 32 + height, left:left + width] = image(FRAMES / filename, width, height)
        text(canvas, label, left + 10, top + 9, scale=1 if width < 400 else 2)
    png(BOARDS / (name + '.png'), canvas)


board('multiview', [(name + '.png', name) for name in ['front-quarter', 'rear-quarter', 'top', 'underside']], 2, 520, 390, 'CARGO KIT / ACTUAL SOURCE SEED 42 / MAXH 3.2')
board('hardware', [('crate-hardware.png', 'CRATE / INTEGRAL LATCH + RIB'), ('drum-hardware.png', 'DRUM / CLOSED RECESSED LID')], 2, 520, 390, 'FITTED HARDWARE / 156 CRATE + 180 DRUM TRIANGLES')
for max_height in [1.9, 3.2]:
    items = [(f'stack-{max_height}-{seed}-{version}.png', f'{version} / SEED {seed} / MAXH {max_height}') for version in ['source', 'kit'] for seed in [1, 7, 42, 123]]
    board(f'stacks-{max_height}', items, 4, 320, 250, f'ORIGINAL STACKS / SCATTER / YAW / MAXH {max_height} / SOURCE ABOVE KIT')
board('world-rigs', [(f'world-{rig}-{version}.png', f'{rig} / {version}') for rig in ['classic', 'modern', 'chase'] for version in ['source', 'kit']], 2, 640, 360, 'COMMON WORLD SCALE / SHIPPED PLAYER / SOURCE LEFT - KIT RIGHT')
(EVIDENCE / 'board-provenance.json').write_text(json.dumps(dict(compositor='Blender image decoding/scaling + NumPy + stdlib PNG writer; no added dependencies', scale='overview resampling only; original full-size frames preserved', boards=['boards/' + filename.name for filename in sorted(BOARDS.glob('*.png'))], captions='No visual asset changes; headers/labels only', view_status='See visual-inspection.json for actual opened files'), indent=2) + '\n')
