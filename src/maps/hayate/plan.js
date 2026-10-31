/*
 * plan.js: how Hayate Circuit is written down. One object, the plan's
 * hand (makePlan), that every place in this map draws itself with: a call
 * either makes a thing solid and drawn from the same numbers (box, post,
 * cap), or draws it and leaves it out of the physics (deco and the rest),
 * or hangs a painted sign (sign). Pure: no Three.js, so the solids load in
 * Node (scripts/hayate-check.js) as they do in the browser, and the two
 * cannot disagree about where a wall is.
 *
 * WHAT IS SOLID AND WHAT IS PAINT. Anything a five inch could hit is a
 * part (../../props/parts.js), in the world frame, every box on the axes,
 * which is what the built map's pipeline places and inks. Anything thin
 * that the pipeline's ink and the cel light make read as a thing (a seat
 * back, a rail, a window frame, a cable) is a draw op, filed under its
 * cull cell and drawn by ./index.js with the town's kit; most of it is
 * `fine` and Low leaves it out. Nothing fine is solid, so Low flies the
 * same lines as High.
 *
 * A barrier along a bend cannot be a box on the axes: it is a capsule
 * lying along the road edge, solid and not drawn, under a block turned
 * onto it (an `obox` op), as Drift Matsuri's barriers are.
 *
 * NO JS TRIGONOMETRY in anything solid: a turned point is a sincos() from
 * ../../props/trig.js, the fixed libm the physics path keeps to, so the
 * Ferris wheel's spokes are the same bits in Node and in every browser.
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
import { w, cellAt } from './frame.js';

/*
 * The plan's hand. Every coordinate is the plan's: (x, y) east and north,
 * h up, metres. Ops carry the cell they are filed under, worked out from
 * where they stand.
 *
 *   box(m, x0, y0, h0, x1, y1, h1, opts)   solid and drawn (opts as Parts')
 *   solid(x0, y0, h0, x1, y1, h1, name, kind)   solid, not drawn
 *   post(m, x, y, h0, h1, r, opts)          a solid upright
 *   cap(m, a, b, r, opts)                   a solid capsule, a and b [x, y, h]
 *   deco(m, x0, y0, h0, x1, y1, h1, fine)   drawn only, on the axes
 *   obox(m, x, y, h0, h1, len, wid, tx, ty, fine)   drawn only, a block
 *                                           `len` along the heading (tx, ty)
 *                                           and `wid` across it, centred
 *   cyl(m, a, b, r, seg, fine, rTop)        drawn only, a tube a to b
 *   blob(m, c, r, ry, k, fine)              drawn only, a lump
 *   cone(m, c, r, h, seg, fine)             drawn only, a cone stood on c
 *   prism(m, profile, axis, e0, e1, fine)   drawn only: a profile of
 *                                           [across, h] points extruded
 *                                           along plan x ('x', across is y)
 *                                           or along plan y ('y', across x)
 *   sign(key, x, y, h, nx, ny, wd, ht, lift)   a painted quad on the face
 *                                           whose outward plan normal is
 *                                           (nx, ny), or (0, 0) for lying
 *                                           face up
 *   op(o)                                   any other draw op, filed by o.at
 *
 * `fine` marks what Low leaves out.
 */
export function makePlan() {
  const P = new Parts();
  const ops = [];
  const signs = [];
  const at = (x, y) => cellAt(x, y);
  return {
    P,
    ops,
    signs,
    box(m, x0, y0, h0, x1, y1, h1, opts) {
      const a = w(x0, y0, h0);
      const b = w(x1, y1, h1);
      return P.box(m, a[0], a[1], a[2], b[0], b[1], b[2], opts);
    },
    solid(x0, y0, h0, x1, y1, h1, name = '', kind = 'wall') {
      return this.box('concrete', x0, y0, h0, x1, y1, h1, { draw: false, name, kind });
    },
    post(m, x, y, h0, h1, r, opts) {
      const a = w(x, y, h0);
      return P.post(m, a[0], a[2], h0, h1, r, opts);
    },
    cap(m, a, b, r, opts) {
      return P.cap(m, w(a[0], a[1], a[2]), w(b[0], b[1], b[2]), r, opts);
    },
    deco(m, x0, y0, h0, x1, y1, h1, fine = false) {
      ops.push({
        t: 'box', m, x0, y0, h0, x1, y1, h1, fine, at: at((x0 + x1) / 2, (y0 + y1) / 2),
      });
    },
    obox(m, x, y, h0, h1, len, wid, tx, ty, fine = false) {
      ops.push({
        t: 'obox', m, x, y, h0, h1, len, wid, tx, ty, fine, at: at(x, y),
      });
    },
    cyl(m, a, b, r, seg = 6, fine = false, rTop = null) {
      ops.push({
        t: 'cyl', m, a, b, r, seg, fine, rTop, at: at((a[0] + b[0]) / 2, (a[1] + b[1]) / 2),
      });
    },
    blob(m, c, r, ry, k = 0, fine = false) {
      ops.push({
        t: 'blob', m, c, r, ry, k, fine, at: at(c[0], c[1]),
      });
    },
    cone(m, c, r, h, seg = 10, fine = false) {
      ops.push({
        t: 'cone', m, c, r, h, seg, fine, at: at(c[0], c[1]),
      });
    },
    prism(m, profile, axis, e0, e1, fine = false) {
      let a = 0;
      for (const p of profile) {
        a += p[0];
      }
      a /= profile.length;
      const e = (e0 + e1) / 2;
      ops.push({
        t: 'prism', m, profile, axis, e0, e1, fine, at: axis === 'x' ? at(e, a) : at(a, e),
      });
    },
    sign(key, x, y, h, nx, ny, wd, ht, lift = 0.03) {
      signs.push({
        key, x, y, h, nx, ny, w: wd, ht, lift, at: at(x, y),
      });
    },
    op(o) {
      ops.push({ ...o, at: o.at ?? at(o.x ?? 0, o.y ?? 0) });
    },
  };
}
