"""Read shipped GLBs only. No reference geometry enters the new asset."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from scene_tools import *
reset();setup_render(480,360);neutral()
results={}
for name in ['player','sentinel','turret','radar','silo','fuel']:
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(REPO/'public/models'/f'{name}.glb'))
    obs=[o for o in bpy.data.objects if o not in before];bb=bounds(obs);results[name]=stats(obs)
    center=[(a+b)/2 for a,b in zip(bb['min'],bb['max'])];span=max(b-a for a,b in zip(bb['min'],bb['max']))*1.55
    # Each style thumbnail is framed individually; the later player comparison is world scale.
    render('ref_'+name,[center[i]+[-16,24,-30][i] for i in range(3)],center,span,w=480,h=360)
    for ob in obs:bpy.data.objects.remove(ob,do_unlink=True)
dump('shipped_references.json',results)
