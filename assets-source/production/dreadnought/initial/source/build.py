"""Deterministic ruined warship. All construction coordinates are game X/Y/Z."""
import bpy
import json
import math
import random
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'asset'
OUTPUT.mkdir(exist_ok=True)
START = 3400.0
LENGTH = 820.0
RNG = random.Random(2026111402)
PARTS = []
TRIANGLES = []
BREACHES = [(148, 198), (474, 530), (700, 746)]
PALETTE = {
    'armor': (0.38, 0.48, 0.55), 'edge': (0.56, 0.65, 0.68),
    'ochre': (0.35, 0.24, 0.13), 'char': (0.075, 0.10, 0.13),
    'steel': (0.21, 0.28, 0.32), 'deep': (0.028, 0.043, 0.061),
    'window': (0.075, 0.13, 0.18), 'ember': (0.74, 0.18, 0.028),
    'blue': (0.045, 0.10, 0.23), 'warning': (0.36, 0.035, 0.018)
}


def begin(name, bucket='hull', tint='armor', anim=(0, 0, 0)):
    identifier = len(PARTS)
    PARTS.append({'id': identifier, 'name': name, 'bucket': bucket, 'color': PALETTE.get(tint, tint), 'aAnim': list(anim), 'trianglesBeforeClipping': 0})
    return identifier


def face(part, vertices, outward=None):
    points = [Vector(vertex) for vertex in vertices]
    if outward is not None:
        normal = (points[1] - points[0]).cross(points[2] - points[0])
        if normal.dot(Vector(outward)) < 0:
            points.reverse()
    for corner in range(1, len(points) - 1):
        triangle = [tuple(points[0]), tuple(points[corner]), tuple(points[corner + 1])]
        if (Vector(triangle[1]) - Vector(triangle[0])).cross(Vector(triangle[2]) - Vector(triangle[0])).length > 1e-7:
            TRIANGLES.append((part, triangle))
            PARTS[part]['trianglesBeforeClipping'] += 1


def box(name, center, size, bucket='hull', tint='armor', anim=(0, 0, 0)):
    part = begin(name, bucket, tint, anim)
    center = Vector(center)
    vertices = [center + Vector((sign_x * size[0] / 2, sign_y * size[1] / 2, sign_z * size[2] / 2))
                for sign_x, sign_y, sign_z in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    for indices in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)]:
        midpoint = sum((vertices[index] for index in indices), Vector()) / 4
        face(part, [vertices[index] for index in indices], midpoint - center)
    return part


def beam(name, start, end, width=0.8, depth=None, bucket='dark', tint='steel'):
    start, end = Vector(start), Vector(end)
    along = (end - start).normalized()
    side = along.cross(Vector((0, 1, 0)))
    if side.length < 0.1:
        side = along.cross(Vector((0, 0, 1)))
    side.normalize()
    upper = along.cross(side).normalized()
    side *= width / 2
    upper *= (depth or width) / 2
    vertices = [point + side * side_sign + upper * up_sign for point in [start, end]
                for side_sign, up_sign in [(-1,-1),(1,-1),(1,1),(-1,1)]]
    part = begin(name, bucket, tint)
    center = (start + end) / 2
    for indices in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:
        midpoint = sum((vertices[index] for index in indices), Vector()) / 4
        face(part, [vertices[index] for index in indices], midpoint - center)


def plate(name, outline, top, thickness=0.5, tint='armor', bucket='hull'):
    part = begin(name, bucket, tint)
    face(part, [(across, top, station) for across, station in outline], (0,1,0))
    face(part, [(across, top-thickness, station) for across, station in outline], (0,-1,0))
    center = Vector((sum(point[0] for point in outline)/len(outline), top, sum(point[1] for point in outline)/len(outline)))
    for corner, point in enumerate(outline):
        after = outline[(corner + 1) % len(outline)]
        midpoint = Vector(((point[0]+after[0])/2, top, (point[1]+after[1])/2))
        face(part, [(point[0],top,point[1]),(after[0],top,after[1]),(after[0],top-thickness,after[1]),(point[0],top-thickness,point[1])], midpoint-center)


