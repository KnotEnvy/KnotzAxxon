import json
import math
import pathlib
import struct
import zlib

WORK = pathlib.Path(__file__).resolve().parents[1]
OUT = WORK / 'evidence' / 'png'
FONT = {
    'A': '01110100011000111111100011000110001', 'B': '11110100011000111110100011000111110',
    'C': '01111100001000010000100001000001111', 'D': '11110100011000110001100011000111110',
    'E': '11111100001000011110100001000011111', 'F': '11111100001000011110100001000010000',
    'G': '01111100001000010111100011000101111', 'H': '10001100011000111111100011000110001',
    'I': '11111001000010000100001000010011111', 'J': '00111000100001000010000101001001100',
    'K': '10001100101010011000101001001010001', 'L': '10000100001000010000100001000011111',
    'M': '10001110111010110101100011000110001', 'N': '10001110011010110011100011000110001',
    'O': '01110100011000110001100011000101110', 'P': '11110100011000111110100001000010000',
    'Q': '01110100011000110001101011001001101', 'R': '11110100011000111110101001001010001',
    'S': '01111100001000001110000010000111110', 'T': '11111001000010000100001000010000100',
    'U': '10001100011000110001100011000101110', 'V': '10001100011000110001100010101000100',
    'W': '10001100011000110101101011101110001', 'X': '10001100010101000100010101000110001',
    'Y': '10001100010101000100001000010000100', 'Z': '11111000010001000100010001000011111',
    '0': '01110100011001110101110011000101110', '1': '00100011000010000100001000010001110',
    '2': '01110100010000100010001000100011111', '3': '11110000010000101110000010000111110',
    '4': '00010001100101010010111110001000010', '5': '11111100001000011110000010000111110',
    '6': '01110100001000011110100011000101110', '7': '11111000010001000100010000100001000',
    '8': '01110100011000101110100011000101110', '9': '01110100011000101111000010000101110',
    '-': '00000000000000011111000000000000000', '.': '00000000000000000000000000011000110',
    ':': '00000011000110000000011000110000000', '/': '00001000100001000100010000100010000',
    '+': '00000001000010011111001000010000000', '#': '01010010101111101010111110101001010',
    '=': '00000000001111100000111110000000000', '(': '00010001000100001000010000010000010',
    ')': '01000001000001000010000100010001000', '_': '00000000000000000000000000000011111',
}


def load_png(path):
    data = path.read_bytes()
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    position = 8
    compressed = bytearray()
    while position < len(data):
        length = struct.unpack_from('>I', data, position)[0]
        kind = data[position + 4:position + 8]
        payload = data[position + 8:position + 8 + length]
        if kind == b'IHDR':
            width, height, bits, mode, compression, filtering, interlaced = struct.unpack('>IIBBBBB', payload)
            assert bits == 8 and mode in (2, 6) and interlaced == 0
        elif kind == b'IDAT':
            compressed.extend(payload)
        position += length + 12
    channels = 4 if mode == 6 else 3
    stride = width * channels
    raw = zlib.decompress(compressed)
    pixels = bytearray(width * height * 4)
    previous = bytearray(stride)
    for row in range(height):
        start = row * (stride + 1)
        filtering = raw[start]
        scanline = bytearray(raw[start + 1:start + stride + 1])
        for column in range(stride):
            left = scanline[column - channels] if column >= channels else 0
            up = previous[column]
            upper_left = previous[column - channels] if column >= channels else 0
            if filtering == 1:
                predictor = left
            elif filtering == 2:
                predictor = up
            elif filtering == 3:
                predictor = (left + up) // 2
            elif filtering == 4:
                estimate = left + up - upper_left
                distances = [abs(estimate - left), abs(estimate - up), abs(estimate - upper_left)]
                predictor = [left, up, upper_left][distances.index(min(distances))]
            else:
                assert filtering == 0
                predictor = 0
            scanline[column] = (scanline[column] + predictor) & 255
        if channels == 4:
            pixels[row * width * 4:(row + 1) * width * 4] = scanline
        else:
            for column in range(width):
                pixels[(row * width + column) * 4:(row * width + column + 1) * 4] = scanline[column * 3:column * 3 + 3] + b'\xff'
        previous = scanline
    return width, height, pixels


