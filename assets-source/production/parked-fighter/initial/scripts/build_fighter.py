import bpy
import bmesh
import json
import math
import pathlib
import sys
import hashlib
from mathutils import Vector

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'build'
OUT.mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
scene.render.engine = 'BLENDER_EEVEE'
scene.render.threads_mode = 'FIXED'
scene.render.threads = 4
source_collection = bpy.data.collections.new('EDITABLE_PARTS_not_exported')
scene.collection.children.link(source_collection)
runtime_collection = bpy.data.collections.new('RUNTIME_export_only')
scene.collection.children.link(runtime_collection)

def linear(value):
    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4

def rgba(hex_value):
    return tuple(linear(((hex_value >> shift) & 255) / 255) for shift in (16,8,0)) + (1,)

def material(name, color, metal, rough, emission=0):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    result.diffuse_color = rgba(color)
    shader = result.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = rgba(color)
    shader.inputs['Metallic'].default_value = metal
    shader.inputs['Roughness'].default_value = rough
    if emission:
        shader.inputs['Emission Color'].default_value = rgba(color)
        shader.inputs['Emission Strength'].default_value = emission
    else:
        attribute = result.node_tree.nodes.new('ShaderNodeVertexColor')
        attribute.layer_name = 'Color'
        result.node_tree.links.new(attribute.outputs['Color'], shader.inputs['Base Color'])
    return result

armor = material('PF_Armor',0x995c48,.48,.42)
metal = material('PF_Mechanism',0x526579,.56,.38)
glass = material('PF_Canopy',0x163747,.72,.19)
amber = material('PF_EngineAmber',0xff9a3a,0,.32,2.2)
red = material('PF_BeaconRed',0xff3d55,0,.3,3)
parts = []

def game(point):
    return (point[0], -point[2], point[1])

def paint(obj, color):
    attribute = obj.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
    for item in attribute.data:
        item.color = rgba(color)

def register(obj, name, mat, color, bevel=0):
    obj.name = name
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    source_collection.objects.link(obj)
    obj.data.materials.append(mat)
    paint(obj,color)
    if bevel:
        modifier=obj.modifiers.new('Editable fitted edge chamfer','BEVEL')
        modifier.width=bevel
        modifier.segments=1
        modifier.affect='EDGES'
    parts.append(obj)
    return obj

def mesh(name, vertices, faces, mat=armor, color=0x995c48, bevel=0):
    data=bpy.data.meshes.new(name+'_mesh')
    data.from_pydata([game(point) for point in vertices],[],faces)
    data.update()
    body=bmesh.new()
    body.from_mesh(data)
    bmesh.ops.recalc_face_normals(body,faces=list(body.faces))
    body.to_mesh(data)
    body.free()
    obj=bpy.data.objects.new(name,data)
    return register(obj,name,mat,color,bevel)

def box(name,center,size,mat=metal,color=0x526579,bevel=.02):
    bpy.ops.mesh.primitive_cube_add(size=1,location=game(center))
    obj=bpy.context.object
    obj.scale=(size[0],size[2],size[1])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return register(obj,name,mat,color,bevel)

def hull(name,stations,mat=armor,color=0x995c48,segments=12):
    vertices=[]
    for longitudinal,width,center,height in stations:
        for index in range(segments):
            angle=math.tau*index/segments
            vertices.append((math.cos(angle)*width,center+math.sin(angle)*height,longitudinal))
    faces=[]
    for station in range(len(stations)-1):
        for index in range(segments):
            nxt=(index+1)%segments
            faces.append((station*segments+index,station*segments+nxt,(station+1)*segments+nxt,(station+1)*segments+index))
    faces.extend([tuple(range(segments-1,-1,-1)),tuple((len(stations)-1)*segments+index for index in range(segments))])
    return mesh(name,vertices,faces,mat,color)

def panel(name,outline,height,thickness,mat=armor,color=0x995c48,bevel=.012):
    count=len(outline)
    vertices=[(horizontal,height+offset,longitudinal) for offset in (-thickness/2,thickness/2) for horizontal,longitudinal in outline]
    faces=[tuple(range(count-1,-1,-1)),tuple(range(count,2*count))]
    faces.extend((index,(index+1)%count,(index+1)%count+count,index+count) for index in range(count))
    return mesh(name,vertices,faces,mat,color,bevel)

