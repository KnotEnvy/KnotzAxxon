"""Reopen editable blend; independently reimport GLB; pulse clearances and offline renders."""
import sys, json, math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from scene_tools import *
from mathutils.bvhtree import BVHTree

def get_asset():return [bpy.data.objects[n] for n in ['body','eye','engine','flash_shell']]
def pose(row):
    x,y,z=row['euler_xyz']
    # THREE Euler XYZ -> game rotation matrix, then basis conjugation.
    a,b=math.cos(x),math.sin(x);c,d=math.cos(y),math.sin(y);e,f=math.cos(z),math.sin(z)
    R=Matrix(((c*e,-c*f,d),(a*f+b*e*d,a*e-b*f*d,-b*c),(b*f-a*e*d,b*e+a*f*d,a*c)))
    root.rotation_euler=(C@R@C.transposed()).to_euler();engine.scale=(row['engine_scale'],)*3
    bpy.context.view_layer.update()
def rest():root.rotation_euler=(0,0,0);engine.scale=(1,1,1);bpy.context.view_layer.update()
def tree(ob):
    me=ob.data;return BVHTree.FromPolygons([ob.matrix_world@v.co for v in me.vertices],[list(p.vertices) for p in me.polygons])

# Real save/reopen gate (new process opens file, rather than reading in-memory construction).
bpy.ops.wm.open_mainfile(filepath=str(OUT/'drone.blend'))
asset=get_asset();root=bpy.data.objects['drone_root'];body,eye,engine,shell=asset
blend_stats=stats([body,eye,engine]);shell_stats=stats([shell])
expected=json.loads((REPORT/'build_evaluated.json').read_text())['visible']
assert blend_stats['triangles']==expected['triangles'] and blend_stats['material_primitives']==6
assert shell.hide_render
assert root.location.length<1e-7 and abs(root.rotation_euler.x)+abs(root.rotation_euler.y)+abs(root.rotation_euler.z)<1e-7
clear=[]
bodytree=tree(body)
for i in range(96):
    s=.97+(.095*i/95);engine.scale=(s,)*3;bpy.context.view_layer.update();et=tree(engine)
    overlaps=len(et.overlap(bodytree));dist=min(bodytree.find_nearest(engine.matrix_world@v.co)[3] for v in engine.data.vertices)
    clear.append({'scale':s,'triangle_intersections':overlaps,'vertex_to_static_surface_min':dist})
assert not any(r['triangle_intersections'] for r in clear),'Engine pulse intersects static machinery'
rest()
runtime=json.loads((REPORT/'runtime_samples.json').read_text())
chosen=runtime['chosen'];shot_probe=[];world_bounds=[]
for key,row in chosen.items():
    if row is None:continue
    pose(row);mouth=G(root.matrix_world@B((0,-.045,1.49)));spawn=Vector((0,0,1.5));bt=tree(body)
    dist=bt.find_nearest(B(spawn))[3]
    shot_probe.append({'pose':key,'euler':row['euler_xyz'],'world_shot_minus_root':[0,0,1.5],'rotated_mouth_minus_root':list(mouth),'mouth_to_spawn_distance':(mouth-spawn).length,'shot_nearest_static_surface':dist})
    world_bounds.append({'pose':key,'bounds_game':bounds([body,eye,engine])})
rest()
dump('blend_reopen_clearance.json',{'save_reopen_passed':True,'visible':blend_stats,'hidden_flash':shell_stats,'engine_pulse_samples':len(clear),'engine_pulse_interval':[.97,1.065],'minimum_engine_to_static_surface_vertex_proxy':min(r['vertex_to_static_surface_min'] for r in clear),'all_engine_triangle_intersections_zero':True,'engine_clearance_samples':clear,'shot_graphics_probe':shot_probe,'sampled_root_bounds':world_bounds,'method':'Evaluated saved blend, BVHTree engine vs body triangle intersection + engine-vertex nearest static-surface proxy over 96 scales. Root poses rigid; do not alter internal clearance. Distance proxy is not continuous exact mesh-to-mesh distance. Shot probes are points vs nearest visible surface, not projectile collision changes.','detach':'N/A: no detachable Flyer mechanic. Preserve existing normal explosion/wreck effects.','limitations':['No moving carrier, wing, boss, environment or live collision validation','Shot mouth follows visual root; gameplay spawn/muzzle FX/aiming do not. Report mismatch; do not change aim.','No fixed orbit velocity cap; chosen sampled transforms are evidence, not global limits']})

# Clean scene and actual importer crosscheck, including both glTF scenes.
reset();bpy.ops.import_scene.gltf(filepath=str(OUT/'drone.glb'))
byname={o.name:o for o in bpy.data.objects};reimport=stats([byname[n] for n in ['body','eye','engine']]);reflash=stats([byname['flash_shell']])
assert reimport['triangles']==blend_stats['triangles'] and reimport['material_primitives']==6
assert reflash['triangles']==shell_stats['triangles']
for a,b in zip(reimport['bounds_game']['min']+reimport['bounds_game']['max'],blend_stats['bounds_game']['min']+blend_stats['bounds_game']['max']):assert abs(a-b)<1e-5
dump('glb_clean_reimport.json',{'clean_scene':True,'visible':reimport,'hidden_flash':reflash,'axes':'Independent binary reader verifies nose marker (0,0,2), up marker (0,1,0); Blender reimport bounds converted with (x,z,-y).','bounds_and_counts_match_blend':True,'all_imported_nodes':sorted(byname)})

