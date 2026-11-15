// Resting source camera formulas retained from the Reactor Spine composition helper.
export const RIGS = {
  classic: { yaw: 45, dist: 64, height: 45.255, fov: 52, ortho: true },
  modern: { yaw: 20, dist: 29, height: 14, fov: 58 },
  chase: { yaw: 6, dist: 24, height: 9.5, fov: 66 },
};

/** Exact CameraRig.snap eye/target for a resting player (velocity 0, boost 0). */
export function rigCamera(name, player, aspect) {
  const r = RIGS[name], yaw = r.yaw * Math.PI / 180;
  const off = [-r.dist * Math.sin(yaw), r.height, -r.dist * Math.cos(yaw)];
  if (r.ortho) {
    const lead = 28;
    return { eye: [off[0], 9 + off[1], player[2] + lead + off[2]], target: [0, 9, player[2] + lead], ortho: true, halfHeight: Math.max(40, 60 / aspect), near: 0.35, far: 1344 };
  }
  return { eye: [player[0] + off[0], player[1] + off[1], player[2] + off[2]], target: [player[0], player[1] + 1.2, player[2] + 16], ortho: false, fov: r.fov, near: 0.35, far: 1344 };
}
