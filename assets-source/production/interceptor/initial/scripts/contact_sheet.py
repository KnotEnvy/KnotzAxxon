"""Dependency-free PNG contact sheets and honest nearest-neighbour gameplay crops.
Reads actual Blender PNG scanlines, no renders are fabricated or reinterpreted.
"""
from pathlib import Path
import struct,zlib,binascii,json
OUT=Path(__file__).resolve().parents[1];R=OUT/'renders'
def read(p):
 b=p.read_bytes();pos=8;data=b''
 while pos<len(b):
  n=struct.unpack_from('>I',b,pos)[0];t=b[pos+4:pos+8];v=b[pos+8:pos+8+n];pos+=n+12
  if t==b'IHDR':w,h,depth,kind,_,_,interlace=struct.unpack('>IIBBBBB',v)
  if t==b'IDAT':data+=v
 assert depth==8 and interlace==0 and kind in [2,6];c=3 if kind==2 else 4;data=zlib.decompress(data);stride=w*c;rows=[];prev=bytearray(stride);q=0
 for y in range(h):
  filt=data[q];q+=1;row=bytearray(data[q:q+stride]);q+=stride
  for x in range(stride):
   a=row[x-c] if x>=c else 0;bb=prev[x];cc=prev[x-c] if x>=c else 0
   if filt==1:row[x]=(row[x]+a)&255
   elif filt==2:row[x]=(row[x]+bb)&255
   elif filt==3:row[x]=(row[x]+(a+bb)//2)&255
   elif filt==4:
    pp=a+bb-cc;pa=abs(pp-a);pb=abs(pp-bb);pc=abs(pp-cc);row[x]=(row[x]+(a if pa<=pb and pa<=pc else bb if pb<=pc else cc))&255
  rows.append(bytearray(v for i,v in enumerate(row) if c==3 or i%c!=3));prev=row
 return w,h,rows
def write(p,w,h,rows):
 def chunk(t,b):return struct.pack('>I',len(b))+t+b+struct.pack('>I',binascii.crc32(t+b)&0xffffffff)
 raw=b''.join(b'\x00'+r for r in rows);p.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b''))
FONT={
'A':['01110','10001','10001','11111','10001','10001','10001'],'B':['11110','10001','10001','11110','10001','10001','11110'],'C':['01111','10000','10000','10000','10000','10000','01111'],'D':['11110','10001','10001','10001','10001','10001','11110'],'E':['11111','10000','10000','11110','10000','10000','11111'],'F':['11111','10000','10000','11110','10000','10000','10000'],'G':['01111','10000','10000','10111','10001','10001','01111'],'H':['10001','10001','10001','11111','10001','10001','10001'],'I':['11111','00100','00100','00100','00100','00100','11111'],'J':['00111','00010','00010','00010','10010','10010','01100'],'K':['10001','10010','10100','11000','10100','10010','10001'],'L':['10000','10000','10000','10000','10000','10000','11111'],'M':['10001','11011','10101','10101','10001','10001','10001'],'N':['10001','11001','10101','10011','10001','10001','10001'],'O':['01110','10001','10001','10001','10001','10001','01110'],'P':['11110','10001','10001','11110','10000','10000','10000'],'Q':['01110','10001','10001','10001','10101','10010','01101'],'R':['11110','10001','10001','11110','10100','10010','10001'],'S':['01111','10000','10000','01110','00001','00001','11110'],'T':['11111','00100','00100','00100','00100','00100','00100'],'U':['10001','10001','10001','10001','10001','10001','01110'],'V':['10001','10001','10001','10001','10001','01010','00100'],'W':['10001','10001','10001','10101','10101','10101','01010'],'X':['10001','10001','01010','00100','01010','10001','10001'],'Y':['10001','10001','01010','00100','00100','00100','00100'],'Z':['11111','00001','00010','00100','01000','10000','11111'],'0':['01110','10001','10011','10101','11001','10001','01110'],'1':['00100','01100','00100','00100','00100','00100','01110'],'2':['01110','10001','00001','00010','00100','01000','11111'],'3':['11110','00001','00001','01110','00001','00001','11110'],'4':['00010','00110','01010','10010','11111','00010','00010'],'5':['11111','10000','10000','11110','00001','00001','11110'],'6':['01110','10000','10000','11110','10001','10001','01110'],'7':['11111','00001','00010','00100','01000','01000','01000'],'8':['01110','10001','10001','01110','10001','10001','01110'],'9':['01110','10001','10001','01111','00001','00001','01110'],'-':['00000','00000','00000','11111','00000','00000','00000'],'.':['00000','00000','00000','00000','00000','00110','00110'],'/':['00001','00001','00010','00100','01000','10000','10000'],':':['00000','00110','00110','00000','00110','00110','00000']}
def text(rows,x,y,s,scale=2):
 for k,c in enumerate(s.upper()):
  for yy,line in enumerate(FONT.get(c,['00000']*7)):
   for xx,v in enumerate(line):
    if v=='1':
     for sy in range(scale):
      for sx in range(scale):
       px=x+(k*6+xx)*scale+sx;py=y+yy*scale+sy
       if 0<=py<len(rows) and 0<=px<len(rows[0])//3:rows[py][px*3:px*3+3]=bytes((205,215,225))
