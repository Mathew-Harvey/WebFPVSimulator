/*
 * frame.js: Hinode Park's plan frame, its chunks and the builder every part
 * of the park is written with. Pure data and arithmetic, no Three.js and no
 * JS trigonometry, so the solids can be built and checked in plain Node, as
 * Sunnyfield's are (../sunny/frame.js, whose builder this is, with the
 * park's plot, its chunks and one shape more).
 *
 * THE PLAN'S FRAME is the document's: px east, py north, h up, metres, the
 * origin at the plot's south west corner, life size (a five inch map). The
 * plot is W by D: the park itself in the middle, the lane round it, and a
 * row of the neighbourhood's houses, flats and shops across the lane. The
 * world is the built map's (../built/place.js docToWorld): x = px - W / 2,
 * y = h, z = D / 2 - py.
 *
 * THE CHUNKS. The built map culls by chunk and bakes one batch per material
 * per chunk (../built/index.js), and its own 48 m chunks would cut the plot
 * into twenty. The park is cut in six, three across and two up, about 87 by
 * 100 m each, and the map hands that cut to the pipeline (chunkOf). Fewer,
 * bigger chunks is fewer draw calls for the same triangles; the frustum
 * still drops the ones behind the camera.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { Parts } from '../../props/parts.js';

/* The plot, metres. */
export const W = 260;
export const D = 200;

export const wx = (px) => px - W / 2;
export const wz = (py) => D / 2 - py;

/* A plan point as the world's [x, y, z]. */
export function worldAt(px, py, h = 0) {
  return [wx(px), h, wz(py)];
}

/* The chunk a world point is filed under: three across, two up. */
const COLS = [87, 174];
const ROW = 100;
export function chunkOf(x, z) {
  const px = x + W / 2;
  const py = D / 2 - z;
  const c = px < COLS[0] ? 0 : px < COLS[1] ? 1 : 2;
  const r = py < ROW ? 0 : 1;
  return `pk${c}${r}`;
}

/* The near cell a piece of set dressing is filed under, six across and
 * four up: about 43 m by 50, so ./index.js can switch the dressing off by
 * range while the chunk it stands in stays on. Each cell is one draw once
 * the palette is merged (../sunny/palette.js). */
const NEAR_COLS = 6;
const NEAR_ROWS = 4;
export function nearOf(x, z) {
  const px = x + W / 2;
  const py = D / 2 - z;
  const c = Math.min(NEAR_COLS - 1, Math.max(0, Math.floor((px / W) * NEAR_COLS)));
  const r = Math.min(NEAR_ROWS - 1, Math.max(0, Math.floor((py / D) * NEAR_ROWS)));
  return `pn${c}${r}`;
}

/*
 * A SEEDED RANDOM, integer arithmetic only (Math.imul is exact), so every
 * bench and stone rolls the same on every engine: mulberry32.
 */
export function rng(seed) {
  let a = (seed | 0) ^ 0x9e3779b9;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
  };
}

/*
 * THE BUILDER, Sunnyfield's (../sunny/frame.js has the long account of
 * each list): parts land in one Parts list in the world frame, and what a
 * box cannot say goes in a list for ./index.js to draw: prisms, cyls,
 * discs, tori, cones, balls, signs, scaled assets, frusta and wires, and
 * one the park adds:
 *
 *   polys    a level slab whose plan outline is any polygon: the pond, the
 *            infield's arc, a gravel path's bend. Drawn only.
 *
 * `fine` on anything drawn marks detail the Low preset leaves out; a solid
 * is never fine, so the physics is the same on every preset. Whatever is
 * drawn and not solid inside `dress(fn)` is set dressing: fine, and near,
 * drawn in cells ./index.js switches off by range. Inside `wide(fn)` it is
 * fine but drawn at every range, for paint on the ground.
 */
