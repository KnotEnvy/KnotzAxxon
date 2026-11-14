import json
import struct
import zlib
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
GLYPHS={
'A':'01110 10001 10001 11111 10001 10001 10001','B':'11110 10001 10001 11110 10001 10001 11110','C':'01111 10000 10000 10000 10000 10000 01111','D':'11110 10001 10001 10001 10001 10001 11110','E':'11111 10000 10000 11110 10000 10000 11111','F':'11111 10000 10000 11110 10000 10000 10000','G':'01111 10000 10000 10111 10001 10001 01111','H':'10001 10001 10001 11111 10001 10001 10001','I':'11111 00100 00100 00100 00100 00100 11111','J':'00111 00010 00010 00010 10010 10010 01100','K':'10001 10010 10100 11000 10100 10010 10001','L':'10000 10000 10000 10000 10000 10000 11111','M':'10001 11011 10101 10101 10001 10001 10001','N':'10001 11001 10101 10011 10001 10001 10001','O':'01110 10001 10001 10001 10001 10001 01110','P':'11110 10001 10001 11110 10000 10000 10000','Q':'01110 10001 10001 10001 10101 10010 01101','R':'11110 10001 10001 11110 10100 10010 10001','S':'01111 10000 10000 01110 00001 00001 11110','T':'11111 00100 00100 00100 00100 00100 00100','U':'10001 10001 10001 10001 10001 10001 01110','V':'10001 10001 10001 10001 10001 01010 00100','W':'10001 10001 10001 10101 10101 11011 10001','X':'10001 10001 01010 00100 01010 10001 10001','Y':'10001 10001 01010 00100 00100 00100 00100','Z':'11111 00001 00010 00100 01000 10000 11111',
'0':'01110 10001 10011 10101 11001 10001 01110','1':'00100 01100 00100 00100 00100 00100 01110','2':'01110 10001 00001 00010 00100 01000 11111','3':'11110 00001 00001 01110 00001 00001 11110','4':'00010 00110 01010 10010 11111 00010 00010','5':'11111 10000 10000 11110 00001 00001 11110','6':'01110 10000 10000 11110 10001 10001 01110','7':'11111 00001 00010 00100 01000 01000 01000','8':'01110 10001 10001 01110 10001 10001 01110','9':'01110 10001 10001 01111 00001 00001 01110',
'-':'00000 00000 00000 11111 00000 00000 00000','.':'00000 00000 00000 00000 00000 00110 00110',':':'00000 00110 00110 00000 00110 00110 00000','/':'00001 00001 00010 00100 01000 10000 10000','|':'00100 00100 00100 00100 00100 00100 00100','+':'00000 00100 00100 11111 00100 00100 00000',' ':'00000 00000 00000 00000 00000 00000 00000',
}


def read_png(path):
    raw=path.read_bytes()
    assert raw[:8]==b'\x89PNG\r\n\x1a\n'
    offset=8
    compressed=bytearray()
    while offset<len(raw):
        size=struct.unpack_from('>I',raw,offset)[0]
        kind=raw[offset+4:offset+8]
        data=raw[offset+8:offset+8+size]
        if kind==b'IHDR':
            width,height,depth,color,compression,filter_method,interlace=struct.unpack('>IIBBBBB',data)
            assert depth==8 and color in (2,6) and interlace==0
            channels=3 if color==2 else 4
        if kind==b'IDAT':
            compressed.extend(data)
        offset+=size+12
    decoded=zlib.decompress(compressed)
    stride=width*channels
    rows=[]
    previous=bytearray(stride)
    for row in range(height):
        mode=decoded[row*(stride+1)]
        line=bytearray(decoded[row*(stride+1)+1:(row+1)*(stride+1)])
        for index in range(stride):
            left=line[index-channels] if index>=channels else 0
            up=previous[index]
            upper_left=previous[index-channels] if index>=channels else 0
            if mode==1:
                predictor=left
            elif mode==2:
                predictor=up
            elif mode==3:
                predictor=(left+up)//2
            elif mode==4:
                estimate=left+up-upper_left
                distances=[abs(estimate-value) for value in (left,up,upper_left)]
                predictor=(left,up,upper_left)[distances.index(min(distances))]
            else:
                assert mode==0
                predictor=0
            line[index]=(line[index]+predictor)&255
        rows.append(bytearray(component for index,component in enumerate(line) if channels==3 or index%4!=3))
        previous=line
    return width,height,rows


