/*
 * frame.js: Hotaru Valley's plan frame, its chunks and the builder every
 * part of the valley is written with. Pure data and arithmetic, no
 * Three.js and no JS trigonometry, so the solids can be built and checked
 * in plain Node, the way ../sunny/frame.js is, whose builder this is with
 * the valley's frame and materials.
 *
 * THE PLAN'S FRAME is the document's: px east, py north, h up, metres, the
 * origin at the plot's south west corner, life size (a five inch map). The
 * plot is W by D. The world is the built map's (../built/place.js
 * docToWorld): x = px - W / 2, y = h, z = D / 2 - py. North is up the
 * valley, toward the mountains the river comes out of; south is the bay.
 *
 * THE CHUNKS. The built map culls by chunk and bakes one batch per material
 * per chunk (../built/index.js). The valley is cut four across and three
 * up, 115 by 120 m each: a forest wants smaller cells than a town does,
 * because from inside the trees most of the valley is behind the camera,
 * and the frustum can only drop what is filed apart from what is seen.
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
export const W = 460;
export const D = 360;

export const wx = (px) => px - W / 2;
export const wz = (py) => D / 2 - py;

/* A plan point as the world's [x, y, z]. */
export function worldAt(px, py, h = 0) {
  return [wx(px), h, wz(py)];
}

/* The chunk a world point is filed under: four across, three up. Out past
 * the plot it is the nearest edge chunk's. */
const COLS = 4;
const ROWS = 3;
export function chunkOf(x, z) {
  const px = x + W / 2;
  const py = D / 2 - z;
  const c = Math.min(COLS - 1, Math.max(0, Math.floor((px / W) * COLS)));
  const r = Math.min(ROWS - 1, Math.max(0, Math.floor((py / D) * ROWS)));
  return `hv${c}${r}`;
}

/* The near cell a piece of set dressing is filed under, nine across and
 * seven up, about fifty metres square, so ./index.js can switch the
 * dressing off by range while the chunk it stands in stays on. */
const NEAR_COLS = 9;
const NEAR_ROWS = 7;
export function nearOf(x, z) {
  const px = x + W / 2;
  const py = D / 2 - z;
  const c = Math.min(NEAR_COLS - 1, Math.max(0, Math.floor((px / W) * NEAR_COLS)));
  const r = Math.min(NEAR_ROWS - 1, Math.max(0, Math.floor((py / D) * NEAR_ROWS)));
  return `hn${c}${r}`;
}

