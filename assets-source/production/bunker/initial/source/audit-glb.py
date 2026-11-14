import hashlib
import json
import math
from pathlib import Path
import struct
import sys

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parents[1]


def identity():
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]


def multiply(left, right):
    return [sum(left[row + middle * 4] * right[middle + column * 4] for middle in range(4)) for column in range(4) for row in range(4)]


def local_matrix(node):
    if 'matrix' in node:
        return node['matrix']
    axis_x, axis_y, axis_z, scalar = node.get('rotation', [0, 0, 0, 1])
    matrix = [1-2*(axis_y*axis_y+axis_z*axis_z), 2*(axis_x*axis_y+axis_z*scalar), 2*(axis_x*axis_z-axis_y*scalar), 0,
              2*(axis_x*axis_y-axis_z*scalar), 1-2*(axis_x*axis_x+axis_z*axis_z), 2*(axis_y*axis_z+axis_x*scalar), 0,
              2*(axis_x*axis_z+axis_y*scalar), 2*(axis_y*axis_z-axis_x*scalar), 1-2*(axis_x*axis_x+axis_y*axis_y), 0, 0, 0, 0, 1]
    for column, scale in enumerate(node.get('scale', [1, 1, 1])):
        for row in range(3):
            matrix[row + column * 4] *= scale
    matrix[12:15] = node.get('translation', [0, 0, 0])
    return matrix


def audit(filename):
    content = filename.read_bytes()
    assert content[:4] == b'glTF'
    version, total = struct.unpack_from('<II', content, 4)
    assert version == 2 and total == len(content)
    cursor, document, binary = 12, None, None
    while cursor < len(content):
        length, kind = struct.unpack_from('<II', content, cursor)
        payload = content[cursor+8:cursor+8+length]
        assert len(payload) == length
        if kind == 0x4E4F534A:
            document = json.loads(payload)
        if kind == 0x004E4942:
            binary = payload
        cursor += 8 + length
    assert cursor == total and document and binary is not None
    formats = {5120:'b', 5121:'B', 5122:'h', 5123:'H', 5125:'I', 5126:'f'}
    widths = {'SCALAR':1, 'VEC2':2, 'VEC3':3, 'VEC4':4, 'MAT4':16}

    def accessor(index):
        description = document['accessors'][index]
        view = document['bufferViews'][description['bufferView']]
        width = widths[description['type']]
        encoding = '<' + formats[description['componentType']] * width
        item_bytes = struct.calcsize(encoding)
        stride = view.get('byteStride', item_bytes)
        offset = view.get('byteOffset', 0) + description.get('byteOffset', 0)
        assert offset + (description['count']-1)*stride + item_bytes <= view.get('byteOffset',0)+view['byteLength']
        return [struct.unpack_from(encoding,binary,offset+item*stride) for item in range(description['count'])]

    bounds = [[math.inf]*3,[-math.inf]*3]
    meshes, triangles, degenerates = [], 0, 0
    normal_lengths = []
    normal_alignment = []
    finite = True

    def visit(index, parent):
        nonlocal triangles, degenerates, finite
        node = document['nodes'][index]
        world = multiply(parent,local_matrix(node))
        if 'mesh' in node:
            for primitive in document['meshes'][node['mesh']]['primitives']:
                assert primitive.get('mode',4) == 4
                points = accessor(primitive['attributes']['POSITION'])
                normals = accessor(primitive['attributes']['NORMAL']) if 'NORMAL' in primitive['attributes'] else []
                normal_lengths.extend(math.sqrt(sum(value*value for value in normal)) for normal in normals)
                finite = finite and all(math.isfinite(value) for point in points+normals for value in point)
                transformed = [[sum(world[axis+column*4]*point[column] for column in range(3))+world[axis+12] for axis in range(3)] for point in points]
                for point in transformed:
                    for axis,value in enumerate(point):
                        bounds[0][axis]=min(bounds[0][axis],value)
                        bounds[1][axis]=max(bounds[1][axis],value)
                indices = [entry[0] for entry in accessor(primitive['indices'])] if 'indices' in primitive else list(range(len(points)))
                assert len(indices)%3 == 0 and all(0 <= entry < len(points) for entry in indices)
                count = len(indices)//3
                triangles += count
                for offset in range(0,len(indices),3):
                    first,second,third = [transformed[entry] for entry in indices[offset:offset+3]]
                    edge_a=[second[axis]-first[axis] for axis in range(3)]
                    edge_b=[third[axis]-first[axis] for axis in range(3)]
                    cross=[edge_a[1]*edge_b[2]-edge_a[2]*edge_b[1],edge_a[2]*edge_b[0]-edge_a[0]*edge_b[2],edge_a[0]*edge_b[1]-edge_a[1]*edge_b[0]]
                    if sum(value*value for value in cross)<1e-16:
                        degenerates += 1
                    elif normals:
                        length=math.sqrt(sum(value*value for value in cross))
                        normal=normals[indices[offset]]
                        transformed_normal=[sum(world[axis+column*4]*normal[column] for column in range(3)) for axis in range(3)]
                        normal_length=math.sqrt(sum(value*value for value in transformed_normal))
                        if normal_length>1e-12:
                            normal_alignment.append(sum(cross[axis]*transformed_normal[axis] for axis in range(3))/(length*normal_length))
                meshes.append({'node':node.get('name'), 'material':document['materials'][primitive['material']].get('name'), 'triangles':count, 'transformedMatrix':world, 'attributes':list(primitive['attributes'])})
        for child in node.get('children',[]):
            visit(child,world)

    for index in document['scenes'][document.get('scene',0)]['nodes']:
        visit(index,identity())
    return {'file':filename.name,'sha256':hashlib.sha256(content).hexdigest(),'bytes':len(content),'triangles':triangles,'primitives':len(meshes),'transformedBounds':bounds,'finite':finite,'degenerateTriangles':degenerates,'normalLengthRange':[min(normal_lengths),max(normal_lengths)] if normal_lengths else None,'minimumFaceNormalAlignment':min(normal_alignment) if normal_alignment else None,'textures':len(document.get('textures',[])),'images':len(document.get('images',[])),'materials':document.get('materials',[]),'meshes':meshes,'nodes':[node.get('name') for node in document['nodes']]}