def fin(name,outline,width,mat=armor,color=0x995c48):
    count=len(outline)
    vertices=[(offset,height,longitudinal) for offset in (-width/2,width/2) for longitudinal,height in outline]
    faces=[tuple(range(count-1,-1,-1)),tuple(range(count,2*count))]
    faces.extend((index,(index+1)%count,(index+1)%count+count,index+count) for index in range(count))
    return mesh(name,vertices,faces,mat,color,.012)

def cylinder(name,start,end,radius,mat=metal,color=0x526579,segments=12,radius_end=None):
    start=Vector(game(start))
    end=Vector(game(end))
    delta=end-start
    bpy.ops.mesh.primitive_cone_add(vertices=segments,radius1=radius,radius2=radius if radius_end is None else radius_end,depth=delta.length,location=(start+end)/2)
    obj=bpy.context.object
    obj.rotation_euler=delta.to_track_quat('Z','Y').to_euler()
    return register(obj,name,mat,color)

def annulus(name,longitudinal,outer,inner,depth,center_y=1,color=0x526579,segments=24):
    vertices=[]
    for location,radius in [(longitudinal-depth/2,outer),(longitudinal+depth/2,outer),(longitudinal+depth/2,inner),(longitudinal-depth/2,inner)]:
        vertices.extend((radius*math.cos(index*math.tau/segments),center_y+radius*math.sin(index*math.tau/segments),location) for index in range(segments))
    faces=[]
    for ring in range(4):
        for index in range(segments):
            nxt=(index+1)%segments
            faces.append((ring*segments+index,ring*segments+nxt,((ring+1)%4)*segments+nxt,((ring+1)%4)*segments+index))
    return mesh(name,vertices,faces,metal,color)

hull('Monocoque_pressure_fuselage',[
    (-3.62,.018,1.03,.025),(-3.18,.19,1.08,.14),(-2.58,.34,1.12,.24),
    (-1.78,.49,1.12,.35),(-.72,.58,1.09,.41),(.35,.59,1.08,.40),
    (1.35,.48,1.04,.33),(2.03,.37,1.01,.29),(2.16,.32,1,.26)])
hull('Dark_dielectric_nose_cap',[(-3.64,.012,1.03,.018),(-3.23,.17,1.075,.125),(-3.19,.184,1.08,.137)],metal,0x273848)
hull('Dorsal_fitted_spine',[(-2.4,.18,1.28,.09),(-1.7,.33,1.37,.15),(-.15,.31,1.39,.14),(.62,.2,1.37,.09)],armor,0xb57b58,8)
canopy_stations=[(-2.12,.055,1.42,.035),(-1.72,.29,1.56,.23),(-1.06,.35,1.60,.28),(-.38,.29,1.55,.22),(-.08,.12,1.45,.09)]
hull('Armored_canopy_frame',canopy_stations,metal,0xa2b0ac,8)
hull('Smoked_prismatic_canopy',[(longitudinal,width*.90,center+.025,height*.95) for longitudinal,width,center,height in canopy_stations],glass,0x224957,8)
for longitudinal,width,center,height in [canopy_stations[1],canopy_stations[3]]:
    hull('Canopy_transverse_frame_'+str(longitudinal),[(longitudinal-.032,width*1.02,center+.01,height*1.06),(longitudinal+.032,width*1.02,center+.01,height*1.06)],metal,0x99adae,8)
hull('Canopy_longitudinal_crown',[(-1.95,.022,1.61,.012),(-1.72,.025,1.80,.012),(-1.06,.030,1.895,.012),(-.38,.025,1.79,.012),(-.16,.018,1.61,.012)],metal,0x8a9ca1,4)

