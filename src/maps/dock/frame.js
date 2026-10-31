/*
 * frame.js: Kamome Wharf's plan frame, its chunks and the builder every part
 * of the port is written with. Pure data and arithmetic, no Three.js and no
 * JS trigonometry, so the solids can be built and checked in plain Node, the
 * way ../sunny/frame.js is, whose builder this one follows.
 *
 * THE PLAN'S FRAME is the document's: px east, py north, h up, metres, the
 * origin at the plot's south west corner, life size (a five inch map). The
 * plot is W by D, and the quay's edge runs east to west across it at
 * QUAY_Y: south of it the paving, north of it the harbour. The world is the
 * built map's (../built/place.js docToWorld): x = px - W / 2, y = h,
 * z = D / 2 - py.
 *
 * THE CHUNKS. The built map culls by chunk and bakes one batch per material
 * per chunk (../built/index.js), and ./index.js then folds each chunk's
 * batches into one a look (../sunny/palette.js). The port is cut in eight,
 * four across and two up, so a pilot down in the yard's canyons sees about
 * half of it drawn and a pilot on a crane's boom sees all of it for eight
 * batches and not eighty.
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
export const W = 440;
export const D = 330;

/* The quay's edge, and the harbour's surface under the paving's zero. A
 * Japanese container berth stands about two and a half metres over mean
 * water, which is what puts a ship's hull wall beside the pilot rather than
 * under them. */
export const QUAY_Y = 248;
export const WATER_H = -2.4;

export const wx = (px) => px - W / 2;
export const wz = (py) => D / 2 - py;

/* A plan point as the world's [x, y, z]. */
export function worldAt(px, py, h = 0) {
  return [wx(px), h, wz(py)];
}

/* The chunk a world point is filed under: four across, two up, the line
 * between the rows on the yard's north edge, so the apron, the cranes and
 * the ship are one row and the yard and the landside the other. */
const COLS = [110, 220, 330];
const ROW = 176;
export function chunkOf(x, z) {
  const px = x + W / 2;
  const py = D / 2 - z;
  const c = px < COLS[0] ? 0 : px < COLS[1] ? 1 : px < COLS[2] ? 2 : 3;
  const r = py < ROW ? 0 : 1;
  return `dk${c}${r}`;
}

/* The near cell a piece of set dressing is filed under, eight across and
 * six up, so ./index.js can switch the dressing off by range while the
 * chunk it stands in stays on. Each cell is one draw once it is folded. */
const NEAR_COLS = 8;
const NEAR_ROWS = 6;
export function nearOf(x, z) {
  const px = x + W / 2;
  const py = D / 2 - z;
  const c = Math.min(NEAR_COLS - 1, Math.max(0, Math.floor((px / W) * NEAR_COLS)));
  const r = Math.min(NEAR_ROWS - 1, Math.max(0, Math.floor((py / D) * NEAR_ROWS)));
  return `dn${c}${r}`;
}

/*
 * A SEEDED RANDOM, integer arithmetic only (Math.imul is exact), so every
 * stack rolls the same on every engine: mulberry32, as ../sunny/frame.js.
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
 *   prisms   a profile extruded along a plan axis: a roof's slopes, a hull's
 *            sheer
 *   slabs    a plan polygon stood up from h0 to h1: a ship's bow, a deck
 *   cyls     a drawn cylinder between two plan points, optionally tapered
 *   discs    a level round slab: a bollard's cap, a drum
 *   cones    a cone standing up
 *   balls    a drawn sphere: a lamp, an aviation light
 *   flutes   a container's corrugated wall, ribs proud of a face
 *   signs    a painted plate from the sign atlas (./signs.js)
 *   wires    a cable hung between two plan points, sagging: the ship's
 *            mooring lines, a crane's festoon. Drawn only, never solid
 *
 * `fine` on anything drawn marks detail the Low preset leaves out; a solid
 * is never fine, so the physics is the same on every preset.
 *
 * SET DRESSING is whatever is drawn and not solid inside `dress(fn)`. It is
 * fine, so Low leaves it out, and `near`, so ./index.js draws it in cells of
 * its own that it switches off past NEAR_R from the camera. Inside `dress` a
 * box or a capsule is not solid unless it says so. Inside `wide(fn)` as
 * well it is fine and NOT near: drawn at every range on High and Medium,
 * for what is painted on the ground or fixed to a wall, whose popping in
 * would be seen.
 */
export class Port {
  constructor() {
    this.P = new Parts();
    this.prisms = [];
    this.slabs = [];
    this.cyls = [];
    this.discs = [];
    this.cones = [];
    this.balls = [];
    this.flutes = [];
    this.signs = [];
    this.wires = [];
    this.dressing = false;
    this.widening = false;
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
    return this.box('concrete', px0, py0, h0, px1, py1, h1, { draw: false, kind, name });
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
   * from py e0 to e1. Drawn only. */
  prism(m, axis, profile, e0, e1, fine = false) {
    this.prisms.push({ m, axis, profile, e0, e1, fine: fine || this.dressing, near: this.near });
  }

  /* A plan polygon [[px, py], ...], convex and counter clockwise seen from
   * above, stood from h0 to h1 with a lid and a floor. Drawn only. */
  slab(m, poly, h0, h1, fine = false) {
    this.slabs.push({ m, poly, h0, h1, fine: fine || this.dressing, near: this.near });
  }

  cyl(m, a, b, r, seg = 8, rTop = null, fine = false) {
    this.cyls.push({ m, a: worldAt(a[0], a[1], a[2]), b: worldAt(b[0], b[1], b[2]), r, seg, rTop, fine: fine || this.dressing, near: this.near });
  }

  disc(m, px, py, r, h0, h1, seg = 16, fine = false) {
    this.discs.push({ m, px, py, r, h0, h1, seg, fine: fine || this.dressing, near: this.near });
  }

  cone(m, px, py, h, r, height, seg = 10, fine = false) {
    this.cones.push({ m, px, py, h, r, height, seg, fine: fine || this.dressing, near: this.near });
  }

  ball(m, px, py, h, r, fine = false) {
    this.balls.push({ m, px, py, h, r, fine: fine || this.dressing, near: this.near });
  }

  /*
   * A corrugated wall: `n` ribs proud of the plan face from (px0, py0) to
   * (px1, py1), h0 to h1, `out` metres, on the side the face looks ('n',
   * 's', 'e' or 'w'). The ribs only; the face between them is the box's.
   */
  flute(m, px0, py0, px1, py1, h0, h1, face, n, out = 0.06) {
    this.flutes.push({ m, px0, py0, px1, py1, h0, h1, face, n, out, fine: true, near: true });
  }

  /* A sign from the atlas on a plan face: 'n' faces north (+py), 's' south,
   * 'e' east, 'w' west, 'up' lies flat facing the sky. (px, py, h) is its
   * middle; w across, ht up. */
  sign(key, px, py, h, w, ht, face, lift = 0.03) {
    this.signs.push({ key, px, py, h, w, ht, face, lift });
  }

  /* A cable from a to b, plan [px, py, h], hanging `sag` metres. */
  wire(m, a, b, sag, r = 0.03) {
    this.wires.push({ m, a, b, sag, r });
  }

  /* The solid under a sloped roof, as n stacked boxes each inside the
   * slope, so nothing solid is where nothing is drawn. */
  stepped(o, h0, i, h1, n, name, kind = 'wall') {
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
