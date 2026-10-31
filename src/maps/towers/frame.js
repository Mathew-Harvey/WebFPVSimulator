/*
 * frame.js: Kumoi Towers' plan frame, its chunks and the builder every part
 * of the district is written with. Pure data and arithmetic, no Three.js
 * and no JS trigonometry, so the solids can be built and checked in plain
 * Node, the way Sunnyfield's are (../sunny/frame.js, which this follows
 * method for method, on a bigger plot).
 *
 * THE PLAN'S FRAME is the document's: px east, py north, h up, metres, the
 * origin at the plot's south west corner, life size (a five inch map). The
 * plot is W by D. The world is the built map's (../built/place.js
 * docToWorld): x = px - W / 2, y = h, z = D / 2 - py.
 *
 * THE CHUNKS. Nine, three across and three up, about 147 by 120 m each:
 * the towers are seen from anywhere on the plot, so a finer cut would
 * cull nothing and cost a batch a colour a chunk. The set dressing has
 * cells of its own, nine across and eight up (nearOf), switched off by
 * range from the camera (./index.js), as Sunnyfield's are.
 *
 * WHAT A BOX CANNOT SAY is kept beside the parts for ./index.js to draw:
 * the facades (a tower's glass and concrete skin, one painted picture
 * repeated over each face, ./facade.js), the town's own painted plates
 * (lanterns, noren, shop blades), roof slopes, round things and cables.
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
export const D = 360;

export const wx = (px) => px - W / 2;
export const wz = (py) => D / 2 - py;

/* A plan point as the world's [x, y, z]. */
export function worldAt(px, py, h = 0) {
  return [wx(px), h, wz(py)];
}

/* The chunk a world point is filed under: three across, three up. */
const COL = W / 3;
const ROW = D / 3;
export function chunkOf(x, z) {
  const px = x + W / 2;
  const py = D / 2 - z;
  const c = Math.min(2, Math.max(0, Math.floor(px / COL)));
  const r = Math.min(2, Math.max(0, Math.floor(py / ROW)));
  return `tw${c}${r}`;
}

/* The near cell a piece of set dressing is filed under, nine across and
 * eight up: about 49 by 45 m, as Sunnyfield's near cells are. */
const NEAR_COLS = 9;
const NEAR_ROWS = 8;
export function nearOf(x, z) {
  const px = x + W / 2;
  const py = D / 2 - z;
  const c = Math.min(NEAR_COLS - 1, Math.max(0, Math.floor((px / W) * NEAR_COLS)));
  const r = Math.min(NEAR_ROWS - 1, Math.max(0, Math.floor((py / D) * NEAR_ROWS)));
  return `tn${c}${r}`;
}

/* A seeded random, integer arithmetic only (Math.imul is exact), so every
 * shack rolls the same on every engine: mulberry32, as ../sunny/frame.js. */
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

/* A plan face as the kit's world face: north (+py) is the world's -z. */
export const WORLD_FACE = { n: '-z', s: '+z', e: '+x', w: '-x', up: '+y' };

/*
 * THE BUILDER, as Sunnyfield's: everything is added in plan terms and lands
 * in one Parts list in the world frame, plus what a box cannot say:
 *   prisms    a profile extruded along a plan axis: a roof's slopes
 *   cyls      a drawn cylinder between two plan points
 *   discs     a level round slab: a pool, a helipad's ring
 *   cones     a cone standing up
 *   tori      a ring on any plan heading: the plaza's red ring
 *   balls     a drawn sphere: a lantern, a lamp globe
 *   frusta    a rectangle rising to a smaller one: a crown, a pyramid top
 *   wires     a cable hung between two plan points, never solid
 *   facades   a tower's painted skin on one face (./facade.js)
 *   plates    one of the town's own painted plates (K.townSign)
 *   scaled    one of the town's own assets, drawn by the kit at a scale
 * `fine` marks detail the Low preset leaves out; a solid is never fine.
 * Inside `dress(fn)` whatever is drawn and not solid is set dressing: fine,
 * and `near`, drawn by ./index.js only within NEAR_R of the camera.
 */
