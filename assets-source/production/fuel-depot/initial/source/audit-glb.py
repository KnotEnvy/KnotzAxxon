import collections
import hashlib
import json
import math
import struct
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
FILE=ROOT/'asset/fortress-fuel-depot.glb'
raw=FILE.read_bytes()
magic,version,length=struct.unpack_from('<4sII',raw)
assert magic==b'glTF' and version==2 and length==len(raw)
offset=12
chunks=[]
while offset<len(raw):
    size,kind=struct.unpack_from('<II',raw,offset)
    chunks.append((kind,raw[offset+8:offset+8+size]))
    offset+=size+8
assert len(chunks)==2 and offset==len(raw)
doc=json.loads(chunks[0][1])
binary=chunks[1][1]
assert chunks[0][0]==0x4e4f534a and chunks[1][0]==0x004e4942
assert len(raw)<=768*1024
assert not any(doc.get(key) for key in ('textures','images','animations','skins','cameras'))
assert len(doc['materials'])==2


def accessor(index):
    item=doc['accessors'][index]
    assert 'sparse' not in item
    view=doc['bufferViews'][item['bufferView']]
    components={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[item['type']]
    code,size={5120:('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)}[item['componentType']]
    stride=view.get('byteStride',components*size)
    start=view.get('byteOffset',0)+item.get('byteOffset',0)
    assert start+(item['count']-1)*stride+components*size<=view.get('byteOffset',0)+view['byteLength']
    values=[struct.unpack_from('<'+code*components,binary,start+vertex*stride) for vertex in range(item['count'])]
    if item.get('normalized'):
        maximum={5121:255,5123:65535}[item['componentType']]
        values=[tuple(value/maximum for value in row) for row in values]
    assert all(math.isfinite(value) for row in values for value in row)
    return values


IDENTITY=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]


def multiply(left,right):
    return [sum(left[row+index*4]*right[index+column*4] for index in range(4)) for column in range(4) for row in range(4)]


def matrix(node):
    if 'matrix' in node:
        return node['matrix']
    quaternion=node.get('rotation',[0,0,0,1])
    quat_x,quat_y,quat_z,quat_w=quaternion
    rotation=[1-2*(quat_y*quat_y+quat_z*quat_z),2*(quat_x*quat_y+quat_z*quat_w),2*(quat_x*quat_z-quat_y*quat_w),0,2*(quat_x*quat_y-quat_z*quat_w),1-2*(quat_x*quat_x+quat_z*quat_z),2*(quat_y*quat_z+quat_x*quat_w),0,2*(quat_x*quat_z+quat_y*quat_w),2*(quat_y*quat_z-quat_x*quat_w),1-2*(quat_x*quat_x+quat_y*quat_y),0,0,0,0,1]
    for column,scale in enumerate(node.get('scale',[1,1,1])):
        for row in range(3):
            rotation[column*4+row]*=scale
    rotation[12:15]=node.get('translation',[0,0,0])
    return rotation


def transform(value,world,direction=False):
    return tuple(sum(world[row+column*4]*value[column] for column in range(3))+(0 if direction else world[12+row]) for row in range(3))


primitives=[]
canonical=json.loads((ROOT/'asset/fuel-depot.template.json').read_text())
expected={bucket['key']:bucket for bucket in canonical['buckets']}
position_error=normal_error=color_error=0
all_positions=[]
forbidden=[]


def visit(index,parent):
    global position_error,normal_error,color_error
    node=doc['nodes'][index]
    world=multiply(parent,matrix(node))
    if 'mesh' in node:
        mesh=doc['meshes'][node['mesh']]
        key='hull' if 'hull' in node.get('name','') else 'dark'
        canonical_values=expected[key]
        actual=[]
        for primitive in mesh['primitives']:
            assert primitive.get('mode',4)==4
            assert 'COLOR_0' in primitive['attributes'] and 'COLOR_1' not in primitive['attributes']
            positions=accessor(primitive['attributes']['POSITION'])
            normals=accessor(primitive['attributes']['NORMAL'])
            colors=accessor(primitive['attributes']['COLOR_0'])
            indices=[row[0] for row in accessor(primitive['indices'])] if 'indices' in primitive else list(range(len(positions)))
            assert len(indices)%3==0 and max(indices)<len(positions)
            transformed=[transform(position,world) for position in positions]
            transformed_normals=[transform(normal,world,True) for normal in normals]
            all_positions.extend(transformed)
            degenerate=0
            for begin in range(0,len(indices),3):
                first,second,third=[transformed[indices[begin+step]] for step in range(3)]
                left=[second[axis]-first[axis] for axis in range(3)]
                right=[third[axis]-first[axis] for axis in range(3)]
                face=(left[1]*right[2]-left[2]*right[1],left[2]*right[0]-left[0]*right[2],left[0]*right[1]-left[1]*right[0])
                if sum(value*value for value in face)<1e-16:
                    degenerate+=1
                assert sum(face[axis]*transformed_normals[indices[begin]][axis] for axis in range(3))>0
            assert degenerate==0
            actual.extend([(transformed[vertex],transformed_normals[vertex],colors[vertex][:3]) for vertex in indices])
            material=doc['materials'][primitive['material']]['pbrMetallicRoughness']
            if key=='dark':
                base=material['baseColorFactor'][:3]
                channels=[value/255 for value in (0x3a,0x4a,0x5e)]
                expected_base=[value/12.92 if value<=.04045 else ((value+.055)/1.055)**2.4 for value in channels]
                assert max(abs(actual_component-expected_component) for actual_component,expected_component in zip(base,expected_base))<1e-6
            assert abs(material.get('metallicFactor',1)-(.36 if key=='hull' else .5))<1e-6
            assert abs(material.get('roughnessFactor',1)-(1 if key=='hull' else .46))<1e-6
            primitives.append(dict(bucket=key,triangles=len(indices)//3,vertices=len(positions),material=material,degenerateTriangles=degenerate,nodeMatrix=world))
        expected_records=[]
        for offset in range(0,len(canonical_values['position']),3):
            expected_records.append(tuple(tuple(canonical_values[field][offset:offset+3]) for field in ('position','normal','color')))
        remaining=collections.defaultdict(list)
        for record in expected_records:
            remaining[tuple(round(value,5) for value in record[0])].append(record)
        for record in actual:
            candidates=remaining[tuple(round(value,5) for value in record[0])]
            assert candidates,key
            best=min(range(len(candidates)),key=lambda index:max(abs(actual_component-expected_component) for field,expected_field in zip(record,candidates[index]) for actual_component,expected_component in zip(field,expected_field)))
            expected_record=candidates.pop(best)
            errors=[max(abs(actual_component-expected_component) for actual_component,expected_component in zip(field,expected_field)) for field,expected_field in zip(record,expected_record)]
            position_error=max(position_error,errors[0])
            normal_error=max(normal_error,errors[1])
            color_error=max(color_error,errors[2])
            assert errors[0]<1e-5 and errors[1]<5e-4 and errors[2]<2e-5,(key,errors)
        assert not any(remaining.values())
    for child in node.get('children',[]):
        visit(child,world)


for node in doc['scenes'][doc.get('scene',0)]['nodes']:
    visit(node,IDENTITY)
assert len(primitives)==2 and sum(item['triangles'] for item in primitives)==992
bounds=[[min(point[axis] for point in all_positions) for axis in range(3)],[max(point[axis] for point in all_positions) for axis in range(3)]]
shell_proofs=[]
for bucket in canonical['buckets']:
    for part in bucket['parts']:
        if 'continuous-shell' not in part['name']:
            continue
        begin=part['firstVertex']*3
        positions=bucket['position'][begin:begin+part['vertexCount']*3]
        edges=collections.Counter()
        for offset in range(0,len(positions),9):
            points=[tuple(round(value,6) for value in positions[offset+step:offset+step+3]) for step in (0,3,6)]
            for first,second in ((0,1),(1,2),(2,0)):
                edges[tuple(sorted((points[first],points[second])))]+=1
        assert all(count==2 for count in edges.values())
        shell_proofs.append(dict(name=part['name'],closedWeldedEdges=True,boundaryEdges=0,triangles=len(positions)//9))
report=dict(independent='Python standard-library GLB binary parsing, accessors, normalized colors, scene transforms, indices, normals, tolerance-matched canonical position/normal/color multisets and shell edge manifold check; no Blender or glTF library',bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest(),bounds=bounds,triangles=992,primitives=primitives,materials=len(doc['materials']),textures=0,embeddedImages=0,maxCanonicalErrors=dict(position=position_error,normal=normal_error,color=color_error),continuousClosedShells=shell_proofs,passed=True)
(ROOT/'evidence/binary-audit.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
