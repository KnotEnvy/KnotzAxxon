"""Dependency-free PNG contact sheets. Nearest sampling preserves full framing."""
import struct,zlib,json,math
from pathlib import Path
P=Path(__file__).resolve().parent.parent;E=P/'evidence'
def load(p):
 d=p.read_bytes();off=8;chunks=[]
 while off<len(d):
  n=struct.unpack_from('>I',d,off)[0];kind=d[off+4:off+8];c=d[off+8:off+8+n];off+=12+n
  if kind==b'IHDR':w,h,depth,ct,_,_,interlace=struct.unpack('>IIBBBBB',c)
  if kind==b'IDAT':chunks.append(c)
 assert depth==8 and ct in (2,6) and interlace==0
 bpp=4 if ct==6 else 3;raw=zlib.decompress(b''.join(chunks));stride=w*bpp;rows=[];prior=bytearray(stride);off=0
 for y in range(h):
  f=raw[off];row=bytearray(raw[off+1:off+1+stride]);off+=stride+1
  for i in range(stride):
   a=row[i-bpp] if i>=bpp else 0;b=prior[i];c=prior[i-bpp] if i>=bpp else 0
   if f==1:row[i]=(row[i]+a)&255
   elif f==2:row[i]=(row[i]+b)&255
   elif f==3:row[i]=(row[i]+((a+b)//2))&255
   elif f==4:
    pp=a+b-c;aa=abs(pp-a);bb=abs(pp-b);cc=abs(pp-c);pred=a if aa<=bb and aa<=cc else b if bb<=cc else c;row[i]=(row[i]+pred)&255
  rows.append(row);prior=row
 rgba=bytearray(w*h*4)
 for y,row in enumerate(rows):
  for x in range(w):rgba[(y*w+x)*4:(y*w+x+1)*4]=row[x*bpp:x*bpp+3]+bytes([row[x*bpp+3] if bpp==4 else 255])
 return w,h,rgba
def save(p,w,h,d):
 def chunk(k,c):return struct.pack('>I',len(c))+k+c+struct.pack('>I',zlib.crc32(k+c)&0xffffffff)
 raw=b''.join(b'\0'+d[y*w*4:(y+1)*w*4] for y in range(h))
 p.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw,6))+chunk(b'IEND',b''))
def resize(w,h,data,nw,nh):
 out=bytearray(nw*nh*4)
 for y in range(nh):
  sy=min(h-1,int(y*h/nh))
  for x in range(nw):
   sx=min(w-1,int(x*w/nw));out[(y*nw+x)*4:(y*nw+x+1)*4]=data[(sy*w+sx)*4:(sy*w+sx+1)*4]
 return out
FONT={
'A':['01110','10001','10001','11111','10001','10001','10001'],'B':['11110','10001','10001','11110','10001','10001','11110'],'C':['01111','10000','10000','10000','10000','10000','01111'],'D':['11110','10001','10001','10001','10001','10001','11110'],'E':['11111','10000','10000','11110','10000','10000','11111'],'F':['11111','10000','10000','11110','10000','10000','10000'],'G':['01111','10000','10000','10111','10001','10001','01111'],'H':['10001','10001','10001','11111','10001','10001','10001'],'I':['111','010','010','010','010','010','111'],'J':['00111','00010','00010','00010','10010','10010','01100'],'K':['10001','10010','10100','11000','10100','10010','10001'],'L':['10000','10000','10000','10000','10000','10000','11111'],'M':['10001','11011','10101','10101','10001','10001','10001'],'N':['10001','11001','10101','10011','10001','10001','10001'],'O':['01110','10001','10001','10001','10001','10001','01110'],'P':['11110','10001','10001','11110','10000','10000','10000'],'Q':['01110','10001','10001','10001','10101','10010','01101'],'R':['11110','10001','10001','11110','10100','10010','10001'],'S':['01111','10000','10000','01110','00001','00001','11110'],'T':['11111','00100','00100','00100','00100','00100','00100'],'U':['10001','10001','10001','10001','10001','10001','01110'],'V':['10001','10001','10001','10001','10001','01010','00100'],'W':['10001','10001','10001','10101','10101','10101','01010'],'X':['10001','10001','01010','00100','01010','10001','10001'],'Y':['10001','10001','01010','00100','00100','00100','00100'],'Z':['11111','00001','00010','00100','01000','10000','11111'],
'0':['01110','10001','10011','10101','11001','10001','01110'],'1':['010','110','010','010','010','010','111'],'2':['01110','10001','00001','00010','00100','01000','11111'],'3':['11110','00001','00001','01110','00001','00001','11110'],'4':['10010','10010','10010','11111','00010','00010','00010'],'5':['11111','10000','10000','11110','00001','00001','11110'],'6':['01110','10000','10000','11110','10001','10001','01110'],'7':['11111','00001','00010','00100','01000','01000','01000'],'8':['01110','10001','10001','01110','10001','10001','01110'],'9':['01110','10001','10001','01111','00001','00001','01110'],'-':['00000','00000','00000','11111','00000','00000','00000'],'.':['0','0','0','0','0','1','1'],'/':['00001','00001','00010','00100','01000','10000','10000'],' ':['000']*7}
def text(d,w,x,y,s,scale=1):
 for ch in s.upper():
  pat=FONT.get(ch,FONT[' ']);cw=len(pat[0])
  for yy,row in enumerate(pat):
   for xx,b in enumerate(row):
    if b=='1':
     for dy in range(scale):
      for dx in range(scale):
       off=((y+yy*scale+dy)*w+x+xx*scale+dx)*4;d[off:off+4]=bytes([225,231,237,255])
  x+=(cw+1)*scale
