import bpy
import bmesh
import hashlib
import json
import math
import pathlib
import sys
from mathutils import Vector

HOME = pathlib.Path(__file__).resolve().parents[1]
arguments = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
OUT = pathlib.Path(arguments[arguments.index('--out')+1]).resolve() if '--out' in arguments else HOME / 'asset'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
SCENE = bpy.context.scene
SCENE.name = 'Covered_Fighter_Asset_Only'
SCENE.render.engine = 'BLENDER_EEVEE'
bpy.context.preferences.filepaths.save_version = 0
SCENE.unit_settings.system = 'METRIC'
SCENE.unit_settings.scale_length = 1.0
PARTS = []


def linear(value):
    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4


def rgb(value):
    return [linear(((value >> shift) & 255) / 255) for shift in (16, 8, 0)]


def game(point):
    return (point[0], -point[2], point[1])


MATERIALS = {}
for bucket, base, metal, roughness in [('hull', 0xffffff, .36, .92), ('dark', 0x3a4a5e, .32, .65), ('paint', 0xffffff, 0, 1)]:
    material = bpy.data.materials.new('CF_' + bucket.upper())
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*rgb(base), 1)
    shader.inputs['Metallic'].default_value = metal
    shader.inputs['Roughness'].default_value = roughness
    color = material.node_tree.nodes.new('ShaderNodeVertexColor')
    color.layer_name = 'Color'
    material.node_tree.links.new(color.outputs['Color'], shader.inputs['Base Color'])
    material.use_backface_culling = True
    MATERIALS[bucket] = material


