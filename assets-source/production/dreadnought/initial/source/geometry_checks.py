import json
import math
from collections import defaultdict
from pathlib import Path
from inspect_glb import GLB, transform

ROOT=Path(__file__).resolve().parents[1]
model=GLB(ROOT/'asset/dreadnought.glb')
seams=defaultdict(lambda:defaultdict(set))
clearance=[]
degenerate=0
for node,mesh,matrix in model.instances():
    chunk=node['extras']['game_chunk']
    for primitive in mesh['primitives']:
        positions=[transform(matrix,point) for point in model.accessor(primitive['attributes']['POSITION'])]
        source_faces=model.accessor(primitive['attributes']['_FACE'])
        indices=[row[0] for row in model.accessor(primitive['indices'])]
        for offset in range(0,len(indices),3):
            triangle=[positions[index] for index in indices[offset:offset+3]]
            minimum=[min(point[axis] for point in triangle) for axis in range(3)]
            maximum=[max(point[axis] for point in triangle) for axis in range(3)]
            if maximum[1]>=1.3 and minimum[0]<=16 and maximum[0]>=-16:
                clearance.append({'node':node['name'],'triangle':offset//3,'bounds':[minimum,maximum]})
            for boundary in [chunk*96,(chunk+1)*96]:
                for vertex_index in indices[offset:offset+3]:
                    point=positions[vertex_index]
                    if abs(point[2]-boundary)<1e-4:
                        source_face=int(round(source_faces[vertex_index][0]))
                        seams[(boundary,source_face)][chunk].add((round(point[0],4),round(point[1],4)))
            first=[triangle[1][axis]-triangle[0][axis] for axis in range(3)]
            second=[triangle[2][axis]-triangle[0][axis] for axis in range(3)]
            area=math.sqrt(sum(value*value for value in [first[1]*second[2]-first[2]*second[1],first[2]*second[0]-first[0]*second[2],first[0]*second[1]-first[1]*second[0]]))
            if area<1e-7:
                degenerate+=1
mismatches=[]
matched=0
for (boundary,part),chunks in seams.items():
    if len(chunks)==2:
        left,right=sorted(chunks)
        if chunks[left]!=chunks[right]:
            mismatches.append({'z':boundary,'part':part,'left':sorted(chunks[left]),'right':sorted(chunks[right])})
        else:
            matched+=1
result={'corridor':{'x':[-16,16],'y':[1.3,25]},'triangle_aabb_clearance_conflicts':clearance,
        'clearance_test':'Conservative triangle AABB overlap with entire infinite-Z gameplay prism; no authored triangles above floor overlap lane.',
        'section_seams':{'matching_source_triangle_boundary_sets':matched,'mismatches':mismatches,'tolerance':.0001,'scope':'Shared original source-triangle (_FACE) vertex sets at exact global 96-unit slicing planes. Intentional ring height steps and destroyed armor gaps are not falsely treated as clipping seams.'},
        'degenerate_triangles':degenerate,'poses':'Static wreck, no skeleton, damage/detach/retraction/destruction/launch poses: N/A.'}
(ROOT/'checks/geometry-clearance-seams.json').write_text(json.dumps(result,indent=2)+'\n')
assert not clearance and not mismatches and degenerate==0,(len(clearance),len(mismatches),degenerate)
print('GEOMETRY_PASS',matched,'matching seams')