/*
 * A SEEDED RANDOM, integer arithmetic only (Math.imul is exact), so every
 * tree and every bundle of rice rolls the same on every engine: mulberry32.
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

/* A fixed integer hash of two integers to [0, 1). */
export function hash2(i, j) {
  let h = Math.imul(i + 0x1f3d, 0x9e3779b1) ^ Math.imul(j + 0x7a11, 0x85ebca77);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/*
 * THE BUILDER, Sunnyfield's (../sunny/frame.js Town), in the valley's
 * frame. Everything is added in plan terms and lands in one Parts list in
 * the world frame, plus what a box cannot say, for ./index.js to draw:
 *
 *   prisms   a profile extruded along a plan axis: a roof's slopes and its
 *            gables, a thatch slab, an arch's haunch
 *   cyls     a drawn cylinder between two plan points, optionally tapered
 *   discs    a level round slab: a well's ring, a lantern's cap
 *   cones    a cone standing up
 *   balls    a drawn sphere: a lamp, a float, a persimmon
 *   rods     a drawn box turned to any plan heading: a plank, a bamboo pole
 *            laid along a rack, an oar. Drawn only, never solid
 *   slabs    a plan polygon stood up: a hull, a bow
 *   frusta   a rectangle rising to a smaller one: a stone lantern's cap, a
 *            hipped roof
 *   wires    a cable hung between two plan points, sagging
 *   scaled   one of the kit's own assets (a pole, a vending machine, a
 *            kei truck), drawn by the kit; its solids join the parts
 *
 * `fine` on anything drawn marks detail the Low preset leaves out; a solid
 * is never fine, so the physics is the same on every preset. SET DRESSING
 * is whatever is drawn and not solid inside `dress(fn)`: fine, and `near`,
 * drawn in cells of its own that ./index.js switches off past a radius.
 */
export class Vale {
  constructor() {
    this.P = new Parts();
    this.prisms = [];
    this.cyls = [];
    this.discs = [];
    this.cones = [];
    this.balls = [];
    this.rods = [];
    this.slabs = [];
    this.frusta = [];
    this.wires = [];
    this.scaled = [];
    this.signs = [];
    this.dressing = false;
    this.widening = false;
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

  /* Inside `dress`, dressing that is fine and NOT near: drawn at every
   * range on High and Medium. What is fixed to a wall or painted on the
   * ground, which is seen appearing where a bucket is not. */
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

  /* Drawn, not solid, casting no shadow: paint, a line, a flat. */
  paint(m, px0, py0, h0, px1, py1, h1, fine = false) {
    return this.box(m, px0, py0, h0, px1, py1, h1, { solid: false, cast: false, fine });
  }

  /* Drawn, not solid, casting: a small thing a quad brushes through. */
  deco(m, px0, py0, h0, px1, py1, h1, fine = false) {
    return this.box(m, px0, py0, h0, px1, py1, h1, { solid: false, fine });
  }

  /* Solid and not drawn. */
  hidden(px0, py0, h0, px1, py1, h1, kind = 'wall', name = 'hidden') {
    return this.box('hvStone', px0, py0, h0, px1, py1, h1, { draw: false, kind, name });
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

  disc(m, px, py, r, h0, h1, seg = 16, fine = false) {
    this.discs.push({ m, px, py, r, h0, h1, seg, fine: fine || this.dressing, near: this.near });
  }

  cone(m, px, py, h, r, height, seg = 8, fine = false) {
    this.cones.push({ m, px, py, h, r, height, seg, fine: fine || this.dressing, near: this.near });
  }

  ball(m, px, py, h, r, fine = false) {
    this.balls.push({ m, px, py, h, r, fine: fine || this.dressing, near: this.near });
  }

  /* A ball of twenty faces: what is small and many, a persimmon, a float. */
  bead(m, px, py, h, r) {
    this.balls.push({ m, px, py, h, r, bead: true, fine: true, near: this.near });
  }

  /* A box w by t in section, from plan point a to b ([px, py, h] each),
   * turned to the run: a plank, a pole laid in a rack, a beam on a slant.
   * Drawn only. `up` true stands its t across the run and its w up. */
  rod(m, a, b, w, t, fine = false) {
    this.rods.push({ m, a: worldAt(a[0], a[1], a[2]), b: worldAt(b[0], b[1], b[2]), w, t, fine: fine || this.dressing, near: this.near });
  }

  /* A plan polygon ([[px, py], ...], counter clockwise seen from above)
   * stood up from h0 to h1: a boat's hull, a bow, a pier's end. Drawn
   * only; its solid is the caller's. */
  slab(m, pts, h0, h1, fine = false) {
    this.slabs.push({ m, pts, h0, h1, fine: fine || this.dressing, near: this.near });
  }

  frustum(m, o, h0, i, h1, fine = false) {
    this.frusta.push({ m, o, h0, i, h1, fine: fine || this.dressing, near: this.near });
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

  /* A cable from a to b, plan [px, py, h], hanging `sag` at its middle. */
  wire(m, a, b, sag, r = 0.03) {
    this.wires.push({ m, a, b, sag, r });
  }

  /* A sign from ./signs.js's atlas on a plan face: 'n', 's', 'e', 'w'.
   * (px, py, h) its middle, w across, ht up. */
  sign(key, px, py, h, w, ht, face, lift = 0.02) {
    this.signs.push({ key, px, py, h, w, ht, face, lift });
  }

  asset(el, k, px, py, h, yaw) {
    this.scaled.push({ el, k, px, py, h, yaw });
  }
}

/*
 * A BUILDING'S OWN FRAME, so a house is written once and stood facing any
 * of the four ways. u runs along the front, v back from it, h up; the
 * origin is the front's corner on the u = 0 side, at `base` up. `face` is
 * the way the front looks: 's' looks south, so v runs north, and so on.
 * Every one is a quarter turn, so a box stays a box. Sunnyfield's lot frame
 * (../sunny/frame.js lotFrame), cut to what the valley's buildings use.
 */
export function lotFrame(T, lot) {
  const { x0, x1, y0, y1, face } = lot;
  const base = lot.base ?? 0;
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
  const uAlongX = face === 's' || face === 'n';
  const turn = { s: ['s', 'e', 'n', 'w'], e: ['e', 'n', 'w', 's'], n: ['n', 'w', 's', 'e'], w: ['w', 's', 'e', 'n'] }[face];
  const faces = { front: turn[0], right: turn[1], back: turn[2], left: turn[3] };
  const L = {
    width, depth, face, faces, at, uAlongX, base,
    box(m, u0, v0, h0, u1, v1, h1, opts) {
      const [ax, ay] = at(u0, v0);
      const [bx, by] = at(u1, v1);
      return T.box(m, ax, ay, base + h0, bx, by, base + h1, opts);
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
      return T.hidden(ax, ay, base + h0, bx, by, base + h1, kind, name);
    },
    post(m, u, v, h0, h1, r, opts) {
      const [px, py] = at(u, v);
      return T.post(m, px, py, base + h0, base + h1, r, opts);
    },
    cap(m, a, b, r, opts) {
      const [ax, ay] = at(a[0], a[1]);
      const [bx, by] = at(b[0], b[1]);
      return T.cap(m, [ax, ay, base + a[2]], [bx, by, base + b[2]], r, opts);
    },
    cyl(m, a, b, r, seg, rTop, fine) {
      const [ax, ay] = at(a[0], a[1]);
      const [bx, by] = at(b[0], b[1]);
      T.cyl(m, [ax, ay, base + a[2]], [bx, by, base + b[2]], r, seg, rTop, fine);
    },
    rod(m, a, b, w, t, fine) {
      const [ax, ay] = at(a[0], a[1]);
      const [bx, by] = at(b[0], b[1]);
      T.rod(m, [ax, ay, base + a[2]], [bx, by, base + b[2]], w, t, fine);
    },
    disc(m, u, v, r, h0, h1, seg, fine) {
      const [px, py] = at(u, v);
      T.disc(m, px, py, r, base + h0, base + h1, seg, fine);
    },
    ball(m, u, v, h, r, fine) {
      const [px, py] = at(u, v);
      T.ball(m, px, py, base + h, r, fine);
    },
    bead(m, u, v, h, r) {
      const [px, py] = at(u, v);
      T.bead(m, px, py, base + h, r);
    },
    cone(m, u, v, h, r, height, seg, fine) {
      const [px, py] = at(u, v);
      T.cone(m, px, py, base + h, r, height, seg, fine);
    },
    /* A profile over v, extruded along u from u0 to u1: a roof whose ridge
     * runs along the front. */
    prismAlong(m, profile, u0, u1, fine) {
      const ends = [at(u0, 0), at(u1, 0)];
      if (uAlongX) {
        T.prism(m, 'x', profile.map(([v, h]) => [at(0, v)[1], base + h]), Math.min(ends[0][0], ends[1][0]), Math.max(ends[0][0], ends[1][0]), fine);
      } else {
        T.prism(m, 'y', profile.map(([v, h]) => [at(0, v)[0], base + h]), Math.min(ends[0][1], ends[1][1]), Math.max(ends[0][1], ends[1][1]), fine);
      }
    },
    /* A profile over u, extruded along v from v0 to v1: a gable that faces
     * the front. */
    prismAcross(m, profile, v0, v1, fine) {
      const ends = [at(0, v0), at(0, v1)];
      if (uAlongX) {
        T.prism(m, 'y', profile.map(([u, h]) => [at(u, 0)[0], base + h]), Math.min(ends[0][1], ends[1][1]), Math.max(ends[0][1], ends[1][1]), fine);
      } else {
        T.prism(m, 'x', profile.map(([u, h]) => [at(u, 0)[1], base + h]), Math.min(ends[0][0], ends[1][0]), Math.max(ends[0][0], ends[1][0]), fine);
      }
    },
    sign(key, u, v, h, w, ht, side, lift) {
      const [px, py] = at(u, v);
      T.sign(key, px, py, base + h, w, ht, faces[side], lift);
    },
  };
  return L;
}
