import bpy
import json
import math
import struct
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
REST_HEIGHT = 9.0
POSITIONS = []
WEIGHTS = []
COLORS = []
BUCKETS = []
PARTS = []
MATERIAL_NAMES = ['CS_Hull', 'CS_Dark', 'CS_Heat']
BUCKET_NAMES = ['hull', 'dark', 'neon']


def linear(channel):
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def tint(hex_color):
    return [linear(((hex_color >> shift) & 255) / 255) for shift in (16, 8, 0)]


def point(pos_x, height_weight, offset, pos_z):
    return (pos_x, height_weight, offset, pos_z)


def position(vertex, height=REST_HEIGHT):
    return (vertex[0], vertex[1] * height + vertex[2], vertex[3])


def face(vertices, bucket, color, normal):
    vertex_a, vertex_b, vertex_c = [Vector(position(vertex)) for vertex in vertices[:3]]
    if (vertex_b - vertex_a).cross(vertex_c - vertex_a).dot(Vector(normal)) < 0:
        vertices = list(reversed(vertices))
    for corner in range(1, len(vertices) - 1):
        for vertex in (vertices[0], vertices[corner], vertices[corner + 1]):
            POSITIONS.extend(position(vertex))
            WEIGHTS.append(vertex[1])
            COLORS.extend(tint(color))
        BUCKETS.append(bucket)


def part(name, callback):
    start = len(BUCKETS)
    callback()
    PARTS.append({'name': name, 'firstTriangle': start, 'triangles': len(BUCKETS) - start})


def prism(bottom, top, bucket, color):
    centroid = sum((Vector(position(vertex)) for vertex in bottom),Vector()) / len(bottom)
    for index in range(len(bottom)):
        following = (index + 1) % len(bottom)
        center = (Vector(position(bottom[index])) + Vector(position(bottom[following]))) / 2 - centroid
        face([bottom[index], bottom[following], top[following], top[index]], bucket, color, (center.x, 0, center.z))
    face(bottom, bucket, color, (0, -1, 0))
    face(top, bucket, color, (0, 1, 0))


def box(center_x, center_z, width, depth, weight_bottom, offset_bottom, weight_top, offset_top, bucket, color):
    outline = [(center_x-width/2, center_z-depth/2), (center_x+width/2, center_z-depth/2),
               (center_x+width/2, center_z+depth/2), (center_x-width/2, center_z+depth/2)]
    bottom = [point(pos_x, weight_bottom, offset_bottom, pos_z) for pos_x, pos_z in outline]
    top = [point(pos_x, weight_top, offset_top, pos_z) for pos_x, pos_z in outline]
    for index in range(4):
        following = (index + 1) % 4
        normals = [(0, 0, -1), (1, 0, 0), (0, 0, 1), (-1, 0, 0)]
        face([bottom[index], bottom[following], top[following], top[index]], bucket, color, normals[index])
    face(bottom, bucket, color, (0, -1, 0))
    face(top, bucket, color, (0, 1, 0))


def radius(height_weight):
    return 2.04 - .60 * height_weight


def outline(half_width):
    chamfer = .28
    return [(-half_width+chamfer, -half_width), (half_width-chamfer, -half_width),
            (half_width, -half_width+chamfer), (half_width, half_width-chamfer),
            (half_width-chamfer, half_width), (-half_width+chamfer, half_width),
            (-half_width, half_width-chamfer), (-half_width, -half_width+chamfer)]


def turned(vertex, side):
    pos_x, weight, offset, pos_z = vertex
    angle = side * math.pi / 2
    return point(pos_x * math.cos(angle) - pos_z * math.sin(angle), weight, offset,
                 pos_x * math.sin(angle) + pos_z * math.cos(angle))


