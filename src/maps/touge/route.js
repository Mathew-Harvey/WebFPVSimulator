/*
 * route.js: the road over Momiji Pass, as a line and a height. Pure, as
 * ./frame.js is, and arithmetic only (+ - * / and Math.sqrt), because the
 * road's height is the ground the plant is given under it (./terrain.js)
 * and the height of the lanes the physics module drives the cars along.
 *
 * THE PLACE is a Japanese mountain pass road, a touge, of our own, built
 * from what such roads are rather than from any one of them: Nikko's
 * Irohazaka (two one way roads of tight numbered hairpins stacked up a
 * mountain side), the Hakone roads (a pass with a rest stop and a tea
 * house at the top), and the gorges such roads cross on vermilion arch
 * bridges. One loop: the valley road from the hamlet, east over the gorge
 * on the red arch bridge, up the east face in three hairpins, through the
 * tunnel under the ridge, past the rest stop at the pass, down the west
 * face in three more, and back over the gorge on the concrete bridge.
 *
 * SIZES, from the references (scripts/touge-check.js measures them):
 *   the road        7.0 m between the edge lines, a two lane mountain road
 *                   (Japan's Road Structure Ordinance class 3: 3.0 m lanes,
 *                   0.5 m shoulders)
 *   a hairpin       13 m to the centre line at the apex, the size of the
 *                   tightest Irohazaka bends; the legs between are 36 m
 *                   apart, so the ground between two legs climbs about
 *                   fourteen metres, a cut slope of thirty odd degrees
 *   the grade       about 6 percent, the gentle side of a Japanese pass
 *                   road (Irohazaka's average is a little steeper)
 *   the hairpins    level through the bend, as the real ones nearly are
 *
 * THE HEIGHT, e(s), is a function of the arc length round the loop: 0 in
 * the valley and over the two bridges, rising at a constant grade up the
 * east face, level at the top through the tunnel and past the rest stop's
 * gate, and falling the same way down the west face.
 *
 * NEAREST. Where on the road a plan point is nearest is asked for every
 * node of the ground's grid and every tree, so the line's segments are
 * filed in 8 m cells and only the cells round the point are searched.
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

import { centreLine, pointAt } from '../built/road.js';

/* The road between its edge lines, and how far the level ground beside it
 * reaches from the centre: the shoulder, the ditch and room for the rail. */
export const ROAD_W = 7.0;
export const HALF = ROAD_W / 2;
export const BENCH = HALF + 2;
/* A hairpin's radius at the centre line. */
export const BEND_R = 13;
/* The height of the pass over the valley, at the road. */
export const SUMMIT = 46;
/* The valley road. */
export const VALLEY_Y = 62;

/*
 * THE NODES of the loop, plan metres, in the order it is driven. The eased
 * bends are ../built/road.js's, at BEND_R. HAIRPINS pairs the two quarter
 * bends of each hairpin, for the signs and the mirrors (./places.js).
 */
export const NODES = [
  [120, VALLEY_Y], // 0: the valley road leaves the west bridge, east
  [310, VALLEY_Y], // 1: north onto the red arch bridge
  [310, 168], // 2: east, leg E1
  [420, 168], // 3: hairpin E1
  [420, 204], // 4
  [232, 204], // 5: hairpin E2
  [232, 240], // 6
  [420, 240], // 7: hairpin E3
  [420, 276], // 8: west, to the tunnel
  [40, 276], // 9: hairpin W1, past the rest stop
  [40, 240], // 10
  [178, 240], // 11: hairpin W2
  [178, 204], // 12
  [40, 204], // 13: hairpin W3
  [40, 168], // 14
  [120, 168], // 15: south over the concrete bridge
];
export const HAIRPINS = [[3, 4], [5, 6], [7, 8], [9, 10], [11, 12], [13, 14]];

/* The gorge the road crosses twice, its two lips, py (./terrain.js cuts it). */
export const GORGE = { y0: 100, y1: 134, floor: -18, water: -17.4 };

/* The tunnel under the ridge: its bore along the top road, px x0 to x1. */
export const TUNNEL = { x0: 232, x1: 302, y: 276, w: 9.6, h: 5.8, wall: 1.2, roof: 1.6 };

/* The rest stop at the pass: the car park north of the road. */
export const REST = { x0: 120, x1: 214, y0: 284, y1: 326 };

/* The shrine on its ledge up the slope behind the car park, and the stair
 * up to it from the torii at the car park's back. */
export const SHRINE = { x: 150, y0: 326, y1: 344, top: SUMMIT + 10 };

/* The rock shed on leg W2's cliff side: a gallery over the road. */
export const SHED = { x0: 74, x1: 134, y: 240 };

/* The road as a document road element would hold it: ./yard.js gives it
 * to the cars, closed and of two lanes, so a car keeps to its left. */
export function roadNodes() {
  return NODES.map(([x, y], k) => ({ x, y, node: k }));
}

let LINE = null;
let PROFILE = null;
let GRID = null;

/* The eased centre line, worked out once. */
export function centre() {
  if (!LINE) {
    LINE = centreLine(roadNodes(), true, { radius: BEND_R });
  }
  return LINE;
}

/* The arc length range of node k's bend: the points that belong to it. */
export function bendRange(line, k) {
  let a = Infinity;
  let b = -Infinity;
  for (let i = 0; i < line.points.length; i += 1) {
    if (line.node[i] === k) {
      a = Math.min(a, line.s[i]);
      b = Math.max(b, line.s[i]);
    }
  }
  return [a, b];
}

/* The arc length of the line's point nearest (x, y) by a plain scan:
 * only used to find the profile's few marks. */
function sNear(line, x, y) {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < line.points.length; i += 1) {
    const p = line.points[i];
    const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
    if (d < bd) {
      bd = d;
      best = line.s[i];
    }
  }
  return best;
}