def clipped_rectangle(left, right, near, far, bevel=0.8):
    return [(left+bevel,near),(right-bevel,near),(right,near+bevel),(right,far-bevel),
            (right-bevel,far),(left+bevel,far),(left,far-bevel),(left,near+bevel)]


def width_at(station):
    taper = min(1, max(0, station)/98.4, max(0,LENGTH-station)/82)
    return 32 * (0.35 + 0.65 * taper)


def cross_section(station):
    width = width_at(station)
    return [(6-width*.85,-15.8,station),(6+width*.85,-15.8,station),
            (6+width,-20.5,station),(6+width*.9,-33,station),(6+width*.6,-41,station),
            (6-width*.6,-41,station),(6-width*.9,-33,station),(6-width,-20.5,station)]


def tube(name, center, axis, rings, segments=16, bucket='dark', tint='steel', closed=False, anim=(0,0,0)):
    center, axis = Vector(center), Vector(axis).normalized()
    side = axis.cross(Vector((0,1,0)))
    if side.length < .01:
        side = axis.cross(Vector((0,0,1)))
    side.normalize()
    upper = axis.cross(side).normalized()
    vertices = [[center + axis*distance + radius*(math.cos(index*math.tau/segments)*side + math.sin(index*math.tau/segments)*upper)
                 for index in range(segments)] for distance, radius in rings]
    part = begin(name,bucket,tint,anim)
    for ring in range(len(vertices)-1):
        for index in range(segments):
            after = (index+1)%segments
            face(part,[vertices[ring][index],vertices[ring][after],vertices[ring+1][after],vertices[ring+1][index]])
    if closed:
        face(part,vertices[0],-axis)
        face(part,vertices[-1],axis)
    return part