export class Town {
  constructor() {
    this.P = new Parts();
    this.prisms = [];
    this.cyls = [];
    this.discs = [];
    this.cones = [];
    this.tori = [];
    this.balls = [];
    this.frusta = [];
    this.wires = [];
    this.facades = [];
    this.plates = [];
    this.scaled = [];
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

  /* Inside `dress`, dressing that is fine but drawn at every range on High
   * and Medium: what is fixed to a wall or painted on the ground. */
  wide(fn) {
    const was = this.widening;
    this.widening = true;
    try {
      fn();
    } finally {
      this.widening = was;
    }
  }

  mark(p, fine) {
    if (p && (fine || (this.dressing && !p.solid))) {
      p.fine = true;
    }
    if (p && this.dressing && !this.widening && !p.solid && p.draw) {
      p.near = true;
    }
    return p;
  }

  soft(opts) {
    return this.dressing && opts.solid === undefined && opts.draw !== false ? { ...opts, solid: false } : opts;
  }

  /* The flags a drawn shape that is not a part carries. */
  flags(fine) {
    return { fine: Boolean(fine) || this.dressing, near: this.dressing && !this.widening };
  }

  box(m, px0, py0, h0, px1, py1, h1, opts = {}) {
    const o = this.soft(opts);
    return this.mark(this.P.box(m, wx(px0), h0, wz(py0), wx(px1), h1, wz(py1), o), o.fine);
  }

  /* Drawn, not solid, casting no shadow: paint, a line, a flat. */
  paint(m, px0, py0, h0, px1, py1, h1, fine = false) {
    return this.box(m, px0, py0, h0, px1, py1, h1, { solid: false, cast: false, fine });
  }

  /* Drawn, not solid, casting: a small thing a quad would brush through. */
  deco(m, px0, py0, h0, px1, py1, h1, fine = false) {
    return this.box(m, px0, py0, h0, px1, py1, h1, { solid: false, fine });
  }

  /* Solid and not drawn: what a facade or a drawn shape stands for. */
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
   * from py e0 to e1. */
  prism(m, axis, profile, e0, e1, fine = false) {
    this.prisms.push({ m, axis, profile, e0, e1, ...this.flags(fine) });
  }

  cyl(m, a, b, r, seg = 8, rTop = null, fine = false) {
    this.cyls.push({ m, a: worldAt(a[0], a[1], a[2]), b: worldAt(b[0], b[1], b[2]), r, seg, rTop, ...this.flags(fine) });
  }

  disc(m, px, py, r, h0, h1, seg = 24, fine = false) {
    this.discs.push({ m, px, py, r, h0, h1, seg, ...this.flags(fine) });
  }

  /* A ring standing on edge, its middle h up, its axis along the plan's
   * (nx, ny), or lying flat when both are 0; tube t. */
  torus(m, px, py, h, R, t, nx, ny, seg = 10, round = 32) {
    this.tori.push({ m, px, py, h, R, t, nx, ny, seg, round, ...this.flags(false) });
  }

  cone(m, px, py, h, r, height, seg = 10, fine = false) {
    this.cones.push({ m, px, py, h, r, height, seg, ...this.flags(fine) });
  }

  ball(m, px, py, h, r, fine = false) {
    this.balls.push({ m, px, py, h, r, ...this.flags(fine) });
  }

  /* A ball of twenty faces rather than eighty, for what is small and many. */
  bead(m, px, py, h, r) {
    this.balls.push({ m, px, py, h, r, bead: true, fine: true, near: this.dressing && !this.widening });
  }

  /* A cable from a to b, plan [px, py, h], hanging `sag` at its middle. */
  wire(m, a, b, sag, r = 0.03) {
    this.wires.push({ m, a, b, sag, r });
  }

  /* A closed solid from the plan rectangle `o` at h0 to the rectangle `i`
   * at h1, its four faces sloped. Drawn only: its solid is the caller's. */
  frustum(m, o, h0, i, h1, fine = false) {
    this.frusta.push({ m, o, h0, i, h1, ...this.flags(fine) });
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

  /*
   * A tower's skin on one face of a plan rectangle: `face` the way it
   * looks, `rect` { x0, y0, x1, y1 } the block it is the face of, from h0
   * up to h1, in `style` (./facade.js FACADES). `seed` picks where in the
   * picture the face starts, so two faces side by side do not repeat.
   */
  facade(style, rect, face, h0, h1, seed = 0) {
    const ns = face === 'n' || face === 's';
    const at = { n: rect.y1, s: rect.y0, e: rect.x1, w: rect.x0 }[face];
    this.facades.push({
      style, face, at, a0: ns ? rect.x0 : rect.y0, a1: ns ? rect.x1 : rect.y1, h0, h1, seed,
    });
  }

  /* All four faces of a block, and its solid: the block a tower is made
   * of. The roof is the caller's, since a roof is where a tower differs. */
  block(style, rect, h0, h1, seed = 0, name = 'tower') {
    this.hidden(rect.x0, rect.y0, h0, rect.x1, rect.y1, h1, 'wall', name);
    ['n', 'e', 's', 'w'].forEach((f, i) => this.facade(style, rect, f, h0, h1, seed + i * 7));
  }

  /* One of the town's own painted plates (src/maps/city/vendored/core/
   * textures.js, through K.townSign) on a plan face, its middle at
   * (px, py, h), w across and ht up. Fine: a plate is a shop's dressing. */
  plate(fn, arg, px, py, h, w, ht, face) {
    this.plates.push({ fn, arg, px, py, h, w, ht, face, ...this.flags(true) });
  }

  /* One of the kit's own assets (a car, a vending machine) at a scale. */
  asset(el, k, px, py, h, yaw) {
    this.scaled.push({ el, k, px, py, h, yaw });
  }
}
