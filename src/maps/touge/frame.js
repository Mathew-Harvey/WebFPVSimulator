/*
 * frame.js: Momiji Pass's plan frame, its chunks, its seeded random and the
 * builder every solid and every drawn piece of the pass is written with.
 * Pure data and arithmetic, no Three.js and no JS trigonometry, so the
 * solids and the ground can be built and checked in plain Node
 * (scripts/touge-check.js).
 *
 * THE PLAN'S FRAME is the document's: px east, py north, h up, metres, the
 * origin at the plot's south west corner, life size (a five inch map). The
 * plot is W by D. The world is the built map's (../built/place.js
 * docToWorld): x = px - W / 2, y = h, z = D / 2 - py.
 *
 * THE CHUNKS. The built map culls by chunk and bakes one batch per material
 * per chunk (../built/index.js). A mountain side is seen whole from the
 * pass, so the plot is cut in nine, three by three, each about 153 m
 * square: fewer, bigger chunks is fewer draw calls for the same triangles,
 * and the frustum still drops the ones behind the camera. The ground
 * outside the plot, which only ever stands in the distance, is a tenth
 * chunk of its own.
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
export const D = 460;

export const wx = (px) => px - W / 2;
export const wz = (py) => D / 2 - py;
export const px = (x) => x + W / 2;
export const py = (z) => D / 2 - z;

/* A plan point as the world's [x, y, z]. */
export function worldAt(x, y, h = 0) {
  return [wx(x), h, wz(y)];
}

/* The chunk a world point is filed under: three by three over the plot, and
 * the far ground outside it. */
const CUT = W / 3;
export function chunkOf(x, z) {
  const a = x + W / 2;
  const b = D / 2 - z;
  if (a < -8 || b < -8 || a > W + 8 || b > D + 8) {
    return 'tgFar';
  }
  const c = a < CUT ? 0 : a < 2 * CUT ? 1 : 2;
  const r = b < CUT ? 0 : b < 2 * CUT ? 1 : 2;
  return `tg${c}${r}`;
}

/* The near cell a piece of small furniture is filed under, eight by eight
 * over the plot, so ./index.js can switch it off by range while the chunk
 * it stands in stays on: a delineator or a curve mirror is a pixel from
 * across the valley. */
const NEAR = 8;
export function nearOf(x, z) {
  const a = x + W / 2;
  const b = D / 2 - z;
  const c = Math.min(NEAR - 1, Math.max(0, Math.floor((a / W) * NEAR)));
  const r = Math.min(NEAR - 1, Math.max(0, Math.floor((b / D) * NEAR)));
  return `tn${c}${r}`;
}

/*
 * A SEEDED RANDOM, integer arithmetic only (Math.imul is exact), so every
 * tree and every rock rolls the same on every engine: mulberry32.
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
export function hash2(i, j, salt = 0) {
  let h = Math.imul(i + 0x632be5ab, 0x9e3779b1) ^ Math.imul(j + 0x3c6ef372, 0x85ebca77) ^ Math.imul(salt + 7, 0xc2b2ae3d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/*
 * THE BUILDER. Everything is added in plan terms and lands in one Parts
 * list in the world frame, plus what a box on the axes cannot say, for
 * ./index.js to draw:
 *
 *   turned   boxes in a frame of their own, stood at a plan point and
 *            turned to a heading: a guardrail's beam, a sign's plate, a
 *            delineator, anything that follows the road round a bend.
 *            Drawn only; what is solid of them is a capsule in the parts
 *   prisms   a profile extruded along a plan axis: roofs and gables
 *   cyls     a drawn cylinder between two plan points, maybe tapered
 *   cones    a cone standing up: a cedar's tiers, a lantern's cap
 *   balls    a drawn sphere
 *   leaves   a canopy clump, drawn by the kit's leaf (codedLeaf), so a
 *            maple inks as one shape as the town's trees do
 *   wires    a cable hung between two plan points, sagging
 *   signs    a painted plate from the sign atlas (./signs.js), at a plan
 *            point, facing a plan direction
 *   rails    a guardrail's beam along a run of road points
 *
 * Each drawn thing carries `fine` (Low leaves it out; never solid, so the
 * flight is the same on every preset) and `near` (small furniture, which
 * ./index.js files in a near cell and switches off by range).
 */
