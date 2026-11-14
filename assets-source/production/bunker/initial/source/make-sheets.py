import json
from pathlib import Path
import struct
import textwrap
import zlib

OUT=Path(__file__).resolve().parents[1]
WORK=OUT.parent/'work'
FONT={
    'A':'7e1111117e','B':'7f49494936','C':'3e41414122','D':'7f4141221c','E':'7f49494941','F':'7f09090901',
    'G':'3e4149497a','H':'7f0808087f','I':'00417f4100','J':'2040413f01','K':'7f08142241','L':'7f40404040',
    'M':'7f020c027f','N':'7f0408107f','O':'3e4141413e','P':'7f09090906','Q':'3e4151215e','R':'7f09192946',
    'S':'4649494931','T':'01017f0101','U':'3f4040403f','V':'1f2040201f','W':'3f4038403f','X':'6314081463',
    'Y':'0708700807','Z':'6151494543','0':'3e4551493e','1':'00427f4000','2':'4261514946','3':'2141494d33',
    '4':'1814127f10','5':'2745454539','6':'3c4a494930','7':'0171090503','8':'3649494936','9':'064949291e',
    ' ':'0000000000','-':'0808080808','.':'0060600000',':':'0036360000','/':'2010080402','|':'00007f0000',
    '#':'147f147f14','*':'14083e0814',',':'0050300000','_':'4040404040',
}


def annotate(width,height,pixels,title,footer):
    original_height=height
    height+=100
    expanded=bytearray(bytes((10,16,25,255))*(width*height))
    expanded[50*width*4:(50+original_height)*width*4]=pixels
    pixels=expanded
    def rectangle(left,top,right,bottom,color):
        for axis_y in range(max(0,top),min(height,bottom)):
            start=(axis_y*width+max(0,left))*4
            finish=(axis_y*width+min(width,right))*4
            pixels[start:finish]=bytes(color)*((finish-start)//4)

    def draw(text,axis_y):
        cursor=16
        for character in text.upper():
            columns=bytes.fromhex(FONT.get(character,FONT[' ']))
            for column,bits in enumerate(columns):
                for row in range(7):
                    if bits&(1<<row):
                        rectangle(cursor+column*2,axis_y+row*2,cursor+column*2+2,axis_y+row*2+2,(214,228,240,255))
            cursor+=12

    limit=(width-32)//12
    title_lines=textwrap.wrap(title.upper(),width=limit)[:2]
    footer_lines=textwrap.wrap(footer.upper(),width=limit)[:2]
    for index,text in enumerate(title_lines):
        draw(text,8+index*20)
    for index,text in enumerate(footer_lines):
        draw(text,height-20*len(footer_lines)+index*20)
    return height,pixels


def read_png(filename):
    content=Path(filename).read_bytes()
    assert content[:8]==b'\x89PNG\r\n\x1a\n'
    cursor=8
    compressed=bytearray()
    while cursor<len(content):
        length=struct.unpack_from('>I',content,cursor)[0]
        kind=content[cursor+4:cursor+8]
        data=content[cursor+8:cursor+8+length]
        if kind==b'IHDR':
            width,height,depth,color,compression,filtering,interlace=struct.unpack('>IIBBBBB',data)
            assert depth==8 and color in [2,6] and interlace==0
        if kind==b'IDAT':
            compressed.extend(data)
        cursor+=length+12
    channels=4 if color==6 else 3
    stride=width*channels
    source=zlib.decompress(compressed)
    result=bytearray()
    previous=bytearray(stride)
    cursor=0
    for row in range(height):
        filtering=source[cursor]
        current=bytearray(source[cursor+1:cursor+1+stride])
        cursor+=stride+1
        for index in range(stride):
            left=current[index-channels] if index>=channels else 0
            above=previous[index]
            upper_left=previous[index-channels] if index>=channels else 0
            if filtering==1:
                predictor=left
            elif filtering==2:
                predictor=above
            elif filtering==3:
                predictor=(left+above)//2
            elif filtering==4:
                estimate=left+above-upper_left
                distances=[abs(estimate-left),abs(estimate-above),abs(estimate-upper_left)]
                predictor=[left,above,upper_left][distances.index(min(distances))]
            else:
                assert filtering==0
                predictor=0
            current[index]=(current[index]+predictor)&255
        if channels==4:
            result.extend(current)
        else:
            for index in range(0,len(current),3):
                result.extend(current[index:index+3]+b'\xff')
        previous=current
    return width,height,result


def write_png(filename,width,height,pixels):
    def chunk(kind,data):
        return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    scanlines=b''.join(b'\0'+pixels[row*width*4:(row+1)*width*4] for row in range(height))
    content=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(scanlines,8))+chunk(b'IEND',b'')
    Path(filename).write_bytes(content)


groups=json.loads((WORK/'render-index.json').read_text())
frames=OUT/'evidence/frames'
frames.mkdir(exist_ok=True)
inventory=[]
for number,(name,entries) in enumerate(groups.items(),1):
    columns=3 if name=='world-scale' else 2
    rows=(len(entries)+columns-1)//columns
    loaded=[read_png(entry['path']) for entry in entries]
    for index,(frame_width,frame_height,frame_pixels) in enumerate(loaded):
        caption_height,caption_pixels=annotate(frame_width,frame_height,frame_pixels,entries[index]['title'],entries[index]['footer'])
        loaded[index]=(frame_width,caption_height,caption_pixels)
    tile_width,tile_height=loaded[0][:2]
    width,height=tile_width*columns,tile_height*rows
    pixels=bytearray(width*height*4)
    for index,(frame_width,frame_height,frame_pixels) in enumerate(loaded):
        assert (frame_width,frame_height)==(tile_width,tile_height)
        column=index%columns
        row=index//columns
        for source_row in range(tile_height):
            target=((row*tile_height+source_row)*width+column*tile_width)*4
            pixels[target:target+tile_width*4]=frame_pixels[source_row*tile_width*4:(source_row+1)*tile_width*4]
        write_png(frames/Path(entries[index]['path']).name,frame_width,frame_height,frame_pixels)
    filename=f'{number:02d}-{name}.png'
    write_png(OUT/'evidence'/filename,width,height,pixels)
    inventory.append({'file':filename,'width':width,'height':height,'panels':[{'file':f'frames/{Path(entry["path"]).name}','title':entry['title']} for entry in entries]})
(OUT/'evidence/png-inventory.json').write_text(json.dumps({'method':'Lossless stdlib PNG decoding/filter reversal and pixel copy; no resampling or color grading. Explicit 5x7 pixel-font captions are composited into 50px top/bottom gutters OUTSIDE the original render; no render pixels are overwritten and captions cannot cast 3D shadows.','sheets':inventory},indent=2))
print('PNG_SHEETS_PASS',[(item['file'],item['width'],item['height']) for item in inventory])
