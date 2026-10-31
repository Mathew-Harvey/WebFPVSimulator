/*
 * frame.js: Hyoura Island's frame, its chunks, its random and the builder
 * every part of the island is written with. Pure data and arithmetic, no
 * Three.js and no JS trigonometry, so the solids can be built and checked
 * in plain Node (scripts/arctic-check.js), as Sunnyfield's are.
 *
 * THE FRAME is the built map's world (../built/place.js docToWorld): x east,
 * y up, z SOUTH, metres, life size, a five inch map. The plot is W by D and
 * centred on the origin, so the document's plan point (px, py) is the world's
 * (px - W / 2, D / 2 - py). Everything on the island is written straight in
 * the world, because nearly all of it stands on ground that is not at zero
 * and the plan's frame would only be one more conversion to get wrong; the
 * document (./yard.js) is the one thing that speaks in plan, and planOf turns
 * a world point into it.
 *
 * THE CHUNKS. The built map culls by chunk and bakes one batch per material
 * per chunk (../built/index.js). The island is cut in a four by four grid of
 * 250 m cells over the plot: from anywhere on it the fog (420 m on High)
 * reaches most of them, so finer cells would cost draw calls and cull
 * nothing. The hamlet's small things (./hamlet.js) go in near cells of
 * their own, 60 m across, which ./index.js switches off by range.
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

/* The plot, metres, centred on the origin. */
export const W = 1000;
export const D = 1000;

/* A world point as the document's plan [px, py]. */
export function planOf(x, z) {
  return [x + W / 2, D / 2 - z];
}

/* The chunk a world point is filed under: four by four, 250 m each. */
const CHUNK = 250;
export function chunkOf(x, z) {
  const c = Math.min(3, Math.max(0, Math.floor((x + W / 2) / CHUNK)));
  const r = Math.min(3, Math.max(0, Math.floor((z + D / 2) / CHUNK)));
  return `ar${c}${r}`;
}

/* The near cell a piece of set dressing is filed under, 60 m across. */
const NEAR = 60;
export function nearOf(x, z) {
  const c = Math.floor((x + W / 2) / NEAR);
  const r = Math.floor((z + D / 2) / NEAR);
  return `an${c}_${r}`;
}

/*
 * A SEEDED RANDOM, integer arithmetic only (Math.imul is exact), so every
 * floe and every fir rolls the same on every engine: mulberry32, as
 * Sunnyfield's.
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
 * THE BUILDER, in the world frame. Everything is a Parts part (drawn and
 * solid from the same six numbers) or a thing only drawn, for ./index.js:
 *
 *   prisms   a profile [[a, y], ...] extruded along a world axis: along 'x'
 *            its a is z and it runs from x e0 to e1, along 'z' its a is x
 *   cyls     a drawn cylinder between two points, optionally tapered
 *   cones    a cone standing up
 *   balls    a drawn sphere, or a squashed one (sy): a seal, a buoy, a dome
 *   polys    a level polygon extruded from y0 to y1: a floe, an iceberg's
 *            tier, a ridge of snow, each wall its own face
 *   ribbons  a strip of quads over given points: the road, the falls
 *   wires    a cable hung between two points, sagging, drawn only
 *   signs    a painted plate from the sign atlas (./signs.js)
 *   assets   one of the builder's own elements, drawn by the kit and solid
 *            by its own parts (scaledParts in ./plan.js): vending machines
 *
 * `fine` on anything drawn marks detail the Low preset leaves out, and
 * `near` (set inside dress()) detail drawn only near the camera. A solid is
 * never fine, so the physics is the same on every preset.
 */
export class Isle {
  constructor() {
    this.P = new Parts();
    this.prisms = [];
    this.cyls = [];
    this.cones = [];
    this.balls = [];
    this.polys = [];
    this.ribbons = [];
    this.wires = [];
    this.signs = [];
    this.assets = [];
    this.dressing = false;
  }

  /* Everything drawn and not solid that fn writes is set dressing: fine,
   * and drawn near the camera only. */
  dress(fn) {
    const was = this.dressing;
    this.dressing = true;
    try {
      fn();
    } finally {
      this.dressing = was;
    }
  }

  flags(fine) {
    return { fine: Boolean(fine || this.dressing), near: this.dressing };
  }

  mark(p, fine) {
    if (p && !p.solid && (fine || this.dressing)) {
      p.fine = true;
      if (this.dressing && p.draw) {
        p.near = true;
      }
    }
    return p;
  }

  box(m, x0, y0, z0, x1, y1, z1, opts = {}) {
    const o = this.dressing && opts.solid === undefined && opts.draw !== false ? { ...opts, solid: false } : opts;
    return this.mark(this.P.box(m, x0, y0, z0, x1, y1, z1, o), o.fine);
  }

  /* Drawn, not solid, casting no shadow: paint on a face. */
  paint(m, x0, y0, z0, x1, y1, z1, fine = false) {
    return this.box(m, x0, y0, z0, x1, y1, z1, { solid: false, cast: false, fine });
  }

  /* Drawn, not solid, casting. */
  deco(m, x0, y0, z0, x1, y1, z1, fine = false) {
    return this.box(m, x0, y0, z0, x1, y1, z1, { solid: false, fine });
  }

  /* Solid and not drawn: under a shape no box can be. */
  hidden(x0, y0, z0, x1, y1, z1, kind = 'wall', name = 'hidden') {
    return this.P.box('arRock', x0, y0, z0, x1, y1, z1, { draw: false, kind, name });
  }

  cap(m, a, b, r, opts = {}) {
    const o = this.dressing && opts.solid === undefined ? { ...opts, solid: false } : opts;
    return this.mark(this.P.cap(m, a, b, r, o), o.fine);
  }

  post(m, x, z, y0, y1, r, opts = {}) {
    return this.cap(m, [x, y0, z], [x, y1, z], r, opts);
  }

  prism(m, axis, profile, e0, e1, fine = false) {
    this.prisms.push({ m, axis, profile, e0, e1, ...this.flags(fine) });
  }

  cyl(m, a, b, r, seg = 8, rTop = null, fine = false) {
    this.cyls.push({ m, a, b, r, seg, rTop, ...this.flags(fine) });
  }

  cone(m, x, y, z, r, h, seg = 8, fine = false) {
    this.cones.push({ m, x, y, z, r, h, seg, ...this.flags(fine) });
  }

  ball(m, x, y, z, r, sy = 1, fine = false) {
    this.balls.push({ m, x, y, z, r, sy, ...this.flags(fine) });
  }

  /* A level polygon [[x, z], ...] (any winding) from y0 to y1, its top
   * drawn in `top` and its walls in `side`. */
  poly(top, side, pts, y0, y1, fine = false) {
    this.polys.push({ top, side, pts, y0, y1, ...this.flags(fine) });
  }

  /* A strip of quads: `left` and `right` are matching lists of [x, y, z];
   * its face is the side the left to right cross with the run looks out of. */
  ribbon(m, left, right, fine = false) {
    this.ribbons.push({ m, left, right, ...this.flags(fine) });
  }

  wire(m, a, b, sag, r = 0.03) {
    this.wires.push({ m, a, b, sag, r });
  }

  /* A sign from the atlas on an axis face ('+x', '-x', '+z', '-z'): (x, y, z)
   * its middle, w across, h up. */
  sign(key, x, y, z, w, h, face) {
    this.signs.push({ key, x, y, z, w, h, face, near: this.dressing });
  }

  asset(el, x, y, z, yaw) {
    this.assets.push({ el, x, y, z, yaw });
  }
}
