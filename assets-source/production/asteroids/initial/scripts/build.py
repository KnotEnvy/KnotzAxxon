import argparse
import json
import math
import pathlib
import sys

import bmesh
import bpy
from mathutils import Vector


ROOT = pathlib.Path(__file__).resolve().parents[1]
SPECS = [
    {
        'name': 'AS_Talus_Basin', 'slug': 'talus-basin', 'seed': 17411,
        'description': 'Broad off-axis impact bowl, stepped regolith terraces, blunt fractured back.',
        'theta': [.10, .24, .40, .54, .67, .91, 1.31, 1.96, 2.61],
        'radial': [.56, .57, .66, .92, 1.00, .96, .92, .91, .87],
        'axis': [.18, .86, -.48], 'shape': [1.0, .94, .97],
        'planes': [([-.8, -.3, .45], .77), ([.4, -.8, .3], .79)],
        'phase': .4,
    },
    {
        'name': 'AS_Keel_DoubleImpact', 'slug': 'keel-double-impact', 'seed': 29173,
        'description': 'Long intact keel mass, oblique excavated basin and subordinate weathered impact.',
        'theta': [.10, .22, .36, .49, .61, .76, 1.01, 1.42, 2.04, 2.65],
        'radial': [.59, .60, .66, .87, .98, .97, .93, .94, .90, .86],
        'axis': [-.22, .76, -.61], 'shape': [.82, .89, 1.09],
        'planes': [([.8, -.3, .4], .71), ([-.6, -.7, -.2], .78)],
        'phase': 2.1,
    },
    {
        'name': 'AS_Scar_Cleaved', 'slug': 'scar-cleaved', 'seed': 53657,
        'description': 'Angular shield-like mass, open shallow basin and a broad diagonal fracture shelf.',
        'theta': [.12, .29, .46, .59, .81, 1.24, 1.88, 2.56],
        'radial': [.63, .64, .79, .98, .97, .92, .93, .89],
        'axis': [.34, .80, -.49], 'shape': [1.03, .91, .90],
        'planes': [([.8, .15, .5], .66), ([-.3, -.8, -.2], .76), ([-.7, .2, .6], .78)],
        'phase': 4.2,
    },
]


def to_blender(point):
    return (point[0], -point[2], point[1])


def to_game(point):
    return (point[0], point[2], -point[1])


def surface(spec):
    axis = Vector(spec['axis']).normalized()
    tangent = Vector((1, 0, 0)).cross(axis).normalized()
    bitangent = axis.cross(tangent).normalized()
    segments = 24
    vertices = []
    colors = []
    labels = []

    def add(theta, phi, base_radius, ring):
        angular = phi + .038 * math.sin(phi * 3 + spec['phase'])
        direction = (axis * math.cos(theta) + (tangent * math.cos(angular) + bitangent * math.sin(angular)) * math.sin(theta)).normalized()
        broad_erosion = 1 + .044 * math.sin(phi * 3 + spec['phase']) * math.sin(theta) + .026 * math.cos(phi * 5 - theta * 2)
        radius = base_radius * broad_erosion
        if spec['slug'] == 'keel-double-impact':
            secondary_axis = Vector((-.79, .12, .60)).normalized()
            secondary = max(0, (direction.dot(secondary_axis) - .80) / .20)
            radius -= .18 * secondary * secondary
        if spec['slug'] == 'scar-cleaved':
            seam = direction.dot(Vector((.55, -.15, -.82)).normalized())
            radius -= .052 * math.exp(-((seam - .11) / .09) ** 2) * max(0, math.sin(theta))
        for normal, limit in spec['planes']:
            projection = direction.dot(Vector(normal).normalized())
            if projection > 0:
                radius = min(radius, limit / projection)
        point = Vector(tuple(direction[index] * radius * spec['shape'][index] for index in range(3)))
        shade = .94
        label = 'regolith'
        if theta < .29:
            shade, label = .70, 'impact_floor'
        elif theta < .48:
            shade, label = .80, 'basin_wall'
        elif theta < .78:
            shade, label = .99, 'impact_rim'
        if any(abs(radius * direction.dot(Vector(normal).normalized()) - limit) < .00001 for normal, limit in spec['planes']):
            shade *= .88
            label = 'fracture_plane'
        strata = .965 + .035 * math.sin(point.y * 14 + point.z * 3 + spec['phase'])
        colors.append((shade * strata, shade * strata * .982, shade * strata * .947, 1))
        vertices.append(to_blender(point))
        labels.append(label)

    add(0, 0, spec['radial'][0], -1)
    for ring, (theta, radius) in enumerate(zip(spec['theta'], spec['radial'])):
        for segment in range(segments):
            add(theta, segment * math.tau / segments, radius, ring)
    add(math.pi, 0, .85, len(spec['theta']))
    faces = []
    for segment in range(segments):
        faces.append((0, 1 + segment, 1 + (segment + 1) % segments))
    for ring in range(len(spec['theta']) - 1):
        current = 1 + ring * segments
        following = current + segments
        for segment in range(segments):
            next_segment = (segment + 1) % segments
            first, second, third, fourth = current + segment, current + next_segment, following + next_segment, following + segment
            if (ring + segment) % 2:
                faces.extend([(first, second, fourth), (second, third, fourth)])
            else:
                faces.extend([(first, second, third), (first, third, fourth)])
    bottom = len(vertices) - 1
    last = bottom - segments
    for segment in range(segments):
        faces.append((last + segment, bottom, last + (segment + 1) % segments))
    return vertices, faces, colors, labels


