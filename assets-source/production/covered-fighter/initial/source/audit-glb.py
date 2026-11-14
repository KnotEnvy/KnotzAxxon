import hashlib
import json
import math
import pathlib
import struct

HOME = pathlib.Path(__file__).resolve().parents[1]
KINDS = {5120:('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)}
WIDTHS = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}


def parse(filepath):
    raw = pathlib.Path(filepath).read_bytes()
    magic,version,total = struct.unpack_from('<4sII',raw)
    assert magic == b'glTF' and version == 2 and total == len(raw)
    cursor = 12
    doc = None
    binary = None
    while cursor < len(raw):
        length,kind = struct.unpack_from('<II',raw,cursor)
        chunk = raw[cursor+8:cursor+8+length]
        if kind == 0x4e4f534a:
            doc = json.loads(chunk)
        elif kind == 0x004e4942:
            binary = chunk
        cursor += length + 8
    assert doc is not None and binary is not None

    def accessor(index):
        item = doc['accessors'][index]
        assert 'sparse' not in item
        view = doc['bufferViews'][item['bufferView']]
        code,size = KINDS[item['componentType']]
        width = WIDTHS[item['type']]
        offset = view.get('byteOffset',0)+item.get('byteOffset',0)
        stride = view.get('byteStride',width*size)
        result = [struct.unpack_from('<'+code*width,binary,offset+row*stride) for row in range(item['count'])]
        assert offset+(item['count']-1)*stride+width*size <= view.get('byteOffset',0)+view['byteLength']
        assert all(math.isfinite(value) for row in result for value in row)
        if item.get('normalized') and item['componentType'] != 5126:
            divisor = {5120:127,5121:255,5122:32767,5123:65535,5125:4294967295}[item['componentType']]
            result = [tuple(max(-1,value/divisor) for value in row) for row in result]
        return result

    def transform(node,point):
        if 'matrix' in node:
            matrix = node['matrix']
            return tuple(sum(matrix[column*4+row]*(*point,1)[column] for column in range(4)) for row in range(3))
        scale = node.get('scale',[1,1,1])
        point = tuple(point[index]*scale[index] for index in range(3))
        quat = node.get('rotation',[0,0,0,1])
        qx,qy,qz,qw = quat
        px,py,pz = point
        tx,ty,tz = 2*(qy*pz-qz*py),2*(qz*px-qx*pz),2*(qx*py-qy*px)
        point = (px+qw*tx+qy*tz-qz*ty,py+qw*ty+qz*tx-qx*tz,pz+qw*tz+qx*ty-qy*tx)
        return tuple(point[index]+node.get('translation',[0,0,0])[index] for index in range(3))

    authored = json.loads((HOME/'asset'/'covered-fighter.recipe.json').read_text())
    authored_by_name = {part['name']:part for part in authored['parts']}
    recipe_checks = []
    primitives = []
    all_points = []
    aircraft = []
    triangles = 0
    worst_normal = 1
    degenerates = 0
    for node_index,node in enumerate(doc.get('nodes',[])):
        if 'mesh' not in node:
            continue
        assert not node.get('children'), 'Audit expects flat authored leaf mesh nodes'
        for primitive in doc['meshes'][node['mesh']]['primitives']:
            positions = accessor(primitive['attributes']['POSITION'])
            normals = accessor(primitive['attributes']['NORMAL'])
            indices = [item[0] for item in accessor(primitive['indices'])] if 'indices' in primitive else list(range(len(positions)))
            points = [transform(node,point) for point in positions]
            assert len(indices)%3 == 0
            part = authored_by_name[node['name']]
            exported = sorted(tuple(sorted(tuple(round(value,5) for value in positions[index]) for index in indices[cursor:cursor+3])) for cursor in range(0,len(indices),3))
            expected = sorted(tuple(sorted(tuple(round(value,5) for value in part['positions'][cursor+vertex:cursor+vertex+3]) for vertex in [0,3,6])) for cursor in range(0,len(part['positions']),9))
            assert exported == expected,node['name']
            expected_normals = {}
            for cursor in range(0,len(part['positions']),3):
                key = tuple(round(value,5) for value in part['positions'][cursor:cursor+3])
                expected_normals.setdefault(key,[]).append(part['normals'][cursor:cursor+3])
            normal_error = max(min(math.sqrt(sum((normal[axis]-candidate[axis])**2 for axis in range(3))) for candidate in expected_normals[tuple(round(value,5) for value in point)]) for point,normal in zip(positions,normals))
            assert normal_error < 2e-4,(node['name'],normal_error)
            colors = accessor(primitive['attributes']['COLOR_0'])
            def linear(value):
                return value/12.92 if value <= .04045 else ((value+.055)/1.055)**2.4
            tint = [linear(((part['tint']>>shift)&255)/255) for shift in (16,8,0)]
            base = [linear(((0x3a4a5e>>shift)&255)/255) for shift in (16,8,0)] if part['bucket']=='dark' else [1,1,1]
            color_error = max(abs(row[axis]-tint[axis]*base[axis]) for row in colors for axis in range(3))
            assert color_error < 2e-5
            recipe_checks.append({'node':node['name'],'positionTriangleMultisetEqualAt1e5':True,'maxNormalDifference':normal_error,'maxColorQuantizationError':color_error})
            for normal in normals:
                assert abs(math.sqrt(sum(value*value for value in normal))-1) < 2e-5
            for cursor in range(0,len(indices),3):
                first,second,third = [positions[index] for index in indices[cursor:cursor+3]]
                edge_a = [second[axis]-first[axis] for axis in range(3)]
                edge_b = [third[axis]-first[axis] for axis in range(3)]
                cross = [edge_a[1]*edge_b[2]-edge_a[2]*edge_b[1],edge_a[2]*edge_b[0]-edge_a[0]*edge_b[2],edge_a[0]*edge_b[1]-edge_a[1]*edge_b[0]]
                length = math.sqrt(sum(value*value for value in cross))
                if length < 1e-10:
                    degenerates += 1
                else:
                    for index in indices[cursor:cursor+3]:
                        worst_normal = min(worst_normal,sum(cross[axis]*normals[index][axis] for axis in range(3))/length)
            count = len(indices)//3
            triangles += count
            all_points.extend(points)
            if node.get('extras',{}).get('bucket') != 'paint':
                aircraft.extend(points)
            primitives.append({'node':node.get('name',str(node_index)),'triangles':count,'vertices':len(positions),'material':doc['materials'][primitive.get('material',0)]['name'],'transform':{key:node[key] for key in ['matrix','translation','rotation','scale'] if key in node},'bounds':bounds(points)})
    return {'file':str(filepath),'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'triangles':triangles,'primitives':len(primitives),'meshes':len(doc.get('meshes',[])),'nodes':len(doc.get('nodes',[])),'materials':[item.get('name') for item in doc.get('materials',[])],'textures':len(doc.get('textures',[])),'animations':len(doc.get('animations',[])),'bounds':bounds(all_points),'aircraftBounds':bounds(aircraft),'degenerateTriangles':degenerates,'minFaceNormalDot':worst_normal,'entries':primitives,'recipeChecks':recipe_checks,'emissiveFactors':[item.get('emissiveFactor',[0,0,0]) for item in doc.get('materials',[])],'doubleSidedMaterials':[item.get('doubleSided',False) for item in doc.get('materials',[])]}


def bounds(points):
    return {'min':[min(point[axis] for point in points) for axis in range(3)],'max':[max(point[axis] for point in points) for axis in range(3)]}


if __name__ == '__main__':
    result = parse(HOME / 'asset' / 'covered-fighter.glb')
    assert result['triangles'] == 1372
    assert result['bytes'] <= 768*1024
    assert result['textures'] == result['animations'] == result['degenerateTriangles'] == 0
    assert result['minFaceNormalDot'] > .9999
    assert len(result['materials']) == 3
    assert not any(result['doubleSidedMaterials'])
    assert all(all(value == 0 for value in factor) for factor in result['emissiveFactors'])
    (HOME / 'evidence' / 'binary-audit.json').write_text(json.dumps(result,indent=2)+'\n')
    references = []
    root = HOME
    while not (root / 'public' / 'models' / 'player.glb').exists() and root.parent != root:
        root = root.parent
    for name in ['player','sentinel','turret','radar','silo','fuel']:
        raw = (root / 'public' / 'models' / (name+'.glb')).read_bytes()
        size,kind = struct.unpack_from('<II',raw,12)
        doc = json.loads(raw[20:20+size])
        sources={'player':['assets-source/fighter/player.blend','assets-source/fighter/blender/build_player.py','assets-source/fighter/blender/kzlib.py'],'sentinel':['assets-source/sentinel/sentinel.blend','assets-source/sentinel/build/build_sentinel.py'],'turret':['assets-source/ground/turret.blend','assets-source/ground/scripts/build_assets.py'],'radar':['assets-source/ground/radar.blend','assets-source/ground/scripts/build_assets.py'],'silo':['assets-source/supplies/silo.blend','assets-source/supplies/scripts/build.py'],'fuel':['assets-source/supplies/fuel.blend','assets-source/supplies/scripts/build.py']}[name]
        primitives=[primitive for mesh in doc.get('meshes',[]) for primitive in mesh['primitives']]
        references.append({'name':name,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'triangles':sum(doc['accessors'][primitive['indices']]['count']//3 if 'indices' in primitive else doc['accessors'][primitive['attributes']['POSITION']]['count']//3 for primitive in primitives),'primitives':len(primitives),'materials':[item.get('name') for item in doc.get('materials',[])],'editableSourceHashes':{source:hashlib.sha256((root/source).read_bytes()).hexdigest() for source in sources}})
    (HOME / 'evidence' / 'shipped-references.json').write_text(json.dumps(references,indent=2)+'\n')
    print(json.dumps({key:result[key] for key in ['bytes','sha256','triangles','primitives','materials','bounds','aircraftBounds','minFaceNormalDot','degenerateTriangles']},indent=2))
