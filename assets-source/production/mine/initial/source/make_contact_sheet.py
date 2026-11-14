"""PNG montage and true small-resolution evidence, standard library only.
No crops, geometry scaling, recoloring, or per-asset normalization."""
import struct,zlib,json,math
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'evidence'
def png_read(path):
    blob=Path(path).read_bytes();assert blob[:8]==b'\x89PNG\r\n\x1a\n';pos=8;data=b''
    while pos<len(blob):
        n=struct.unpack_from('>I',blob,pos)[0];kind=blob[pos+4:pos+8];chunk=blob[pos+8:pos+8+n];pos+=12+n
        if kind==b'IHDR':w,h,depth,mode,_,_,interlace=struct.unpack('>IIBBBBB',chunk)
        if kind==b'IDAT':data+=chunk
    assert depth==8 and mode in [2,6] and interlace==0
    nc=3 if mode==2 else 4;stride=w*nc;raw=zlib.decompress(data);rows=[];prev=bytearray(stride);p=0
    for y in range(h):
        f=raw[p];p+=1;cur=bytearray(raw[p:p+stride]);p+=stride
        for x in range(stride):
            a=cur[x-nc] if x>=nc else 0;b=prev[x];c=prev[x-nc] if x>=nc else 0
            if f==1:q=a
            elif f==2:q=b
            elif f==3:q=(a+b)//2
            elif f==4:
                k=a+b-c;pa=abs(k-a);pb=abs(k-b);pc=abs(k-c);q=a if pa<=pb and pa<=pc else b if pb<=pc else c
            else:q=0
            cur[x]=(cur[x]+q)&255
        if nc==4:
            rgb=bytearray(w*3)
            for x in range(w):rgb[x*3:x*3+3]=cur[x*4:x*4+3]
            rows.append(rgb)
        else:rows.append(cur[:])
        prev=cur
    return w,h,rows

def png_write(path,w,h,rows):
    def chunk(k,v):return struct.pack('>I',len(v))+k+v+struct.pack('>I',zlib.crc32(k+v)&0xffffffff)
    raw=b''.join(b'\0'+bytes(r) for r in rows)
    Path(path).write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw,7))+chunk(b'IEND',b''))

def resize(im,w,h):
    iw,ih,rr=im;out=[]
    if iw==w*2 and ih==h*2:
        for y in range(h):
            row=bytearray(w*3)
            for x in range(w):
                for c in range(3):row[x*3+c]=(rr[y*2][x*6+c]+rr[y*2][x*6+3+c]+rr[y*2+1][x*6+c]+rr[y*2+1][x*6+3+c])//4
            out.append(row)
    else:
        xs=[int(x*iw/w)*3 for x in range(w)]
        for y in range(h):
            source=rr[int(y*ih/h)];out.append(bytearray(b''.join(source[x:x+3] for x in xs)))
    return w,h,out