def make_material():
    material = bpy.data.materials.new('AS_Regolith_RuntimeRock')
    material.use_nodes = True
    nodes = material.node_tree.nodes
    principled = nodes.get('Principled BSDF')
    principled.inputs['Roughness'].default_value = .9
    principled.inputs['Metallic'].default_value = .08
    color = nodes.new('ShaderNodeVertexColor')
    color.layer_name = 'AS_Palette'
    material.node_tree.links.new(color.outputs['Color'], principled.inputs['Base Color'])
    material.diffuse_color = (.72, .69, .63, 1)
    material['runtime_mapping'] = 'Materials.rock, shared, shader aPivot/aSpin rebuilt by adapter'
    return material


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    collection = bpy.data.collections.new('ASTEROID_SCENERY_KIT_INITIAL')
    bpy.context.scene.collection.children.link(collection)
    material = make_material()
    report = []
    for spec in SPECS:
        vertices, faces, colors, labels = surface(spec)
        mesh = bpy.data.meshes.new(spec['name'] + '_Surface')
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        editable = bmesh.new()
        editable.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(editable, faces=list(editable.faces))
        if sum(face.calc_area() * face.normal.dot(face.calc_center_median()) for face in editable.faces) < 0:
            bmesh.ops.reverse_faces(editable, faces=list(editable.faces))
        editable.to_mesh(mesh)
        manifold = all(edge.is_manifold for edge in editable.edges)
        components = 0
        remaining = set(editable.verts)
        while remaining:
            components += 1
            stack = [remaining.pop()]
            while stack:
                for edge in stack.pop().link_edges:
                    for vertex in edge.verts:
                        if vertex in remaining:
                            remaining.remove(vertex)
                            stack.append(vertex)
        editable.free()
        color_layer = mesh.color_attributes.new(name='AS_Palette', type='FLOAT_COLOR', domain='POINT')
        for index, rgba in enumerate(colors):
            color_layer.data[index].color = rgba
        uv_layer = mesh.uv_layers.new(name='AS_PreviewUV')
        for polygon in mesh.polygons:
            polygon.use_smooth = False
            dominant = max(range(3), key=lambda index: abs(polygon.normal[index]))
            for loop_index in polygon.loop_indices:
                point = mesh.vertices[mesh.loops[loop_index].vertex_index].co
                uv_layer.data[loop_index].uv = ((point.y if dominant == 0 else point.x) / 2, (point.y if dominant == 2 else point.z) / 2)
        mesh.materials.append(material)
        obj = bpy.data.objects.new(spec['name'], mesh)
        collection.objects.link(obj)
        obj['design_seed'] = spec['seed']
        obj['purpose'] = 'Outside-lane asteroid scenery only. Not a collider or gate replacement.'
        obj['authored_shape'] = spec['description']
        obj['runtime_variant'] = spec['slug']
        for label in sorted(set(labels)):
            group = obj.vertex_groups.new(name=label)
            group.add([index for index, value in enumerate(labels) if value == label], 1, 'REPLACE')
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.export_scene.gltf(filepath=str(ROOT / 'assets' / (spec['slug'] + '.glb')), export_format='GLB', use_selection=True,
                                  export_yup=True, export_materials='EXPORT', export_normals=True, export_texcoords=True,
                                  export_vertex_color='MATERIAL', export_all_vertex_colors=False, export_attributes=False, export_extras=True)
        mesh.calc_loop_triangles()
        points = [to_game(obj.matrix_world @ vertex.co) for vertex in mesh.vertices]
        report.append({
            'node': obj.name, 'file': 'assets/' + spec['slug'] + '.glb', 'evaluatedTriangles': len(mesh.loop_triangles),
            'verticesEditable': len(mesh.vertices), 'primitives': 1, 'materials': [material.name],
            'boundsGame': {'min': [min(point[index] for point in points) for index in range(3)], 'max': [max(point[index] for point in points) for index in range(3)]},
            'radiusAboutPivot': max(Vector(point).length for point in points), 'closedManifold': manifold,
            'connectedComponents': components, 'identityTransform': list(obj.matrix_world) == list(__import__('mathutils').Matrix.Identity(4)),
            'spec': spec,
        })
        assert manifold and components == 1
        assert 320 <= len(mesh.loop_triangles) <= 600
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(ROOT / 'assets/asteroid-scenery-kit.glb'), export_format='GLB', use_selection=True,
                              export_yup=True, export_materials='EXPORT', export_normals=True, export_texcoords=True,
                              export_vertex_color='MATERIAL', export_all_vertex_colors=False, export_attributes=False, export_extras=True)
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 4
    scene.world = bpy.data.worlds.new('AS_StudioWorld')
    scene.world.color = (.035, .045, .065)
    scene['status'] = 'pending_deferred_opus_review; INITIAL, zero formal review/fix passes'
    scene['coordinate_contract'] = 'Blender X right / Y=-game Z / Z=game Y; glTF Y-up; no runtime normalization'
    scene['deterministic_generator'] = 'scripts/build.py; specs and analytic erosion/fracture planes; no random operator state'
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'source/asteroid-scenery-kit.blend'))
    metadata = {'blender': bpy.app.version_string, 'buildHash': bpy.app.build_hash.decode(), 'platform': bpy.app.build_platform.decode(),
                'engine': scene.render.engine, 'threads': scene.render.threads, 'textures': 0, 'templates': report}
    (ROOT / 'measurements/build.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print('ASTEROID_BUILD', json.dumps(metadata))


if __name__ == '__main__':
    build()