export class Park {
  constructor() {
    this.P = new Parts();
    this.prisms = [];
    this.cyls = [];
    this.discs = [];
    this.tori = [];
    this.cones = [];
    this.balls = [];
    this.signs = [];
    this.scaled = [];
    this.frusta = [];
    this.wires = [];
    this.polys = [];
    this.taken = [];
    this.dressing = false;
    this.widening = false;
  }

  take(px, py, r) {
    this.taken.push({ u: px, v: py, r });
  }

  /* Whether a plan circle is clear of everything taken. */
  clear(px, py, r) {
    for (const t of this.taken) {
      const dx = t.u - px;
      const dy = t.v - py;
      const rr = t.r + r;
      if (dx * dx + dy * dy < rr * rr) {
        return false;
      }
    }
    return true;
  }

  dress(fn) {
    const was = this.dressing;
    this.dressing = true;
    try {
      fn();
    } finally {
      this.dressing = was;
    }
  }

  wide(fn) {
    const was = this.widening;
    this.widening = true;
    try {
      fn();
    } finally {
      this.widening = was;
    }
  }

  get near() {
    return this.dressing && !this.widening;
  }

  mark(p, fine) {
    if (p && (fine || (this.dressing && !p.solid))) {
      p.fine = true;
    }
    if (p && this.near && !p.solid && p.draw) {
      p.near = true;
    }
    return p;
  }

  soft(opts) {
    return this.dressing && opts.solid === undefined && opts.draw !== false ? { ...opts, solid: false } : opts;
  }

  box(m, px0, py0, h0, px1, py1, h1, opts = {}) {
    const o = this.soft(opts);
    return this.mark(this.P.box(m, wx(px0), h0, wz(py0), wx(px1), h1, wz(py1), o), o.fine);
  }

  /* Drawn, not solid, and casting no shadow: paint, a line, a flat. */
  paint(m, px0, py0, h0, px1, py1, h1, fine = false) {
    return this.box(m, px0, py0, h0, px1, py1, h1, { solid: false, cast: false, fine });
  }

  /* Drawn, not solid, casting: a small thing a quad would brush through. */
  deco(m, px0, py0, h0, px1, py1, h1, fine = false) {
    return this.box(m, px0, py0, h0, px1, py1, h1, { solid: false, fine });
  }

  /* Solid and not drawn. */
  hidden(px0, py0, h0, px1, py1, h1, kind = 'wall', name = 'hidden') {
    return this.box('pkConcrete', px0, py0, h0, px1, py1, h1, { draw: false, kind, name });
  }

  cap(m, a, b, r, opts = {}) {
    const o = this.soft(opts);
    return this.mark(this.P.cap(m, worldAt(a[0], a[1], a[2]), worldAt(b[0], b[1], b[2]), r, o), o.fine);
  }

  post(m, px, py, h0, h1, r, opts = {}) {
    return this.cap(m, [px, py, h0], [px, py, h1], r, opts);
  }

  /* A profile of [a, h] extruded along a plan axis: along 'x' the profile's
   * a is py and it runs from px e0 to e1; along 'y' its a is px and it runs
   * from py e0 to e1. */
  prism(m, axis, profile, e0, e1, fine = false) {
    this.prisms.push({ m, axis, profile, e0, e1, fine: fine || this.dressing, near: this.near });
  }

  cyl(m, a, b, r, seg = 8, rTop = null, fine = false) {
    this.cyls.push({ m, a: worldAt(a[0], a[1], a[2]), b: worldAt(b[0], b[1], b[2]), r, seg, rTop, fine: fine || this.dressing, near: this.near });
  }

  disc(m, px, py, r, h0, h1, seg = 24, fine = false) {
    this.discs.push({ m, px, py, r, h0, h1, seg, fine: fine || this.dressing, near: this.near });
  }

  /* A ring, its middle h up, its axis along the plan's (nx, ny), or
   * straight up when both are 0; tube t, `seg` round the tube and `round`
   * round the ring. */
  torus(m, px, py, h, R, t, nx, ny, seg = 8, round = 24, scale = null) {
    this.tori.push({ m, px, py, h, R, t, nx, ny, seg, round, scale, fine: this.dressing, near: this.near });
  }