# Five-by-seven glyphs for legible evidence labels without font dependencies.
FONT={
'A':'01110/10001/10001/11111/10001/10001/10001','B':'11110/10001/10001/11110/10001/10001/11110','C':'01111/10000/10000/10000/10000/10000/01111','D':'11110/10001/10001/10001/10001/10001/11110','E':'11111/10000/10000/11110/10000/10000/11111','F':'11111/10000/10000/11110/10000/10000/10000','G':'01111/10000/10000/10111/10001/10001/01111','H':'10001/10001/10001/11111/10001/10001/10001','I':'11111/00100/00100/00100/00100/00100/11111','J':'00111/00010/00010/00010/10010/10010/01100','K':'10001/10010/10100/11000/10100/10010/10001','L':'10000/10000/10000/10000/10000/10000/11111','M':'10001/11011/10101/10101/10001/10001/10001','N':'10001/11001/10101/10011/10001/10001/10001','O':'01110/10001/10001/10001/10001/10001/01110','P':'11110/10001/10001/11110/10000/10000/10000','Q':'01110/10001/10001/10001/10101/10010/01101','R':'11110/10001/10001/11110/10100/10010/10001','S':'01111/10000/10000/01110/00001/00001/11110','T':'11111/00100/00100/00100/00100/00100/00100','U':'10001/10001/10001/10001/10001/10001/01110','V':'10001/10001/10001/10001/10001/01010/00100','W':'10001/10001/10001/10101/10101/11011/10001','X':'10001/10001/01010/00100/01010/10001/10001','Y':'10001/10001/01010/00100/00100/00100/00100','Z':'11111/00001/00010/00100/01000/10000/11111',
'0':'01110/10001/10011/10101/11001/10001/01110','1':'00100/01100/00100/00100/00100/00100/01110','2':'01110/10001/00001/00010/00100/01000/11111','3':'11110/00001/00001/01110/00001/00001/11110','4':'00010/00110/01010/10010/11111/00010/00010','5':'11111/10000/10000/11110/00001/00001/11110','6':'01110/10000/10000/11110/10001/10001/01110','7':'11111/00001/00010/00100/01000/01000/01000','8':'01110/10001/10001/01110/10001/10001/01110','9':'01110/10001/10001/01111/00001/00001/01110','-':'00000/00000/00000/11111/00000/00000/00000','.':'00000/00000/00000/00000/00000/00100/00100','/':'00001/00010/00010/00100/01000/01000/10000',':':'00000/00100/00100/00000/00100/00100/00000',' ':'00000/00000/00000/00000/00000/00000/00000'}
def label(rows,x,y,text,scale=2):
    for char in text.upper():
        for yy,line in enumerate(FONT.get(char,FONT[' ']).split('/')):
            for xx,bit in enumerate(line):
                if bit=='1':
                    for dy in range(scale):
                        for dx in range(scale):
                            ix=x+xx*scale+dx;iy=y+yy*scale+dy
                            if 0<=iy<len(rows) and 0<=ix<len(rows[0])//3:rows[iy][ix*3:ix*3+3]=b'\xdd\xe6\xef'
        x+=6*scale

def sheet(entries,path,columns=4,cellw=360,cellh=312):
    w=columns*cellw;h=math.ceil(len(entries)/columns)*cellh;rows=[bytearray(bytes([18,24,33])*w) for y in range(h)]
    for i,(file,title) in enumerate(entries):
        x=i%columns*cellw;y=i//columns*cellh;im=png_read(OUT/file);scale=min(cellw/im[0],270/im[1]);tw,th=int(im[0]*scale),int(im[1]*scale);tile=resize(im,tw,th);ox=x+(cellw-tw)//2;oy=y+(270-th)//2
        for k,r in enumerate(tile[2]):rows[oy+k][ox*3:(ox+tw)*3]=r
        for line,t in enumerate(title.split('|')[:2]):label(rows,x+8,y+277+line*16,t[:28],2)
    png_write(path,w,h,rows)
if __name__=='__main__':
    rec=json.loads((OUT/'render-index.json').read_text());entries=[]
    for r in rec:
        name=r['file'];short=name.replace('.png','').replace('_',' ').upper()
        title=('OFFLINE '+short.replace('GAMEPLAY ','')+'|SHARED WORLD SCALE') if name.startswith('gameplay_') else short+'|INITIAL - REVIEW DEFERRED'
        entries.append((name,title))
    sheet(entries,OUT/'contact_sheet.png')
    for mode in ['classic','modern','chase']:
        for alt in [3,22]:
            name=f'gameplay_{mode}_alt{alt}.png';small=resize(png_read(OUT/name),480,270);png_write(OUT/f'small_{name}',*small)
    gameplay=[(f'small_gameplay_{mode}_alt{alt}.png',f'OFFLINE {mode} / ALT {alt}|480 X 270 - NO NORMALIZATION') for mode in ['classic','modern','chase'] for alt in [3,22]]
    sheet(gameplay,OUT/'small_gameplay_sheet.png',columns=2,cellw=480,cellh=312)
    # A compact inline sheet keeps the delivered evidence easy to open.
    overview=[('rest_common.png','REST / COMMON NEUTRAL|SPAN 14'),('reference_shared_scale.png','MINE + SHIPPED PLAYER|SHARED WORLD SCALE'),('tumble_4.png','SOURCE TUMBLE / 4 SECONDS|ALL PARTS TUMBLE TOGETHER'),('proximity_armed.png','PROXIMITY ARMED|EMISSION CONSTANT / SCALE 1.06')]
    sheet(overview,OUT/'overview.png',columns=2,cellw=360,cellh=312)
    print('Montages and six actual half-resolution gameplay PNGs saved.')