for side,label in [(-1,'L'),(1,'R')]:
    wing=[(side*.42,-.72),(side*.94,-.48),(side*2.78,.64),(side*3.04,.96),(side*2.92,1.40),(side*2.39,1.32),(side*.64,.80)]
    panel('Cranked_delta_wing_'+label,wing,.96,.145)
    panel('Leading_edge_alloy_'+label,[(side*.92,-.43),(side*2.77,.68),(side*2.94,.93),(side*2.77,.94),(side*.86,-.32)],1.047,.025,metal,0x8a999d,.006)
    panel('Wingtip_wear_cap_'+label,[(side*2.76,.70),(side*3.03,.97),(side*2.91,1.39),(side*2.72,1.34)],1.045,.02,armor,0xd5c7a0,.006)
    panel('Aileron_inset_'+label,[(side*1.32,.80),(side*2.68,1.13),(side*2.64,1.23),(side*1.28,.91)],1.043,.016,metal,0x384e5b,.004)
    panel('Wing_identification_bar_'+label,[(side*1.69,.11),(side*1.90,.24),(side*1.54,.93),(side*1.33,.88)],1.049,.012,armor,0xdfd4b3,0)
    for index in range(2):
        panel('Wing_service_dash_'+label+str(index),[(side*(2.12+index*.2),.77),(side*(2.23+index*.2),.80),(side*(2.19+index*.2),.89),(side*(2.08+index*.2),.86)],1.054,.008,armor,0x562f26,0)
    hull('Cheek_intake_fairing_'+label,[(-1.04,.18,1.05,.20),(-.76,.23,1.06,.23),(.35,.25,1.02,.22),(1.44,.12,1.015,.17)],armor,0x89503f,8)
    intake=parts[-1]
    intake.location.x=side*.64
    mouth=box('Recessed_intake_mouth_'+label,(side*.64,1.06,-1.065),(.30,.27,.027),metal,0x142730,.012)
    box('Intake_top_lip_'+label,(side*.64,1.218,-1.04),(.38,.055,.12),metal,0xb4b9ac,.012)
    box('Intake_bottom_lip_'+label,(side*.64,.902,-1.04),(.38,.043,.10),metal,0x697f88,.01)
    for index in range(3):
        box('Intake_splitter_'+label+str(index),(side*.64+(index-1)*.083,1.062,-1.085),(.018,.22,.023),metal,0x70868b,.003)
    panel('Tailplane_'+label,[(side*.28,1.18),(side*1.37,1.87),(side*1.20,2.14),(side*.31,1.96)],1.19,.095,armor,0x995c48,.012)
    panel('Tailplane_edge_'+label,[(side*.58,1.83),(side*1.23,2.00),(side*1.17,2.08),(side*.57,1.91)],1.245,.012,armor,0xc5b58f,0)
    box('Wing_root_shoulder_'+label,(side*.52,1.13,.21),(.21,.16,1.08),armor,0xb77a59,.05)
    for index in range(5):
        box('Cooling_louver_'+label+str(index),(side*.42,1.372,.55+index*.12),(.17,.025,.045),metal,0x293e4d,.005)
    box('Service_access_panel_'+label,(side*.51,1.19,-.32),(.12,.025,.30),armor,0x754a3e,.008)

fin('Swept_vertical_stabilizer',[(.47,1.31),(1.30,2.34),(1.68,2.34),(2.12,1.29)],.11)
fin('Stabilizer_tip_paint',[(1.26,2.27),(1.30,2.34),(1.68,2.34),(1.72,2.27)],.118,armor,0xd7c9a7)
for side,label in [(-1,'L'),(1,'R')]:
    finplate=fin('Rudder_side_inset_'+label,[(1.36,1.50),(1.55,2.18),(1.68,2.16),(1.91,1.50)],.006,metal,0x536c76)
    finplate.location.x=side*.061
    insignia=fin('Fin_identity_panel_'+label,[(1.06,1.91),(1.20,2.09),(1.39,2.09),(1.29,1.91)],.006,armor,0xdfd4b3)
    insignia.location.x=side*.064
annulus('Turbine_outer_nozzle',2.115,.366,.273,.27,color=0x374c59)
annulus('Machined_nozzle_lip',2.265,.348,.277,.055,color=0x9ca8a5)
annulus('Inner_heat_shield',2.18,.276,.244,.13,color=0x1b2c36)
for index in range(12):
    angle=math.tau*index/12
    start=(.309*math.cos(angle),1+.309*math.sin(angle),2.01)
    end=(.326*math.cos(angle),1+.326*math.sin(angle),2.235)
    cylinder('Nozzle_segment_'+str(index),start,end,.018,metal,0x667780,6)