def sheet(items,name,cols=3):
 cw,ch=384,314;w=cols*cw;h=math.ceil(len(items)/cols)*ch+36;d=bytearray(bytes([20,27,35,255])*(w*h));text(d,w,10,12,'HEAVY TURRET - INITIAL - DEFERRED OPUS REVIEW',2)
 for i,(fn,label) in enumerate(items):
  iw,ih,im=load(E/fn);nw=380;nh=round(ih*nw/iw);small=resize(iw,ih,im,nw,nh);x=(i%cols)*cw+2;y=36+(i//cols)*ch
  for yy in range(nh):d[((y+yy)*w+x)*4:((y+yy)*w+x+nw)*4]=small[yy*nw*4:(yy+1)*nw*4]
  text(d,w,x+4,y+288,label[:61])
 save(E/name,w,h,d)
index=json.loads((E/'render-index.json').read_text())
for r in index:r['label']=r['label'].replace('heavy left, shipped standard right','heavy X-5, shipped standard X+5')
(E/'render-index.json').write_text(json.dumps(index,indent=2))
items=[]
for r in index:
 fn=r['file'];label=fn[:-4].replace('game-','OFFLINE ').replace('-',' ')
 w,h,d=load(E/fn)
 for y in range(25):d[y*w*4:(y+1)*w*4]=bytes([20,27,35,255])*w
 if fn.startswith('game-'):
  text(d,w,8,5,'OFFLINE GAMEPLAY RECONSTRUCTION / '+fn[:-4].replace('game-','').replace('-',' '))
  text(d,w,8,15,'SHARED WORLD SCALE 1 / HEAVY X-5 / SHIPPED STANDARD X+5 / NOT LIVE GAMEPLAY')
 else:text(d,w,8,9,'INITIAL / '+fn[:-4].replace('-',' ')+' / DEFERRED OPUS REVIEW')
 save(E/fn,w,h,d)
 items.append((fn,label))
 if fn.startswith('game-'):
  sd=resize(w,h,d,640,360)
  for y in range(23):sd[y*640*4:(y+1)*640*4]=bytes([20,27,35,255])*640
  text(sd,640,6,4,'OFFLINE '+fn[:-4].replace('game-','').replace('-',' ')+' / WORLD SCALE 1')
  text(sd,640,6,14,'HEAVY X-5 / SHIPPED STANDARD X+5 / NOT LIVE GAMEPLAY')
  save(E/(fn[:-4]+'-small.png'),640,360,sd)
sheet(items,'contact-sheet.png')
sheet([p for p in items if p[0].startswith('game-')],'offline-gameplay-contact.png',2)
print('CONTACT_SHEETS_READY',len(items))
