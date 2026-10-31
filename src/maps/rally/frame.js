/*
 * frame.js: Tanada RX's plan frame, its chunks, and the builder every part
 * of the place is written with. Pure: no Three.js, and no JS trigonometry
 * in anything that is solid, so the solids load and are checked in plain
 * Node (scripts/rally-check.js) exactly as the browser places them.
 *
 * THE PLAN'S FRAME is the document's: px east, py north, h up, metres, the
 * origin at the plot's south west corner, life size (a five inch map). The
 * plot is W by D. The world is the built map's (../built/place.js
 * docToWorld): x = px - W / 2, y = h, z = D / 2 - py. Every point is
 * written in the plan and converted once, in w().
 *
 * THE CHUNKS, as Sunnyfield's (../sunny/frame.js): the built map culls by
 * chunk and bakes one batch per material per chunk, and its own 48 m
 * chunks would cut a 420 m plot into sixty. So the place is cut in six,
 * three across and two up, and the map hands that cut to the pipeline
 * (chunkOf). The set dressing, which is what makes it a place and is
 * worth nothing from across the valley, goes in near cells of its own that
 * ./index.js switches off by range.
 *
 * WHAT IS DRAWN AND WHAT IS SOLID. A box or a capsule is a part
 * (../../props/parts.js): drawn and solid from the same six numbers. What
 * no box can say (a gable, a curved bank, a tyre, a crowd) is a drawing,
 * a function of the kit kept with the plan point it is filed by, which
 * ./index.js runs in that point's chunk. A drawing is never solid. Where it
 * stands for something a quad could hit, the solid beside it is a hidden
 * part, written next to it, so the two cannot drift apart.
 *
 * `fine` marks detail Low leaves out, and a solid is never fine, so the
 * flight is the same on every preset. Inside `dress(fn)` everything drawn
 * and not solid is fine and near: set dressing.
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
export const W = 420;
export const D = 330;

/* A plan point as the world's [x, y, z]. */
export function w(px, py, h = 0) {
  return [px - W / 2, h, D / 2 - py];
}

/* The chunk a world point is filed under: three across, two up. */
export function chunkOf(x, z) {
  const px = x + W / 2;
  const py = D / 2 - z;
  const c = px < 140 ? 0 : px < 280 ? 1 : 2;
  const r = py < 150 ? 0 : 1;
  return `rx${c}${r}`;
}

/* The near cell a piece of set dressing is filed under: eight across and
 * six up, about 52 by 55 m, each one batch after the palette merge. */
const NEAR_COLS = 8;
const NEAR_ROWS = 6;
export function nearOf(x, z) {
  const px = x + W / 2;
  const py = D / 2 - z;
  const c = Math.min(NEAR_COLS - 1, Math.max(0, Math.floor((px / W) * NEAR_COLS)));
  const r = Math.min(NEAR_ROWS - 1, Math.max(0, Math.floor((py / D) * NEAR_ROWS)));
  return `rn${c}${r}`;
}

/* A fixed integer hash to [0, 1), so the place is the same every build. */
export function hash(i, salt = 0) {
  let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca77);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/*
 * THE BUILDER.
 *
 *   box, cap, post     parts: drawn and solid unless opts say otherwise
 *   paint, deco        drawn, never solid; paint casts no shadow either
 *   hidden             solid, never drawn: the solid of a drawing
 *   draw(px, py, fn)   a drawing, fn(K, chunk) with K the kit, filed by
 *                      the plan point; turn(K, chunk, px, py, h, a) sets
 *                      the kit's frame there, `a` the plan heading
 *   dress(fn)          what fn adds drawn and not solid is set dressing
 */
export class Place {
  constructor() {
    this.P = new Parts();
    this.draws = [];
    this.dressing = false;
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

  mark(p, fine) {
    if (p && (fine || (this.dressing && !p.solid))) {
      p.fine = true;
    }
    if (p && this.dressing && !p.solid && p.draw) {
      p.near = true;
    }
    return p;
  }

  soft(opts) {
    return this.dressing && opts.solid === undefined && opts.draw !== false ? { ...opts, solid: false } : opts;
  }

  box(m, px0, py0, h0, px1, py1, h1, opts = {}) {
    const o = this.soft(opts);
    const a = w(px0, py0, h0);
    const b = w(px1, py1, h1);
    return this.mark(this.P.box(m, a[0], a[1], a[2], b[0], b[1], b[2], o), o.fine);
  }

  paint(m, px0, py0, h0, px1, py1, h1, fine = false) {
    return this.box(m, px0, py0, h0, px1, py1, h1, { solid: false, cast: false, fine });
  }

  deco(m, px0, py0, h0, px1, py1, h1, fine = false) {
    return this.box(m, px0, py0, h0, px1, py1, h1, { solid: false, fine });
  }

  hidden(px0, py0, h0, px1, py1, h1, kind = 'wall', name = 'hidden') {
    return this.box('rxStone', px0, py0, h0, px1, py1, h1, { draw: false, kind, name });
  }

  cap(m, a, b, r, opts = {}) {
    const o = this.soft(opts);
    return this.mark(this.P.cap(m, w(a[0], a[1], a[2]), w(b[0], b[1], b[2]), r, o), o.fine);
  }

  post(m, px, py, h0, h1, r, opts = {}) {
    return this.cap(m, [px, py, h0], [px, py, h1], r, opts);
  }

  draw(px, py, fn, fine = false) {
    this.draws.push({
      px, py, fn, fine: fine || this.dressing, near: this.dressing,
    });
  }
}

/* The kit's frame at a plan point, `a` the plan heading (radians from east
 * toward north): local +x along the heading, +z to its right, +y up. */
export function turn(K, chunk, px, py, h, a) {
  const p = w(px, py, h);
  K.begin(p[0], p[1], p[2], a, chunk);
}

/* The kit's frame at the world's origin, unturned: what w() points mean. */
export function origin(K, chunk) {
  K.begin(0, 0, 0, 0, chunk);
}
