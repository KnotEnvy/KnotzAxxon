import hashlib
import json
import math
import pathlib
import struct

ROOT=pathlib.Path(__file__).resolve().parents[1]

def identity():
    return [[float(row==column) for column in range(4)] for row in range(4)]

def multiply(first,second):
    return [[sum(first[row][index]*second[index][column] for index in range(4)) for column in range(4)] for row in range(4)]

def matrix(node):
    if 'matrix' in node:
        return [[node['matrix'][column*4+row] for column in range(4)] for row in range(4)]
    horizontal,vertical,longitudinal,scalar=node.get('rotation',[0,0,0,1])
    result=identity()
    rotation=[
        [1-2*(vertical*vertical+longitudinal*longitudinal),2*(horizontal*vertical-longitudinal*scalar),2*(horizontal*longitudinal+vertical*scalar)],
        [2*(horizontal*vertical+longitudinal*scalar),1-2*(horizontal*horizontal+longitudinal*longitudinal),2*(vertical*longitudinal-horizontal*scalar)],
        [2*(horizontal*longitudinal-vertical*scalar),2*(vertical*longitudinal+horizontal*scalar),1-2*(horizontal*horizontal+vertical*vertical)],
    ]
    scales=node.get('scale',[1,1,1])
    for row in range(3):
        for column in range(3):
            result[row][column]=rotation[row][column]*scales[column]
        result[row][3]=node.get('translation',[0,0,0])[row]
    return result

def transform(matrix_value,point):
    return [sum(matrix_value[row][column]*point[column] for column in range(3))+matrix_value[row][3] for row in range(3)]

def bounds(points):
    minimum=[min(point[axis] for point in points) for axis in range(3)]
    maximum=[max(point[axis] for point in points) for axis in range(3)]
    return {'min':minimum,'max':maximum,'size':[maximum[axis]-minimum[axis] for axis in range(3)]}

def read_glb(file):
    data=pathlib.Path(file).read_bytes()
    magic,version,length=struct.unpack_from('<III',data)
    assert magic==0x46546c67 and version==2 and length==len(data)
    offset=12
    document=None
    binary=None
    while offset<length:
        chunk_length,chunk_type=struct.unpack_from('<II',data,offset)
        chunk=data[offset+8:offset+8+chunk_length]
        if chunk_type==0x4e4f534a:
            document=json.loads(chunk)
        if chunk_type==0x004e4942:
            binary=chunk
        offset+=8+chunk_length
    return document,binary,data

