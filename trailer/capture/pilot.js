// Trailer autopilot. Each frame it picks where the ship should be:
//   1. through the next barrier's opening (optionally hugging an edge, so the
//      game pays THREAD / PERFECT THREAD bonuses),
//   2. otherwise level with the nearest target ahead (guns fire level),
//   3. otherwise a home position,
// then pushes that point away from enemy fire it predicts will pass too close
// (near misses are allowed: grazes look like mastery), and steers there with
// a rate-limited stick so banking stays smooth.
import { CORRIDOR_HALF, ALT_MIN, ALT_MAX } from '/src/world/Level.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createPilot(game, options = {}) {
  const o = {
    home: { x: 0, y: 9 },
    hold: null,          // {x, y}: fixed framing, ignores targets (barriers still win)
    fire: 'auto',        // 'auto' (when locked), true (always), false
    boost: false,
    targets: true,
    prefer: null,        // enemy kind to prioritise
    thread: 0.35,        // 0 = centre of a gap, 1 = on the edge
    dodge: true,
    lookahead: 2.4,      // seconds of barrier look-ahead
    gain: 0.34,
    rate: 0.16,          // max stick change per frame
    xLimit: CORRIDOR_HALF - 1,
    ...options,
  };
  let ix = 0, iy = 0;
  let mode = 'home';

  function barrierAhead(p) {
    const feats = game.level.features;
    const reach = Math.max(60, p.speed * o.lookahead);
    for (let i = game._hudCursor ?? 0; i < feats.length; i++) {
      const f = feats[i];
      if (f.z < p.pos.z - 3) continue;
      if (f.z > p.pos.z + reach) break;
      if (f.kind === 'wall' || f.kind === 'gate' || f.kind === 'arch' || f.kind === 'fence') return f;
      // free-floating gun platforms (16 wide, 2.4 thick): only when in our lane
      if (f.kind === 'platform' && Math.abs(f.x - p.pos.x) < 8 + p.radius + 1.5) return f;
    }
    return null;
  }

  // A point inside [lo, hi], pushed toward the edge nearest `cur` by `thread`.
  const edge = (lo, hi, cur, margin) => {
    const mid = (lo + hi) / 2, half = Math.max(0, (hi - lo) / 2 - margin);
    const dir = cur >= mid ? 1 : -1;
    return mid + dir * half * o.thread;
  };

  function throughBarrier(f, p, want) {
    const m = p.radius * 0.72 + 0.6;
    if (f.kind === 'wall') {
      if (f.type === 'pillars') {
        const xs = f.gaps.map(g => [g.x - g.w / 2, g.x + g.w / 2]).sort((a, b) => a[0] - b[0]);
        let best = want.x, bestD = 1e9;
        for (let k = 0; k < xs.length - 1; k++) {
          const lo = xs[k][1], hi = xs[k + 1][0];
          const mid = (lo + hi) / 2;
          if (Math.abs(mid) > CORRIDOR_HALF - 1 || hi - lo < m * 2) continue;
          const d = Math.abs(mid - p.pos.x);
          if (d < bestD) { bestD = d; best = mid; }
        }
        want.x = best;
      } else {
        const g = f.gaps[0];
        const top = Math.min(g.y + g.h, ALT_MAX);
        if (f.type !== 'notch') want.y = edge(g.y, top, p.pos.y, m);
        if (f.type === 'notch' || f.type === 'window') want.x = clamp(edge(g.x - g.w / 2, g.x + g.w / 2, p.pos.x, m), -o.xLimit, o.xLimit);
      }
    } else if (f.kind === 'gate' && f.runtime) {
      want.y = edge(f.runtime.gapY, f.runtime.gapY + f.runtime.gapH, p.pos.y, m + 0.4);
    } else if (f.kind === 'arch') {
      want.y = clamp(f.clearance * 0.36, ALT_MIN + 0.8, f.clearance - m);
    } else if (f.kind === 'platform') {
      const over = f.y + 2.4 + m + 0.6, under = f.y - m - 0.6;
      const goOver = under < ALT_MIN + 0.5 || p.pos.y > f.y + 1.2;
      want.y = goOver ? Math.max(want.y, over) : Math.min(want.y, under);
    } else if (f.kind === 'fence') {
      const under = f.y - m - 0.4, over = f.y + f.band + m + 0.4;
      const goOver = under < ALT_MIN + 0.5 || (over < ALT_MAX - 1 && Math.abs(p.pos.y - over) < Math.abs(p.pos.y - under));
      want.y = goOver ? over : under;
    }
  }

  function pickTarget(p) {
    let target = null, best = 1e9;
    for (const e of game.enemies) {
      if (!e.alive || e.kind === 'mine') continue;
      const dz = e.pos.z - p.pos.z;
      if (dz < 10 || dz > 120 || Math.abs(e.pos.x) > CORRIDOR_HALF + 1) continue;
      const score = dz + Math.abs(e.pos.x - p.pos.x) * 1.5 - (o.prefer && e.kind === o.prefer ? 60 : 0);
      if (score < best) { best = score; target = e; }
    }
    if (target) return { x: target.pos.x, y: target.pos.y + target.radius * 0.4 + 0.1 };
    const b = game.boss;
    if (b?.alive && b.active) {
      const L = b.launcher;
      if (L?.charging) return { x: L.pos.x, y: L.pos.y };
      const pod = b.pods?.find(pp => pp.alive);
      if (pod) return { x: pod.pos.x, y: pod.pos.y };
      if (b.coreOpen > 0.55) { const v = b.coreGroup.getWorldPosition(b.pos.clone()); return { x: v.x, y: v.y }; }
    }
    return null;
  }

  function dodge(p, want, limit) {
    const pools = [game.projectiles.enemy, game.projectiles.missile];
    let pushX = 0, pushY = 0;
    for (const pool of pools) {
      for (let i = 0; i < pool.capacity; i++) {
        if (pool.life[i] <= 0) continue;
        const rx = pool.x[i] - want.x, ry = pool.y[i] - want.y, rz = pool.z[i] - p.pos.z;
        if (rz < -6 || rz > 140) continue;
        const vx = pool.vx[i], vy = pool.vy[i], vz = pool.vz[i] - p.speed;
        const vv = vx * vx + vy * vy + vz * vz;
        if (vv < 1e-4) continue;
        const t = clamp(-(rx * vx + ry * vy + rz * vz) / vv, 0, 0.9);
        const cx = rx + vx * t, cy = ry + vy * t, cz = rz + vz * t;
        const d = Math.hypot(cx, cy, cz);
        const danger = pool.radius[i] + p.radius + 1.1;
        if (d >= danger) continue;
        const k = (danger - d) * 1.6 + 0.8;
        const len = Math.hypot(cx, cy) || 1;
        // Move away from where the bolt will be (in the screen plane).
        pushX -= cx / len * k; pushY -= cy / len * k;
      }
    }
    const m = Math.hypot(pushX, pushY);
    if (m > limit) { pushX *= limit / m; pushY *= limit / m; }
    want.x += pushX; want.y += pushY;
  }

  return {
    opts: o,
    get mode() { return mode; },
    set(next) { Object.assign(o, next); },
    input() {
      const p = game.player;
      const want = { x: o.hold?.x ?? o.home.x, y: o.hold?.y ?? o.home.y };
      mode = o.hold ? 'hold' : 'home';
      if (!o.hold && o.targets) {
        const t = pickTarget(p);
        if (t) { want.x = clamp(t.x, -o.xLimit, o.xLimit); want.y = clamp(t.y, ALT_MIN + 0.4, ALT_MAX - 1); mode = 'target'; }
      }
      const f = barrierAhead(p);
      let dodgeLimit = 7;
      if (f) {
        throughBarrier(f, p, want); mode = 'barrier';
        const tta = (f.z - p.pos.z) / Math.max(1, p.speed);
        dodgeLimit = clamp((tta - 0.35) * 5, 0, 7);
      }
      if (o.dodge) dodge(p, want, dodgeLimit);
      want.x = clamp(want.x, -o.xLimit, o.xLimit);
      want.y = clamp(want.y, ALT_MIN + 0.3, ALT_MAX - 0.5);
      const tx = clamp((p.pos.x - want.x) * o.gain, -1, 1);
      const ty = clamp((want.y - p.pos.y) * o.gain, -1, 1);
      ix += clamp(tx - ix, -o.rate, o.rate);
      iy += clamp(ty - iy, -o.rate, o.rate);
      const fire = o.fire === 'auto' ? !!p.target : !!o.fire;
      return { moveX: ix, moveY: iy, fire, boost: !!o.boost, want };
    },
  };
}
