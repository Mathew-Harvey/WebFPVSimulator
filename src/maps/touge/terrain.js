/*
 * terrain.js: the ground of Momiji Pass, which is the ground the plant is
 * given. Pure, as ./frame.js is, and arithmetic only (+ - * / and
 * Math.sqrt, Math.floor), because every height here reaches the physics:
 * the built map hands `floor` to groundUnder (../built/place.js) wherever
 * no box top is under the craft, and the shell samples it for the plane
 * and the slope it gives the plant every step, as it does over the race
 * field's hills (sampleGroundNormal in src/main.js). Nothing about the
 * physics changes: a heightfield under the craft is what the race field
 * has always been.
 *
 * ONE GRID, DRAWN AND FLOWN. The heights are worked out once on a 4 m grid
 * over the plot and a little past it, and the ground the plant is given is
 * that grid's own triangles, split along the same diagonal ./index.js
 * draws them with, so the ground drawn is the ground hit to the
 * millimetre. Past the fine grid a 16 m grid carries the mountains out to
 * the horizon, drawn the same way and flown the same way.
 *
 * WHAT A HEIGHT IS MADE OF, at each node:
 *   the mountains    `base`: a valley floor at 0 south of the gorge, the
 *                    north face climbing from the gorge to the ridge, the
 *                    spur between the two hairpin stacks, the ridge the
 *                    tunnel goes under, peaks to the north, and hills all
 *                    round past the plot so the plot sits in a bowl
 *   the road         near the road the ground is the road: level across
 *                    from the centre to BENCH (./route.js), then eased
 *                    over ten metres into
 *   the slope        a smooth surface through the road's own heights,
 *                    an inverse distance mean of the road's samples, so the
 *                    ground between two legs of a hairpin stack climbs from
 *                    one to the next; it gives way to the mountains as the
 *                    road gets further away
 *   the pads         the rest stop's car park and the lookout, level
 *   the gorge        cut out: a river bed GORGE.floor deep between walls
 *                    that are solid boxes (./places.js), its lips on the 4 m
 *                    grid's own lines so no triangle overhangs it
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

import { W, D, hash2 } from './frame.js';
import {
  centre, heightAt, nearest, BENCH, SUMMIT, GORGE, TUNNEL, REST, SHRINE,
} from './route.js';

/* The fine grid: 4 m, from FINE.x0 to FINE.x1 in px and the same in py. */
export const FINE = { x0: -20, x1: W + 20, y0: -20, y1: D + 20, step: 4 };
/* The far grid: 16 m, out to where the fog has the last of it. */
export const FAR = { x0: -340, x1: W + 340, y0: -340, y1: D + 340, step: 16 };

/* 0 at a, 1 at b, eased between; a may be past b, for a fall. */
const smooth = (a, b, x) => {
  let t = (x - a) / (b - a);
  t = t < 0 ? 0 : (t > 1 ? 1 : t);
  return t * t * (3 - 2 * t);
};

/* A round bump of height 1 at (cx, cy), radii rx and ry, falling to 0 at
 * the edge with a smooth shoulder. */
function bump(x, y, cx, cy, rx, ry) {
  const u = (x - cx) / rx;
  const v = (y - cy) / ry;
  const q = u * u + v * v;
  if (q >= 1) {
    return 0;
  }
  const t = 1 - q;
  return t * t;
}

/* Value noise on a lattice of `cell` metres, smooth, in [0, 1). */
function noise(x, y, cell, salt) {
  const fx = x / cell;
  const fy = y / cell;
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  const u = fx - i;
  const v = fy - j;
  const su = u * u * (3 - 2 * u);
  const sv = v * v * (3 - 2 * v);
  const a = hash2(i, j, salt);
  const b = hash2(i + 1, j, salt);
  const c = hash2(i, j + 1, salt);
  const d = hash2(i + 1, j + 1, salt);
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
}

/*
 * THE GORGE'S LIPS, per 8 m of px: the south lip GORGE.y0 and the north
 * GORGE.y1, each moved by 0 or a grid step either way, so the walls are
 * ragged and every lip still lies on a grid line. Straight where a bridge
 * lands, so its abutments meet a straight wall.
 */
export const GORGE_X0 = 16;
const BRIDGES = [[112, 128], [300, 320]];
export function lipsAt(x) {
  const k = Math.floor(x / 8);
  const sx = k * 8;
  for (const [a, b] of BRIDGES) {
    if (sx + 8 > a - 8 && sx < b + 8) {
      return [GORGE.y0, GORGE.y1];
    }
  }
  const j0 = Math.floor(hash2(k, 3, 91) * 3) - 1;
  const j1 = Math.floor(hash2(k, 7, 92) * 3) - 1;
  return [GORGE.y0 + 4 * j0, GORGE.y1 + 4 * j1];
}

/* Whether plan (x, y) is inside the gorge, between its walls. */
export function inGorge(x, y) {
  if (x < GORGE_X0) {
    return false;
  }
  const [a, b] = lipsAt(x);
  return y > a && y < b;
}

