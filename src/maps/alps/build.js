/*
 * build.js: the few shapes every structure on Raicho Ridge is made of, in
 * the world frame, drawn and solid from the same numbers.
 *
 * A Plan collects three things as the places are laid out (./places.js):
 * the parts (src/props/parts.js, every box on the axes, every capsule any
 * way), which the built map's pipeline both draws and makes solid; the
 * paint, functions of the kit that draw what a box cannot say (a roof's
 * slope, a cable's sag, a sheave, a sign) and are never solid; and the
 * named gaps, in the world frame, which ./yard.js turns into the
 * document's.
 *
 * A ROOF IS A SLOPE DRAWN AND LEVEL BANDS SOLID, the house maps' rule
 * (src/maps/house/house.js): a box cannot lie on a slope, so under every
 * drawn pitch is a stack of bands, each as wide as the roof is at the
 * band's TOP, so the solid is always inside the drawn roof and a craft
 * that lands on a roof lands at most a band's height under its tiles, and
 * the eaves' overhang has air under it.
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
import { HALF } from './terrain.js';

/* The cull cells, in metres: the map's 2 km in ten by ten. A cell holds
 * a structure's parts and paint together, so a station is one cell's
 * batches and switches off as one. */
export const CELL_M = 200;

export function chunkOf(x, z) {
  const i = Math.max(0, Math.min(9, Math.floor((x + HALF) / CELL_M)));
  const j = Math.max(0, Math.min(9, Math.floor((z + HALF) / CELL_M)));
  return `al${i},${j}`;
}

/* How far a band of a roof's solid is, in height. */
const BAND = 0.3;

export class Plan {
  constructor() {
    this.P = new Parts();
    this.paint = [];
    this.gaps = [];
  }

  get parts() {
    return this.P.list;
  }

  /* Paint at (x, z), drawn by fn(kit) in the world frame in that cell. */
  draw(x, z, fn) {
    this.paint.push({ x, z, fn });
  }

  box(m, x0, y0, z0, x1, y1, z1, o) {
    return this.P.box(m, x0, y0, z0, x1, y1, z1, o);
  }

  cap(m, a, b, r, o) {
    return this.P.cap(m, a, b, r, o);
  }

  post(m, x, z, y0, y1, r, o) {
    return this.P.post(m, x, z, y0, y1, r, o);
  }

  /* A wall with holes: see Parts.wall. */
  wall(m, o, opts) {
    return this.P.wall(m, o, opts);
  }

  /*
   * A named gap, in the world: its foot's middle (x, z), the bottom of its
   * clear height y, its clear width and height, and the way it is flown,
   * as a heading in the plan: 'x' along +x, 'z' along +z.
   */
  gap(name, x, y, z, w, h, along, points = 0) {
    this.gaps.push({ name, x, y, z, w, h, along, points });
  }

  /*
   * A gable roof whose ridge runs along x, from x0 to x1, centred on zc,
   * half as deep as `half`, its eaves at ye and its ridge `rise` over
   * them, overhanging by `ov`. Drawn as a slab `t` thick; solid as bands.
   */
  gableX(m, x0, x1, zc, half, ye, rise, ov = 0.9, t = 0.22, ends = null) {
    const k = rise / half;
    const W = half + ov;
    const yl = ye - ov * k;
    this.draw((x0 + x1) / 2, zc, (K) => {
      K.begin(0, 0, zc, Math.PI / 2, K.chunk);
      K.extrude(m, [[-W, yl], [0, ye + rise], [W, yl], [W, yl - t], [0, ye + rise - t * 1.25], [-W, yl - t]], x0 - ov, x1 + ov);
      /* The ridge cap, a darker roll along the top. */
      K.extrude('alSteelDark', [[-0.22, ye + rise - 0.05], [0, ye + rise + 0.14], [0.22, ye + rise - 0.05]], x0 - ov, x1 + ov);
      if (ends) {
        for (const xe of [x0, x1 - 0.2]) {
          K.extrude(ends, [[-half, ye], [0, ye + rise], [half, ye]], xe, xe + 0.2);
        }
      }
      K.begin(0, 0, 0, 0, K.chunk);
    });
    for (let y = ye; y + BAND <= ye + rise + 1e-9; y += BAND) {
      const h = half * (1 - (y + BAND - ye) / rise);
      if (h > 0.12) {
        this.box(m, x0, y, zc - h, x1, y + BAND, zc + h, { draw: false, name: 'roof' });
      }
    }
  }

  /* The same with its ridge along z. */
  gableZ(m, z0, z1, xc, half, ye, rise, ov = 0.9, t = 0.22, ends = null) {
    const k = rise / half;
    const W = half + ov;
    const yl = ye - ov * k;
    this.draw(xc, (z0 + z1) / 2, (K) => {
      K.begin(xc, 0, 0, 0, K.chunk);
      K.extrude(m, [[-W, yl], [0, ye + rise], [W, yl], [W, yl - t], [0, ye + rise - t * 1.25], [-W, yl - t]], z0 - ov, z1 + ov);
      K.extrude('alSteelDark', [[-0.22, ye + rise - 0.05], [0, ye + rise + 0.14], [0.22, ye + rise - 0.05]], z0 - ov, z1 + ov);
      if (ends) {
        for (const ze of [z0, z1 - 0.2]) {
          K.extrude(ends, [[-half, ye], [0, ye + rise], [half, ye]], ze, ze + 0.2);
        }
      }
      K.begin(0, 0, 0, 0, K.chunk);
    });
    for (let y = ye; y + BAND <= ye + rise + 1e-9; y += BAND) {
      const h = half * (1 - (y + BAND - ye) / rise);
      if (h > 0.12) {
        this.box(m, xc - h, y, z0, xc + h, y + BAND, z1, { draw: false, name: 'roof' });
      }
    }
  }

  /*
   * A cable from a to b, sagging `sag` at its middle: drawn as a run of
   * thin cylinders, and solid as the same run of capsules, because a
   * ropeway's rope is the first thing a pilot clips.
   */
  cable(a, b, sag, r = 0.05, segs = 8, m = 'alCable') {
    const pts = [];
    for (let i = 0; i <= segs; i += 1) {
      const t = i / segs;
      pts.push([
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t - 4 * sag * t * (1 - t),
        a[2] + (b[2] - a[2]) * t,
      ]);
    }
    for (let i = 0; i < segs; i += 1) {
      this.cap(m, pts[i], pts[i + 1], r, { seg: 4, name: 'cable', cast: false });
    }
    return pts;
  }

  /* A railing along x or z: posts every `step` and two rails, solid. */
  railing(m, axis, at, a0, a1, y, h = 1.1, step = 2) {
    const n = Math.max(1, Math.round((a1 - a0) / step));
    for (let i = 0; i <= n; i += 1) {
      const a = a0 + ((a1 - a0) * i) / n;
      const p = axis === 'x' ? [a, at] : [at, a];
      this.post(m, p[0], p[1], y, y + h, 0.035, { seg: 4, name: 'rail' });
    }
    for (const hy of [h, h * 0.5]) {
      const A = axis === 'x' ? [a0, y + hy, at] : [at, y + hy, a0];
      const B = axis === 'x' ? [a1, y + hy, at] : [at, y + hy, a1];
      this.cap(m, A, B, 0.03, { seg: 4, name: 'rail' });
    }
  }
}
