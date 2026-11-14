"""Pure-stdlib PNG contact sheets. No optional image package or hidden browser."""
import struct,zlib,json,math
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent; PNG=ROOT/'evidence/png'
def read(path):
    d=Path(path).read_bytes();assert d[:8]==b'\x89PNG\r\n\x1a\n';off=8;packed=[]
    while off<len(d):
        n=struct.unpack_from('>I',d,off)[0];k=d[off+4:off+8];p=d[off+8:off+8+n];off+=12+n
        if k==b'IHDR':w,h,depth,color,_,_,inter=struct.unpack('>IIBBBBB',p);assert depth==8 and color in (2,6) and inter==0
        if k==b'IDAT':packed.append(p)
    raw=zlib.decompress(b''.join(packed));channels=3 if color==2 else 4;stride=w*channels;rows=[];last=bytearray(stride);at=0
    def paeth(a,b,c):
        p=a+b-c;pa=abs(p-a);pb=abs(p-b);pc=abs(p-c);return a if pa<=pb and pa<=pc else b if pb<=pc else c
    for y in range(h):
        f=raw[at];at+=1;row=bytearray(raw[at:at+stride]);at+=stride
        for x in range(stride):
            a=row[x-channels] if x>=channels else 0;b=last[x];c=last[x-channels] if x>=channels else 0
            row[x]=(row[x]+(0 if f==0 else a if f==1 else b if f==2 else (a+b)//2 if f==3 else paeth(a,b,c)))&255
        rows.append(bytearray(v for x in range(w) for v in row[x*channels:x*channels+3]));last=row
    return w,h,rows
def write(path,w,h,rows):
    def chunk(k,p):return struct.pack('>I',len(p))+k+p+struct.pack('>I',zlib.crc32(k+p)&0xffffffff)
    data=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(b'\0'+bytes(r) for r in rows),7))+chunk(b'IEND',b'')
    Path(path).write_bytes(data)
# Compact authored 5x7 glyph set for evidence labels only.
glyphs={
'A':['01110','10001','10001','11111','10001','10001','10001'],'B':['11110','10001','10001','11110','10001','10001','11110'],'C':['01111','10000','10000','10000','10000','10000','01111'],'D':['11110','10001','10001','10001','10001','10001','11110'],'E':['11111','10000','10000','11110','10000','10000','11111'],'F':['11111','10000','10000','11110','10000','10000','10000'],'G':['01111','10000','10000','10111','10001','10001','01111'],'H':['10001','10001','10001','11111','10001','10001','10001'],'I':['11111','00100','00100','00100','00100','00100','11111'],'J':['00111','00010','00010','00010','10010','10010','01100'],'K':['10001','10010','10100','11000','10100','10010','10001'],'L':['10000','10000','10000','10000','10000','10000','11111'],'M':['10001','11011','10101','10101','10001','10001','10001'],'N':['10001','11001','11001','10101','10011','10011','10001'],'O':['01110','10001','10001','10001','10001','10001','01110'],'P':['11110','10001','10001','11110','10000','10000','10000'],'Q':['01110','10001','10001','10001','10101','10010','01101'],'R':['11110','10001','10001','11110','10100','10010','10001'],'S':['01111','10000','10000','01110','00001','00001','11110'],'T':['11111','00100','00100','00100','00100','00100','00100'],'U':['10001','10001','10001','10001','10001','10001','01110'],'V':['10001','10001','10001','10001','10001','01010','00100'],'W':['10001','10001','10001','10101','10101','10101','01010'],'X':['10001','10001','01010','00100','01010','10001','10001'],'Y':['10001','10001','01010','00100','00100','00100','00100'],'Z':['11111','00001','00010','00100','01000','10000','11111'],
'0':['01110','10001','10011','10101','11001','10001','01110'],'1':['00100','01100','00100','00100','00100','00100','01110'],'2':['01110','10001','00001','00010','00100','01000','11111'],'3':['11110','00001','00001','01110','00001','00001','11110'],'4':['00010','00110','01010','10010','11111','00010','00010'],'5':['11111','10000','10000','11110','00001','00001','11110'],'6':['01110','10000','10000','11110','10001','10001','01110'],'7':['11111','00001','00010','00100','01000','01000','01000'],'8':['01110','10001','10001','01110','10001','10001','01110'],'9':['01110','10001','10001','01111','00001','00001','01110'],'-':['00000','00000','00000','11111','00000','00000','00000'],'.':['00000','00000','00000','00000','00000','00100','00100'],'/':['00001','00010','00010','00100','01000','01000','10000'],':':['00000','00100','00100','00000','00100','00100','00000']}
def label(rows,x,y,text,scale=1,color=(205,217,230)):
    for ch in text.upper():
        g=glyphs.get(ch,['00000']*7)
        for yy,line in enumerate(g):
            for xx,c in enumerate(line):
                if c=='1':
                    for sy in range(scale):
                        for sx in range(scale):
                            px=x+xx*scale+sx;py=y+yy*scale+sy
                            if 0<=py<len(rows) and 0<=px<len(rows[py])//3:rows[py][px*3:px*3+3]=bytes(color)
        x+=6*scale