def shell():
    bottom_outline, top_outline = outline(radius(0)), outline(radius(1))
    bottom = [point(pos_x, 0, .20, pos_z) for pos_x, pos_z in bottom_outline]
    top = [point(pos_x, 1, 0, pos_z) for pos_x, pos_z in top_outline]
    for index in (1, 3, 5, 7):
        following = (index + 1) % 8
        center = Vector(position(bottom[index])) + Vector(position(bottom[following]))
        face([bottom[index], bottom[following], top[following], top[index]], 0, 0x9a8a80, (center.x, 0, center.z))
    face(bottom, 0, 0x7a7470, (0, -1, 0))
    face(top, 0, 0x9a8a80, (0, 1, 0))
    for side in range(4):
        outer = [point(-radius(0)+.28, 0, .20, -radius(0)), point(radius(0)-.28, 0, .20, -radius(0)),
                 point(radius(1)-.28, 1, 0, -radius(1)), point(-radius(1)+.28, 1, 0, -radius(1))]
        opening = [point(-1.37, .18, 0, -radius(.18)), point(1.37, .18, 0, -radius(.18)),
                   point(1.03, .78, 0, -radius(.78)), point(-1.03, .78, 0, -radius(.78))]
        recess = [point(vertex[0], vertex[1], vertex[2], vertex[3]+.21) for vertex in opening]
        direction = (math.sin(side*math.pi/2), 0, -math.cos(side*math.pi/2))
        for index in range(4):
            following = (index + 1) % 4
            face([turned(vertex, side) for vertex in [outer[index], outer[following], opening[following], opening[index]]], 0, 0x9a8a80, direction)
            wall_normal = [(0, 1, 0), (-math.cos(side*math.pi/2), 0, -math.sin(side*math.pi/2)),
                           (0, -1, 0), (math.cos(side*math.pi/2), 0, math.sin(side*math.pi/2))][index]
            face([turned(vertex, side) for vertex in [opening[index], opening[following], recess[following], recess[index]]], 1, 0xaeb7bf, wall_normal)
        face([turned(vertex, side) for vertex in recess], 1, 0x646c78, direction)


def fins(side):
    for weight in (.26, .41, .56, .71):
        half_width = 1.37 - (weight-.18)/.60*.34 - .025
        front = -radius(weight)-.055
        rear = front+.25
        bottom = [point(-half_width, weight, -.07, front), point(half_width, weight, -.07, front),
                  point(half_width, weight, -.07, rear), point(-half_width, weight, -.07, rear)]
        top = [point(vertex[0], weight, .07, vertex[3]) for vertex in bottom]
        bottom, top = [[turned(vertex, side) for vertex in ring] for ring in [bottom, top]]
        prism(bottom, top, 1, 0xe4d8c8)


def rails():
    for side in range(4):
        rings = []
        for weight in (.055, .96):
            center = radius(weight)-.105
            ring = [point(center+offset_x, weight, 0, center+offset_z) for offset_x, offset_z in [(-.055,-.055),(.055,-.055),(.055,.055),(-.055,.055)]]
            rings.append([turned(vertex, side) for vertex in ring])
        prism(rings[0], rings[1], 0, 0xc0b1a0)


def cap():
    outer = [(-1.6,-1.6),(1.6,-1.6),(1.6,1.6),(-1.6,1.6)]
    inner = [(-1.36,-1.36),(1.36,-1.36),(1.36,1.36),(-1.36,1.36)]
    for index in range(4):
        following = (index+1) % 4
        for offset, normal in [(0, (0,-1,0)), (.18, (0,1,0))]:
            face([point(*[outer[index][0],1,offset,outer[index][1]]), point(outer[following][0],1,offset,outer[following][1]),
                  point(inner[following][0],1,offset,inner[following][1]), point(inner[index][0],1,offset,inner[index][1])], 1, 0xe4d8c8, normal)
        for ring, inward in [(outer, False), (inner, True)]:
            normal = [(0,0,-1),(1,0,0),(0,0,1),(-1,0,0)][index]
            if inward:
                normal = tuple(-value for value in normal)
            face([point(ring[index][0],1,0,ring[index][1]),point(ring[following][0],1,0,ring[following][1]),
                  point(ring[following][0],1,.18,ring[following][1]),point(ring[index][0],1,.18,ring[index][1])], 1, 0xe4d8c8, normal)


