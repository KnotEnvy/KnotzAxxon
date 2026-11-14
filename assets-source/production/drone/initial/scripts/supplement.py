"""Exact contract endpoint stress poses; explicitly distinct from sampled animation frames."""
import sys,math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from scene_tools import *
bpy.ops.wm.open_mainfile(filepath=str(OUT/'drone.blend'));setup_render();neutral()
root=bpy.data.objects['drone_root'];engine=bpy.data.objects['engine'];shell=bpy.data.objects['flash_shell'];shell.hide_render=True
for bank,tag in [(-1.1,'minus'),(1.1,'plus')]:
    R=Matrix(((math.cos(bank),-math.sin(bank),0),(math.sin(bank),math.cos(bank),0),(0,0,1)))
    root.rotation_euler=(C@R@C.transposed()).to_euler();engine.scale=(1.065,)*3
    render('action_contract_roll_'+tag+'_1p1',(-11,10,15),span=8)
root.rotation_euler=(0,0,0);engine.scale=(1,1,1);shell.hide_render=False
render('hit_flash_shell_demonstration',(-11,10,15),span=8)
dump('endpoint_stress_metadata.json',{'contract_roll_minus_1p1':{'bank_radians':-1.1,'engine_scale':1.065,'type':'synthetic exact clamp-endpoint stress pose; sampled real launch approaches the negative endpoint'},'contract_roll_plus_1p1':{'bank_radians':1.1,'engine_scale':1.065,'type':'synthetic opposite clamp-endpoint stress pose; not claimed to occur on the standard +58 carrier launch'},'hit_flash':'Opaque emissive-white shell geometry demonstration only. Live runtime must use additive opacity flash*0.75 and hide at zero, per Enemy._addFlashShell contract.'})
