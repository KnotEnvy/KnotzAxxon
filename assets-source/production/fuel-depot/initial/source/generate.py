import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PARTS = []


def add(left, right):
    return tuple(left_component + right_component for left_component, right_component in zip(left, right))


def sub(left, right):
    return tuple(left_component - right_component for left_component, right_component in zip(left, right))


def mul(vector, value):
    return tuple(component * value for component in vector)


def dot(left, right):
    return sum(left_component * right_component for left_component, right_component in zip(left, right))


def cross(left, right):
    return (left[1]*right[2]-left[2]*right[1], left[2]*right[0]-left[0]*right[2], left[0]*right[1]-left[1]*right[0])


def unit(vector):
    return mul(vector, 1 / math.sqrt(dot(vector, vector)))


def linear(hex_color):
    channels = [(hex_color >> shift & 255) / 255 for shift in (16, 8, 0)]
    return [value / 12.92 if value <= .04045 else ((value + .055) / 1.055)**2.4 for value in channels]


class Part:
    def __init__(self, name, bucket, color):
        self.data = dict(name=name, bucket=bucket, tintHex=f'{color:06x}', position=[], normal=[], color=[])
        self.color = linear(color)
        PARTS.append(self.data)

    def tri(self, points, outward, normals=None):
        points = list(points)
        normals = list(normals) if normals else None
        face = cross(sub(points[1], points[0]), sub(points[2], points[0]))
        if dot(face, outward) < 0:
            points[1], points[2] = points[2], points[1]
            if normals:
                normals[1], normals[2] = normals[2], normals[1]
            face = mul(face, -1)
        face = unit(face)
        for index, point in enumerate(points):
            self.data['position'].extend(point)
            self.data['normal'].extend(normals[index] if normals else face)
            self.data['color'].extend(self.color)

    def quad(self, points, outward, normals=None):
        for indices in ((0, 1, 2), (0, 2, 3)):
            self.tri([points[index] for index in indices], outward, [normals[index] for index in indices] if normals else None)


def box(name, bucket, color, center, size):
    part = Part(name, bucket, color)
    for axis in range(3):
        other = [index for index in range(3) if index != axis]
        for sign in (-1, 1):
            points = []
            for first, second in ((-1,-1), (1,-1), (1,1), (-1,1)):
                point = list(center)
                point[axis] += sign * size[axis] / 2
                point[other[0]] += first * size[other[0]] / 2
                point[other[1]] += second * size[other[1]] / 2
                points.append(point)
            outward = [0,0,0]
            outward[axis] = sign
            part.quad(points, outward)


def vessel(center_x, label):
    part = Part(f'{label}.continuous-shell-formed-heads', 'hull', 0x9aa2aa)
    stations = [(-3.95,.38),(-3.76,.9),(-3.3,1.25),(3.3,1.25),(3.76,.9),(3.95,.38)]
    rings, normal_rings = [], []
    count = 16
    for axial, radius in stations:
        ring, normals = [], []
        for index in range(count):
            angle = math.tau * index / count
            cosine, sine = math.cos(angle), math.sin(angle)
            ring.append((center_x + radius*cosine, 1.5 + radius*sine, axial))
            cap = max(0, abs(axial)-3.3)
            normals.append(unit((cosine, sine, math.copysign(cap*1.25*1.25/(.7*.7*max(radius,.01)), axial))))
        rings.append(ring)
        normal_rings.append(normals)
    for station in range(len(rings)-1):
        for index in range(count):
            following = (index+1) % count
            indices = ((station,index),(station,following),(station+1,following),(station+1,index))
            points = [rings[row][column] for row,column in indices]
            normals = [normal_rings[row][column] for row,column in indices]
            part.quad(points, normals[0], normals)
    for station, sign in ((0,-1),(-1,1)):
        for index in range(count):
            following = (index+1) % count
            part.tri([(center_x,1.5,sign*4), rings[station][index], rings[station][following]], (0,0,sign), [(0,0,sign),normal_rings[station][index],normal_rings[station][following]])


def band(center_x, center_z, label):
    part = Part(f'{label}.retaining-strap', 'dark', 0xd4dce1)
    count, inner, outer, width = 12, 1.245, 1.32, .30
    def point(radius, index, sign):
        angle = math.tau * index / count
        return (center_x + radius*math.cos(angle), 1.5 + radius*math.sin(angle), center_z + sign*width/2)
    for index in range(count):
        following = (index+1) % count
        angle = math.tau * (index+.5) / count
        outward = (math.cos(angle),math.sin(angle),0)
        part.quad([point(outer,index,-1),point(outer,following,-1),point(outer,following,1),point(outer,index,1)],outward)
        for sign in (-1,1):
            part.quad([point(inner,index,sign),point(outer,index,sign),point(outer,following,sign),point(inner,following,sign)],(0,0,sign))