export class Build {
  constructor() {
    this.P = new Parts();
    this.turned = [];
    this.prisms = [];
    this.cyls = [];
    this.cones = [];
    this.balls = [];
    this.leaves = [];
    this.wires = [];
    this.signs = [];
    this.rails = [];
    this.small = false;
  }

  /* Everything drawn inside fn is small furniture: fine and near. */
  furniture(fn) {
    const was = this.small;
    this.small = true;
    try {
      fn();
    } finally {
      this.small = was;
    }
  }

  flags(o, fine) {
    o.fine = Boolean(fine || this.small);
    o.near = this.small;
    return o;
  }

  box(m, x0, y0, h0, x1, y1, h1, opts = {}) {
    const p = this.P.box(m, wx(x0), h0, wz(y0), wx(x1), h1, wz(y1), opts);
    if (p && (opts.fine || (this.small && !p.solid))) {
      p.fine = true;
    }
    if (p && this.small && !p.solid && p.draw) {
      p.near = true;
    }
    return p;
  }

  /* Drawn, not solid, casting no shadow: paint on a face. */
  paint(m, x0, y0, h0, x1, y1, h1, fine = false) {
    return this.box(m, x0, y0, h0, x1, y1, h1, { solid: false, cast: false, fine });
  }

  /* Drawn, not solid. */
  deco(m, x0, y0, h0, x1, y1, h1, fine = false) {
    return this.box(m, x0, y0, h0, x1, y1, h1, { solid: false, fine });
  }

  /* Solid, not drawn. */
  hidden(x0, y0, h0, x1, y1, h1, kind = 'wall', name = 'hidden') {
    return this.box('tgConcrete', x0, y0, h0, x1, y1, h1, { draw: false, kind, name });
  }

  cap(m, a, b, r, opts = {}) {
    return this.P.cap(m, worldAt(a[0], a[1], a[2]), worldAt(b[0], b[1], b[2]), r, opts);
  }

  post(m, x, y, h0, h1, r, opts = {}) {
    return this.cap(m, [x, y, h0], [x, y, h1], r, opts);
  }

  /* A box in its own frame: centred on plan (x, y) at height h, turned to
   * the plan direction `dir` ([tx, ty], unit), its local +u along it, +v to
   * its left, +h up. Drawn only. A direction, not an angle, so nothing here
   * takes a sine; ./index.js turns it into the kit's heading. */
  turn(m, x, y, h, dir, u0, v0, h0, u1, v1, h1, fine = false) {
    this.turned.push(this.flags({ m, x, y, h, dir, b: [u0, v0, h0, u1, v1, h1] }, fine));
  }

  /* A profile of [a, h] extruded along a plan axis: along 'x' the profile's
   * a is py and it runs from px e0 to e1; along 'y' its a is px and it runs
   * from py e0 to e1. */
  prism(m, axis, profile, e0, e1, fine = false) {
    this.prisms.push(this.flags({ m, axis, profile, e0, e1 }, fine));
  }

  cyl(m, a, b, r, seg = 8, rTop = null, fine = false) {
    this.cyls.push(this.flags({ m, a: worldAt(a[0], a[1], a[2]), b: worldAt(b[0], b[1], b[2]), r, seg, rTop }, fine));
  }

  cone(m, x, y, h, r, height, seg = 8, fine = false) {
    this.cones.push(this.flags({ m, c: worldAt(x, y, h), r, height, seg }, fine));
  }

  ball(m, x, y, h, r, fine = false) {
    this.balls.push(this.flags({ m, c: worldAt(x, y, h), r }, fine));
  }

  leaf(m, x, y, h, r, ry, spin) {
    this.leaves.push({ m, c: worldAt(x, y, h), r, ry, spin, fine: false, near: false });
  }

  wire(m, a, b, sag, r = 0.025) {
    this.wires.push({ m, a: worldAt(a[0], a[1], a[2]), b: worldAt(b[0], b[1], b[2]), sag, r });
  }

  /* A painted plate: its middle at plan (x, y, h), facing the plan
   * direction `dir` ([nx, ny], unit: the way its face looks), w across and
   * ht up, lifted off what it hangs on by `lift`. */
  sign(key, x, y, h, dir, w, ht, lift = 0.02) {
    this.signs.push({ key, x, y, h, dir, w, ht, lift, near: this.small });
  }

  /* A guardrail's run: plan points [x, y, h] at the road's height, the
   * beam drawn as one band along them by ./index.js. */
  rail(pts, side) {
    this.rails.push({ pts, side });
  }
}
