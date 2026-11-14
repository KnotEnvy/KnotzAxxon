"""Label offline evidence without changing geometry, framing, or pixel exposure."""
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
RAW=ROOT.parent/'.runtime/raw-evidence'
RAW.mkdir(parents=True,exist_ok=True)
font_file='/usr/share/fonts/truetype/ubuntu/Ubuntu-R.ttf'
large=ImageFont.truetype(font_file,25)
small=ImageFont.truetype(font_file,19)
records=json.loads((ROOT/'checks/render-rigs.json').read_text())['renders']
for record in ([] if '--sheets-only' in sys.argv else records):
    filename=record['file']
    raw=RAW/filename
    authored=ROOT/'evidence'/filename
    if not raw.exists():
        authored.rename(raw)
    image=Image.open(raw).convert('RGB')
    canvas=Image.new('RGB',(image.width,image.height+98),(9,17,29))
    canvas.paste(image,(0,0))
    draw=ImageDraw.Draw(canvas)
    title=Path(filename).stem.replace('_',' ')
    draw.text((22,image.height+8),title+'  |  INITIAL / OFFLINE EEVEE',fill=(219,232,238),font=large)
    detail=f"Player.glb scale 1.0; game Y={record['player_game'][1]}  |  t={record['time_seconds']:g}s  |  source rig" if record['source_rig'] else f"Structural evidence; shipped player scale 1.0  |  t={record['time_seconds']:g}s  |  custom inspection camera"
    draw.text((22,image.height+40),detail,fill=(149,177,197),font=small)
    draw.text((22,image.height+66),'Approximate source lighting; no live game, source textures, fog, bloom or HUD.  pending_deferred_opus_review',fill=(178,153,117),font=small)
    canvas.save(authored,optimize=True)


def sheet(filename,names,columns=3,width=720):
    thumbs=[]
    for name in names:
        image=Image.open(ROOT/'evidence'/name).convert('RGB')
        image.thumbnail((width,600),Image.LANCZOS)
        thumbs.append(image)
    height=max(image.height for image in thumbs)
    rows=(len(thumbs)+columns-1)//columns
    canvas=Image.new('RGB',(width*columns,height*rows),(9,17,29))
    for index,image in enumerate(thumbs):
        canvas.paste(image,((index%columns)*width,(index//columns)*height))
    canvas.save(ROOT/'evidence'/filename,optimize=True)


sheet('00_multiview_contact_sheet.png',[record['file'] for record in records],3,640)
sheet('00_game_scale_rigs.png',['07_game_Classic.png','08_game_Modern.png','09_game_Chase.png'],3,720)