def service(side):
    half_width, weight, near = .60, .105, -radius(.105)-.025
    bottom = [point(-half_width,weight,-.24,near), point(half_width,weight,-.24,near),
              point(half_width,weight,-.24,near+.065), point(-half_width,weight,-.24,near+.065)]
    top = [point(vertex[0],weight,.24,vertex[3]) for vertex in bottom]
    prism([turned(vertex,side) for vertex in bottom], [turned(vertex,side) for vertex in top], 0, 0xc2a788)
    base = [point(.40,weight,-.06,near-.016),point(.49,weight,-.06,near-.016),point(.445,weight,.06,near-.016)]
    peak = point(.445,weight,0,near-.055)
    for index in range(3):
        face([turned(base[index],side),turned(base[(index+1)%3],side),turned(peak,side)], 1, 0xffffff, (math.sin(side*math.pi/2),0,-math.cos(side*math.pi/2)))
    face([turned(vertex,side) for vertex in base], 1, 0xffffff, (-math.sin(side*math.pi/2),0,math.cos(side*math.pi/2)))


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    part('continuous_chamfered_shell_and_four_recessed_inlets', shell)
    part('octagonal_foundation', lambda: prism([point(pos_x,0,0,pos_z) for pos_x,pos_z in outline(2.08)], [point(pos_x,0,.28,pos_z) for pos_x,pos_z in outline(2.08)], 1, 0xe4d8c8))
    for side in range(4):
        part(f'separated_cooling_fins_{side}', lambda side=side: fins(side))
    part('four_fitted_corner_spines', rails)
    part('fitted_open_cap', cap)
    part('original_amber_heat_surface', lambda: box(0,0,2.7,2.7,1,.19,1,.24,2,0xff6a2a))
    for center_x in (-.48,.48):
        part(f'underplate_cap_support_{center_x:+.2f}', lambda center_x=center_x: box(center_x,0,.065,2.72,1,.175,1,.185,1,0xffffff))
    for side in (0,2):
        part(f'fitted_service_hatch_and_latch_{side}', lambda side=side: service(side))
    mesh = bpy.data.meshes.new('CS_Parametric_HeatExchanger')
    vertices = [(POSITIONS[index],-POSITIONS[index+2],POSITIONS[index+1]) for index in range(0,len(POSITIONS),3)]
    mesh.from_pydata(vertices, [], [(index,index+1,index+2) for index in range(0,len(vertices),3)])
    mesh.update()
    obj = bpy.data.objects.new('CS_CoolingStack',mesh)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    colors = mesh.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
    weights = mesh.attributes.new(name='_CS_HEIGHT',type='FLOAT',domain='POINT')
    for index, value in enumerate(WEIGHTS):
        weights.data[index].value = value
        colors.data[index].color = (*COLORS[index*3:index*3+3],1)
    for material_index, name in enumerate(MATERIAL_NAMES):
        material = bpy.data.materials.new(name)
        material.use_nodes = True
        material.use_backface_culling = True
        nodes = material.node_tree.nodes
        principled = nodes.get('Principled BSDF')
        vertex_color = nodes.new('ShaderNodeVertexColor')
        vertex_color.layer_name = 'Color'
        if material_index == 1:
            multiply = nodes.new('ShaderNodeMixRGB')
            multiply.blend_type = 'MULTIPLY'
            multiply.inputs[0].default_value = 1
            multiply.inputs[2].default_value = (*tint(0x3a4a5e),1)
            material.node_tree.links.new(vertex_color.outputs['Color'],multiply.inputs[1])
            material.node_tree.links.new(multiply.outputs[0],principled.inputs['Base Color'])
        else:
            material.node_tree.links.new(vertex_color.outputs['Color'],principled.inputs['Base Color'])
        principled.inputs['Roughness'].default_value = .64 if material_index == 0 else .46
        principled.inputs['Metallic'].default_value = .36 if material_index == 0 else .5
        if material_index == 2:
            principled.inputs['Emission Color'].default_value = (*tint(0xff6a2a),1)
            principled.inputs['Emission Strength'].default_value = 1.2
            principled.inputs['Metallic'].default_value = 0
        mesh.materials.append(material)
        material['runtime_bucket'] = BUCKET_NAMES[material_index]
    for polygon, bucket in zip(mesh.polygons,BUCKETS):
        polygon.material_index = bucket
    uv_layer = mesh.uv_layers.new(name='SourceBoxProjection')
    for polygon in mesh.polygons:
        normal = polygon.normal
        game_normal = (normal.x,normal.z,-normal.y)
        plane = max(range(3),key=lambda axis: abs(game_normal[axis]))
        scale = [4,3,8][polygon.material_index]
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            pos_x,pos_y,pos_z = POSITIONS[vertex_index*3:vertex_index*3+3]
            uv_layer.data[loop_index].uv = ((pos_z if plane == 0 else pos_x)/scale,(pos_z if plane == 1 else pos_y)/scale)
    obj['rest_height'] = REST_HEIGHT
    obj['deformation'] = 'gameY = restY + (sourceHeight - 9) * _CS_HEIGHT'
    obj['part_ranges_json'] = json.dumps(PARTS,separators=(',',':'))
    obj['runtime'] = 'One prepared template, stamped into existing hull/dark/neon Batch buckets only.'
    for name, offset in [('CS_HeatSurfacePivot',.19),('CS_SteamOrigin',.4)]:
        pivot = bpy.data.objects.new(name,None)
        bpy.context.collection.objects.link(pivot)
        pivot.location = (0,0,REST_HEIGHT+offset)
        pivot.empty_display_size = .2
        pivot['height_coefficient'] = 1
        pivot['height_offset'] = offset
        pivot['runtime'] = 'Reference only; source emit callback is sole emitter owner.'
        pivot.select_set(True)
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 4
    scene.view_settings.view_transform = 'AgX'
    scene.world = bpy.data.worlds.new('CS_OfflineStudio')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.055,.07,.10,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .45
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'cooling-stack.blend'))
    bpy.ops.export_scene.gltf(filepath=str(ROOT/'cooling-stack.glb'),export_format='GLB',use_selection=True,
                             export_animations=False,export_attributes=True,export_extras=True,export_yup=True,
                             export_texcoords=True,export_normals=True,export_materials='EXPORT',
                             export_vertex_color='NAME',export_vertex_color_name='Color',export_all_vertex_colors=False)
    glb_path = ROOT/'cooling-stack.glb'
    encoded = glb_path.read_bytes()
    json_size = struct.unpack_from('<I',encoded,12)[0]
    gltf = json.loads(encoded[20:20+json_size])
    for material in gltf['materials']:
        if material['name'] == 'CS_Dark':
            material['pbrMetallicRoughness']['baseColorFactor'] = [*tint(0x3a4a5e),1]
    json_chunk = json.dumps(gltf,separators=(',',':')).encode()
    json_chunk += b' ' * (-len(json_chunk) % 4)
    remainder = encoded[20+json_size:]
    glb_path.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(json_chunk)+len(remainder))+struct.pack('<I4s',len(json_chunk),b'JSON')+json_chunk+remainder)
    template = {'schema':'cooling-stack-parametric-v1','restHeight':REST_HEIGHT,'heightRange':[7,11],
                'positions':POSITIONS,'heightWeights':WEIGHTS,'linearColors':COLORS,'triangleBuckets':BUCKETS,
                'buckets':BUCKET_NAMES,'uvScale':[4,3,8],'parts':PARTS}
    (ROOT/'cooling-stack.template.json').write_text(json.dumps(template,separators=(',',':'))+'\n')
    mesh.calc_loop_triangles()
    report = {'blender':bpy.app.version_string,'buildHash':bpy.app.build_hash.decode(),'engine':scene.render.engine,
              'threads':4,'restHeight':REST_HEIGHT,'evaluatedTriangles':len(mesh.loop_triangles),
              'meshObjects':1,'materialPrimitives':3,'materials':MATERIAL_NAMES,'parts':PARTS,
              'trianglesPerBucket':{key:BUCKETS.count(index) for index,key in enumerate(BUCKET_NAMES)},
              'textures':0,'images':0,'animations':0,'templateBytes':(ROOT/'cooling-stack.template.json').stat().st_size,
              'glbBytes':(ROOT/'cooling-stack.glb').stat().st_size}
    (ROOT/'evidence/generation.json').write_text(json.dumps(report,indent=2)+'\n')
    print('GENERATED',json.dumps(report))


if __name__ == '__main__':
    build()