/*
 * THE PROFILE: knots [s, e] the height is linear between, worked out from
 * where the climb starts and ends and where the hairpins are, so the grade
 * is the same all the way up each face.
 */
function profile() {
  if (PROFILE) {
    return PROFILE;
  }
  const line = centre();
  const L = line.length;
  /* The hairpins climb at the legs' grade. Held level they took a third
   * of each face's run and left the legs at thirteen percent. */
  const flats = [];
  /* The climb: from the north end of the red arch bridge to the tunnel's
   * east portal. The descent: from the far end of the rest stop to the
   * north end of the concrete bridge. */
  const up0 = sNear(line, 310, GORGE.y1 + 10);
  const up1 = sNear(line, TUNNEL.x1 + 6, TUNNEL.y);
  const dn0 = sNear(line, REST.x1 - 14, TUNNEL.y);
  const dn1 = sNear(line, 120, GORGE.y1 + 10);
  const ramp = (s0, s1, e0, e1) => {
    const inside = flats.filter(([a, b]) => a > s0 && b < s1);
    let run = s1 - s0;
    for (const [a, b] of inside) {
      run -= b - a;
    }
    const k = (e1 - e0) / run;
    const out = [[s0, e0]];
    let e = e0;
    let at = s0;
    for (const [a, b] of inside) {
      e += (a - at) * k;
      out.push([a, e], [b, e]);
      at = b;
    }
    out.push([s1, e1]);
    return out;
  };
  const knots = [[0, 0], ...ramp(up0, up1, 0, SUMMIT), ...ramp(dn0, dn1, SUMMIT, 0), [L, 0]];
  PROFILE = { knots, length: L, up: [up0, up1], down: [dn0, dn1], flats };
  return PROFILE;
}

/* The road's height at arc length s round the loop. */
export function heightAt(s) {
  const { knots, length } = profile();
  let x = s - Math.floor(s / length) * length;
  let lo = 0;
  let hi = knots.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (knots[mid][0] <= x) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const [s0, e0] = knots[lo];
  const [s1, e1] = knots[hi];
  if (!(s1 > s0)) {
    return e0;
  }
  x = x < s0 ? s0 : (x > s1 ? s1 : x);
  return e0 + ((e1 - e0) * (x - s0)) / (s1 - s0);
}

/* The grade at arc length s, rise over run. */
export function gradeAt(s) {
  return (heightAt(s + 1) - heightAt(s - 1)) / 2;
}

export function profileInfo() {
  return profile();
}

/* The segments, filed in 8 m cells. */
const CELL = 8;
function grid() {
  if (GRID) {
    return GRID;
  }
  const line = centre();
  const n = line.points.length;
  const cells = new Map();
  for (let i = 0; i < n; i += 1) {
    const a = line.points[i];
    const b = line.points[(i + 1) % n];
    const cx0 = Math.floor(Math.min(a.x, b.x) / CELL);
    const cx1 = Math.floor(Math.max(a.x, b.x) / CELL);
    const cy0 = Math.floor(Math.min(a.y, b.y) / CELL);
    const cy1 = Math.floor(Math.max(a.y, b.y) / CELL);
    for (let cx = cx0; cx <= cx1; cx += 1) {
      for (let cy = cy0; cy <= cy1; cy += 1) {
        const key = cx * 4096 + cy;
        let list = cells.get(key);
        if (!list) {
          list = [];
          cells.set(key, list);
        }
        list.push(i);
      }
    }
  }
  GRID = { cells, line };
  return GRID;
}

/*
 * The road's point nearest plan (x, y) within `reach` metres:
 * { s, d, x, y, tx, ty, side } with side +1 when (x, y) is on the road's
 * left as it is driven, or null when nothing is that near.
 */
export function nearest(x, y, reach = 40) {
  const { cells, line } = grid();
  const n = line.points.length;
  const r = Math.ceil(reach / CELL);
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(y / CELL);
  let best = null;
  let bd = reach * reach;
  for (let i = cx - r; i <= cx + r; i += 1) {
    for (let j = cy - r; j <= cy + r; j += 1) {
      const list = cells.get(i * 4096 + j);
      if (!list) {
        continue;
      }
      for (const k of list) {
        const a = line.points[k];
        const b = line.points[(k + 1) % n];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const ll = dx * dx + dy * dy;
        let f = ll > 0 ? ((x - a.x) * dx + (y - a.y) * dy) / ll : 0;
        f = f < 0 ? 0 : (f > 1 ? 1 : f);
        const qx = a.x + dx * f;
        const qy = a.y + dy * f;
        const d2 = (x - qx) * (x - qx) + (y - qy) * (y - qy);
        if (d2 < bd) {
          bd = d2;
          const l = Math.sqrt(ll);
          best = {
            s: line.s[k] + f * l, d: 0, x: qx, y: qy, tx: l > 0 ? dx / l : 1, ty: l > 0 ? dy / l : 0, side: 0,
          };
        }
      }
    }
  }
  if (best) {
    best.d = Math.sqrt(bd);
    const cross = best.tx * (y - best.y) - best.ty * (x - best.x);
    best.side = cross >= 0 ? 1 : -1;
  }
  return best;
}

/* A point on the line at arc length s, with its tangent, and its height. */
export function roadPoint(s) {
  const p = pointAt(centre(), s);
  return { x: p.x, y: p.y, tx: p.tx, ty: p.ty, h: heightAt(s) };
}

/* Whether arc length s is in the tunnel's bore. */
export function inTunnel(x, y) {
  return x > TUNNEL.x0 && x < TUNNEL.x1 && Math.abs(y - TUNNEL.y) < TUNNEL.w / 2 + TUNNEL.wall;
}
