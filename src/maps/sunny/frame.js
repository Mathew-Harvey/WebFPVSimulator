/*
 * frame.js: Sunnyfield's plan frame, its chunks and the builder every part
 * of the town is written with. Pure data and arithmetic, no Three.js and no
 * JS trigonometry, so the solids can be built and checked in plain Node, the
 * way ../bardwell/bardwell.js is.
 *
 * THE PLAN'S FRAME is the document's: px east, py north, h up, metres, the
 * origin at the plot's south west corner, life size (a five inch map). The
 * plot is W by D. The world is the built map's (../built/place.js
 * docToWorld): x = px - W / 2, y = h, z = D / 2 - py.
 *
 * THE CHUNKS. The built map culls by chunk and bakes one batch per material
 * per chunk (../built/index.js). Its own 48 m chunks would cut a 400 m town
 * into fifty four, and with the whole town inside the fog on High that is
 * fifty four times every colour in view. So the town is cut in six, three
 * across and two up, about 133 by 140 m each, and the map hands that cut to
 * the pipeline (chunkOf), which files its document's assets and its own
 * structure by it. Fewer, bigger chunks is fewer draw calls for the same
 * triangles; the frustum still drops the ones behind the camera.
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
export const W = 400;
export const D = 280;

export const wx = (px) => px - W / 2;
export const wz = (py) => D / 2 - py;

/* A plan point as the world's [x, y, z]. */
export function worldAt(px, py, h = 0) {
  return [wx(px), h, wz(py)];
}

/* The chunk a world point is filed under: three across, two up. */
const COLS = [134, 267];
const ROW = 140;
export function chunkOf(x, z) {
  const px = x + W / 2;
  const py = D / 2 - z;
  const c = px < COLS[0] ? 0 : px < COLS[1] ? 1 : 2;
  const r = py < ROW ? 0 : 1;
  return `sf${c}${r}`;
}

/* The near cell a piece of set dressing is filed under, four across and
 * three up: a hundred metres by ninety three, so ./index.js can switch the
 * dressing off by range while the chunk it stands in stays on. Smaller
 * cells would cull closer and cost a draw or two more each; the town's
 * chunks themselves are too big to cull anything by, since from any one of
 * them the others are all within a long stone's throw. */
const NEAR_COLS = 4;
const NEAR_ROWS = 3;
export function nearOf(x, z) {
  const px = x + W / 2;
  const py = D / 2 - z;
  const c = Math.min(NEAR_COLS - 1, Math.max(0, Math.floor((px / W) * NEAR_COLS)));
  const r = Math.min(NEAR_ROWS - 1, Math.max(0, Math.floor((py / D) * NEAR_ROWS)));
  return `sn${c}${r}`;
}

/*
 * A SEEDED RANDOM, integer arithmetic only (Math.imul is exact), so every
 * house rolls the same on every engine: mulberry32.
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
 * THE BUILDER. Everything is added in plan terms and lands in one Parts list
 * in the world frame, plus what a box cannot say, for ./index.js to draw:
 *
 *   prisms   a profile extruded along a plan axis: roof slopes and gables,
 *            a ramp, an awning
 *   cyls     a drawn cylinder between two plan points, optionally tapered
 *   discs    a level round slab: a pool, a manhole, the cul-de-sac
 *   shells   an open tapered tube on a vertical axis, the cooling towers
 *   tori     a ring on any plan heading: the donut, a hoop
 *   cones    a cone standing up
 *   balls    a drawn sphere: a lamp globe, a ball on a post
 *   signs    a painted plate from the sign atlas (./signs.js)
 *   scaled   one of the town's own assets, trees and cars, drawn by the kit
 *            at a scale; its solids join the parts (scaledParts in ./plan.js)
 *   frusta   a rectangle rising to a smaller one: the hill's banks, a
 *            hipped roof, a junk mound's
 *   wires    a cable hung between two plan points, sagging: the utility
 *            poles' lines. Drawn only, never solid, as the builder's are
 *
 * `fine` on anything drawn marks detail the Low preset leaves out; a solid is
 * never fine, so the physics is the same on every preset.
 *
 * SET DRESSING is whatever is drawn and not solid inside `dress(fn)`: the
 * clutter of yards, roofs and pavements that makes the town a place. It is
 * fine, so Low leaves it out, and `near`, so ./index.js draws it in cells of
 * its own that it switches off past NEAR_R from the camera: from across the
 * town it is a pixel or two, and drawing it there would be all cost. Inside
 * `dress` a box or a capsule is not solid unless it says so, so a garden
 * chair is a thing a quad brushes through and the flight is the same on
 * every preset. What a dressing does make solid is drawn as any other part,
 * on every preset and at every range, so a pilot never meets a wall that is
 * not drawn.
 */