  cone(m, px, py, h, r, height, seg = 10, fine = false) {
    this.cones.push({ m, px, py, h, r, height, seg, fine: fine || this.dressing, near: this.near });
  }

  ball(m, px, py, h, r, fine = false) {
    this.balls.push({ m, px, py, h, r, fine: fine || this.dressing, near: this.near });
  }

  /* A ball of twenty faces, for what is small and many: a flower, a koi. */
  bead(m, px, py, h, r) {
    this.balls.push({ m, px, py, h, r, bead: true, fine: true, near: this.near });
  }

  /* A sign from the atlas on a plan face: 'n' faces north (+py), 's'
   * south, 'e' east, 'w' west, 'up' lies flat facing the sky. */
  sign(key, px, py, h, w, ht, face, lift = 0.02) {
    this.signs.push({ key, px, py, h, w, ht, face, lift });
  }

  wire(m, a, b, sag, r = 0.025) {
    this.wires.push({ m, a, b, sag, r });
  }

  asset(el, k, px, py, h, yaw) {
    this.scaled.push({ el, k, px, py, h, yaw });
    this.take(px, py, el.type === 'car' ? 2.4 : el.type === 'tree' ? 1.6 : 1.0);
  }

  frustum(m, o, h0, i, h1, fine = false) {
    this.frusta.push({ m, o, h0, i, h1, fine: fine || this.dressing, near: this.near });
  }

  /* A level slab over a plan polygon [[px, py], ...], counter clockwise,
   * from h0 to h1. Drawn only. */
  poly(m, pts, h0, h1, fine = false) {
    this.polys.push({ m, pts, h0, h1, fine: fine || this.dressing, near: this.near });
  }

  /* The solid under a frustum, as n stacked boxes each inside the slope. */
  frustumSolid(o, h0, i, h1, n, name, kind = 'wall') {
    for (let k = 0; k < n; k += 1) {
      const f = (k + 1) / n;
      const x0 = o.x0 + (i.x0 - o.x0) * f;
      const x1 = o.x1 + (i.x1 - o.x1) * f;
      const y0 = o.y0 + (i.y0 - o.y0) * f;
      const y1 = o.y1 + (i.y1 - o.y1) * f;
      this.hidden(x0, y0, h0 + ((h1 - h0) * k) / n, x1, y1, h0 + (h1 - h0) * f, kind, name);
    }
  }
}

/*
 * A FRAME OF ITS OWN for a thing written once and stood facing any of the
 * four ways, as Sunnyfield's lotFrame: u across, v back, h up, the origin
 * at (ox, oy), `face` the way its front (v = 0) looks. Every map is a
 * quarter turn, so a box stays a box.
 */
