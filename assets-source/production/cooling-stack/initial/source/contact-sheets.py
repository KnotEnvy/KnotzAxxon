import json
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT/'evidence'


def read_png(path):
    payload = path.read_bytes()
    assert payload[:8] == b'\x89PNG\r\n\x1a\n'
    cursor, compressed = 8, bytearray()
    while cursor < len(payload):
        size, kind = struct.unpack_from('>I4s',payload,cursor)
        block = payload[cursor+8:cursor+8+size]
        if kind == b'IHDR':
            width,height,depth,color,compression,filtering,interlace = struct.unpack('>IIBBBBB',block)
            assert depth == 8 and color in (2,6) and interlace == 0
            channels = 3 if color == 2 else 4
        elif kind == b'IDAT':
            compressed.extend(block)
        cursor += size+12
    raw = zlib.decompress(compressed)
    stride = width*channels
    rows, previous, cursor = [],bytearray(stride),0
    for row_index in range(height):
        filtering = raw[cursor]
        current = bytearray(raw[cursor+1:cursor+1+stride])
        cursor += stride+1
        for index in range(stride):
            left = current[index-channels] if index>=channels else 0
            up = previous[index]
            upper_left = previous[index-channels] if index>=channels else 0
            if filtering == 1:
                current[index] = (current[index]+left)&255
            elif filtering == 2:
                current[index] = (current[index]+up)&255
            elif filtering == 3:
                current[index] = (current[index]+(left+up)//2)&255
            elif filtering == 4:
                prediction = left+up-upper_left
                differences = [abs(prediction-left),abs(prediction-up),abs(prediction-upper_left)]
                predictor = [left,up,upper_left][differences.index(min(differences))]
                current[index] = (current[index]+predictor)&255
            else:
                assert filtering == 0
        rows.append(current if channels == 3 else bytearray(value for index,value in enumerate(current) if index%4 != 3))
        previous = current
    return width,height,rows


def write_png(path,width,height,rows):
    def chunk(kind,data):
        return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    raw = b''.join(b'\x00'+bytes(row) for row in rows)
    path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b''))


def sheet(name,files,columns,scale):
    images = [read_png(EVIDENCE/filename) for filename in files]
    cell_width,cell_height = images[0][0]//scale,images[0][1]//scale
    width,height = cell_width*columns,cell_height*((len(files)+columns-1)//columns)
    rows = [bytearray([18,24,33]*width) for row_index in range(height)]
    for image_index,(source_width,source_height,source_rows) in enumerate(images):
        assert source_width//scale == cell_width and source_height//scale == cell_height
        row_offset,column_offset = image_index//columns*cell_height,image_index%columns*cell_width
        for target_row in range(cell_height):
            sampled = bytearray()
            for target_column in range(cell_width):
                offset = target_column*scale*3
                sampled.extend(source_rows[target_row*scale][offset:offset+3])
            rows[row_offset+target_row][column_offset*3:(column_offset+cell_width)*3] = sampled
    write_png(EVIDENCE/name,width,height,rows)
    return {'file':name,'width':width,'height':height,'columns':columns,'scaleDenominator':scale,'sourceFilesInRowMajorOrder':files}


reports = []
reports.append(sheet('structure-contact.png',[f'structure-{view}.png' for view in ['front','rear','side','top','close']],3,2))
for mode in ('classic','modern','chase'):
    files = [f'world-{mode}-h{height}-heat-{heat}-{variant}.png' for height in (7,11) for heat in ('min','max') for variant in ('source','prototype')]
    reports.append(sheet(f'world-{mode}-comparison.png',files,2,2))
(EVIDENCE/'contact-sheets.json').write_text(json.dumps({'note':'Contact sheets only resize whole frames at identical factor; no objects normalized or moved. Left SOURCE, right PROTOTYPE. Rows h7 min/max then h11 min/max.', 'sheets':reports},indent=2)+'\n')
print(json.dumps(reports,indent=2))