export class Town {
  constructor() {
    this.P = new Parts();
    this.prisms = [];
    this.cyls = [];
    this.discs = [];
    this.shells = [];
    this.tori = [];
    this.cones = [];
    this.balls = [];
    this.signs = [];
    this.scaled = [];
    this.frusta = [];
    this.wires = [];
    this.dressing = false;
  }

  /* Everything drawn and not solid that fn writes is set dressing. */
  dress(fn) {
    const was = this.dressing;
    this.dressing = true;
    try {
      fn();
    } finally {
      this.dressing = was;
    }
  }

  /* A drawn part's flags: fine if asked, and fine and near if it is set
   * dressing. */
  mark(p, fine) {
    if (p && (fine || (this.dressing && !p.solid))) {
      p.fine = true;
    }
    if (p && this.dressing && !p.solid && p.draw) {
      p.near = true;
    }
    return p;
  }

  /* Inside `dress`, drawn and not solid unless the caller says solid. */
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

  /* Drawn, not solid, casting: a small thing a quad would brush through,
   * or a piece of a shape whose solid is somebody else's box. */
  deco(m, px0, py0, h0, px1, py1, h1, fine = false) {
    return this.box(m, px0, py0, h0, px1, py1, h1, { solid: false, fine });
  }

  /* Solid and not drawn. */
  hidden(px0, py0, h0, px1, py1, h1, kind = 'wall', name = 'hidden') {
    return this.box('sfConcrete', px0, py0, h0, px1, py1, h1, { draw: false, kind, name });
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
    this.prisms.push({ m, axis, profile, e0, e1, fine: fine || this.dressing, near: this.dressing });
  }

  cyl(m, a, b, r, seg = 8, rTop = null, fine = false) {
    this.cyls.push({ m, a: worldAt(a[0], a[1], a[2]), b: worldAt(b[0], b[1], b[2]), r, seg, rTop, fine: fine || this.dressing, near: this.dressing });
  }

  disc(m, px, py, r, h0, h1, seg = 24, fine = false) {
    this.discs.push({ m, px, py, r, h0, h1, seg, fine: fine || this.dressing, near: this.dressing });
  }

  /* An open tube round (px, py) from y0, r0 round, to y1, r1 round; inward
   * turns it inside out, so its face is seen from the middle; arc, if
   * given, [a0, a1] radians from +x toward +z, as the kit counts. */
  shell(m, px, py, y0, y1, r0, r1, inward = false, arc = null, seg = 48) {
    this.shells.push({ m, px, py, y0, y1, r0, r1, inward, arc, seg });
  }

  /* A ring standing on edge, its middle h up, its axis along the plan's
   * (nx, ny); tube t, `seg` round the tube and `round` round the ring. */
  torus(m, px, py, h, R, t, nx, ny, seg = 10, round = 32, scale = null) {
    this.tori.push({ m, px, py, h, R, t, nx, ny, seg, round, scale, fine: this.dressing, near: this.dressing });
  }

  cone(m, px, py, h, r, height, seg = 10, fine = false) {
    this.cones.push({ m, px, py, h, r, height, seg, fine: fine || this.dressing, near: this.dressing });
  }

  ball(m, px, py, h, r, fine = false) {
    this.balls.push({ m, px, py, h, r, fine: fine || this.dressing, near: this.dressing });
  }

  /* A ball of twenty faces rather than eighty, for what is small and many:
   * a flower, a tomato, a duck's head. */
  bead(m, px, py, h, r) {
    this.balls.push({ m, px, py, h, r, bead: true, fine: true, near: this.dressing });
  }

  /* A sign from the atlas on a plan face: 'n' faces north (+py), 's'
   * south, 'e' east, 'w' west, 'up' lies flat facing the sky. (px, py, h) is
   * its middle; w across, ht up. */
  sign(key, px, py, h, w, ht, face, lift = 0.02) {
    this.signs.push({ key, px, py, h, w, ht, face, lift });
  }

  /* A sign wrapped round a vertical drum: centred on (px, py), `r` out,
   * its middle at h up and at plan heading `a` (radians from east toward
   * north); w along the curve, ht up. */
  roundSign(key, px, py, h, r, a, w, ht, lift = 0.03) {
    this.signs.push({ key, px, py, h, w, ht, face: 'round', r, a, lift });
  }

  /* A cable from a to b, plan [px, py, h], hanging `sag` metres at its
   * middle, `r` thick. */
  wire(m, a, b, sag, r = 0.03) {
    this.wires.push({ m, a, b, sag, r });
  }

  asset(el, k, px, py, h, yaw) {
    this.scaled.push({ el, k, px, py, h, yaw });
  }

