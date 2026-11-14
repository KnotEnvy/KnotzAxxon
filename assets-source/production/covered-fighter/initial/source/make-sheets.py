import json
import pathlib
import sys

sys.dont_write_bytecode = True
try:
    from PIL import Image, ImageDraw, ImageFont
except ModuleNotFoundError:
    sys.path.insert(0,'/home/knotzuni/code/KnotzAxxon-archive/2026-11-14/contest-entry/.cache/sysroot/usr/lib/python3/dist-packages')
    from PIL import Image, ImageDraw, ImageFont

HOME = pathlib.Path(__file__).resolve().parents[1]
RENDERS = HOME / 'evidence' / 'renders'
OUT = HOME / 'evidence' / 'sheets'
OUT.mkdir(parents=True,exist_ok=True)
FONT = '/mnt/c/Windows/Fonts/arial.ttf'
TITLE = ImageFont.truetype(FONT,30)
LABEL = ImageFont.truetype(FONT,23)
SMALL = ImageFont.truetype(FONT,18)
SHEETS = []


def sheet(name,title,frames,columns):
    images=[Image.open(RENDERS/filename).convert('RGB') for filename,label in frames]
    width,height=images[0].size
    header=84
    row_height=height+38
    canvas=Image.new('RGB',(width*columns,header+row_height*((len(frames)+columns-1)//columns)),(20,25,32))
    draw=ImageDraw.Draw(canvas)
    draw.text((20,10),title,font=TITLE,fill=(231,235,239))
    draw.text((20,49),'OFFLINE BLENDER EEVEE RECONSTRUCTION | INITIAL | PENDING DEFERRED OPUS REVIEW | 0 FORMAL REVIEWS',font=SMALL,fill=(173,186,199))
    for index,((filename,label),image) in enumerate(zip(frames,images)):
        x=(index%columns)*width
        y=header+(index//columns)*row_height
        draw.text((x+15,y+6),label,font=LABEL,fill=(219,224,230))
        canvas.paste(image,(x,y+38))
    path=OUT/(name+'.png')
    canvas.save(path,optimize=True)
    SHEETS.append({'file':path.name,'frames':[filename for filename,label in frames],'size':canvas.size,'resampling':'none; original pixels retained'})


sheet('multiview','COVERED / MOTHBALLED FIGHTER - FITTED CANVAS, NO LIVE CUES',[(f'candidate-{view}.png',label) for view,label in [('front-quarter','FRONT QUARTER'),('rear-quarter','REAR QUARTER'),('top','TOP: COHERENT AIRFRAME / COVER PANELS'),('profile','PROFILE: ATTACHED FIN AND LANDING GEAR'),('nose','NOSE: CINCHED COVER'),('rear','REAR: SEALED EXHAUST')]],2)
sheet('structure','STRUCTURAL CLOSEUPS - TENSIONED PANELS, TIEDOWNS, ATTACHED GEAR',[('structure-canvas-and-tiedowns.png','CANVAS PANEL BREAKS / REINFORCED SEAMS / TIEDOWNS'),('structure-attached-gear.png','THREE ATTACHED STRUTS / TORQUE BRACES / WHEELS')],2)
sheet('full-yaw','SOURCE / CANDIDATE - SAME CAMERA, LIGHTING, AND WORLD UNITS',[(f'yaw-{yaw:+.2f}-{variant}.png',f'{variant.upper()} | YAW {yaw:+.2f} RAD') for yaw in [-.25,0,.25] for variant in ['source','candidate']],2)
camera_data=json.loads((HOME/'evidence'/'camera-evidence.json').read_text())['cameras']
camera_data+=json.loads((HOME/'evidence'/'camera-evidence-centerlane.json').read_text())['cameras']
for rig in camera_data:
    mode=rig['mode']
    suffix='-centerlane' if rig.get('state')=='centerlane' else ''
    title=f'{mode.upper()} - ACTUAL SOURCE RIG / FULL CHUNK / SHIPPED PLAYER AT SCALE 1'
    if suffix:
        title+=' / CENTER LANE'
    sheet('world-'+mode+suffix,title,[(f'world-{mode}-source{suffix}.png','SOURCE: 260 TRIANGLES INCLUDING HARDSTAND'),(f'world-{mode}-candidate{suffix}.png','CANDIDATE: 1,372 TRIANGLES INCLUDING UNCHANGED HARDSTAND')],2)
    images=[]
    for variant in ['source','candidate']:
        image=Image.open(RENDERS/f'world-{mode}-{variant}{suffix}.png').convert('RGB')
        bounds=rig['projections'][variant]
        center_x=((bounds['ndcMin'][0]+bounds['ndcMax'][0])/2+1)*640
        center_y=(1-(bounds['ndcMin'][1]+bounds['ndcMax'][1])/2)*360
        crop=image.crop((round(center_x-100),round(center_y-80),round(center_x+100),round(center_y+80)))
        images.append(crop)
    canvas=Image.new('RGB',(1600,740),(20,25,32))
    draw=ImageDraw.Draw(canvas)
    draw.text((18,12),f'{mode.upper()} DETAIL - EXPLICIT 4X NEAREST-NEIGHBOR CROP, NOT WORLD-SCALE ACCEPTANCE',font=LABEL,fill=(231,235,239))
    for index,(variant,image) in enumerate(zip(['source','candidate'],images)):
        draw.text((index*800+18,50),variant.upper(),font=LABEL,fill=(220,226,233))
        canvas.paste(image.resize((800,640),Image.NEAREST),(index*800,90))
    path=OUT/('world-'+mode+suffix+'-detail-4x.png')
    canvas.save(path,optimize=True)
    SHEETS.append({'file':path.name,'resampling':'explicit 4x nearest-neighbor; supporting crop only, not native world scale'})
(HOME/'evidence'/'sheet-index.json').write_text(json.dumps(SHEETS,indent=2)+'\n')
print(json.dumps(SHEETS,indent=2))
