"""Independent stdlib GLB accessor, hierarchy, transformed-bound and cue audit."""
import hashlib
import json
import math
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMPONENTS = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
WIDTH = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def identity():
    return [[float(row == column) for column in range(4)] for row in range(4)]


def multiply(left, right):
    return [[sum(left[row][inner] * right[inner][column] for inner in range(4)) for column in range(4)] for row in range(4)]


def node_matrix(node):
    if 'matrix' in node:
        return [[node['matrix'][column * 4 + row] for column in range(4)] for row in range(4)]
    matrix = identity()
    quaternion = node.get('rotation', [0, 0, 0, 1])
    qx, qy, qz, qw = quaternion
    rotation = [[1-2*(qy*qy+qz*qz), 2*(qx*qy-qz*qw), 2*(qx*qz+qy*qw)],
                [2*(qx*qy+qz*qw), 1-2*(qx*qx+qz*qz), 2*(qy*qz-qx*qw)],
                [2*(qx*qz-qy*qw), 2*(qy*qz+qx*qw), 1-2*(qx*qx+qy*qy)]]
    for row in range(3):
        for column in range(3):
            matrix[row][column] = rotation[row][column] * node.get('scale', [1, 1, 1])[column]
        matrix[row][3] = node.get('translation', [0, 0, 0])[row]
    return matrix


def transform(matrix, point):
    return [sum(matrix[row][column] * point[column] for column in range(3)) + matrix[row][3] for row in range(3)]


class GLB:
    def __init__(self, filename):
        self.path = Path(filename)
        self.raw = self.path.read_bytes()
        magic, version, total = struct.unpack_from('<III', self.raw)
        assert magic == 0x46546c67 and version == 2 and total == len(self.raw)
        offset = 12
        while offset < total:
            length, kind = struct.unpack_from('<II', self.raw, offset)
            offset += 8
            chunk = self.raw[offset:offset + length]
            if kind == 0x4e4f534a:
                self.document = json.loads(chunk)
            elif kind == 0x004e4942:
                self.binary = chunk
            offset += length

    def accessor(self, index):
        accessor = self.document['accessors'][index]
        view = self.document['bufferViews'][accessor['bufferView']]
        code, component_bytes = COMPONENTS[accessor['componentType']]
        width = WIDTH[accessor['type']]
        stride = view.get('byteStride', width * component_bytes)
        offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        result = [list(struct.unpack_from('<' + code * width, self.binary, offset + item * stride)) for item in range(accessor['count'])]
        if accessor.get('normalized'):
            denominator = {5120: 127, 5121: 255, 5122: 32767, 5123: 65535}[accessor['componentType']]
            result = [[max(-1, value / denominator) for value in row] for row in result]
        return result

    def instances(self):
        result = []
        def visit(index, parent):
            node = self.document['nodes'][index]
            matrix = multiply(parent, node_matrix(node))
            if 'mesh' in node:
                result.append((node, self.document['meshes'][node['mesh']], matrix))
            for child in node.get('children', []):
                visit(child, matrix)
        for node in self.document['scenes'][self.document.get('scene', 0)]['nodes']:
            visit(node, identity())
        return result

    def report(self):
        minimum, maximum = [math.inf]*3, [-math.inf]*3
        triangles, vertices, primitive_count = 0, 0, 0
        nodes = []
        cues = set()
        for node, mesh, matrix in self.instances():
            local_minimum, local_maximum = [math.inf]*3, [-math.inf]*3
            node_triangles = 0
            attributes = set()
            for primitive in mesh['primitives']:
                assert primitive.get('mode', 4) == 4
                positions = self.accessor(primitive['attributes']['POSITION'])
                indices = self.accessor(primitive['indices']) if 'indices' in primitive else [[index] for index in range(len(positions))]
                node_triangles += len(indices)//3
                vertices += len(positions)
                primitive_count += 1
                attributes.update(primitive['attributes'])
                for point in positions:
                    world = transform(matrix, point)
                    for axis in range(3):
                        minimum[axis] = min(minimum[axis], world[axis])
                        maximum[axis] = max(maximum[axis], world[axis])
                        local_minimum[axis] = min(local_minimum[axis], world[axis])
                        local_maximum[axis] = max(local_maximum[axis], world[axis])
                if '_ANIM' in primitive['attributes']:
                    cues.update(tuple(round(value, 6) for value in cue) for cue in self.accessor(primitive['attributes']['_ANIM']))
            triangles += node_triangles
            nodes.append({'name':node.get('name'), 'triangles':node_triangles, 'world_bounds':{'min':local_minimum,'max':local_maximum},
                          'attributes':sorted(attributes), 'world_matrix':matrix, 'extras':{key:value for key,value in node.get('extras',{}).items() if key!='module_names'}})
        return {'path':str(self.path),'sha256':hashlib.sha256(self.raw).hexdigest(),'bytes':len(self.raw),
                'triangles':triangles,'vertices':vertices,'material_primitives':primitive_count,
                'materials':[material.get('name') for material in self.document.get('materials',[])],
                'textures':len(self.document.get('textures',[])),'bounds':{'min':minimum,'max':maximum},
                'nodes':nodes,'cue_tuples':sorted(cues)}


def main():
    asset = GLB(ROOT/'asset/dreadnought.glb').report()
    assert asset['triangles'] <= 32000 and asset['bytes'] <= 4*1024*1024
    assert len(asset['materials']) == 3 and asset['textures'] == 0
    assert all('_ANIM' in node['attributes'] and '_PART' in node['attributes'] and 'COLOR_0' in node['attributes'] for node in asset['nodes'])
    references = {}
    repo = ROOT.parents[2]
    for name in ['player','sentinel','turret','radar','silo','fuel']:
        report = GLB(repo/f'public/models/{name}.glb').report()
        references[name] = {key:value for key,value in report.items() if key not in ['nodes','cue_tuples']}
    (ROOT/'checks/glb-independent.json').write_text(json.dumps(asset,indent=2)+'\n')
    (ROOT/'checks/shipped-reference-measurements.json').write_text(json.dumps(references,indent=2)+'\n')
    print(json.dumps({key:value for key,value in asset.items() if key not in ['nodes','cue_tuples']},indent=2))


if __name__=='__main__':
    main()
