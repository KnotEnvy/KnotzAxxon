import itertools
import math


class Solid:
    def __init__(self, name):
        self.name = name
        self.vertices = []
        self.triangles = []
        self.parts = []
        self.lookup = {}

    def vertex(self, point):
        key = tuple(round(value, 10) for value in point)
        if key not in self.lookup:
            self.lookup[key] = len(self.vertices)
            self.vertices.append(list(key))
        return self.lookup[key]

    def face(self, points, normal, part):
        points = [tuple(point) for point in points]
        first = [points[1][axis] - points[0][axis] for axis in range(3)]
        second = [points[2][axis] - points[0][axis] for axis in range(3)]
        cross = [first[1] * second[2] - first[2] * second[1], first[2] * second[0] - first[0] * second[2], first[0] * second[1] - first[1] * second[0]]
        if sum(cross[axis] * normal[axis] for axis in range(3)) < 0:
            points.reverse()
        indices = [self.vertex(point) for point in points]
        for corner in range(1, len(indices) - 1):
            self.triangles.append([indices[0], indices[corner], indices[corner + 1]])
            self.parts.append(part)

    def data(self):
        return dict(name=self.name, vertices=self.vertices, triangles=self.triangles, parts=self.parts)


def rectangle(left, right, bottom, top, depth):
    return [(left, bottom, depth), (right, bottom, depth), (right, top, depth), (left, top, depth)]


def crate():
    solid = Solid('CargoCrate_Fitted')
    for axis in range(3):
        for sign in [-1, 1]:
            tangent = [index for index in range(3) if index != axis]
            normal = [0, 0, 0]
            normal[axis] = sign
            def mapped(point):
                result = [0, 0.5, 0]
                result[tangent[0]] += point[0]
                result[tangent[1]] += point[1]
                result[axis] += point[2] * sign
                return result
            outer = rectangle(-0.46, 0.46, -0.46, 0.46, 0.5)
            label = ('x', 'y', 'z')[axis] + ('_positive' if sign == 1 else '_negative')
            if axis == 1 and sign == -1:
                solid.face([mapped(point) for point in outer], normal, 'shell_bottom')
                continue
            rings = [outer, rectangle(-0.34, 0.34, -0.33, 0.33, 0.471)]
            if axis == 1:
                rings.append(rectangle(-0.10, 0.10, -0.30, 0.30, 0.493))
            else:
                rings.extend([rectangle(-0.085, 0.085, 0.13, 0.31, 0.471), rectangle(-0.06, 0.06, 0.15, 0.29, 0.498)])
            for layer in range(len(rings) - 1):
                part = ['frame_rib', 'inset_panel', 'captive_latch_bevel'][layer] + '_' + label
                for corner in range(4):
                    following = (corner + 1) % 4
                    solid.face([mapped(rings[layer][corner]), mapped(rings[layer][following]), mapped(rings[layer + 1][following]), mapped(rings[layer + 1][corner])], normal, part)
            solid.face([mapped(point) for point in rings[-1]], normal, ('lid_hinge_strap' if axis == 1 else 'captive_latch') + '_' + label)
    for free in range(3):
        fixed = [axis for axis in range(3) if axis != free]
        for signs in itertools.product([-1, 1], repeat=2):
            points = []
            for along, first, second in [(-0.46, 0.5, 0.46), (0.46, 0.5, 0.46), (0.46, 0.46, 0.5), (-0.46, 0.46, 0.5)]:
                point = [0, 0.5, 0]
                point[free] += along
                point[fixed[0]] += first * signs[0]
                point[fixed[1]] += second * signs[1]
                points.append(point)
            normal = [0, 0, 0]
            normal[fixed[0]], normal[fixed[1]] = signs
            solid.face(points, normal, 'shell_edge_bevel')
    for signs in itertools.product([-1, 1], repeat=3):
        points = []
        for tip in range(3):
            point = [signs[axis] * (0.5 if axis == tip else 0.46) + (0.5 if axis == 1 else 0) for axis in range(3)]
            points.append(point)
        solid.face(points, signs, 'shell_corner_bevel')
    return solid.data()


def drum():
    solid = Solid('CargoDrum_Fitted')
    profile = [(0, 0.93), (0.035, 1), (0.08, 0.94), (0.32, 0.94), (0.35, 1), (0.38, 0.94), (0.965, 0.94), (1, 1), (0.975, 0.8)]
    rings = [[(math.sin(corner * math.tau / 10) * radius, height, math.cos(corner * math.tau / 10) * radius) for corner in range(10)] for height, radius in profile]
    labels = ['rolled_foot', 'foot_seam', 'lower_wall', 'retaining_hoop_rise', 'retaining_hoop_return', 'upper_wall', 'rolled_lid_rim', 'recessed_lid_shoulder']
    for layer in range(len(rings) - 1):
        delta_height = profile[layer + 1][0] - profile[layer][0]
        delta_radius = profile[layer + 1][1] - profile[layer][1]
        for corner in range(10):
            following = (corner + 1) % 10
            angle = (corner + 0.5) * math.tau / 10
            solid.face([rings[layer][corner], rings[layer][following], rings[layer + 1][following], rings[layer + 1][corner]], [math.sin(angle) * delta_height, -delta_radius, math.cos(angle) * delta_height], labels[layer])
    for corner in range(10):
        following = (corner + 1) % 10
        solid.face([(0, 0, 0), rings[0][corner], rings[0][following]], [0, -1, 0], 'closed_bottom')
        solid.face([(0, 0.975, 0), rings[-1][corner], rings[-1][following]], [0, 1, 0], 'recessed_lid')
    return solid.data()


def generate():
    return dict(format='cargo-kit-topology-v1', coordinates='X across / Y up / Z forward; bottom-center origins', models=[crate(), drum()])