def paste(rows,img,x,y,w,h):
 iw,ih,ir=img
 for yy in range(h):
  sy=min(ih-1,int(yy*ih/h));row=bytearray()
  for xx in range(w):sx=min(iw-1,int(xx*iw/w));row.extend(ir[sy][sx*3:sx*3+3])
  rows[y+yy][x*3:(x+w)*3]=row
def sheet(items,name,cols=3,tw=400,th=300):
 pad=12;label=30;header=68;w=pad+(tw+pad)*cols;h=header+((len(items)+cols-1)//cols)*(th+label+pad)+pad;rows=[bytearray((19,24,31))*w for _ in range(h)]
 text(rows,16,12,'INTERCEPTOR / INITIAL',2);text(rows,16,36,'PENDING DEFERRED OPUS REVIEW',2)
 for i,(f,l) in enumerate(items):
  x=pad+(i%cols)*(tw+pad);y=header+(i//cols)*(th+label+pad);img=read(R/(f+'.png'))
  if '-crop4x' in f:
   iw,ih,_=img;assert iw<=tw and ih<=th;paste(rows,img,x+(tw-iw)//2,y+(th-ih)//2,iw,ih)
  else:paste(rows,img,x,y,tw,th)
  text(rows,x+3,y+th+8,l,1 if len(l)>32 else 2)
 write(R/name,w,h,rows)
rest=[(x,x.replace('rest-','').replace('-',' ')) for x in ['rest-front','rest-rear','rest-top','rest-side','rest-three-quarter','common-neutral']]
actions=[('action-'+x,x.replace('-',' ')) for x in ['weave','strafe','orbit-displaced','dive','peel','carrier-launch','carrier-transition','extreme-positive','extreme-negative']]
sheet(rest+actions,'contact-sheet.png')
sheet([(f'reference-{x}',x+' / STYLE ONLY') for x in ['player','sentinel','turret','radar','silo','fuel']],'shipped-style-contact.png',tw=360,th=252)
# Crops preserve the exact source pixels; 4x nearest-neighbour magnification is explicitly labelled.
crops={}
for mode in ['classic','modern','chase']:
 w,h,rows=read(R/f'gameplay-{mode}.png');bg=tuple(rows[0][:3]);xs=[];ys=[]
 for y,row in enumerate(rows):
  for x in range(w):
   if max(abs(row[x*3+k]-bg[k]) for k in range(3))>7:xs.append(x);ys.append(y)
 if not xs:continue
 loX=max(0,min(xs)-12);hiX=min(w,max(xs)+13);loY=max(0,min(ys)-12);hiY=min(h,max(ys)+13)
 cr=[r[loX*3:hiX*3] for r in rows[loY:hiY]];cw=hiX-loX;ch=hiY-loY;rr=[bytearray() for _ in range(ch*4)]
 for y in range(ch*4):
  for x in range(cw*4):rr[y].extend(cr[y//4][(x//4)*3:(x//4)*3+3])
 write(R/f'gameplay-{mode}-crop4x.png',cw*4,ch*4,rr);crops[mode]={'source_bbox':[min(xs),min(ys),max(xs)+1,max(ys)+1],'pixel_extent':[max(xs)-min(xs)+1,max(ys)-min(ys)+1],'note':'4x nearest-neighbour crop from full 960x540 offline reconstructed gameplay PNG; no rerender/normalization.'}
sheet([('world-scale-player-comparison','INTERCEPTOR LEFT / PLAYER RIGHT'),*[(f'gameplay-{x}-crop4x',x+' / CROP 4X') for x in ['classic','modern','chase']]],'gameplay-contact.png',cols=2,tw=480,th=280)
(OUT/'evidence'/'gameplay-pixel-measurements.json').write_text(json.dumps(crops,indent=2)+'\n')
print('CONTACT_SHEETS_COMPLETE',crops)