if __name__ == '__main__':
    if '--references' in sys.argv:
        report = {'method':'Independent binary GLB traversal of all six shipped files, not accessor bounds alone; static scene transforms; original geometry inspected but not reused.','assets':[audit(ROOT/'public/models'/f'{name}.glb') for name in ['player','sentinel','turret','radar','silo','fuel']], 'vocabulary':['Shipped player: coherent swept silver/ivory airframe, slate hard-surface separation, cyan belongs to player.','Turret/radar: warm armor, dark slate supports, eye/barrel/dish silhouettes are active targets and intentionally not borrowed.','Silo/fuel/sentinel: strong broad material zones and fitted structural joins, not dense random greeble.','Bunker: existing mapped cold hull and unmapped darkMetal only, warm line stays passive; no red target telegraph, no cyan weapon light, no texture added.']}
        (OUT/'evidence/style-vocabulary.json').write_text(json.dumps(report,indent=2))
        print([(entry['file'],entry['triangles'],entry['transformedBounds']) for entry in report['assets']])
    else:
        report = audit(OUT/'asset/fortress-bunker.glb')
        assert report['bytes']<=524288 and 400<=report['triangles']<=650
        assert report['primitives']==3 and len(report['materials'])==3 and not report['textures']
        assert report['finite'] and report['degenerateTriangles']==0
        assert report['normalLengthRange'][0]>.999 and report['normalLengthRange'][1]<1.001
        assert report['minimumFaceNormalAlignment']>.999
        for axis in range(3):
            assert report['transformedBounds'][0][axis]>=[-3.5,0,-4][axis]-1e-6
            assert report['transformedBounds'][1][axis]<=[3.5,4,4][axis]+1e-6
        report['status']='PASS'
        report['limitations']='Independent stdlib binary/static-transform audit; not Khronos glTF Validator, not a renderer or GPU test.'
        (OUT/'evidence/independent-binary-audit.json').write_text(json.dumps(report,indent=2))
        print(json.dumps(report,indent=2))