/* The tunnel's bore, walls included, where the ground is its road. */
export function inBore(x, y) {
  return x > TUNNEL.x0 && x < TUNNEL.x1 && Math.abs(y - TUNNEL.y) < TUNNEL.w / 2 + TUNNEL.wall;
}

/* THE MOUNTAINS, before the road. */
export function base(x, y) {
  let h = 0;
  /* The north face, from the foot below the gorge's north lip to the
   * ridge, and on to the peaks along the plot's north edge. */
  if (y > 146) {
    h += (y - 146) * 0.37;
  }
  h += smooth(330, 500, y) * 45;
  /* The valley's far side to the south, and its two ends, closed by hills
   * rising out of the plot, so the plot sits in a bowl. */
  h += smooth(26, -110, y) * 62;
  h += smooth(W - 24, W + 110, x) * 74;
  h += smooth(14, -110, x) * 74;
  /* The spur between the stacks, and the ridge the tunnel goes under. */
  h += 14 * bump(x, y, 206, 214, 26, 58);
  h += 26 * bump(x, y, 268, 302, 50, 70);
  /* The peaks: the pass's own mountain north east, a shoulder north west. */
  h += 40 * bump(x, y, 340, 430, 120, 90);
  h += 26 * bump(x, y, 80, 440, 110, 70);
  /* Far hills round the bowl. */
  h += 50 * bump(x, y, -170, 220, 150, 260) + 55 * bump(x, y, 640, 240, 160, 260);
  h += 34 * bump(x, y, 230, -190, 260, 110);
  /* A roughness that reads as forested ground, on the mountains only, so
   * the valley floor and the strip by the gorge stay level. */
  const rough = noise(x, y, 38, 11) * 6 + noise(x, y, 13, 12) * 1.6;
  const mount = smooth(150, 200, y) + smooth(20, -40, y) + smooth(W - 24, W + 40, x) + smooth(14, -40, x);
  h += (rough - 3.8) * Math.min(1, mount);
  return h;
}

/* The road's samples for the slope's mean: every 3 m, the tunnel's left
 * out (the ridge over it is not the road's to set). */
let SAMPLES = null;
function samples() {
  if (SAMPLES) {
    return SAMPLES;
  }
  const line = centre();
  const out = [];
  const cells = new Map();
  for (let s = 0; s < line.length; s += 3) {
    const i = Math.min(line.points.length - 1, Math.round(s));
    void i;
    const p = pointOn(line, s);
    if (inBore(p.x, p.y)) {
      continue;
    }
    const e = heightAt(s);
    const k = out.length;
    out.push([p.x, p.y, e]);
    const key = Math.floor(p.x / 16) * 4096 + Math.floor(p.y / 16);
    let list = cells.get(key);
    if (!list) {
      list = [];
      cells.set(key, list);
    }
    list.push(k);
  }
  SAMPLES = { out, cells };
  return SAMPLES;
}

/* A point of a line at arc length s, by bisection on its arc lengths. */
function pointOn(line, s) {
  const n = line.points.length;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (line.s[mid] <= s) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const a = line.points[lo];
  const b = line.points[hi];
  const span = line.s[hi] - line.s[lo];
  const f = span > 0 ? (s - line.s[lo]) / span : 0;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

/* The road's surface, as an inverse distance mean of its samples within
 * 48 m: { h, w } the mean and the total weight (0: no road near). */
function slopeMean(x, y) {
  const { out, cells } = samples();
  const cx = Math.floor(x / 16);
  const cy = Math.floor(y / 16);
  let sw = 0;
  let sh = 0;
  for (let i = cx - 3; i <= cx + 3; i += 1) {
    for (let j = cy - 3; j <= cy + 3; j += 1) {
      const list = cells.get(i * 4096 + j);
      if (!list) {
        continue;
      }
      for (const k of list) {
        const p = out[k];
        const d2 = (p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y);
        if (d2 > 48 * 48) {
          continue;
        }
        const w = 1 / (d2 * d2 + 64);
        sw += w;
        sh += w * p[2];
      }
    }
  }
  return sw > 0 ? sh / sw : null;
}

/* The pads, each a rectangle held level at h, eased into what is round it
 * over `ease` metres. */
export const LOOKOUT = { x0: 146, x1: 182, y0: 258, y1: 268, h: SUMMIT - 3.2 };
const PADS = [
  { ...REST, h: SUMMIT, ease: 5 },
  /* The shrine's ledge, and the stair's cut climbing to it, py y0 to y1
   * from the car park's height to the ledge's. */
  { x0: SHRINE.x - 7, x1: SHRINE.x + 7, y0: SHRINE.y1, y1: SHRINE.y1 + 9, h: SHRINE.top, ease: 4 },
  {
    x0: SHRINE.x - 2.4, x1: SHRINE.x + 2.4, y0: SHRINE.y0, y1: SHRINE.y1, ease: 3,
    h: (x, y) => SUMMIT + ((SHRINE.top - SUMMIT) * (y - SHRINE.y0)) / (SHRINE.y1 - SHRINE.y0),
  },
];

function padBlend(x, y, h) {
  let out = h;
  for (const p of PADS) {
    const dx = Math.max(p.x0 - x, 0, x - p.x1);
    const dy = Math.max(p.y0 - y, 0, y - p.y1);
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < p.ease) {
      const t = smooth(0, p.ease, d);
      const cy = y < p.y0 ? p.y0 : (y > p.y1 ? p.y1 : y);
      const ph = typeof p.h === 'function' ? p.h(x, cy) : p.h;
      out = ph + (out - ph) * t;
    }
  }
  return out;
}