def hull():
    stations = sorted(set([0, LENGTH] + list(range(24, 817, 24)) + [value for bounds in BREACHES for value in bounds]))
    for slab, (near,far) in enumerate(zip(stations,stations[1:])):
        middle = (near+far)/2
        breached = any(lower < middle < upper for lower,upper in BREACHES)
        before,after = cross_section(near), cross_section(far)
        part = begin(f'keel-shell-{slab:02d}','hull','steel')
        for facet in range(8):
            if breached and facet in (0,6,7):
                continue
            following=(facet+1)%8
            vertices=[before[facet],before[following],after[following],after[facet]]
            midpoint=sum((Vector(vertex) for vertex in vertices),Vector())/4
            face(part,vertices,midpoint-Vector((6,-29,middle)))
        if not breached:
            boundaries=[-.85,-.43,-.015,.42,.85]
            for band,(left,right) in enumerate(zip(boundaries,boundaries[1:])):
                inset=.22
                outline=[(6+width_at(near+.35)*left+inset,near+.35),(6+width_at(near+.35)*right-inset,near+.35),
                         (6+width_at(far-.35)*right-inset,far-.35),(6+width_at(far-.35)*left+inset,far-.35)]
                top=-15.0 + [.12,-.1,-.1,.12][band]
                plate(f'armored-deck-{slab:02d}-{band}',outline,top,.68,'edge' if slab%7==0 else 'armor')
            if slab%3==0 and width_at(middle)>25:
                plate(f'ochre-deck-identification-{slab:02d}',clipped_rectangle(18,21,near+1,far-1,.15),-14.82,.05,'ochre')
        for side in [-1,1]:
            if breached and side<0:
                continue
            for belt,(upper,lower) in enumerate([(-20.9,-25.3),(-26,-32)]):
                part=begin(f'flank-overlap-{slab:02d}-{side}-{belt}','hull','armor' if belt==0 else 'steel')
                vertices=[]
                for station in [near+.4,far-.4]:
                    width=width_at(station)
                    for height in [upper,lower]:
                        fraction=1-(abs(height+20.5)/12.5)*.1
                        vertices.append((6+side*(width*fraction+.16),height,station))
                face(part,[vertices[0],vertices[1],vertices[3],vertices[2]],(side,0,0))
                inner=[(across-side*.6,height,station) for across,height,station in vertices]
                for first,second in [(0,1),(1,3),(3,2),(2,0)]:
                    face(part,[vertices[first],vertices[second],inner[second],inner[first]])
            if slab%2==0:
                side_x=6+side*(width_at(middle)*.97+.23)
                for window in range(3):
                    box(f'dead-flank-window-{slab}-{side}-{window}',(side_x,-23.5,middle+(window-1)*2.7),(.15,.55,1.6),'dark','window')
    for station in [0,LENGTH]:
        part=begin('armored-bow-bulkhead' if station==0 else 'engine-transom','hull','armor')
        face(part,cross_section(station),(0,0,-1 if station==0 else 1))
    for across in [-4,6,16]:
        beam(f'continuous-keel-stringer-{across}',(across,-32,6),(across,-32,814),1.2,1.7,'dark','steel')
    for across in [-10,5,19]:
        tube(f'exposed-longitudinal-service-main-{across}',(across,-25,12),(0,0,1),[(0,.7),(796,.7)],8,'dark','ochre',True)
    for breach_index,(near,far) in enumerate(BREACHES):
        for station in range(int(near)+4,int(far),9):
            width=width_at(station)
            path=[(6-width*.83,-17.5,station),(6-width*.86,-31.8,station),(6-width*.56,-38.8,station),
                  (6+width*.56,-38.8,station),(6+width*.86,-31.8,station),(6+width*.83,-17.5,station)]
            for segment,(start,end) in enumerate(zip(path,path[1:])):
                beam(f'breach-{breach_index}-ringframe-{station}-{segment}',start,end,.9,1.4,'hull','edge')
            beam(f'breach-{breach_index}-lower-crossbrace-{station}',(6-width*.82,-31,station),(6+width*.82,-31,station),.7,1.0)
            for across in [-16,28]:
                beam(f'breach-{breach_index}-diagonal-{station}-{across}',(across,-31,station),(across,-20,station+6),.52,.7)
        for side in [-1,1]:
            for tooth in range(7):
                across=6+(tooth-3)*6.8
                edge_station=near if side<0 else far
                reach=RNG.uniform(1.2,5.3)
                outline=[(across-2.7,edge_station-side*.4),(across+2.7,edge_station-side*.4),
                         (across+RNG.uniform(-1.5,1.5),edge_station-side*reach)]
                plate(f'breach-{breach_index}-torn-armor-{side}-{tooth}',outline,-15.0+RNG.uniform(-.4,.3),.7,'edge')
        for machinery in range(3):
            station=near+12+machinery*11
            tube(f'breach-{breach_index}-exposed-accumulator-{machinery}',(6+(machinery-1)*9,-29,station),(0,0,1),[(0,2.0),(1,2.35),(6,2.35),(7,2)],12,'dark','steel',True)
            box(f'breach-{breach_index}-residual-ember-{machinery}',(5+(machinery-1)*9,-26.4,station+3),(.6,.14,1.1),'neon','ember',(4,.7,(breach_index*.21+machinery*.17)%1))
    for station in [30,67,219,260,310,354,401,443,550,594,642,674,766,796]:
        width=width_at(station)
        for side in [-1,1]:
            beam(f'continuous-rib-buttress-{station}-{side}',(6+side*width*.55,-38.4,station),(6+side*width*.95,-22,station),.6,1.1,'hull','edge')
        if 100<station<770:
            plate(f'dorsal-spine-access-{station}',clipped_rectangle(1.1,10.9,station-5,station+5,.9),-14.6,.45,'steel')
            for offset in [-2.3,0,2.3]:
                box(f'recessed-spine-vent-{station}-{offset}',(6+offset,-14.32,station),(.7,.13,5.2),'dark','deep')