for horizontal,longitudinal,label in [(0,-1.4,'Nose'),(-1,.8,'Main_L'),(1,.8,'Main_R')]:
    cylinder('Oleostrut_upper_'+label,(horizontal,.37,longitudinal),(horizontal,.82,longitudinal+.045),.066,metal,0x45596a,10)
    cylinder('Oleostrut_chrome_'+label,(horizontal,.19,longitudinal),(horizontal,.46,longitudinal),.041,metal,0xc3cecb,10)
    cylinder('Gear_diagonal_brace_'+label,(horizontal,.35,longitudinal),(horizontal*.65,.83,longitudinal+.37),.035,metal,0x758a8f,8)
    for side in [-1,1]:
        cylinder('Fork_'+label+str(side),(horizontal+side*.085,.18,longitudinal),(horizontal+side*.085,.37,longitudinal+.025),.022,metal,0x8c9b9d,8)
    cylinder('Tire_'+label,(horizontal-.075,.18,longitudinal),(horizontal+.075,.18,longitudinal),.18,metal,0x18252c,16)
    for side in [-1,1]:
        cylinder('Wheel_hub_'+label+str(side),(horizontal+side*.076,.18,longitudinal),(horizontal+side*.084,.18,longitudinal),.088,metal,0x90a0a5,12)
    box('Gear_socket_'+label,(horizontal,.815,longitudinal+.04),(.20,.12,.28),metal,0x283b49,.025)
box('Beacon_pedestal',(0,2.35,1.6),(.18,.10,.23),metal,0x637782,.018)

root=bpy.data.objects.new('parked_fighter',None)
runtime_collection.objects.link(root)
root['contract']='Deck origin; +Y game up; nose -Z; no root scale or turn correction'
root['hp']=1
root['radius']=2.4
root['score']=150
root['review_status']='pending_deferred_opus_review'
bpy.ops.object.select_all(action='DESELECT')
copies=[]
for part in parts:
    evaluated=part.evaluated_get(bpy.context.evaluated_depsgraph_get())
    data=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=bpy.context.evaluated_depsgraph_get())
    duplicate=bpy.data.objects.new(part.name+'_baked',data)
    duplicate.matrix_world=part.matrix_world.copy()
    runtime_collection.objects.link(duplicate)
    duplicate.select_set(True)
    copies.append(duplicate)
bpy.context.view_layer.objects.active=copies[0]
bpy.ops.object.join()
airframe=bpy.context.object
airframe.name='airframe'
airframe.parent=root
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
airframe['flash_source']='All static airframe primitives; construct independent 1.12 additive shell at runtime, initially hidden'
original_mesh=airframe.data
original_mesh.calc_loop_triangles()
surviving=[triangle for triangle in original_mesh.loop_triangles if triangle.area>1e-9]
removed_degenerate=len(original_mesh.loop_triangles)-len(surviving)
cleaned=bpy.data.meshes.new('Fitted_airframe_clean_triangles')
cleaned.from_pydata([tuple(vertex.co) for vertex in original_mesh.vertices],[],[tuple(triangle.vertices) for triangle in surviving])
for mat in original_mesh.materials:
    cleaned.materials.append(mat)
cleaned.update()
clean_colors=cleaned.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
loop_normals=[]
surface_signature=[]
for polygon,triangle in zip(cleaned.polygons,surviving):
    polygon.material_index=triangle.material_index
    for new_loop,old_loop in zip(polygon.loop_indices,triangle.loops):
        clean_colors.data[new_loop].color=original_mesh.color_attributes['Color'].data[old_loop].color
        normal=original_mesh.corner_normals[old_loop].vector.copy()
        loop_normals.append(tuple(normal))
        surface_signature.extend(round(value,6) for value in original_mesh.vertices[original_mesh.loops[old_loop].vertex_index].co)
        surface_signature.extend(round(value,6) for value in normal)
        surface_signature.extend(round(value,6) for value in original_mesh.color_attributes['Color'].data[old_loop].color)