def accessor(document,binary,index):
    description=document['accessors'][index]
    view=document['bufferViews'][description['bufferView']]
    formats={5120:'b',5121:'B',5122:'h',5123:'H',5125:'I',5126:'f'}
    components={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[description['type']]
    layout='<'+formats[description['componentType']]*components
    step=view.get('byteStride',struct.calcsize(layout))
    start=view.get('byteOffset',0)+description.get('byteOffset',0)
    return [struct.unpack_from(layout,binary,start+item*step) for item in range(description['count'])]

def inspect(file):
    document,binary,data=read_glb(file)
    points=[]
    primitives=[]
    nodes=[]
    by_node={}
    def visit(index,parent):
        node=document['nodes'][index]
        world=multiply(parent,matrix(node))
        nodes.append({'index':index,'name':node.get('name'),'translation':node.get('translation',[0,0,0]),'rotation':node.get('rotation',[0,0,0,1]),'scale':node.get('scale',[1,1,1]),'worldMatrix':world,'children':node.get('children',[])})
        if 'mesh' in node:
            node_points=[]
            for primitive in document['meshes'][node['mesh']]['primitives']:
                assert primitive.get('mode',4)==4
                positions=accessor(document,binary,primitive['attributes']['POSITION'])
                indices=accessor(document,binary,primitive['indices']) if 'indices' in primitive else [(item,) for item in range(len(positions))]
                assert all(math.isfinite(value) for position in positions for value in position)
                assert all(0<=item[0]<len(positions) for item in indices)
                degenerate=0
                for offset in range(0,len(indices),3):
                    first,second,third=[positions[indices[index][0]] for index in range(offset,offset+3)]
                    edge_first=[second[axis]-first[axis] for axis in range(3)]
                    edge_second=[third[axis]-first[axis] for axis in range(3)]
                    cross=[edge_first[1]*edge_second[2]-edge_first[2]*edge_second[1],edge_first[2]*edge_second[0]-edge_first[0]*edge_second[2],edge_first[0]*edge_second[1]-edge_first[1]*edge_second[0]]
                    if sum(value*value for value in cross)<1e-18:
                        degenerate+=1
                transformed=[transform(world,point) for point in positions]
                node_points.extend(transformed)
                primitives.append({'node':node.get('name'),'triangles':len(indices)//3,'vertices':len(positions),'material':document['materials'][primitive['material']]['name'],'bounds':bounds(transformed),'attributes':list(primitive['attributes']),'zeroAreaTriangles':degenerate})
                if node.get('name')=='engine_lens':
                    normals=accessor(document,binary,primitive['attributes']['NORMAL'])
                    assert all(abs(normal[0])<1e-6 and abs(normal[1])<1e-6 and abs(normal[2]-1)<1e-6 for normal in normals)
            points.extend(node_points)
            by_node[node.get('name')]=node_points
        for child in node.get('children',[]):
            visit(child,world)
    for index in document['scenes'][document.get('scene',0)]['nodes']:
        visit(index,identity())
    report={'file':str(pathlib.Path(file).name),'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'triangles':sum(primitive['triangles'] for primitive in primitives),'zeroAreaTriangles':sum(primitive['zeroAreaTriangles'] for primitive in primitives),'visibleMaterialPrimitives':len(primitives),'materialCount':len(document.get('materials',[])),'materials':[material['name'] for material in document.get('materials',[])],'bounds':bounds(points),'nodes':nodes,'primitives':primitives,'extensionsUsed':document.get('extensionsUsed',[]),'textures':len(document.get('textures',[]))}
    return report,by_node

if __name__=='__main__':
    report,parts=inspect(ROOT/'build/parked-fighter.glb')
    assert report['triangles']<=7000
    assert report['visibleMaterialPrimitives']<=5
    assert report['bytes']<=1048576
    assert report['zeroAreaTriangles']==0
    assert report['bounds']['min'][1]>=-1e-5
    for name,position,scale in [('engine',[0,1,2.3],[.3,.3,.3]),('beacon',[0,2.4,1.6],[1,1,1])]:
        node=next(item for item in report['nodes'] if item['name']==name)
        assert all(abs(actual-expected)<1e-5 for actual,expected in zip(node['translation'],position))
        assert all(abs(actual-expected)<1e-5 for actual,expected in zip(node['scale'],scale))
    assert report['bounds']['min'][2]<-3.5 and report['bounds']['max'][2]<2.6
    contract=json.loads((ROOT/'source/source_contract.json').read_text())
    samples=[]
    all_states=contract['samples']+[contract['yawExtremes']['min'],contract['yawExtremes']['max']]+contract['naturalApproach']
    for state in all_states:
        pitch=state.get('pitch',0)
        yaw=state['yaw']
        root_matrix=multiply([[1,0,0,0],[0,math.cos(pitch),-math.sin(pitch),0],[0,math.sin(pitch),math.cos(pitch),0],[0,0,0,1]],[[math.cos(yaw),0,math.sin(yaw),0],[0,1,0,0],[-math.sin(yaw),0,math.cos(yaw),0],[0,0,0,1]])
        for axis in range(3):
            root_matrix[axis][3]=state.get('pos',[0,0,0])[axis]
        state_points=[]
        for name,node_points in parts.items():
            if name=='beacon_lens' and not state.get('beaconVisible',True):
                continue
            for point in node_points:
                if name=='engine_lens':
                    point=[pivot+(coordinate-pivot)*state.get('engineScale',.3)/.3 for coordinate,pivot in zip(point,[0,1,2.3])]
                state_points.append(transform(root_matrix,point))
        samples.append({'label':state.get('label','seeded_yaw_'+str(state['seed'])),'time':state.get('time'),'dt':state.get('dt'),'sourceDzBefore':state.get('dzBefore'),'worldRootPosition':state.get('pos',[0,0,0]),'engineUniformScale':state.get('engineScale',.3),'beaconVisible':state.get('beaconVisible',True),'yaw':yaw,'pitch':pitch,'bounds':bounds(state_points)})
    report['sourceMotionTransformedBounds']=samples
    report['minimumSampledGroundClearance']=min(item['bounds']['min'][1] for item in samples if item['label']=='natural_player_approach')
    (ROOT/'evidence/glb_binary_report.json').write_text(json.dumps(report,indent=2))
    print(json.dumps({key:report[key] for key in ['bytes','triangles','visibleMaterialPrimitives','bounds','minimumSampledGroundClearance']},indent=2))