# Images use reopened editable blend; no flash template appears in rest views.
bpy.ops.wm.open_mainfile(filepath=str(OUT/'drone.blend'));root=bpy.data.objects['drone_root'];body,eye,engine,shell=get_asset();shell.hide_render=True
setup_render();neutral();rest()
render('rest_three_quarter_front',(-11,10,15),span=8)
render('rest_front',(0,2.4,16),span=7)
render('rest_rear',(0,2.4,-16),span=7)
render('rest_top',(0,16,.001),span=7)
render('rest_side',(16,1.5,0),span=6)
# Required common neutral: exact GAME coordinates, proper explicit conversion.
renderlog={'common_neutral':{'camera_game':[-16,24,-30],'target_game':[0,0,0],'camera_blender':[-16,30,24],'target_blender':[0,0,0],'ortho_span':14,'key_game':[-12,22,-12],'key_blender':[-12,12,22],'fill_game':[14,12,8],'fill_blender':[14,-8,12],'background':'shared neutral dark','additional_rim':False},'offline_gameplay':{}}
# No extra rim in the specified common neutral setup.
bpy.data.objects['Soft rim'].hide_render=True
render('common_neutral',(-16,24,-30),span=14)
bpy.data.objects['Soft rim'].hide_render=False
poses=[('action_weave_bank','weave_bank'),('action_strafe_bank','strafe_bank'),('action_orbit_restore_extreme','orbit_restore_stress_bank'),('action_pitch_peel','dive_and_committed_peel_pitch'),('action_carrier_roll_extreme','carrier_launch_transition_bank'),('action_launch_initial','launch_initial'),('action_launch_transition','launch_transition')]
for name,key in poses:
    row=chosen[key];pose(row);render(name,(-11,10,15),span=8)
rest()

# Common WORLD scale comparison. Shipped player +5X, drone -4X; no normalization.
before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(REPO/'public/models/player.glb'))
player=[o for o in bpy.data.objects if o not in before]
player_roots=[o for o in player if o.parent not in player]
for ob in player_roots:ob.location+=B((4.5,0,0))
root.location=B((-4,0,0));bpy.context.view_layer.update()
render('world_scale_player_and_drone',(-16,24,-30),target=(0,0,0),span=17,w=900,h=600)
renderlog['world_scale_comparison']={'drone_world_position':[-4,0,0],'player_world_position':[4.5,0,0],'player_import_scale':1,'drone_import_scale':1,'normalization':False,'player_bounds_placed':bounds(player),'drone_bounds_placed':bounds([body,eye,engine])}

# Reconstruct CameraRig._compute at player(0,10,0), no boost/shake/lag, 16:9.
# This is offline Blender EEVEE evidence, not a browser screenshot or performance run.
for mode,yaw,dist,height,fov in [('classic',45,64,45.255,52),('modern',20,29,14,58),('chase',6,24,9.5,66)]:
    root.location=B((0,10,28));bpy.context.view_layer.update()
    for ob in player_roots:ob.location+=B((-4.5,10,0)) if mode=='classic' else Vector((0,0,0))
    off=(-math.sin(math.radians(yaw))*dist,height,-math.cos(math.radians(yaw))*dist)
    if mode=='classic':pos=(off[0],9+height,28+off[2]);target=(0,9,28);kind='ORTHO';span=80
    else:pos=(off[0],10+height,off[2]);target=(0,11.2,16);kind='PERSP';span=80
    clear_lights()
    # Dusk key vector and rim from Sky.js, translated around the reconstruction.
    vec=Vector((-.5,.7,-.52)).normalized();key=(vec.x*140,vec.y*140+90,vec.z*140-24)
    light('Dusk directional',key,3.4,color=(1,.737,.525),target=(0,0,0),kind='SUN')
    light('Cyan rim',(-vec.x*120,70,-vec.z*120),1.1,color=(.31,.847,1),kind='SUN')
    # Hemisphere approximated by blue world; no exact environment PMREM equivalence.
    bpy.context.scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.10,.145,.24,1)
    bpy.context.scene.world.node_tree.nodes['Background'].inputs[1].default_value=.7
    render('offline_gameplay_'+mode,pos,target,span,kind,fov,w=960,h=540)
    renderlog['offline_gameplay'][mode]={'camera_game':list(pos),'target_game':list(target),'drone_world':[0,10,28],'player_world':[0,10,0],'projection':kind,'vertical_fov_degrees':fov if kind=='PERSP' else None,'vertical_ortho_span':span if kind=='ORTHO' else None,'resolution':[960,540],'limitations':'Offline reconstructed Blender EEVEE. Exact source static camera rig offsets, no boost; dusk key/rim directions and nominal intensities approximated, blue environment replaces hemisphere/PMREM. AgX differs from game ACES 1.02. No fog/bloom/HUD, animated camera lag, shake, walls, carrier or boss.'}
dump('render_metadata.json',renderlog)
print('DRONE_VERIFY_AND_RENDER_COMPLETE')