def save_png(path, image):
    width, height, pixels = image

    def chunk(kind, payload):
        return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', zlib.crc32(kind + payload) & 0xffffffff)

    raw = b''.join(b'\0' + pixels[row * width * 4:(row + 1) * width * 4] for row in range(height))
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
    data += chunk(b'IDAT', zlib.compress(raw, 6)) + chunk(b'IEND', b'')
    path.write_bytes(data)


def canvas(width, height, tint=(17, 25, 38, 255)):
    return width, height, bytearray(tint) * (width * height)


def rectangle(image, left, top, width, height, tint):
    image_width, image_height, pixels = image
    for row in range(max(0, top), min(top + height, image_height)):
        start = (row * image_width + max(0, left)) * 4
        pixels[start:start + min(width, image_width - max(0, left)) * 4] = bytearray(tint) * min(width, image_width - max(0, left))


def text(image, message, left, top, scale=2, tint=(205, 224, 235, 255)):
    for offset, character in enumerate(message.upper()):
        glyph = FONT.get(character)
        if not glyph:
            continue
        for row in range(7):
            for column in range(5):
                if glyph[row * 5 + column] == '1':
                    rectangle(image, left + (offset * 6 + column) * scale, top + row * scale, scale, scale, tint)


def blit(destination, source, left, top, width=None, height=None):
    dest_width, dest_height, dest_pixels = destination
    src_width, src_height, src_pixels = source
    width = width or src_width
    height = height or src_height
    for row in range(height):
        if not 0 <= top + row < dest_height:
            continue
        src_row = min(src_height - 1, row * src_height // height)
        for column in range(width):
            if not 0 <= left + column < dest_width:
                continue
            src_column = min(src_width - 1, column * src_width // width)
            source_offset = (src_row * src_width + src_column) * 4
            dest_offset = ((top + row) * dest_width + left + column) * 4
            dest_pixels[dest_offset:dest_offset + 4] = src_pixels[source_offset:source_offset + 4]


def crop(source, left, top, width, height):
    result = canvas(width, height)
    blit(result, source, -left, -top)
    return result


def sheet(name, title, cards, columns=3, card_width=350, card_height=300, subtitle='INITIAL - PENDING DEFERRED OPUS REVIEW'):
    rows = math.ceil(len(cards) / columns)
    result = canvas(columns * card_width, rows * card_height + 70)
    text(result, title, 16, 12, 2, (82, 255, 168, 255))
    text(result, subtitle, 16, 38, 1)
    for index, (filename, label) in enumerate(cards):
        left = (index % columns) * card_width
        top = (index // columns) * card_height + 70
        image = load_png(OUT / filename)
        ratio = min((card_width - 8) / image[0], (card_height - 40) / image[1])
        width, height = round(image[0] * ratio), round(image[1] * ratio)
        blit(result, image, left + (card_width - width) // 2, top, width, height)
        text(result, label, left + 10, top + card_height - 28, 1)
    save_png(OUT / name, result)


def grayscale(source):
    width, height, source_pixels = source
    pixels = bytearray(source_pixels)
    table = [value / 255 / 12.92 if value / 255 <= .04045 else ((value / 255 + .055) / 1.055) ** 2.4 for value in range(256)]
    for offset in range(0, len(pixels), 4):
        luminance = .2126 * table[pixels[offset]] + .7152 * table[pixels[offset + 1]] + .0722 * table[pixels[offset + 2]]
        encoded = 12.92 * luminance if luminance <= .0031308 else 1.055 * luminance ** (1 / 2.4) - .055
        value = max(0, min(255, round(encoded * 255)))
        pixels[offset:offset + 3] = bytes([value] * 3)
    return width, height, pixels


if __name__ == '__main__':
    cards = [('common-neutral-rest.png', 'COMMON CAMERA - SPAN14 - REST'), ('view-front.png', 'FRONT - GEOMETRY DIAGNOSTIC'),
             ('view-quarter.png', 'QUARTER - GEOMETRY DIAGNOSTIC'), ('view-rear.png', 'REAR - GEOMETRY DIAGNOSTIC'),
             ('view-edge.png', 'EDGE - DEPTH .640 GAME UNITS'), ('combined-extremes.png', 'MIN PULSE + POSITIVE WOBBLE'),
             ('action-pulse-max.png', 'SOURCE PULSE MAX'), ('action-pulse-min.png', 'SOURCE PULSE MIN'),
             ('action-wobble-max.png', 'SOURCE WOBBLE +.08'), ('action-wobble-min.png', 'SOURCE WOBBLE -.08'),
             ('action-spin-10sec.png', 'SOURCE SPIN AFTER 10 SECONDS'), ('world-scale-comparison.png', 'SHIPPED PLAYER / BASELINE / NEW - WORLD SCALE'),
             ('combined-maxpulse-negativewobble.png', 'MAX PULSE + NEGATIVE WOBBLE'), ('exact-green-front.png', 'EXACT SOURCE GREEN DIAGNOSTIC'),
             ('grayscale-front.png', 'GRAYSCALE - NO COLOR DEPENDENCE')]
    save_png(OUT / 'grayscale-front.png', grayscale(load_png(OUT / 'view-front.png')))
    save_png(OUT / 'grayscale-kind-silhouette-cues.png', grayscale(load_png(OUT / 'kind-silhouette-cues.png')))
    save_png(OUT / 'grayscale-exact-green-front.png', grayscale(load_png(OUT / 'exact-green-front.png')))
    save_png(OUT / 'grayscale-frozen-kit-comparison.png', grayscale(load_png(OUT / 'frozen-kit-comparison.png')))
    save_png(OUT / 'grayscale-danger-mine-distinction.png', grayscale(load_png(OUT / 'danger-mine-distinction.png')))
    sheet('contact-sheet.png', 'HULL REPAIR PICKUP / FROZEN INITIAL', cards)
    sheet('identity-sheet.png', 'REPAIR CROSS / DISTINCT REWARD IDENTITY', [
        ('kind-silhouette-cues.png', 'REPAIR / SOURCE SHIELD / SPREAD / FUEL'),
        ('grayscale-kind-silhouette-cues.png', 'SAME SOURCE CUES WITHOUT COLOR'),
        ('frozen-kit-comparison.png', 'NEW REPAIR / FROZEN SHIELD INITIAL'),
        ('grayscale-frozen-kit-comparison.png', 'CROSS VS SHIELD EMBLEM WITHOUT COLOR'),
        ('danger-mine-distinction.png', 'REPAIR LEFT / SOURCE MINE RIGHT'),
        ('grayscale-danger-mine-distinction.png', 'REWARD VS DANGER WITHOUT COLOR')], columns=2, card_width=600, card_height=300)
    gameplay_cards = [(f'offline-{mode}-{context}.png', f'{mode.upper()} {context.upper()} / NEW LEFT - BASELINE RIGHT')
                      for mode in ['classic', 'modern', 'chase'] for context in ['near', 'far']]
    sheet('offline-gameplay-sheet.png', 'OFFLINE RECONSTRUCTION / NOT LIVE PROOF', gameplay_cards, columns=2, card_width=480, card_height=310,
          subtitle='ACTUAL SOURCE RIGS + DUSK KEY/RIM / SHARED WORLD SCALE / APPROXIMATE HALO AND WORLD')
    sheet('contexts-sheet.png', 'SOURCE COLLECTION / MAGNET CONTEXTS', [
        ('offline-magnet-d11.png', 'D11 - MAGNET STRENGTH15 - NO BEAM'),
        ('offline-precollection-d3-8.png', 'D3.8 - JUST OUTSIDE COLLECTION'),
        ('offline-collection-threshold-d3-7.png', 'D3.7 - COLLECTION THRESHOLD'),
        ('offline-collected-next-update.png', 'NEXT UPDATE - BADGE DETACHED')], columns=2, card_width=480, card_height=310)
    sheet('drift-context-sheet.png', 'SOURCE DRIFT / MAGNET / LIFECYCLE', [
        ('offline-drift-outside-magnet.png', 'D30 - PHASE1 - SOURCE BOB .7'),
        ('offline-magnet-d11.png', 'D11 - SOURCE MAGNET ACTIVE - NO BEAM'),
        ('offline-collection-threshold-d3-7.png', 'D3.7 - HULL REPAIR TRIGGER'),
        ('offline-collected-next-update.png', 'NEXT UPDATE - ROOT AND HALO DETACH')], columns=2, card_width=480, card_height=310)
    save_png(OUT / 'grayscale-front.png', grayscale(load_png(OUT / 'view-front.png')))
    save_png(OUT / 'grayscale-classic-near.png', grayscale(load_png(OUT / 'offline-classic-near.png')))
    save_png(OUT / 'grayscale-kind-silhouette-cues.png', grayscale(load_png(OUT / 'kind-silhouette-cues.png')))
    projections = json.loads((WORK / 'evidence' / 'renders.json').read_text())
    for entry in projections:
        if entry['file'] == 'world-scale-comparison.png':
            entry['note'] = 'Left shipped player.glb / middle actual-source baseline / right NEW. Shared WORLD scale 1, no separate normalization; required neutral camera/light geometry.'
    (WORK / 'evidence' / 'renders.json').write_text(json.dumps(projections, indent=2) + '\n')
    native = canvas(840, 570)
    text(native, 'SMALL CAMERA READABILITY / NATIVE PIXEL CROPS', 10, 12, 2)
    text(native, 'NO RESIZING OR PER-ASSET NORMALIZATION / NEW BADGE', 10, 38, 1)
    sizes = []
    for index, mode in enumerate(['classic', 'modern', 'chase']):
        for column, context in enumerate(['near', 'far']):
            filename = f'offline-{mode}-{context}.png'
            entry = next(entry for entry in projections if entry['file'] == filename)
            bounds = entry['badge_pixel_bounds']
            center = ((bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2)
            image = load_png(OUT / filename)
            closeup = crop(image, round(center[0]) - 70, round(center[1]) - 70, 140, 140)
            save_png(OUT / f'native-crop-{mode}-{context}.png', closeup)
            gray = grayscale(closeup)
            left, top = column * 420 + 5, index * 170 + 60
            blit(native, closeup, left, top)
            blit(native, gray, left + 145, top)
            pixel_width = bounds[2] - bounds[0]
            text(native, f'{mode} {context} / {pixel_width:.1f}PX', left, top + 146, 1)
            text(native, 'COLOR / LINEAR REC709 GRAY', left, top + 158, 1)
            sizes.append({'mode': mode, 'context': context, 'native_badge_pixel_width': pixel_width})
    save_png(OUT / 'small-gameplay-readability.png', native)
    swatches = canvas(840, 170)
    text(swatches, 'SOURCE COLOR CUES / EXACT SRGB SWATCHES', 10, 12, 2)
    for index, (label, tint) in enumerate([('SHIELD', '45e0ff'), ('SPREAD', 'ffb43a'), ('REPAIR', '52ffa8'), ('FUEL', 'ffd76a')]):
        rgba = tuple(int(tint[position:position + 2], 16) for position in [0, 2, 4]) + (255,)
        rectangle(swatches, index * 210 + 10, 42, 190, 80, rgba)
        text(swatches, label + ' #' + tint, index * 210 + 10, 140, 1)
    save_png(OUT / 'exact-source-color-swatches.png', swatches)
    (WORK / 'evidence' / 'readability.json').write_text(json.dumps({
        'pixel_sizes': sizes, 'grayscale': 'Decode sRGB -> linear Rec709 luminance (.2126,.7152,.0722) -> encode sRGB; no contrast enhancement.',
        'assessment': 'Manual inspection recorded separately. The central cross silhouette is primary; bevels/rim facets are secondary. Far perspective images lose fine craft details. No tiny text or final art acceptance claimed.',
        'sampling': 'Contact sheets downsample whole frames with nearest-neighbor only for presentation. Native crop files and small-gameplay-readability.png do not resize assets or pixels.',
    }, indent=2) + '\n')
    print('REPAIR_SHEETS', len(list(OUT.glob('*.png'))), 'PNGs')