/* THE HEIGHT of one node, as the header puts it together. */
export function heightOf(x, y) {
  /* A node inside the gorge stands at the rim, not on the river bed: the
   * bed is floorAt's and the walls' (./places.js), and a node down at the
   * bed pulled every ground triangle along the lip down into a notch,
   * under the walls' tops, so the rim read as a fence and the floor
   * just outside the lip sagged. */
  const m = base(x, y);
  const near = inBore(x, y) ? null : nearest(x, y, 64);
  let h = m;
  if (near) {
    const mean = slopeMean(x, y);
    const a = smooth(14, 58, near.d);
    const s = mean === null ? m : mean + (m - mean) * a;
    const e = heightAt(near.s);
    const b = smooth(BENCH, BENCH + 10, near.d);
    h = e + (s - e) * b;
  }
  /* Over the tunnel the ridge is at least a roof's depth over the bore. */
  if (x > TUNNEL.x0 - 6 && x < TUNNEL.x1 + 6 && Math.abs(y - TUNNEL.y) < 14) {
    const roof = SUMMIT + TUNNEL.h + TUNNEL.roof + 3;
    const inside = x > TUNNEL.x0 && x < TUNNEL.x1;
    if (inside && h < roof) {
      h = roof;
    }
  }
  return padBlend(x, y, h);
}

/* A grid of heights: { x0, y0, step, nx, ny, h: Float64Array }. */
function makeGrid(g, fn) {
  const nx = Math.round((g.x1 - g.x0) / g.step) + 1;
  const ny = Math.round((g.y1 - g.y0) / g.step) + 1;
  const h = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      h[j * nx + i] = fn(g.x0 + i * g.step, g.y0 + j * g.step);
    }
  }
  return { x0: g.x0, y0: g.y0, step: g.step, nx, ny, h };
}

let GROUND = null;

/* Both grids, worked out once a page. */
export function ground() {
  if (!GROUND) {
    const fine = makeGrid(FINE, heightOf);
    /* The far grid's own heights are the mountains alone, but where it
     * lies under the fine grid's edge it takes the fine grid's heights, so
     * the two meet. */
    const far = makeGrid(FAR, (x, y) => {
      if (x >= FINE.x0 && x <= FINE.x1 && y >= FINE.y0 && y <= FINE.y1) {
        return sampleGrid(fine, x, y) - 0.4;
      }
      if (x > GORGE_X0 && y > GORGE.y0 - 8 && y < GORGE.y1 + 8) {
        return base(x, y) * 0.3 + GORGE.floor * 0.7;
      }
      return base(x, y);
    });
    GROUND = { fine, far };
  }
  return GROUND;
}

/*
 * A grid's surface at plan (x, y): the triangle of the cell it is in, split
 * along the cell's diagonal from (i, j) to (i + 1, j + 1), which is how
 * ./index.js draws it.
 */
export function sampleGrid(g, x, y) {
  let fx = (x - g.x0) / g.step;
  let fy = (y - g.y0) / g.step;
  fx = fx < 0 ? 0 : (fx > g.nx - 1.000001 ? g.nx - 1.000001 : fx);
  fy = fy < 0 ? 0 : (fy > g.ny - 1.000001 ? g.ny - 1.000001 : fy);
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  const u = fx - i;
  const v = fy - j;
  const n = g.nx;
  const h00 = g.h[j * n + i];
  const h11 = g.h[(j + 1) * n + i + 1];
  if (u >= v) {
    const h10 = g.h[j * n + i + 1];
    return h00 + (h10 - h00) * u + (h11 - h10) * v;
  }
  const h01 = g.h[(j + 1) * n + i];
  return h00 + (h11 - h01) * u + (h01 - h00) * v;
}

/*
 * THE GROUND THE PLANT IS GIVEN at plan (x, y), metres: the river bed in
 * the gorge, the road in the tunnel's bore, and the drawn grid everywhere
 * else.
 */
export function floorAt(x, y) {
  if (inGorge(x, y)) {
    return GORGE.floor;
  }
  if (inBore(x, y)) {
    return SUMMIT;
  }
  const { fine, far } = ground();
  if (x >= FINE.x0 && x <= FINE.x1 && y >= FINE.y0 && y <= FINE.y1) {
    return sampleGrid(fine, x, y);
  }
  return sampleGrid(far, x, y);
}

/* The same, in the world frame, for the built map's extra.floor. */
export function worldFloor(x, z) {
  return floorAt(x + W / 2, D / 2 - z);
}