cleaned.normals_split_custom_set(loop_normals)
airframe.data=cleaned
cleaned.calc_loop_triangles()
assert all(triangle.area>1e-9 for triangle in cleaned.loop_triangles)
surface_digest=hashlib.sha256(json.dumps(surface_signature,separators=(',',':')).encode()).hexdigest()
airframe['export_cleanup']='Only zero-area tessellation triangles removed; surviving triangle coordinates, corner colors and custom normals preserved'
airframe['nondegenerate_surface_sha256']=surface_digest

def pivot(name,position,scale=1):
    obj=bpy.data.objects.new(name,None)
    runtime_collection.objects.link(obj)
    obj.parent=root
    obj.location=game(position)
    obj.scale=(scale,scale,scale)
    return obj

engine=pivot('engine',(0,1,2.3),.3)
vertices=[(0,0,0)]+[(.24*math.cos(index*math.tau/24),.24*math.sin(index*math.tau/24),0) for index in range(24)]
lens=mesh('engine_lens',vertices,[(0,index+1,(index+1)%24+1) for index in range(24)],amber,0xff9a3a)
source_collection.objects.unlink(lens)
runtime_collection.objects.link(lens)
parts.remove(lens)
lens.parent=engine
beacon=pivot('beacon',(0,2.4,1.6))
bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=6,radius=.18)
lens=bpy.context.object
lens.name='beacon_lens'
for collection in list(lens.users_collection):
    collection.objects.unlink(lens)
runtime_collection.objects.link(lens)
lens.data.materials.append(red)
lens.parent=beacon
for polygon in lens.data.polygons:
    polygon.use_smooth=True
source_collection.hide_render=True
source_collection.hide_viewport=True
studio=bpy.data.collections.new('STUDIO_not_exported')
scene.collection.children.link(studio)
camera_data=bpy.data.cameras.new('Common_neutral_camera')
camera=bpy.data.objects.new('Common_neutral_camera',camera_data)
studio.objects.link(camera)
camera.location=game((-16,24,-30))
camera.rotation_euler=(Vector(game((0,0,0)))-camera.location).to_track_quat('-Z','Y').to_euler()
camera_data.type='ORTHO'
camera_data.sensor_fit='VERTICAL'
camera_data.ortho_scale=14
scene.camera=camera
for name,position,power,color in [('Neutral_key',(-12,22,-12),2600,(1,.88,.72)),('Neutral_fill',(14,12,8),1900,(.64,.79,1))]:
    light_data=bpy.data.lights.new(name,'AREA')
    light_data.energy=power
    light_data.size=10
    light_data.color=color
    light_obj=bpy.data.objects.new(name,light_data)
    studio.objects.link(light_obj)
    light_obj.location=game(position)
    light_obj.rotation_euler=(-light_obj.location).to_track_quat('-Z','Y').to_euler()
scene.render.resolution_x=800
scene.render.resolution_y=600
scene.render.resolution_percentage=100
scene.eevee.taa_render_samples=24
bpy.ops.file.pack_all()
bpy.ops.object.select_all(action='DESELECT')
for obj in runtime_collection.objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'parked-fighter.blend'),compress=True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'parked-fighter.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_extras=True,export_animations=False,export_materials='EXPORT',export_cameras=False,export_lights=False)
metadata={'blender_version':bpy.app.version_string,'blender_build':bpy.app.build_hash.decode(),'editable_parts':len(parts),'export_nodes':[obj.name for obj in runtime_collection.objects],'materials':[mat.name for mat in [armor,metal,glass,amber,red]],'removed_zero_area_tessellation_triangles':removed_degenerate,'nondegenerate_surface_sha256':surface_digest,'export_cleanup_preserves_surviving_triangle_positions_colors_normals':True,'generator':'New procedural design; no shipped mesh copied. Shipped source geometry used solely in evidence.'}
(OUT/'build_metadata.json').write_text(json.dumps(metadata,indent=2))
print(json.dumps(metadata,indent=2))