  /* A bank or a hipped roof: a closed solid from the plan rectangle `o`
   * ({ x0, y0, x1, y1 }) at h0 up to the rectangle `i` at h1, its four
   * faces sloped, its top flat. Drawn only: its solid is the caller's. */
  frustum(m, o, h0, i, h1, fine = false) {
    this.frusta.push({ m, o, h0, i, h1, fine: fine || this.dressing, near: this.dressing });
  }

  /* The solid under a frustum, as n stacked boxes each inside the slope:
   * the box of step k stands to the height the slope reaches at its edge,
   * so nothing solid is where nothing is drawn. `name` for the audit. */
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
 * A LOT'S OWN FRAME, so a house is written once and stood facing any of the
 * four streets. u runs along the frontage, v back from the street, h up;
 * the origin is the lot's front corner on the u = 0 side. `face` is the way
 * the house looks, which is toward its street: 's' looks south, so v runs
 * north, and so on. Every map is a quarter turn, so a box stays a box.
 */
export function lotFrame(T, lot) {
  const { x0, x1, y0, y1, face } = lot;
  let at;
  if (face === 's') {
    at = (u, v) => [x0 + u, y0 + v];
  } else if (face === 'n') {
    at = (u, v) => [x1 - u, y1 - v];
  } else if (face === 'e') {
    at = (u, v) => [x1 - v, y0 + u];
  } else {
    at = (u, v) => [x0 + v, y1 - u];
  }
  const width = face === 's' || face === 'n' ? x1 - x0 : y1 - y0;
  const depth = face === 's' || face === 'n' ? y1 - y0 : x1 - x0;
  /* Along the frontage is plan x for a house looking north or south. */
  const uAlongX = face === 's' || face === 'n';
  /* The plan face a local face looks out of: the front (v = 0) looks the
   * lot's way; +u, -u and the back follow round. */
  const turn = { s: ['s', 'e', 'n', 'w'], e: ['e', 'n', 'w', 's'], n: ['n', 'w', 's', 'e'], w: ['w', 's', 'e', 'n'] }[face];
  const faces = { front: turn[0], right: turn[1], back: turn[2], left: turn[3] };
  const L = {
    width, depth, face, faces, at, uAlongX,
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
    /* A ring whose axis is the local direction (du, dv), or lying flat with
     * its axis up when both are 0. */
    ring(m, u, v, h, R, t, du, dv, seg, round) {
      const [px, py] = at(u, v);
      if (du === 0 && dv === 0) {
        T.torus(m, px, py, h, R, t, 0, 0, seg, round);
        return;
      }
      const [qx, qy] = at(u + du, v + dv);
      T.torus(m, px, py, h, R, t, qx - px, qy - py, seg, round);
    },
    cone(m, u, v, h, r, height, seg, fine) {
      const [px, py] = at(u, v);
      T.cone(m, px, py, h, r, height, seg, fine);
    },
    /* A profile over v, extruded along u from u0 to u1: a roof whose ridge
     * runs along the frontage. */
    prismAlong(m, profile, u0, u1, fine) {
      const ends = [at(u0, 0), at(u1, 0)];
      if (uAlongX) {
        T.prism(m, 'x', profile.map(([v, h]) => [at(0, v)[1], h]), Math.min(ends[0][0], ends[1][0]), Math.max(ends[0][0], ends[1][0]), fine);
      } else {
        T.prism(m, 'y', profile.map(([v, h]) => [at(0, v)[0], h]), Math.min(ends[0][1], ends[1][1]), Math.max(ends[0][1], ends[1][1]), fine);
      }
    },
    /* A profile over u, extruded along v from v0 to v1: a gable that faces
     * the street. */
    prismAcross(m, profile, v0, v1, fine) {
      const ends = [at(0, v0), at(0, v1)];
      if (uAlongX) {
        T.prism(m, 'y', profile.map(([u, h]) => [at(u, 0)[0], h]), Math.min(ends[0][1], ends[1][1]), Math.max(ends[0][1], ends[1][1]), fine);
      } else {
        T.prism(m, 'x', profile.map(([u, h]) => [at(u, 0)[1], h]), Math.min(ends[0][0], ends[1][0]), Math.max(ends[0][0], ends[1][0]), fine);
      }
    },
    /* A sign on a local face: 'front' (v = 0 side, looking at the street),
     * 'back', 'left' (u = 0 side) or 'right'. (u, v, h) is its middle. */
    sign(key, u, v, h, w, ht, side, lift) {
      const [px, py] = at(u, v);
      T.sign(key, px, py, h, w, ht, faces[side], lift);
    },
    asset(el, k, u, v, h, yawLocal) {
      const [px, py] = at(u, v);
      T.asset(el, k, px, py, h, yawLocal);
    },
  };
  return L;
}

/* The heading, radians counter clockwise from east, a lot's front looks. */
export const FACE_YAW = { e: 0, n: Math.PI / 2, w: Math.PI, s: -Math.PI / 2 };
