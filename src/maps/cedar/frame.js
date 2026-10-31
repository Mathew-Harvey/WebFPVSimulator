/*
 * frame.js: Kodama Onsen's plan frame, its cull chunks, its seeded random
 * and the builder every part of the place is written with. Pure data and
 * arithmetic, no Three.js and no JS trigonometry, so the solids can be
 * built and checked in plain Node (scripts/cedar-check.js), the way
 * Sunnyfield's are (../sunny/frame.js, whose builder this one follows
 * call for call so a reader of one can read the other).
 *
 * THE PLAN'S FRAME is the document's: px east, py north, h up, metres, the
 * origin at the plot's south west corner, life size (a five inch map). The
 * plot is W by D. The world is the built map's (../built/place.js
 * docToWorld): x = px - W / 2, y = h, z = D / 2 - py.
 *
 * THE CHUNKS. The built map culls by chunk and bakes one batch per look per
 * chunk once ./index.js has merged the colours (../sunny/palette.js). This
 * place is a forest first: three thousand cedars spread over the whole plot,
 * and from anywhere under them the trunks hide most of the rest. So the plot
 * is cut finer than Sunnyfield's six, four by four, 75 m a side: the frustum
 * drops the chunks behind the camera, and the fog's cull drops the far ones,
 * and a chunk of trees is three batches (trunks, and the crowns' two looks).
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
export const W = 300;
export const D = 300;

export const wx = (px) => px - W / 2;
export const wz = (py) => D / 2 - py;

/* A plan point as the world's [x, y, z]. */
export function worldAt(px, py, h = 0) {
  return [wx(px), h, wz(py)];
}

/* The chunk a world point is filed under: four across and four up on
 * Medium and High, so the cull and the frustum leave the far side of the
 * forest out. On Low the whole place is one chunk, set by ./index.js
 * before it builds: a chunk is a draw call per look, and on a low end
 * machine the calls cost more than the triangles the cull would save. */
let CUT = 4;
export function setChunkCut(n) {
  CUT = n;
}
export function chunkOf(x, z) {
  const px = x + W / 2;
  const py = D / 2 - z;
  const c = Math.min(CUT - 1, Math.max(0, Math.floor((px / W) * CUT)));
  const r = Math.min(CUT - 1, Math.max(0, Math.floor((py / D) * CUT)));
  return `kd${c}${r}`;
}

/*
 * A SEEDED RANDOM, integer arithmetic only (Math.imul is exact), so every
 * tree stands in the same place on every engine: mulberry32, as
 * ../sunny/frame.js has it.
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
 *   prisms   a profile extruded along a plan axis: a roof's slopes and
 *            gables, a torii's lintel, a step
 *   cyls     a drawn cylinder between two plan points, optionally tapered
 *   discs    a level round slab: the outdoor bath's water, a lantern's cap
 *   cones    a cone standing up: a lantern's roof, a fox's ear
 *   balls    a drawn sphere: a lantern's jewel, a moss boulder
 *   frusta   a rectangle rising to a smaller one: a hipped roof, a mound
 *   wires    a cable hung between two plan points, sagging
 *   trees    the cedars, as numbers (./forest.js), drawn by ./index.js and
 *            made solid here as one trunk and a capsule a whorl
 *
 * `fine` on anything drawn marks detail the Low preset leaves out; a solid
 * is never fine, so the physics is the same on every preset.
 */
export class Town {
  constructor() {
    this.P = new Parts();
    this.prisms = [];
    this.cyls = [];
    this.discs = [];
    this.cones = [];
    this.balls = [];
    this.frusta = [];
    this.wires = [];
    this.tori = [];
    this.trees = [];
    /* Plan rectangles nothing grows in: every building and its margin,
     * the paths, the water. ./forest.js reads them. */
    this.clear = [];
  }