def ruined_turrets():
    for turret,station in enumerate([78,248,332,416,563,676,782]):
        across=2 if turret%2==0 else -7
        radius=5.4 if turret in (2,4) else 4.3
        plate(f'gun-{turret}-fitted-deck-collar',clipped_rectangle(across-radius-1,across+radius+1,station-radius-1,station+radius+1,.9),-14.45,.7,'steel','dark')
        tube(f'gun-{turret}-recessed-empty-well',(across,-15.6,station),(0,1,0),[(0,radius*.82),(.8,radius*.82)],20,'dark','deep',True)
        segments=20
        part=begin(f'gun-{turret}-shattered-ring','hull','edge')
        for segment in range(segments):
            if segment in [1,2,12] or (turret%2 and segment==3):
                continue
            angle=segment*math.tau/segments
            following=(segment+1)*math.tau/segments
            height=-12.2 + (0.65 if segment%5==0 else 0)
            for radial,upper,lower in [(radius,height,-14.4),(radius*.72,height,-14.4)]:
                normal_sign=1 if radial==radius else -1
                vertices=[(across+radial*math.cos(angle),lower,station+radial*math.sin(angle)),
                          (across+radial*math.cos(following),lower,station+radial*math.sin(following)),
                          (across+radial*math.cos(following),upper,station+radial*math.sin(following)),
                          (across+radial*math.cos(angle),upper,station+radial*math.sin(angle))]
                face(part,vertices,(normal_sign*math.cos(angle),0,normal_sign*math.sin(angle)))
            face(part,[(across+radial*math.cos(theta),height,station+radial*math.sin(theta))
                       for radial,theta in [(radius,angle),(radius,following),(radius*.72,following),(radius*.72,angle)]],(0,1,0))
            if segment in [0,3,11,13]:
                beam(f'gun-{turret}-ripped-feed-{segment}',(across+radius*.8*math.cos(angle),-14,station+radius*.8*math.sin(angle)),
                     (across+radius*math.cos(angle+.15),-10.5,station+radius*math.sin(angle+.15)),.5,.6,'dark','char')
        for mount in [-1,1]:
            beam(f'gun-{turret}-broken-trunnion-{mount}',(across+mount*radius*.5,-14.2,station),(across+mount*radius*.4,-10.2,station+.8),.9,1.2,'dark','steel')
        box(f'gun-{turret}-faint-well-ember',(across,-14.1,station-1),(1.6,.13,.25),'neon','ember',(4,.8,turret*.137%1))


def bridge():
    for tier,(bottom,top,left,right,near,far) in enumerate([(-15,-5,22,37,582,651),(-5,4.5,25,36,592,642),(4.5,10,27,36,600,631)]):
        bottom_ring=[(left,bottom,near),(right,bottom,near),(right,bottom,far),(left,bottom,far)]
        top_ring=[(left+1,top,near+3),(right-.5,top,near+3),(right-.5,top,far-3),(left+1,top,far-3)]
        part=begin(f'far-beam-command-tower-tier-{tier}','hull','armor')
        for edge in range(4):
            following=(edge+1)%4
            if tier==2 and edge==0:
                continue
            midpoint=(Vector(bottom_ring[edge])+Vector(bottom_ring[following])+Vector(top_ring[edge])+Vector(top_ring[following]))/4
            face(part,[bottom_ring[edge],bottom_ring[following],top_ring[following],top_ring[edge]],midpoint-Vector(((left+right)/2,(bottom+top)/2,(near+far)/2)))
        if tier<2:
            face(part,top_ring,(0,1,0))
        else:
            plate('bridge-destroyed-roof-port',[(28,604),(30.4,604),(31.2,612),(29,628),(28,628)],10.15,.7,'edge')
            plate('bridge-destroyed-roof-starboard',[(34,604),(35.5,604),(35.5,628),(32,628),(33.5,620)],10.15,.7,'edge')
            for station in [605,613,621,628]:
                beam(f'bridge-exposed-roof-arch-{station}',(28.7,7,station),(34.5,9.5,station),.48,.7,'dark','steel')
        plate(f'bridge-tier-{tier}-overhang',clipped_rectangle(left-.6,right+.3,near+1,far-1,.9),bottom+.35,.55,'steel','dark')
    for row,height in enumerate([-2.7,.8,6.2]):
        for window in range(9 if row<2 else 5):
            station=597+window*4.3 if row<2 else 605+window*4.3
            across=25.7 if row<2 else 28.25
            box(f'bridge-deep-window-reveal-{row}-{window}',(across-.1,height,station),(.32,1.55,2.8),'dark','deep')
            box(f'bridge-dead-window-{row}-{window}',(across-.3,height+.07,station),(.05,.73,2.15),'dark','window')
    for station in [589,603,630,644]:
        beam(f'bridge-armored-foundation-knee-{station}',(19,-15,station),(24,-5,station),1.1,1.7,'hull','edge')
    beam('bridge-broken-signal-mast',(32,9.5,627),(34,12.6,629),.6,.7,'dark','steel')
    box('bridge-last-faint-strobe',(34,12.65,629),(.25,.25,.25),'neon','warning',(1,.5,.413))
    box('bridge-residual-window-ember',(25.38,-2.7,614.2),(.06,.32,1.2),'neon','ember',(4,.9,.72))
    for station in [586,646]:
        for across in [28,33]:
            tube(f'bridge-dead-exchanger-{station}-{across}',(across,-4,station),(0,1,0),[(0,1.1),(1.4,1.1)],12,'dark','steel',True)


