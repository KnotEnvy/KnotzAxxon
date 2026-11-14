import collections
import hashlib
import json
import math
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    payload = (ROOT/'cooling-stack.glb').read_bytes()
    magic, version, length = struct.unpack_from('<4sII',payload)
    assert magic == b'glTF' and version == 2 and length == len(payload)
    cursor, chunks = 12, []
    while cursor < length:
        size, kind = struct.unpack_from('<I4s',payload,cursor)
        assert size % 4 == 0
        chunks.append((kind,payload[cursor+8:cursor+8+size]))
        cursor += size+8
    assert cursor == length and [kind for kind,data in chunks] == [b'JSON',b'BIN\x00']
    document, binary = json.loads(chunks[0][1]), chunks[1][1]
    component = {5120:('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)}
    widths = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}

    def accessor(index):
        info = document['accessors'][index]
        assert 'sparse' not in info
        view = document['bufferViews'][info['bufferView']]
        assert view.get('buffer',0) == 0
        code,size = component[info['componentType']]
        width = widths[info['type']]
        stride = view.get('byteStride',size*width)
        offset = view.get('byteOffset',0)+info.get('byteOffset',0)
        assert offset+stride*(info['count']-1)+size*width <= len(binary)
        result = [struct.unpack_from('<'+code*width,binary,offset+row*stride) for row in range(info['count'])]
        if info.get('normalized'):
            maximum = (1 << (size*8))-1
            result = [tuple(value/maximum for value in row) for row in result]
        assert all(math.isfinite(value) for row in result for value in row)
        return result

    template = json.loads((ROOT/'cooling-stack.template.json').read_text())
    material_counts, primitive_reports = {}, []
    actual_signatures = collections.Counter()
    actual_colors = collections.defaultdict(list)
    all_positions, endpoint_positions = [], {7:[],11:[]}
    mesh_nodes = [node for node in document['nodes'] if 'mesh' in node]
    assert len(mesh_nodes) == 1
    for node in mesh_nodes:
        assert node.get('translation',[0,0,0]) == [0,0,0]
        assert node.get('rotation',[0,0,0,1]) == [0,0,0,1]
        assert node.get('scale',[1,1,1]) == [1,1,1]
    for mesh in document['meshes']:
        for primitive in mesh['primitives']:
            assert primitive.get('mode',4) == 4
            attrs = primitive['attributes']
            assert set(attrs) == {'POSITION','NORMAL','TEXCOORD_0','COLOR_0','_CS_HEIGHT'}
            positions, colors = accessor(attrs['POSITION']),accessor(attrs['COLOR_0'])
            normals, weights = accessor(attrs['NORMAL']),accessor(attrs['_CS_HEIGHT'])
            indices = [row[0] for row in accessor(primitive['indices'])]
            assert len(indices) % 3 == 0 and max(indices) < len(positions)
            assert all(abs(math.sqrt(sum(value*value for value in normal))-1)<.00001 for normal in normals)
            material = document['materials'][primitive['material']]
            bucket = material['extras']['runtime_bucket']
            material_counts[bucket] = len(indices)//3
            for vertex_index in indices:
                pos, color, weight = positions[vertex_index],colors[vertex_index],weights[vertex_index][0]
                all_positions.append(pos)
                signature = (bucket,*[round(value,4) for value in pos],round(weight,5))
                actual_signatures[signature] += 1
                actual_colors[signature].append(tuple(color[:3]))
                for height in endpoint_positions:
                    endpoint_positions[height].append((pos[0],pos[1]+(height-9)*weight,pos[2]))
            primitive_reports.append({'material':material['name'],'bucket':bucket,'triangles':len(indices)//3,'indexedVertices':len(positions),'attributes':sorted(attrs)})
    expected_signatures = collections.Counter()
    expected_colors = collections.defaultdict(list)
    for index,weight in enumerate(template['heightWeights']):
        bucket = template['buckets'][template['triangleBuckets'][index//3]]
        pos = template['positions'][index*3:index*3+3]
        color = template['linearColors'][index*3:index*3+3]
        signature = (bucket,*[round(value,4) for value in pos],round(weight,5))
        expected_signatures[signature] += 1
        expected_colors[signature].append(tuple(color))
    assert actual_signatures == expected_signatures, {'unexpected':(actual_signatures-expected_signatures).most_common(3),'missing':(expected_signatures-actual_signatures).most_common(3)}
    maximum_color_error = max(abs(actual-expected) for signature in expected_colors for actual_row,expected_row in zip(sorted(actual_colors[signature]),sorted(expected_colors[signature])) for actual,expected in zip(actual_row,expected_row))
    assert maximum_color_error < .0001
    assert material_counts == {'hull':124,'dark':324,'neon':12}
    assert not document.get('textures') and not document.get('images') and not document.get('animations') and not document.get('skins')
    assert len(document['materials']) == 3 and len(primitive_reports) == 3 and len(payload) <= 512*1024
    assert all(not buffer.get('uri') for buffer in document['buffers'])

    def bounds(points):
        return {'min':[min(point[axis] for point in points) for axis in range(3)],'max':[max(point[axis] for point in points) for axis in range(3)]}

    report = {'status':'PASS','method':'Independent Python struct-based GLB2 JSON/BIN accessor/index/node audit; no Blender or Three loader.',
              'bytes':len(payload),'sha256':hashlib.sha256(payload).hexdigest(),'evaluatedTriangles':sum(material_counts.values()),
              'meshNodes':1,'primitives':primitive_reports,'materials':document['materials'],'transformedRestBoundsGameYUp':bounds(all_positions),
              'deformedEndpointBounds':{str(height):bounds(points) for height,points in endpoint_positions.items()},
              'coordinateTransform':'Blender authoring (x,-z,y) exports glTF game (x,y,z); exported mesh node transform is identity.',
              'parametricGeometryMatchesTemplateWithin1eMinus4':True,'heightWeightsMatchWithin1eMinus5':True,
              'maximumLinearVertexColorError':maximum_color_error,'vertexColorTolerance':.0001,
              'externalURIs':0,'textures':0,'animations':0,'skins':0,
              'nodeNames':[node.get('name') for node in document['nodes']]}
    (ROOT/'evidence/binary-audit.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))


if __name__ == '__main__':
    main()
