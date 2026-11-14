import json
import struct
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FONT = {
    'A': '01110/10001/10001/11111/10001/10001/10001', 'B': '11110/10001/10001/11110/10001/10001/11110',
    'C': '01111/10000/10000/10000/10000/10000/01111', 'D': '11110/10001/10001/10001/10001/10001/11110',
    'E': '11111/10000/10000/11110/10000/10000/11111', 'F': '11111/10000/10000/11110/10000/10000/10000',
    'G': '01111/10000/10000/10111/10001/10001/01111', 'H': '10001/10001/10001/11111/10001/10001/10001',
    'I': '11111/00100/00100/00100/00100/00100/11111', 'J': '00111/00010/00010/00010/10010/10010/01100',
    'K': '10001/10010/10100/11000/10100/10010/10001', 'L': '10000/10000/10000/10000/10000/10000/11111',
    'M': '10001/11011/10101/10101/10001/10001/10001', 'N': '10001/11001/10101/10011/10001/10001/10001',
    'O': '01110/10001/10001/10001/10001/10001/01110', 'P': '11110/10001/10001/11110/10000/10000/10000',
    'Q': '01110/10001/10001/10001/10101/10010/01101', 'R': '11110/10001/10001/11110/10100/10010/10001',
    'S': '01111/10000/10000/01110/00001/00001/11110', 'T': '11111/00100/00100/00100/00100/00100/00100',
    'U': '10001/10001/10001/10001/10001/10001/01110', 'V': '10001/10001/10001/10001/10001/01010/00100',
    'W': '10001/10001/10001/10101/10101/10101/01010', 'X': '10001/10001/01010/00100/01010/10001/10001',
    'Y': '10001/10001/01010/00100/00100/00100/00100', 'Z': '11111/00001/00010/00100/01000/10000/11111',
    '0': '01110/10001/10011/10101/11001/10001/01110', '1': '00100/01100/00100/00100/00100/00100/01110',
    '2': '01110/10001/00001/00010/00100/01000/11111', '3': '11110/00001/00001/01110/00001/00001/11110',
    '4': '00010/00110/01010/10010/11111/00010/00010', '5': '11111/10000/10000/11110/00001/00001/11110',
    '6': '01110/10000/10000/11110/10001/10001/01110', '7': '11111/00001/00010/00100/01000/01000/01000',
    '8': '01110/10001/10001/01110/10001/10001/01110', '9': '01110/10001/10001/01111/00001/00001/01110',
    '-': '00000/00000/00000/11111/00000/00000/00000', '/': '00001/00001/00010/00100/01000/10000/10000',
    '|': '00100/00100/00100/00100/00100/00100/00100', '.': '00000/00000/00000/00000/00000/01100/01100',
    ':': '00000/01100/01100/00000/01100/01100/00000', ' ': '00000/00000/00000/00000/00000/00000/00000',
}


def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)


def paeth(first, second, third):
    prediction = first + second - third
    first_distance, second_distance, third_distance = abs(prediction - first), abs(prediction - second), abs(prediction - third)
    return first if first_distance <= second_distance and first_distance <= third_distance else second if second_distance <= third_distance else third


def label(path, title, subtitle):
    payload = path.read_bytes()
    if b'carrier-offline-header-v1' in payload:
        return
    assert payload[:8] == b'\x89PNG\r\n\x1a\n'
    offset = 8
    chunks = []
    compressed = b''
    while offset < len(payload):
        size = struct.unpack_from('>I', payload, offset)[0]
        kind = payload[offset + 4:offset + 8]
        data = payload[offset + 8:offset + 8 + size]
        if kind == b'IHDR':
            width, height, depth, color_type, compression, filtering, interlace = struct.unpack('>IIBBBBB', data)
        elif kind == b'IDAT':
            compressed += data
        elif kind != b'IEND':
            chunks.append((kind, data))
        offset += size + 12
    assert depth == 8 and color_type in [2, 6] and interlace == 0
    channels = 3 if color_type == 2 else 4
    stride = width * channels
    decoded = zlib.decompress(compressed)
    rows = []
    previous = bytearray(stride)
    for row in range(height):
        filter_mode = decoded[row * (stride + 1)]
        values = bytearray(decoded[row * (stride + 1) + 1:(row + 1) * (stride + 1)])
        for index in range(stride):
            first = values[index - channels] if index >= channels else 0
            second = previous[index]
            third = previous[index - channels] if index >= channels else 0
            if filter_mode == 1:
                values[index] = (values[index] + first) & 255
            elif filter_mode == 2:
                values[index] = (values[index] + second) & 255
            elif filter_mode == 3:
                values[index] = (values[index] + (first + second) // 2) & 255
            elif filter_mode == 4:
                values[index] = (values[index] + paeth(first, second, third)) & 255
            else:
                assert filter_mode == 0
        rows.append(values)
        previous = values
    background = bytes([7, 18, 33] + ([255] if channels == 4 else []))
    header = [bytearray(background * width) for row in range(56)]
    for text, top, tint in [(title, 9, [211, 235, 245]), (subtitle, 32, [139, 176, 194])]:
        for index, letter in enumerate(text.upper()):
            for glyph_row, pattern in enumerate(FONT.get(letter, FONT['-']).split('/')):
                for column, bit in enumerate(pattern):
                    if bit != '1':
                        continue
                    for offset_y in [0, 1]:
                        for offset_x in [0, 1]:
                            pixel_x, pixel_y = 14 + index * 12 + column * 2 + offset_x, top + glyph_row * 2 + offset_y
                            if pixel_x < width - 8:
                                start = pixel_x * channels
                                header[pixel_y][start:start + 3] = bytes(tint)
    result = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height + 56, depth, color_type, compression, filtering, interlace))
    for kind, data in chunks:
        result += chunk(kind, data)
    result += chunk(b'tEXt', b'Description\x00carrier-offline-header-v1: OFFLINE EEVEE; source camera approximations; no production GPU or formal acceptance claim; original render viewport is unchanged below 56px header.')
    result += chunk(b'IDAT', zlib.compress(b''.join(b'\0' + row for row in header + rows), 6)) + chunk(b'IEND', b'')
    path.write_bytes(result)


def main():
    for path in sorted((ROOT / 'evidence').glob('*.png')):
        name = path.stem.replace('offline-', '')
        title = 'OFFLINE EEVEE | CARRIER | ' + name.replace('-', ' ')
        if name.startswith('game-'):
            subtitle = 'SOURCE RIG / PLAYER SCALE 1 / AGX-NO GAME FOG-POSTFX'
        elif name.startswith('cue-'):
            subtitle = 'CPU CUE RECONSTRUCTION / NO GLTF ANIMATION CLAIM'
        else:
            subtitle = 'INITIAL BEST EFFORT / SCALE 1 / NO FORMAL REVIEW'
        label(path, title, subtitle)
        print(path.name)
    info = ROOT / 'evidence/renders.json'
    if info.exists():
        data = json.loads(info.read_text())
        data['annotation'] = '56px offline header added without resizing/cropping the original camera viewport; image dimensions include header.'
        info.write_text(json.dumps(data, indent=2))


if __name__ == '__main__':
    main()