def engines():
    for side in [-1,1]:
        across=6+side*14
        tube(f'engine-{side}-armored-pedestal',(across,-29,807),(0,0,1),[(0,6),(4,7.5),(10,7.5),(12,6.9)],20,'hull','armor')
        tube(f'engine-{side}-double-wall-bell',(across,-29,816),(0,0,1),[(0,5.2),(4,6.2),(13,8),(13,7.35),(4,5.45),(1,4.5)],24,'dark','steel')
        tube(f'engine-{side}-recessed-dead-core',(across,-29,819),(0,0,1),[(0,3.8),(.3,3.8)],20,'dark','deep',True)
        tube(f'engine-{side}-subtle-blue-remnant',(across,-29,819.4),(0,0,1),[(0,3.0),(.06,3.0)],20,'neon','blue',True,(3,.2,0 if side>0 else .5))
        for rib in range(8):
            angle=rib*math.tau/8
            beam(f'engine-{side}-external-longeron-{rib}',(across+5.6*math.cos(angle),-29+5.6*math.sin(angle),813),
                 (across+7.8*math.cos(angle),-29+7.8*math.sin(angle),828),.38,.6,'hull','edge')
        for strut in [-1,1]:
            beam(f'engine-{side}-suspension-{strut}',(across+strut*4,-26,808),(across+strut*6,-22,816),.7,1.2,'hull','steel')


def clip_polygon(points, plane, keep_above):
    result=[]
    for index,current in enumerate(points):
        previous=points[index-1]
        inside_current=current[2]>=plane-1e-7 if keep_above else current[2]<=plane+1e-7
        inside_previous=previous[2]>=plane-1e-7 if keep_above else previous[2]<=plane+1e-7
        if inside_current != inside_previous:
            fraction=(plane-previous[2])/(current[2]-previous[2])
            result.append(tuple(previous[axis]+fraction*(current[axis]-previous[axis]) for axis in range(3)))
        if inside_current:
            result.append(current)
    return result


def material(bucket):
    result=bpy.data.materials.new('DN_'+bucket)
    result.use_nodes=True
    nodes=result.node_tree.nodes
    nodes.clear()
    output=nodes.new('ShaderNodeOutputMaterial')
    color=nodes.new('ShaderNodeVertexColor')
    color.layer_name='Palette'
    if bucket=='neon':
        surface=nodes.new('ShaderNodeEmission')
        surface.inputs['Strength'].default_value=1.0
        result.node_tree.links.new(color.outputs['Color'],surface.inputs['Color'])
        result.node_tree.links.new(surface.outputs[0],output.inputs['Surface'])
    else:
        surface=nodes.new('ShaderNodeBsdfPrincipled')
        surface.inputs['Metallic'].default_value=.38 if bucket=='hull' else .32
        surface.inputs['Roughness'].default_value=.72 if bucket=='hull' else .82
        result.node_tree.links.new(color.outputs['Color'],surface.inputs['Base Color'])
        result.node_tree.links.new(surface.outputs[0],output.inputs['Surface'])
    return result