def write_png(path,width,height,rows):
    def chunk(kind,data):
        return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data))
    data=b''.join(b'\0'+row for row in rows)
    path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(data,6))+chunk(b'IEND',b''))


def text(rows,label,pixel_x,pixel_y,scale=2,color=(215,225,237)):
    for character in label.upper():
        glyph=GLYPHS.get(character,GLYPHS[' ']).split()
        for row,line in enumerate(glyph):
            for column,value in enumerate(line):
                if value=='1':
                    for dy in range(scale):
                        for dx in range(scale):
                            start=(pixel_x+column*scale+dx)*3
                            if 0<=pixel_y+row*scale+dy<len(rows) and start+3<=len(rows[0]):
                                rows[pixel_y+row*scale+dy][start:start+3]=bytes(color)
        pixel_x+=6*scale


def blank(width,height):
    return [bytearray((13,22,34)*width) for ignored_row in range(height)]


def sheet(paths,name,cell_width,cell_height,footer):
    width=cell_width*2
    height=(len(paths)+1)//2*cell_height+50
    rows=blank(width,height)
    for index,path in enumerate(paths):
        source_width,source_height,source=read_png(path)
        for row in range(cell_height):
            source_row=source[min(source_height-1,row*source_height//cell_height)]
            target_row=rows[(index//2)*cell_height+row]
            start=(index%2)*cell_width*3
            for column in range(cell_width):
                source_start=(column*source_width//cell_width)*3
                target_row[start+column*3:start+column*3+3]=source_row[source_start:source_start+3]
    text(rows,footer,14,height-34,2)
    write_png(ROOT/'evidence'/name,width,height,rows)


files=sorted((ROOT/'evidence').glob('craft-*.png'))+sorted((ROOT/'evidence').glob('close-*.png'))+sorted((ROOT/'evidence').glob('world-*.png'))
for path in files:
    width,height,rows=read_png(path)
    result=blank(width,height+62)
    result[30:height+30]=rows
    text(result,path.stem.replace('-',' '),14,8,2)
    text(result,'OFFLINE EEVEE / SOURCE LIGHTING APPROXIMATION | NOT LIVE GPU OR FINAL ACCEPTANCE',14,height+42,1)
    write_png(path,width,height+62,result)
craft=[ROOT/'evidence'/name for name in ('craft-three-quarter.png','craft-opposite.png','craft-endcaps.png','craft-top.png','close-endcap-strap-saddle.png','close-manifold-valve-joints.png')]
world=[ROOT/'evidence'/f'world-{rig}-{variant}.png' for rig in ('classic','modern','chase') for variant in ('source','candidate')]
sheet(craft,'contact-craft.png',560,451,'INITIAL | 992 TRIANGLES | OPUS REVIEW DEFERRED')
sheet(world,'contact-world.png',640,391,'SOURCE LEFT / CANDIDATE RIGHT | SAME CAMERA / SCALE')
(ROOT/'evidence/png-labeling.json').write_text(json.dumps(dict(method='Python standard-library lossless PNG decode/re-encode, bitmap label bands, nearest-neighbor contact sheets; no scene retouching',files=[path.name for path in files],sourceImagePixelsUnchanged=True,labelBands=dict(top=30,bottom=32),sheets=['contact-craft.png','contact-world.png']),indent=2)+'\n')
print('LABELED',len(files),'PNGS AND TWO CONTACT SHEETS')