def mesh(name, vertices, faces, bucket='hull', tint=0x858b88, closed=True):
    data = bpy.data.meshes.new(name)
    data.from_pydata([game(point) for point in vertices], [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    if closed:
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bmesh.ops.triangulate(bm, faces=list(bm.faces), quad_method='FIXED', ngon_method='EAR_CLIP')
    bm.to_mesh(data)
    bm.free()
    data.materials.append(MATERIALS[bucket])
    colors = data.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
    base = rgb(0x3a4a5e if bucket == 'dark' else 0xffffff)
    for color in colors.data:
        color.color = (*(value * base[axis] for axis,value in enumerate(rgb(tint))), 1)
    obj = bpy.data.objects.new(name, data)
    SCENE.collection.objects.link(obj)
    obj['bucket'] = bucket
    obj['tint_hex'] = f'{tint:06x}'
    obj['passive_scenery'] = True
    obj['no_target_no_collision_no_emission'] = True
    PARTS.append(obj)
    return obj


def loft(name, rings, bucket='hull', tint=0x858b88, caps=True):
    vertices = [point for ring in rings for point in ring]
    sides = len(rings[0])
    faces = []
    for ring_index in range(len(rings) - 1):
        for side in range(sides):
            first = ring_index * sides + side
            second = ring_index * sides + (side + 1) % sides
            faces.append((first, second, second + sides, first + sides))
    if caps:
        faces.extend([tuple(range(sides - 1, -1, -1)), tuple((len(rings) - 1) * sides + side for side in range(sides))])
    return mesh(name, vertices, faces, bucket, tint, caps)


def hull_ring(z, width, top, bottom, sides=12):
    center = (top + bottom) / 2
    height = (top - bottom) / 2
    return [(width * math.cos(2 * math.pi * side / sides), center + height * math.sin(2 * math.pi * side / sides), z) for side in range(sides)]


def tube(name, start, end, radius, bucket='dark', tint=0xc0c2ba, sides=6):
    direction = (Vector(end) - Vector(start)).normalized()
    tangent = direction.cross(Vector((0, 1, 0)))
    if tangent.length < .1:
        tangent = direction.cross(Vector((0, 0, 1)))
    tangent.normalize()
    bitangent = direction.cross(tangent).normalized()
    rings = []
    for center in [Vector(start), Vector(end)]:
        rings.append([tuple(center + radius * (math.cos(2 * math.pi * side / sides) * tangent + math.sin(2 * math.pi * side / sides) * bitangent)) for side in range(sides)])
    return loft(name, rings, bucket, tint)


def box(name, center, size, bucket='dark', tint=0xb7bbb6):
    vertices = [(center[0] + x * size[0] / 2, center[1] + y * size[1] / 2, center[2] + z * size[2] / 2) for x, y, z in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    return mesh(name, vertices, [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)], bucket, tint)


def ribbon(name, line, width, bucket='hull', tint=0x69716d):
    vertices = []
    for point in line:
        vertices.extend([(point[0], point[1] + .009, point[2] - width / 2), (point[0], point[1] + .009, point[2] + width / 2)])
    faces = [(index * 2, index * 2 + 1, index * 2 + 3, index * 2 + 2) for index in range(len(line) - 1)]
    if line[-1][0] < line[0][0]:
        faces = [tuple(reversed(face)) for face in faces]
    return mesh(name, vertices, faces, bucket, tint, False)


stations = [(-3.34,.035,1.00,.94),(-2.95,.16,1.08,.86),(-2.28,.32,1.19,.74),(-1.64,.43,1.25,.70),(-.85,.525,1.31,.67),(-.05,.515,1.29,.68),(.8,.47,1.25,.70),(1.52,.37,1.21,.76),(2.025,.285,1.18,.80)]
loft('CF_01_Fuselage_Fitted_Lower_Cover', [hull_ring(*station) for station in stations], tint=0x7e8582)
canopy = [(-1.86,.27,1.29,.99),(-1.52,.43,1.39,.98),(-1.08,.535,1.48,.97),(-.58,.565,1.495,.96),(-.02,.55,1.43,.97),(.58,.50,1.34,1.00),(1.12,.41,1.29,1.04)]
loft('CF_02_Cockpit_Tensioned_Canvas', [hull_ring(*station, sides=8) for station in canopy], tint=0x969b91)

for sign, label in [(-1, 'Port'), (1, 'Starboard')]:
    rings = []
    for span in [.28,.62,1.02,1.5,2.0,2.46,2.84]:
        amount = span / 2.84
        lead = -.35 + 1.45 * amount ** 1.15
        trail = .82 + .60 * amount
        crown = 1.00 - .135 * amount
        chord = trail - lead
        points = [(lead,crown-.07),(lead+.04,crown-.015),(lead+chord*.32,crown+.026*math.sin(amount*math.pi*3)**2),(lead+chord*.65,crown+.016),(trail-.022,crown-.015),(trail,crown-.075),(lead+chord*.64,crown-.092),(lead+chord*.27,crown-.09)]
        rings.append([(sign*span, height, depth) for depth,height in points])
    loft('CF_03_' + label + '_Wing_Draped_Pleats', rings, tint=0x8c938c)
    ribbon('CF_04_' + label + '_Wing_Reinforced_Seam', [(sign*span, 1.02-.135*span/2.84, -.35+1.45*(span/2.84)**1.15 + (.82+.60*span/2.84-(-.35+1.45*(span/2.84)**1.15))*.63) for span in [.65,1.0,1.5,2.0,2.45,2.76]], .045, tint=0x747d76)
    tail = [(sign*.24,1.12,1.20),(sign*1.04,.99,1.73),(sign*.98,.97,1.92),(sign*.25,1.07,1.72)]
    loft('CF_05_' + label + '_Tailplane_Wrapped', [[(x,y-.05,z) for x,y,z in tail], tail], tint=0x838b84)

fin_outline = [(.67,1.18),(.90,1.52),(1.45,2.14),(1.89,2.14),(2.015,1.17)]
loft('CF_06_Vertical_Fin_Fitted_Sock', [[(side, height, depth) for depth,height in fin_outline] for side in [-.068,.068]], tint=0x8e958c)
loft('CF_07_Tail_Exhaust_Weather_Plug', [hull_ring(1.94,.25,1.16,.81),hull_ring(2.045,.235,1.14,.83)], bucket='dark', tint=0xb0b5ad)

for index, z in enumerate([-1.45,-.15,.95]):
    closest = min(canopy, key=lambda station: abs(station[0]-z))
    ring = hull_ring(z, closest[1]+.014, closest[2]+.015, closest[3]-.005, sides=8)
    loft(f'CF_08_Canvas_Cinch_Band_{index+1}', [[(x,y,z-.021) for x,y,z in ring],[(x,y,z+.021) for x,y,z in ring]], tint=0x727c72, caps=False)
    for sign, label in [(-1,'Port'),(1,'Starboard')]:
        box(f'CF_09_{label}_Cinch_Clasp_{index+1}', (sign*(closest[1]+.018),1.13,z), (.034,.072,.095), 'dark', 0xb3b9b0)

for index, (x,z,top,radius) in enumerate([(0,-1.40,.87,.155),(-.98,.81,.84,.185),(.98,.81,.84,.185)]):
    label = ['Nose','Port_Main','Starboard_Main'][index]
    axle_y = radius + .004
    tube('CF_10_' + label + '_Attached_Strut', (x,axle_y,z),(x,top,z+.045), .047, tint=0xc3c7c0, sides=8)
    tube('CF_11_' + label + '_Torque_Brace', (x,axle_y+.06,z-.04),(x,top-.12,z+.15), .028, tint=0x8c999f)
    wheel_rings = []
    for dx,scale in [(-.10,.80),(-.075,1),(.075,1),(.10,.80)]:
        wheel_rings.append([(x+dx,axle_y+radius*scale*math.sin(2*math.pi*side/10-math.pi/2),z+radius*scale*math.cos(2*math.pi*side/10-math.pi/2)) for side in range(10)])
    loft('CF_12_' + label + '_Bevelled_Tyre', wheel_rings, 'dark', 0x67747a)
    tube('CF_13_' + label + '_Axle_Hub',(x-.107,axle_y,z),(x+.107,axle_y,z),radius*.42,tint=0xc3c7c0,sides=8)
    box('CF_14_' + label + '_Gear_Attachment',(x,top-.025,z+.065),(.17,.13,.23),'dark',0xabb4b1)

for sign, label in [(-1,'Port'),(1,'Starboard')]:
    for index, (x,z) in enumerate([(1.48,.55),(2.30,1.16)]):
        start = (sign*x,1.00-.135*x/2.84,z)
        end = (sign*(x-.22),.70,z+.14)
        tube(f'CF_15_{label}_Cover_Tiedown_{index+1}', start, end, .022, tint=0xc2c7b7, sides=4)
        tube(f'CF_16_{label}_Tiedown_Return_{index+1}', end,(sign*(x-.08),.87,z+.20),.018,tint=0x9aab9d,sides=4)

source = json.loads((HOME / 'evidence' / 'source-geometry.json').read_text())
positions = source['buckets']['paint']['positions']
mesh('CF_17_Unchanged_Fixed_Hardstand_24tri', [tuple(positions[index:index+3]) for index in range(0,len(positions),3)], [(index,index+1,index+2) for index in range(0,len(positions)//3,3)], 'paint', 0x9aa4ae)

recipe_parts = []
for obj in PARTS:
    data = obj.data
    positions = []
    normals = []
    for polygon in data.polygons:
        normal = polygon.normal
        for vertex_index in polygon.vertices:
            point = data.vertices[vertex_index].co
            positions.extend([point.x,point.z,-point.y])
            normals.extend([normal.x,normal.z,-normal.y])
    recipe_parts.append({'name': obj.name, 'bucket': obj['bucket'], 'tint': int(obj['tint_hex'],16), 'positions': positions, 'normals': normals, 'triangles': len(positions)//9})
recipe = {'schema':1,'units':'game units; X across Y up nose -Z','revision':'ee221ad3e05cd66292fe02b71b50f513696bdda2','yawRange':[-.25,.25],'uvScale':3,'parts':recipe_parts}
(OUT / 'covered-fighter.recipe.json').write_text(json.dumps(recipe,separators=(',',':'))+'\n')
SCENE['status'] = 'pending_deferred_opus_review'
SCENE['formal_reviews'] = 0
SCENE['formal_fix_rounds'] = 0
SCENE['design'] = 'Original fitted canvas mothballed airframe. No imported geometry; exact source hardstand retained.'
SCENE['runtime'] = 'Recipe geometry cached at startup; Batch hull/dark/paint only. No prop roots or colliders.'
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'covered-fighter.blend'), check_existing=False)
bpy.ops.export_scene.gltf(filepath=str(OUT / 'covered-fighter.glb'),export_format='GLB',export_yup=True,export_normals=True,export_materials='EXPORT',export_vertex_color='ACTIVE',export_all_vertex_colors=False,export_animations=False,export_cameras=False,export_lights=False,export_extras=True,export_apply=False)
report = {'blender':bpy.app.version_string,'hash':bpy.app.build_hash.decode(),'engine':SCENE.render.engine,'nodes':[{key:part[key] for key in ['name','bucket','tint','triangles']} for part in recipe_parts],'buckets':{bucket:sum(part['triangles'] for part in recipe_parts if part['bucket']==bucket) for bucket in ['hull','dark','paint']},'external_files':[image.filepath for image in bpy.data.images if image.source=='FILE'],'parts':len(PARTS)}
(HOME / 'evidence' / 'build-report.json').write_text(json.dumps(report,indent=2)+'\n')
print('COVERED_FIGHTER_BUILD',json.dumps(report))