def sheet(name,items,cols=3,tw=320,th=240,title='DR-3 INITIAL - OPUS REVIEW DEFERRED'):
    nrows=math.ceil(len(items)/cols);w=cols*tw;h=44+nrows*(th+30);rows=[bytearray([17,22,30]*w) for _ in range(h)];label(rows,12,14,title,2)
    for i,(file,text) in enumerate(items):
        sw,sh,source=read(PNG/(file+'.png'));r=min(tw/sw,th/sh);dw=int(sw*r);dh=int(sh*r);x=(i%cols)*tw+(tw-dw)//2;y=44+(i//cols)*(th+30)+(th-dh)//2
        for yy in range(dh):
            sy=min(sh-1,int(yy/r));src=source[sy]
            for xx in range(dw):
                sx=min(sw-1,int(xx/r));rows[y+yy][(x+xx)*3:(x+xx)*3+3]=src[sx*3:sx*3+3]
        label(rows,(i%cols)*tw+8,44+(i//cols)*(th+30)+th+8,text)
    write(PNG/(name+'.png'),w,h,rows)
    return {'file':name+'.png','tiles':[{'file':f+'.png','label':t} for f,t in items],'dimensions':[w,h]}
if __name__=='__main__':
    refs=[('ref_'+n,'SHIPPED '+n.upper()) for n in ['player','sentinel','turret','radar','silo','fuel']]
    items=[('rest_three_quarter_front','FRONT THREE QUARTER'),('rest_front','FRONT'),('rest_rear','REAR'),('rest_top','TOP'),('rest_side','SIDE'),('common_neutral','COMMON NEUTRAL - SPAN 14'),('action_weave_bank','SOURCE WEAVE BANK'),('action_strafe_bank','SOURCE STRAFE BANK'),('action_orbit_restore_extreme','ORBIT RESTORE EXTREME'),('action_pitch_peel','COMMITTED PEEL PITCH'),('action_carrier_roll_extreme','CARRIER ROLL EXTREME'),('action_launch_initial','LAUNCH INITIAL X58'),('action_launch_transition','LAUNCH TRANSITION'),('world_scale_player_and_drone','DRONE / PLAYER - WORLD SCALE'),('offline_gameplay_classic','OFFLINE CLASSIC - 960X540'),('offline_gameplay_modern','OFFLINE MODERN - 960X540'),('offline_gameplay_chase','OFFLINE CHASE - 960X540')]
    items += [('action_contract_roll_minus_1p1','SYNTHETIC CLAMP -1.1'),('action_contract_roll_plus_1p1','SYNTHETIC CLAMP +1.1'),('hit_flash_shell_demonstration','FLASH GEOMETRY DEMONSTRATION'),('debug_actual_shot_ray','DEBUG SOURCE SHOT RAY')]
    out=[sheet('reference_contact_sheet',refs,title='SHIPPED STYLE REFERENCES'),sheet('contact_sheet',items,cols=3)]
    # Exact 1:1 source pixels, cropped to the drone without per-model scaling.
    crop_rows=[bytearray([17,22,30]*600) for _ in range(150)]
    label(crop_rows,8,8,'OFFLINE GAMEPLAY - EXACT 1 TO 1 PIXELS')
    crops=[]
    for i,(mode,cx,cy) in enumerate([('classic',480,264),('modern',501,253),('chase',486,260)]):
        w,h,src=read(PNG/('offline_gameplay_'+mode+'.png'));x0=cx-80;y0=cy-50
        for y in range(100):crop_rows[30+y][(i*200+20)*3:(i*200+180)*3]=src[y0+y][x0*3:(x0+160)*3]
        label(crop_rows,i*200+20,137,mode+' - NO RESCALE')
        crops.append({'source':'offline_gameplay_'+mode+'.png','source_crop_xywh':[x0,y0,160,100],'output_pixel_scale':1})
    write(PNG/'gameplay_scale_1to1.png',600,150,crop_rows)
    out.append({'file':'gameplay_scale_1to1.png','method':'Exact source pixels cropped and pasted 1:1. No model normalization or zoom.','crops':crops})
    (ROOT/'evidence/reports/contact_sheets.json').write_text(json.dumps(out,indent=2)+'\n')
    print(json.dumps(out,indent=2))