def main():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.context.scene.render.engine='BLENDER_EEVEE'
    bpy.context.scene.render.threads_mode='FIXED'
    bpy.context.scene.render.threads=4
    hull(); ruined_turrets(); bridge(); engines()
    chunks={}
    original_count=len(TRIANGLES)
    for face_id,(part,triangle) in enumerate(TRIANGLES):
        triangle=[(across,height,station+START) for across,height,station in triangle]
        first=int(math.floor(min(point[2] for point in triangle)/96))
        last=int(math.floor((max(point[2] for point in triangle)-1e-6)/96))
        last=max(first,last)
        normal=(Vector(triangle[1])-Vector(triangle[0])).cross(Vector(triangle[2])-Vector(triangle[0])).normalized()
        for chunk in range(first,last+1):
            polygon=clip_polygon(clip_polygon(triangle,chunk*96,True),(chunk+1)*96,False)
            for corner in range(1,len(polygon)-1):
                clipped=[polygon[0],polygon[corner],polygon[corner+1]]
                if (Vector(clipped[1])-Vector(clipped[0])).cross(Vector(clipped[2])-Vector(clipped[0])).length<1e-6:
                    continue
                chunks.setdefault((chunk,PARTS[part]['bucket']),[]).append((part,clipped,tuple(normal),face_id))
    materials={bucket:material(bucket) for bucket in ['hull','dark','neon']}
    root=bpy.data.objects.new('DN_DERELICT_DREADNOUGHT__game_Y_up_Z_travel',None)
    bpy.context.collection.objects.link(root)
    root['asset_status']='initial_unchanged_pending_deferred_opus_review'
    root['world_start']=START
    root['landmark_length']=LENGTH
    root['gameplay']='scenery_only_no_colliders_no_cover_no_targeting_changes'
    root['model']='gpt-6.1-sol'
    root['reasoning_effort']='xhigh'
    parents={}
    summary=[]
    for (chunk,bucket),triangles in sorted(chunks.items()):
        if chunk not in parents:
            parent=bpy.data.objects.new(f'DN_SECTION_{chunk:04d}__Z{chunk*96}',None)
            bpy.context.collection.objects.link(parent)
            parent.parent=root
            parent.location=(0,-chunk*96,0)
            parent['game_chunk']=chunk
            parent['source_z0']=chunk*96
            parents[chunk]=parent
        vertices=[]
        colors=[]
        anims=[]
        identifiers=[]
        face_ids=[]
        normals=[]
        for part,triangle,normal,face_id in triangles:
            for across,height,station in triangle:
                vertices.append((across,-(station-chunk*96),height))
                colors.append((*PARTS[part]['color'],1))
                anims.append(PARTS[part]['aAnim'])
                identifiers.append(part)
                face_ids.append(face_id)
                normals.append((normal[0],-normal[2],normal[1]))
        mesh=bpy.data.meshes.new(f'DN_{chunk:04d}_{bucket}_editable_section')
        mesh.from_pydata(vertices,[],[(vertex,vertex+1,vertex+2) for vertex in range(0,len(vertices),3)])
        mesh.update()
        palette=mesh.color_attributes.new(name='Palette',type='FLOAT_COLOR',domain='POINT')
        palette.data.foreach_set('color',[component for color in colors for component in color])
        cue=mesh.attributes.new(name='_ANIM',type='FLOAT_VECTOR',domain='POINT')
        cue.data.foreach_set('vector',[component for anim in anims for component in anim])
        part_ids=mesh.attributes.new(name='_PART',type='FLOAT',domain='POINT')
        part_ids.data.foreach_set('value',identifiers)
        source_faces=mesh.attributes.new(name='_FACE',type='FLOAT',domain='POINT')
        source_faces.data.foreach_set('value',face_ids)
        uv=mesh.uv_layers.new(name='SourceBoxProjection')
        uv_values=[]
        for vertex,normal in zip(vertices,normals):
            game_position=(vertex[0],vertex[2],-vertex[1]+chunk*96)
            dominant=max(range(3),key=lambda axis:abs(normal[axis]))
            axes=(1,2) if dominant==0 else (0,2) if dominant==2 else (0,1)
            uv_values.extend([game_position[axes[0]]/12,game_position[axes[1]]/12])
        uv.data.foreach_set('uv',uv_values)
        mesh.normals_split_custom_set_from_vertices(normals)
        mesh.materials.append(materials[bucket])
        obj=bpy.data.objects.new(f'DN_{chunk:04d}__{bucket}',mesh)
        bpy.context.collection.objects.link(obj)
        obj.parent=parents[chunk]
        obj['runtime_bucket']=bucket
        obj['game_chunk']=chunk
        obj['aAnim_mapping']='_ANIM -> aAnim (mode,Hz,phase); restore via fixture, not static glTF shading'
        obj['lifecycle']='loader-owned template; chunk bake owns cloned/consumed geometry only'
        names=sorted(set(PARTS[part]['name'] for part,triangle,normal,face_id in triangles))
        obj['module_names']=json.dumps(names)
        summary.append({'chunk':chunk,'z0':chunk*96,'bucket':bucket,'node':obj.name,'triangles':len(triangles),'parts':sorted(set(part for part,triangle,normal,face_id in triangles))})
    bpy.ops.object.select_all(action='SELECT')
    scene=bpy.context.scene
    scene.world.color=(.04,.04,.04)
    scene['coordinates']='Blender (x,-gameZ,gameY); glTF game +Y up, +Z travel; no normalization'
    scene['construction_seed']=2026111402
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT/'dreadnought.blend'),compress=True)
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT/'dreadnought.glb'),export_format='GLB',use_selection=True,
                              export_yup=True,export_extras=True,export_attributes=True,export_materials='EXPORT',
                              export_normals=True,export_texcoords=True,export_cameras=False,
                              export_lights=False,export_animations=False)
    bounds_min=[min(point[axis] for part,triangle in TRIANGLES for point in triangle) for axis in range(3)]
    bounds_max=[max(point[axis] for part,triangle in TRIANGLES for point in triangle) for axis in range(3)]
    metadata={'version':1,'game_start':START,'game_end':START+LENGTH,'coordinate_space':'game X, Y up, +Z travel',
              'section_z_coordinates':'world absolute; modules parent translation is baked by fixture',
              'construction_seed':2026111402,'triangles_before_section_clipping':original_count,
              'triangles_after_section_clipping':sum(len(value) for value in chunks.values()),
              'bounds_world':{'min':[bounds_min[0],bounds_min[1],bounds_min[2]+START],'max':[bounds_max[0],bounds_max[1],bounds_max[2]+START]},
              'parts':PARTS,'sections':summary,'breaches_local_z':BREACHES,
              'materials':{'DN_hull':'hull','DN_dark':'dark','DN_neon':'neon'},'textures':[],
              'fx':'_ANIM game cue tuple copied to aAnim; no spin geometry in this asset',
              'blender':bpy.app.version_string,'blender_build_hash':bpy.app.build_hash.decode()}
    (OUTPUT/'module-map.json').write_text(json.dumps(metadata,indent=2)+'\n')
    (ROOT/'checks'/'build.json').write_text(json.dumps({key:value for key,value in metadata.items() if key not in ['parts']},indent=2)+'\n')
    print('BUILD_RESULT',original_count,metadata['triangles_after_section_clipping'],metadata['bounds_world'])


if __name__=='__main__':
    main()