  /* A plan rectangle (and a margin round it) the forest keeps out of. */
  clearing(px0, py0, px1, py1, margin = 0) {
    this.clear.push({
      x0: Math.min(px0, px1) - margin, x1: Math.max(px0, px1) + margin,
      y0: Math.min(py0, py1) - margin, y1: Math.max(py0, py1) + margin,
    });
  }

  box(m, px0, py0, h0, px1, py1, h1, opts = {}) {
    const p = this.P.box(m, wx(px0), h0, wz(py0), wx(px1), h1, wz(py1), opts);
    if (p && opts.fine) {
      p.fine = true;
    }
    return p;
  }

  /* Drawn, not solid, and casting no shadow: paint, a stain, a flat. */
  paint(m, px0, py0, h0, px1, py1, h1, fine = false) {
    return this.box(m, px0, py0, h0, px1, py1, h1, { solid: false, cast: false, fine });
  }

  /* Drawn, not solid, casting: a thing a quad would brush through, or a
   * piece of a shape whose solid is somebody else's box. */
  deco(m, px0, py0, h0, px1, py1, h1, fine = false) {
    return this.box(m, px0, py0, h0, px1, py1, h1, { solid: false, fine });
  }

  /* Solid and not drawn. */
  hidden(px0, py0, h0, px1, py1, h1, kind = 'wall', name = 'hidden') {
    return this.box('cdStone', px0, py0, h0, px1, py1, h1, { draw: false, kind, name });
  }

  /*
   * A wall with openings, along plan x (`axis` 'x', at py `at`) or along
   * plan y ('y', at px `at`), `t` thick, from a0 to a1 along it and h0 to
   * h1 up; each hole [a0, a1, h0, h1] in the same terms. The openings are
   * the point: every one is a line a quad can fly (../../props/parts.js
   * wall, which cuts it).
   */
  wall(m, axis, at, a0, a1, h0, h1, t, holes = [], opts = {}) {
    const hs = holes.map(([f, to, y0, y1]) => ({
      from: axis === 'x' ? wx(f) : wz(to), to: axis === 'x' ? wx(to) : wz(f), y0, y1,
    }));
    return this.P.wall(m, {
      axis: axis === 'x' ? 'x' : 'z',
      at: axis === 'x' ? wz(at) : wx(at),
      t,
      from: axis === 'x' ? wx(a0) : wz(a1),
      to: axis === 'x' ? wx(a1) : wz(a0),
      y0: h0,
      y1: h1,
      holes: hs,
    }, opts);
  }

  cap(m, a, b, r, opts = {}) {
    const p = this.P.cap(m, worldAt(a[0], a[1], a[2]), worldAt(b[0], b[1], b[2]), r, opts);
    if (p && opts.fine) {
      p.fine = true;
    }
    return p;
  }

  post(m, px, py, h0, h1, r, opts = {}) {
    return this.cap(m, [px, py, h0], [px, py, h1], r, opts);
  }

  /* A profile of [a, h] extruded along a plan axis: along 'x' the profile's
   * a is py and it runs from px e0 to e1; along 'y' its a is px and it runs
   * from py e0 to e1. Drawn only: the solid is the caller's. */
  prism(m, axis, profile, e0, e1, fine = false) {
    this.prisms.push({ m, axis, profile, e0, e1, fine });
  }

  cyl(m, a, b, r, seg = 8, rTop = null, fine = false) {
    this.cyls.push({ m, a: worldAt(a[0], a[1], a[2]), b: worldAt(b[0], b[1], b[2]), r, seg, rTop, fine });
  }

  /* A brush stroke on a face: a thin cylinder from a to b, plan [px, py, h],
   * drawn only, never solid. */
  stroke(m, a, b, r, fine = false) {
    this.cyl(m, a, b, r, 5, null, fine);
  }

  disc(m, px, py, r, h0, h1, seg = 24, fine = false) {
    this.discs.push({ m, px, py, r, h0, h1, seg, fine });
  }