def saddle(center_x, center_z, label):
    part = Part(f'{label}.fitted-saddle', 'dark', 0xa6b0b7)
    outline = [(-1.1,0),(1.1,0)] + [(value,1.54-math.sqrt(1.25**2-value**2)) for value in (1.1,.7,0,-.7,-1.1)]
    rings = [[(center_x+profile_x,profile_y,center_z+sign*.3) for profile_x,profile_y in outline] for sign in (-1,1)]
    remaining = list(range(len(outline)))
    triangles = []
    def signed_area(first, second, third):
        return (second[0]-first[0])*(third[1]-first[1])-(second[1]-first[1])*(third[0]-first[0])
    while len(remaining)>3:
        for cursor in range(len(remaining)):
            previous,current,following = remaining[cursor-1],remaining[cursor],remaining[(cursor+1)%len(remaining)]
            first,second,third = [outline[index] for index in (previous,current,following)]
            if signed_area(first,second,third)<=0:
                continue
            if any(all(value>=-1e-9 for value in (signed_area(first,second,outline[index]),signed_area(second,third,outline[index]),signed_area(third,first,outline[index]))) for index in remaining if index not in (previous,current,following)):
                continue
            triangles.append((previous,current,following))
            remaining.pop(cursor)
            break
        else:
            raise ValueError('Saddle profile triangulation failed')
    triangles.append(tuple(remaining))
    for ring,sign in zip(rings,(-1,1)):
        for indices in triangles:
            part.tri([ring[index] for index in indices],(0,0,sign))
    for index in range(len(outline)):
        following = (index+1)%len(outline)
        delta = sub(rings[0][following],rings[0][index])
        part.quad([rings[0][index],rings[0][following],rings[1][following],rings[1][index]],(delta[1],-delta[0],0))


def pipe(name, start, end, radius, segments=8, color=0xe4e9ec):
    part = Part(name,'dark',color)
    axis = unit(sub(end,start))
    radial = unit(cross(axis,(0,1,0) if abs(axis[1])<.8 else (1,0,0)))
    tangent = cross(axis,radial)
    rings, normals = [], []
    for center in (start,end):
        ring,normal_ring = [], []
        for index in range(segments):
            angle = math.tau * index / segments
            normal = add(mul(radial,math.cos(angle)),mul(tangent,math.sin(angle)))
            ring.append(add(center,mul(normal,radius)))
            normal_ring.append(normal)
        rings.append(ring)
        normals.append(normal_ring)
    for index in range(segments):
        following = (index+1)%segments
        part.quad([rings[0][index],rings[0][following],rings[1][following],rings[1][index]],normals[0][index],[normals[0][index],normals[0][following],normals[1][following],normals[1][index]])
        for ring,center,sign in ((rings[0],start,-1),(rings[1],end,1)):
            part.tri([center,ring[index],ring[following]],mul(axis,sign))


for label,center_x in (('port',-1.6),('starboard',1.6)):
    vessel(center_x,label)
    for station,center_z in (('fore',-2.6),('aft',2.6)):
        saddle(center_x,center_z,f'{label}.{station}')
        band(center_x,center_z,f'{label}.{station}')
    pipe(f'{label}.riser-nozzle',(center_x,2.64,-.8),(center_x,2.88,-.8),.13,6)
    pipe(f'{label}.valve-flange',(center_x,2.74,-.8),(center_x,2.83,-.8),.21,8,0xc3ccd2)
    box(f'{label}.valve-lever','dark',0xe0ded2,(center_x,2.94,-.8),(.56,.07,.10))
    box(f'{label}.end-service-plate','dark',0xb4bdc3,(center_x,1.5,-3.987),(.24,.18,.022))
pipe('center.longitudinal-manifold',(0,2.9,-3.5),(0,2.9,3.5),.2,8)
pipe('center.connected-cross-header',(-1.6,2.86,-.8),(1.6,2.86,-.8),.11,8)

buckets = []
for key in ('hull','dark'):
    result = dict(key=key,position=[],normal=[],color=[],parts=[])
    for part in PARTS:
        if part['bucket']!=key:
            continue
        result['parts'].append(dict(name=part['name'],firstVertex=len(result['position'])//3,vertexCount=len(part['position'])//3,tintHex=part['tintHex']))
        for field in ('position','normal','color'):
            result[field].extend(round(value,9) for value in part[field])
    buckets.append(result)
positions = [bucket['position'] for bucket in buckets]
bounds = [[min(values[axis::3]) for axis in range(3)] for values in positions]
minimum = [min(value[axis] for value in bounds) for axis in range(3)]
maximum = [max(max(values[axis::3]) for values in positions) for axis in range(3)]
triangles = sum(len(values)//9 for values in positions)
assert 700 <= triangles <= 1000, triangles
assert all(minimum[axis] >= [-2.9200001,0,-4][axis] and maximum[axis] <= [2.9200001,3.1000001,4][axis] for axis in range(3))
document = dict(schema='fuel-depot-template-1',units='source world units; X right, Y up, Z forward',determinism='No random generator; fixed profile stations and segment counts',buckets=buckets,bounds=[minimum,maximum],triangles=triangles)
target = ROOT/'asset/fuel-depot.template.json'
target.write_text(json.dumps(document,separators=(',',':'))+'\n')
report = dict(triangles=triangles,buckets={bucket['key']:len(bucket['position'])//9 for bucket in buckets},bounds=[minimum,maximum],namedParts=[{key:part[key] for key in ('name','bucket','tintHex')}|dict(triangles=len(part['position'])//9) for part in PARTS],templateSHA256=hashlib.sha256(target.read_bytes()).hexdigest(),notes=['Shells each continuous and watertight with formed closed heads.','Retaining straps omit hidden inner faces against the shells; not individually watertight.','Pipe junctions intersect with fitted overlap; no boolean union.','No new textures, emitters, interactions or mechanics.'])
(ROOT/'evidence/generation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({key:report[key] for key in ('triangles','buckets','bounds','templateSHA256')},indent=2))