export function faceFrame(T, ox, oy, face) {
  const at = {
    s: (u, v) => [ox + u, oy + v],
    n: (u, v) => [ox - u, oy - v],
    e: (u, v) => [ox - v, oy + u],
    w: (u, v) => [ox + v, oy - u],
  }[face];
  const turn = { s: ['s', 'e', 'n', 'w'], e: ['e', 'n', 'w', 's'], n: ['n', 'w', 's', 'e'], w: ['w', 's', 'e', 'n'] }[face];
  const faces = { front: turn[0], right: turn[1], back: turn[2], left: turn[3] };
  const uAlongX = face === 's' || face === 'n';
  const L = {
    at, faces, face,
    box(m, u0, v0, h0, u1, v1, h1, opts) {
      const [ax, ay] = at(u0, v0);
      const [bx, by] = at(u1, v1);
      return T.box(m, ax, ay, h0, bx, by, h1, opts);
    },
    paint(m, u0, v0, h0, u1, v1, h1, fine = false) {
      return L.box(m, u0, v0, h0, u1, v1, h1, { solid: false, cast: false, fine });
    },
    deco(m, u0, v0, h0, u1, v1, h1, fine = false) {
      return L.box(m, u0, v0, h0, u1, v1, h1, { solid: false, fine });
    },
    hidden(u0, v0, h0, u1, v1, h1, kind = 'wall', name = 'hidden') {
      const [ax, ay] = at(u0, v0);
      const [bx, by] = at(u1, v1);
      return T.hidden(ax, ay, h0, bx, by, h1, kind, name);
    },
    post(m, u, v, h0, h1, r, opts) {
      const [px, py] = at(u, v);
      return T.post(m, px, py, h0, h1, r, opts);
    },
    cap(m, a, b, r, opts) {
      const [ax, ay] = at(a[0], a[1]);
      const [bx, by] = at(b[0], b[1]);
      return T.cap(m, [ax, ay, a[2]], [bx, by, b[2]], r, opts);
    },
    cyl(m, a, b, r, seg, rTop, fine) {
      const [ax, ay] = at(a[0], a[1]);
      const [bx, by] = at(b[0], b[1]);
      T.cyl(m, [ax, ay, a[2]], [bx, by, b[2]], r, seg, rTop, fine);
    },
    disc(m, u, v, r, h0, h1, seg, fine) {
      const [px, py] = at(u, v);
      T.disc(m, px, py, r, h0, h1, seg, fine);
    },
    ball(m, u, v, h, r, fine) {
      const [px, py] = at(u, v);
      T.ball(m, px, py, h, r, fine);
    },
    bead(m, u, v, h, r) {
      const [px, py] = at(u, v);
      T.bead(m, px, py, h, r);
    },
    cone(m, u, v, h, r, height, seg, fine) {
      const [px, py] = at(u, v);
      T.cone(m, px, py, h, r, height, seg, fine);
    },
    /* A ring whose axis is the local direction (du, dv), or flat. */
    ring(m, u, v, h, R, t, du, dv, seg, round) {
      const [px, py] = at(u, v);
      if (du === 0 && dv === 0) {
        T.torus(m, px, py, h, R, t, 0, 0, seg, round);
        return;
      }
      const [qx, qy] = at(u + du, v + dv);
      T.torus(m, px, py, h, R, t, qx - px, qy - py, seg, round);
    },
    /* A profile over v, extruded along u: a roof whose ridge runs across. */
    prismAlong(m, profile, u0, u1, fine) {
      const ends = [at(u0, 0), at(u1, 0)];
      if (uAlongX) {
        T.prism(m, 'x', profile.map(([v, h]) => [at(0, v)[1], h]), Math.min(ends[0][0], ends[1][0]), Math.max(ends[0][0], ends[1][0]), fine);
      } else {
        T.prism(m, 'y', profile.map(([v, h]) => [at(0, v)[0], h]), Math.min(ends[0][1], ends[1][1]), Math.max(ends[0][1], ends[1][1]), fine);
      }
    },
    /* A profile over u, extruded along v: a gable that faces the front. */
    prismAcross(m, profile, v0, v1, fine) {
      const ends = [at(0, v0), at(0, v1)];
      if (uAlongX) {
        T.prism(m, 'y', profile.map(([u, h]) => [at(u, 0)[0], h]), Math.min(ends[0][1], ends[1][1]), Math.max(ends[0][1], ends[1][1]), fine);
      } else {
        T.prism(m, 'x', profile.map(([u, h]) => [at(u, 0)[1], h]), Math.min(ends[0][0], ends[1][0]), Math.max(ends[0][0], ends[1][0]), fine);
      }
    },
    sign(key, u, v, h, w, ht, side, lift) {
      const [px, py] = at(u, v);
      T.sign(key, px, py, h, w, ht, faces[side], lift);
    },
    asset(el, k, u, v, h, yawLocal) {
      const [px, py] = at(u, v);
      T.asset(el, k, px, py, h, FACE_YAW[face] + yawLocal);
    },
  };
  return L;
}

/* The heading, radians counter clockwise from east, a front looks. */
export const FACE_YAW = { e: 0, n: Math.PI / 2, w: Math.PI, s: -Math.PI / 2 };