  cone(m, px, py, h, r, height, seg = 8, fine = false) {
    this.cones.push({ m, px, py, h, r, height, seg, fine });
  }

  ball(m, px, py, h, r, fine = false) {
    this.balls.push({ m, px, py, h, r, fine });
  }

  /* A closed solid from the plan rectangle `o` ({ x0, y0, x1, y1 }) at h0
   * up to the rectangle `i` at h1, its four faces sloped, its top flat.
   * Drawn only: its solid is the caller's (frustumSolid). */
  frustum(m, o, h0, i, h1, fine = false) {
    this.frusta.push({ m, o, h0, i, h1, fine });
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
   * A thin sloped slab, a roof's one side: drawn as a prism whose profile
   * is the slab's section, and solid as a row of capsules down its fall
   * line, each running the slab's length, close enough that nothing gets
   * between two of them. Seen from under it is a ceiling a quad can fly
   * beneath, which a stack of boxes is not.
   *
   *   axis   'x': the slab runs along px from e0 to e1, and falls across
   *          py from (a0, h0) to (a1, h1); 'y' the other way round
   *   t      the thickness, measured straight down
   */
  slope(m, axis, a0, h0, a1, h1, e0, e1, t, name = 'roof', fine = false) {
    this.prism(m, axis, [[a0, h0], [a1, h1], [a1, h1 - t], [a0, h0 - t]], e0, e1, fine);
    const r = t / 2;
    const run = Math.sqrt((a1 - a0) * (a1 - a0) + (h1 - h0) * (h1 - h0));
    const n = Math.max(2, Math.ceil(run / (1.6 * r)) + 1);
    for (let k = 0; k < n; k += 1) {
      const f = k / (n - 1);
      const a = a0 + (a1 - a0) * f;
      const h = h0 + (h1 - h0) * f - r;
      if (axis === 'x') {
        this.cap('cdKawara', [e0 + r, a, h], [e1 - r, a, h], r, { draw: false, name, kind: 'wall' });
      } else {
        this.cap('cdKawara', [a, e0 + r, h], [a, e1 - r, h], r, { draw: false, name, kind: 'wall' });
      }
    }
  }

  /*
   * A closed gable roof: drawn as one prism whose section is the triangle
   * from the eaves at a0 and a1 (height hEave) up to the ridge midway
   * (hRidge), `t` of tile on top; solid as n boxes stacked up inside the
   * triangle, so nothing solid is where nothing is drawn.
   */
  gable(m, axis, a0, a1, hEave, hRidge, e0, e1, t = 0.25, n = 6, name = 'roof', fine = false) {
    const mid = (a0 + a1) / 2;
    this.prism(m, axis, [[a0, hEave], [a0, hEave + t], [mid, hRidge + t], [a1, hEave + t], [a1, hEave]], e0, e1, fine);
    const half = (a1 - a0) / 2;
    for (let k = 0; k < n; k += 1) {
      const f = (k + 1) / n;
      const h0 = hEave + ((hRidge - hEave) * k) / n;
      const h1 = hEave + (hRidge - hEave) * f;
      const w = half * (1 - f);
      if (w < 0.05) {
        continue;
      }
      if (axis === 'x') {
        this.hidden(e0, mid - w, h0, e1, mid + w, h1, 'wall', name);
      } else {
        this.hidden(mid - w, e0, h0, mid + w, e1, h1, 'wall', name);
      }
    }
  }

  /* A ring, its middle at plan (px, py) h up, lying level (axis straight
   * up), R round and t thick: a rope round a trunk. Drawn only. */
  ring(m, px, py, h, R, t, seg = 6, round = 18) {
    this.tori.push({ m, px, py, h, R, t, seg, round });
  }

  /* A cable from a to b, plan [px, py, h], hanging `sag` metres at its
   * middle, `r` thick. Drawn only, never solid, as the builder's are. */
  wire(m, a, b, sag, r = 0.025) {
    this.wires.push({ m, a, b, sag, r });
  }
}
